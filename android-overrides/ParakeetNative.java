package com.pressplay.media;

import ai.onnxruntime.NodeInfo;
import ai.onnxruntime.OnnxJavaType;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * NVIDIA Parakeet TDT 0.6B (English) on native ONNX Runtime, using the onnx-asr export (istupakov/parakeet-tdt-0.6b-v2-onnx):
 * a preprocessor (log-mel, nemo128.onnx), the int8 FastConformer encoder, and the combined decoder+joint network that is run in
 * a greedy token-and-duration (TDT) loop. JavaScript sends one chunk of 16 kHz mono audio and gets back token ids with the
 * encoder frame each one was emitted at (1 frame = 80 ms) and its duration in frames.
 */
final class ParakeetNative {

    static final class Out { int[] tokens, frames, durs; int nFrames; }

    private OrtSession pre, enc, dec;
    private String key = "";

    // preprocessor
    private String preWav, preLen; private boolean preLenI64;
    // encoder
    private String encFeat, encLen; private boolean encLenI64;
    // decoder + joint
    private String dEnc, dTgt, dTgtLen;
    private int dOutIdx = 0;
    private final List<Integer> stOutIdx = new ArrayList<>();
    private boolean dTgtI64 = false, dTgtLenI64 = false;
    private int dEncRank = 3, dEncDim = 0;
    private final List<String> stIn = new ArrayList<>(), stOut = new ArrayList<>();
    private final List<long[]> stShape = new ArrayList<>();

    synchronized boolean loaded(String k) { return pre != null && enc != null && dec != null && k.equals(key); }

    synchronized void close() {
        try { if (pre != null) pre.close(); } catch (Throwable ignored) { }
        try { if (enc != null) enc.close(); } catch (Throwable ignored) { }
        try { if (dec != null) dec.close(); } catch (Throwable ignored) { }
        pre = null; enc = null; dec = null; key = "";
    }

    private static TensorInfo ti(NodeInfo n) { return (TensorInfo) n.getInfo(); }

    private void ensure(OrtEnvironment env, String k, File pf, File ef, File df) throws Exception {
        if (loaded(k)) return;
        close();
        OrtSession p = null, e = null, d = null;
        try {
            p = Accel.build(env, pf, false, false);
            e = Accel.build(env, ef, false);                    // ~650 MB: lean memory settings
            d = Accel.build(env, df, false, false);             // small, but runs thousands of times
            // --- preprocessor: waveform [1, N] float + its length [1]
            preWav = null; preLen = null;
            for (Map.Entry<String, NodeInfo> en : p.getInputInfo().entrySet()) {
                TensorInfo t = ti(en.getValue());
                if (t.getShape().length == 2) preWav = en.getKey();
                else { preLen = en.getKey(); preLenI64 = t.type == OnnxJavaType.INT64; }
            }
            if (preWav == null) throw new IllegalStateException("preprocessor inputs: " + p.getInputNames());
            // --- encoder: features [1, 128, T] + length [1]
            encFeat = null; encLen = null;
            for (Map.Entry<String, NodeInfo> en : e.getInputInfo().entrySet()) {
                TensorInfo t = ti(en.getValue());
                if (t.getShape().length == 3) encFeat = en.getKey();
                else { encLen = en.getKey(); encLenI64 = t.type == OnnxJavaType.INT64; }
            }
            if (encFeat == null) throw new IllegalStateException("encoder inputs: " + e.getInputNames());
            // --- decoder + joint
            dEnc = null; dTgt = null; dTgtLen = null; dEncDim = 0; stIn.clear(); stOut.clear(); stOutIdx.clear(); stShape.clear();
            List<String> outs = new ArrayList<>(d.getOutputNames());
            for (Map.Entry<String, NodeInfo> en : d.getInputInfo().entrySet()) {
                String n = en.getKey(); TensorInfo t = ti(en.getValue()); long[] sh = t.getShape();
                if (n.contains("state")) {
                    String on = n.replace("input", "output");
                    if (!outs.contains(on)) throw new IllegalStateException("decoder has no output " + on + " for state " + n);
                    long[] s = sh.clone(); for (int i = 0; i < s.length; i++) if (s[i] <= 0) s[i] = 1;
                    stIn.add(n); stOut.add(on); stOutIdx.add(outs.indexOf(on)); stShape.add(s);
                } else if (n.contains("length")) { dTgtLen = n; dTgtLenI64 = t.type == OnnxJavaType.INT64; }
                else if (n.contains("target")) { dTgt = n; dTgtI64 = t.type == OnnxJavaType.INT64; }
                else if (n.contains("encoder")) { dEnc = n; dEncRank = sh.length; if (sh.length >= 2 && sh[1] > 0) dEncDim = (int) sh[1]; }
                else throw new IllegalStateException("unsupported decoder input " + n);
            }
            if (dEnc == null || dTgt == null) throw new IllegalStateException("decoder inputs: " + d.getInputNames());
            dOutIdx = Math.max(0, outs.indexOf("outputs"));
        } catch (Exception ex) {
            for (OrtSession s : new OrtSession[]{p, e, d}) if (s != null) try { s.close(); } catch (Throwable ignored) { }
            throw ex;
        }
        pre = p; enc = e; dec = d; key = k;
    }

    private static FloatBuffer direct(float[] a) {
        FloatBuffer fb = ByteBuffer.allocateDirect(Math.max(1, a.length) * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        fb.put(a); fb.rewind();
        return fb;
    }

    private static OnnxTensor lenT(OrtEnvironment env, boolean i64, long v) throws Exception {
        return i64 ? OnnxTensor.createTensor(env, new long[]{v}) : OnnxTensor.createTensor(env, new int[]{(int) v});
    }

    private static long scalar(OnnxTensor t) throws Exception {
        Object v = t.getValue();
        if (v instanceof long[]) return ((long[]) v)[0];
        if (v instanceof int[]) return ((int[]) v)[0];
        return -1;
    }

    private static float[] floats(OnnxTensor t) {
        FloatBuffer fb = t.getFloatBuffer().duplicate();
        float[] a = new float[fb.remaining()];
        fb.get(a);
        return a;
    }

    private static int argmax(float[] a, int from, int to) {
        int b = from; float bv = Float.NEGATIVE_INFINITY;
        for (int i = from; i < to; i++) if (a[i] > bv) { bv = a[i]; b = i; }
        return b;
    }

    /** One chunk of 16 kHz mono audio (n samples). vocab = number of vocabulary entries (blank included), blank = the blank token id. */
    synchronized Out run(OrtEnvironment env, String k, File pf, File ef, File df, FloatBuffer wave, int n, int vocab, int blank) throws Exception {
        ensure(env, k, pf, ef, df);
        OrtSession.Result pr = null, er = null;
        OnnxTensor wT = null, wlT = null, elT = null;
        try {
            // 1) log-mel features
            wT = OnnxTensor.createTensor(env, wave, new long[]{1, n});
            Map<String, OnnxTensor> pin = new HashMap<>();
            pin.put(preWav, wT);
            if (preLen != null) { wlT = lenT(env, preLenI64, n); pin.put(preLen, wlT); }
            pr = pre.run(pin);
            OnnxTensor feats = (OnnxTensor) pr.get(0);
            long featFrames = feats.getInfo().getShape()[2];
            long fl = pr.size() > 1 ? scalar((OnnxTensor) pr.get(1)) : -1;
            if (fl <= 0 || fl > featFrames) fl = featFrames;

            // 2) encoder
            Map<String, OnnxTensor> ein = new HashMap<>();
            ein.put(encFeat, feats);
            if (encLen != null) { elT = lenT(env, encLenI64, fl); ein.put(encLen, elT); }
            er = enc.run(ein);
            OnnxTensor eo = (OnnxTensor) er.get(0);
            long[] es = eo.getInfo().getShape();                                   // [1, D, T'] (or [1, T', D])
            int D, Tp;
            boolean chFirst;
            if (dEncDim > 0) { chFirst = es[1] == dEncDim; D = dEncDim; }
            else { chFirst = es[1] < es[2] ? false : true; D = (int) (chFirst ? es[1] : es[2]); }
            Tp = (int) (chFirst ? es[2] : es[1]);
            long el = er.size() > 1 ? scalar((OnnxTensor) er.get(1)) : -1;
            int T = (int) ((el > 0 && el <= Tp) ? el : Tp);
            float[] E = floats(eo);

            // 3) greedy TDT decoding
            float[][] st = new float[stIn.size()][];
            for (int i = 0; i < st.length; i++) { long c = 1; for (long v : stShape.get(i)) c *= v; st[i] = new float[(int) c]; }
            List<Integer> toks = new ArrayList<>(), frs = new ArrayList<>(), dus = new ArrayList<>();
            float[] col = new float[D];
            int t = 0, emitted = 0, last = blank, guard = 0, maxGuard = T * 12 + 200;
            while (t < T && guard++ < maxGuard) {
                if (chFirst) for (int d = 0; d < D; d++) col[d] = E[d * Tp + t];
                else System.arraycopy(E, t * D, col, 0, D);
                float[][] ns = new float[st.length][];
                float[] lg = step(env, col, D, last, st, ns);
                int L = lg.length, V = Math.min(vocab > 0 ? vocab : L, L);
                int tok = argmax(lg, 0, V);
                int dur = L > V ? argmax(lg, V, L) - V : 0;
                if (tok != blank) {
                    st = ns; toks.add(tok); frs.add(t); dus.add(dur); last = tok; emitted++;
                }
                if (dur > 0) { t += dur; emitted = 0; }
                else if (tok == blank || emitted >= 10) { t += 1; emitted = 0; }
            }
            Out o = new Out();
            o.nFrames = T;
            o.tokens = new int[toks.size()]; o.frames = new int[toks.size()]; o.durs = new int[toks.size()];
            for (int i = 0; i < o.tokens.length; i++) { o.tokens[i] = toks.get(i); o.frames[i] = frs.get(i); o.durs[i] = dus.get(i); }
            return o;
        } finally {
            if (er != null) try { er.close(); } catch (Throwable ignored) { }
            if (pr != null) try { pr.close(); } catch (Throwable ignored) { }
            for (OnnxTensor x : new OnnxTensor[]{elT, wlT, wT}) if (x != null) try { x.close(); } catch (Throwable ignored) { }
        }
    }

    /** One decoder+joint call for one encoder frame. Returns the joint output (token logits followed by duration logits); newSt gets the new decoder state. */
    private float[] step(OrtEnvironment env, float[] col, int D, int tok, float[][] st, float[][] newSt) throws Exception {
        List<OnnxTensor> tmp = new ArrayList<>();
        OrtSession.Result res = null;
        try {
            Map<String, OnnxTensor> in = new HashMap<>();
            OnnxTensor eT = OnnxTensor.createTensor(env, direct(col), dEncRank == 2 ? new long[]{1, D} : new long[]{1, D, 1}); tmp.add(eT);
            in.put(dEnc, eT);
            OnnxTensor tT = dTgtI64 ? OnnxTensor.createTensor(env, new long[][]{{tok}}) : OnnxTensor.createTensor(env, new int[][]{{tok}}); tmp.add(tT);
            in.put(dTgt, tT);
            if (dTgtLen != null) { OnnxTensor lT = lenT(env, dTgtLenI64, 1); tmp.add(lT); in.put(dTgtLen, lT); }
            for (int i = 0; i < stIn.size(); i++) {
                OnnxTensor sT = OnnxTensor.createTensor(env, direct(st[i]), stShape.get(i)); tmp.add(sT);
                in.put(stIn.get(i), sT);
            }
            res = dec.run(in);
            float[] lg = floats((OnnxTensor) res.get(dOutIdx));
            for (int i = 0; i < stOut.size(); i++) newSt[i] = floats((OnnxTensor) res.get(stOutIdx.get(i)));
            return lg;
        } finally {
            if (res != null) try { res.close(); } catch (Throwable ignored) { }
            for (OnnxTensor x : tmp) try { x.close(); } catch (Throwable ignored) { }
        }
    }
}
