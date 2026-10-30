package com.pressplay.media;

import ai.onnxruntime.NodeInfo;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Whisper on native ONNX Runtime (multi-threaded CPU, int8 models): encoder once per 30 s window, then greedy decoding with the
 * merged decoder's KV cache and Whisper's timestamp rules. JavaScript supplies the log-mel features and reads the tokens back.
 */
final class WhisperNative {

    static final class Cfg {
        int sot, eot, noTs, tsBegin, task, lang;          // lang 0 = detect it (needs langIds)
        boolean useLang, timestamps = true;
        int[] langIds = new int[0], suppress = new int[0], beginSuppress = new int[0];
        int maxTokens = 224;
    }

    static final class Out { int[] tokens; int lang; }

    private static final float NEG = Float.NEGATIVE_INFINITY;

    private OrtSession enc, dec;
    private String key = "", encIn;
    private final List<String> pastNames = new ArrayList<>();
    private final Map<String, long[]> pastDims = new HashMap<>();      // name -> {heads, headDim}
    private final Map<String, Integer> presentIdx = new HashMap<>();   // past input name -> output index of its "present" twin
    private int iLogits;
    private boolean hasHidden;

    synchronized void close() {
        try { if (enc != null) enc.close(); } catch (Throwable ignored) { }
        try { if (dec != null) dec.close(); } catch (Throwable ignored) { }
        enc = null; dec = null; key = "";
    }

    private void ensure(OrtEnvironment env, String k, File ef, File df) throws Exception {
        if (enc != null && dec != null && k.equals(key)) return;
        close();
        OrtSession e = Accel.build(env, ef, false, false);
        OrtSession d = null;
        try {
            d = Accel.build(env, df, false, false);
            pastNames.clear(); pastDims.clear(); presentIdx.clear(); hasHidden = false;
            boolean flag = false;
            for (Map.Entry<String, NodeInfo> en : d.getInputInfo().entrySet()) {
                String n = en.getKey();
                if (n.startsWith("past_key_values")) {
                    long[] sh = ((TensorInfo) en.getValue().getInfo()).getShape();
                    if (sh.length != 4 || sh[1] <= 0 || sh[3] <= 0) throw new IllegalStateException("unexpected shape for decoder input " + n);
                    pastNames.add(n); pastDims.put(n, new long[]{sh[1], sh[3]});
                } else if (n.equals("encoder_hidden_states")) hasHidden = true;
                else if (n.equals("use_cache_branch")) flag = true;
                else if (!n.equals("input_ids")) throw new IllegalStateException("unsupported decoder input " + n);
            }
            if (pastNames.isEmpty() || !flag) throw new IllegalStateException("decoder has no KV-cache branch");
            List<String> outs = new ArrayList<>(d.getOutputNames());
            iLogits = outs.indexOf("logits");
            if (iLogits < 0) throw new IllegalStateException("decoder has no logits output");
            for (String pn : pastNames) {
                int i = outs.indexOf(pn.replace("past_key_values", "present"));
                if (i < 0) throw new IllegalStateException("decoder has no output for " + pn);
                presentIdx.put(pn, i);
            }
            encIn = e.getInputNames().iterator().next();
        } catch (Exception ex) {
            try { e.close(); } catch (Throwable ignored) { }
            if (d != null) try { d.close(); } catch (Throwable ignored) { }
            throw ex;
        }
        enc = e; dec = d; key = k;
    }

    /** One 30 s window: mel [1, nMel, 3000] in, generated tokens (text + timestamp tokens, no prompt, no end token) out. */
    synchronized Out run(OrtEnvironment env, String k, File ef, File df, FloatBuffer mel, long[] melDims, Cfg c) throws Exception {
        ensure(env, k, ef, df);
        Out out = new Out();
        OnnxTensor melT = null;
        OrtSession.Result encRes = null, first = null, prev = null;
        try {
            melT = OnnxTensor.createTensor(env, mel, melDims);
            encRes = enc.run(Collections.singletonMap(encIn, melT));
            OnnxTensor hidden = (OnnxTensor) encRes.get(0);

            int lang = c.lang;
            if (c.useLang && lang == 0 && c.langIds.length > 0) {              // detect the language from the start token alone
                OrtSession.Result r0 = step(env, hidden, new long[]{c.sot}, false, null);
                try {
                    float[] lg = lastLogits(r0);
                    float bv = NEG;
                    for (int id : c.langIds) if (id >= 0 && id < lg.length && lg[id] > bv) { bv = lg[id]; lang = id; }
                } finally { r0.close(); }
            }
            out.lang = lang;

            List<Long> p = new ArrayList<>();
            p.add((long) c.sot);
            if (c.useLang) { p.add((long) lang); p.add((long) c.task); }
            if (!c.timestamps) p.add((long) c.noTs);
            long[] ids = new long[p.size()];
            for (int i = 0; i < ids.length; i++) ids[i] = p.get(i);

            Map<String, OnnxTensor> past = new HashMap<>();
            List<Integer> gen = new ArrayList<>();
            boolean cache = false;
            for (int n = 0; n < c.maxTokens; n++) {
                OrtSession.Result res = step(env, hidden, ids, cache, past);
                int tok = pick(lastLogits(res), gen, c);
                for (String pn : pastNames) {
                    if (cache && pn.contains(".encoder.")) continue;           // cross-attention keys/values never change: keep the first step's
                    past.put(pn, (OnnxTensor) res.get(presentIdx.get(pn)));
                }
                if (n == 0) first = res;
                else { if (prev != null) prev.close(); prev = res; }            // the step before is no longer referenced
                if (tok == c.eot) break;
                gen.add(tok);
                int g = gen.size();
                if (g >= 12) {                                                  // stuck repeating one token: stop and drop the loop
                    boolean same = true;
                    for (int i = g - 12; i < g - 1; i++) if (gen.get(i).intValue() != gen.get(g - 1).intValue()) { same = false; break; }
                    if (same) { for (int i = 0; i < 9; i++) gen.remove(gen.size() - 1); break; }
                }
                ids = new long[]{tok};
                cache = true;
            }
            out.tokens = new int[gen.size()];
            for (int i = 0; i < out.tokens.length; i++) out.tokens[i] = gen.get(i);
            return out;
        } finally {
            if (prev != null) try { prev.close(); } catch (Throwable ignored) { }
            if (first != null) try { first.close(); } catch (Throwable ignored) { }
            if (encRes != null) try { encRes.close(); } catch (Throwable ignored) { }
            if (melT != null) try { melT.close(); } catch (Throwable ignored) { }
        }
    }

    private OrtSession.Result step(OrtEnvironment env, OnnxTensor hidden, long[] ids, boolean cache, Map<String, OnnxTensor> past) throws Exception {
        List<OnnxTensor> tmp = new ArrayList<>();
        try {
            Map<String, OnnxTensor> in = new HashMap<>();
            ByteBuffer bb = ByteBuffer.allocateDirect(ids.length * 8).order(ByteOrder.nativeOrder());
            LongBuffer lb = bb.asLongBuffer(); lb.put(ids); lb.rewind();
            OnnxTensor idT = OnnxTensor.createTensor(env, lb, new long[]{1, ids.length}); tmp.add(idT);
            in.put("input_ids", idT);
            if (hasHidden) in.put("encoder_hidden_states", hidden);
            for (String pn : pastNames) {
                if (cache) { in.put(pn, past.get(pn)); continue; }
                // First pass: the model's no-cache branch ignores these, but the inputs must exist (length-1 zeros).
                long[] hd = pastDims.get(pn);
                FloatBuffer z = ByteBuffer.allocateDirect((int) (hd[0] * hd[1] * 4)).order(ByteOrder.nativeOrder()).asFloatBuffer();
                OnnxTensor zt = OnnxTensor.createTensor(env, z, new long[]{1, hd[0], 1, hd[1]}); tmp.add(zt);
                in.put(pn, zt);
            }
            OnnxTensor cf = OnnxTensor.createTensor(env, new boolean[]{cache}); tmp.add(cf);
            in.put("use_cache_branch", cf);
            return dec.run(in);
        } finally {
            for (OnnxTensor t : tmp) try { t.close(); } catch (Throwable ignored) { }
        }
    }

    private float[] lastLogits(OrtSession.Result res) throws Exception {
        OnnxTensor t = (OnnxTensor) res.get(iLogits);
        long[] sh = t.getInfo().getShape();                                     // [1, L, vocab]
        int L = (int) sh[1], V = (int) sh[2];
        FloatBuffer fb = t.getFloatBuffer();
        float[] lg = new float[V];
        fb.position((L - 1) * V);
        fb.get(lg);
        return lg;
    }

    /** Whisper's own timestamp rules, then greedy pick. */
    private int pick(float[] lg, List<Integer> gen, Cfg c) {
        int V = lg.length;
        for (int t : c.suppress) if (t >= 0 && t < V) lg[t] = NEG;
        if (gen.isEmpty()) for (int t : c.beginSuppress) if (t >= 0 && t < V) lg[t] = NEG;
        if (c.timestamps) {
            int tb = Math.min(c.tsBegin, V), n = gen.size();
            if (c.noTs >= 0 && c.noTs < V) lg[c.noTs] = NEG;
            boolean lastTs = n >= 1 && gen.get(n - 1) >= tb;
            boolean penTs = n < 2 || gen.get(n - 2) >= tb;
            if (lastTs) {
                if (penTs) { for (int t = tb; t < V; t++) lg[t] = NEG; }                       // a pair is complete: text must follow
                else { for (int t = 0; t < Math.min(c.eot, V); t++) lg[t] = NEG; }              // a lone stamp: only another stamp or the end
            }
            int lastStamp = -1;
            for (int t : gen) if (t >= tb) lastStamp = t;
            if (lastStamp >= 0) {                                                              // timestamps never go backwards, lines are never empty
                int from = (lastTs && !penTs) ? lastStamp : lastStamp + 1;
                for (int t = tb; t < Math.min(from, V); t++) lg[t] = NEG;
            }
            if (n == 0) {                                                                      // must open with a timestamp, at most 1 s in
                for (int t = 0; t < tb; t++) lg[t] = NEG;
                for (int t = tb + 51; t < V; t++) lg[t] = NEG;
            }
            float m = NEG;
            for (float v : lg) if (v > m) m = v;
            if (m != NEG) {                                                                    // if stamps together beat every single text token, take a stamp
                double sum = 0, tsSum = 0;
                for (int t = 0; t < V; t++) if (lg[t] != NEG) { double e = Math.exp(lg[t] - m); sum += e; if (t >= tb) tsSum += e; }
                float maxText = NEG;
                for (int t = 0; t < tb; t++) if (lg[t] > maxText) maxText = lg[t];
                double lse = m + Math.log(sum);
                double tsLp = tsSum > 0 ? m + Math.log(tsSum) - lse : Double.NEGATIVE_INFINITY;
                double textLp = maxText == NEG ? Double.NEGATIVE_INFINITY : maxText - lse;
                if (tsLp > textLp) for (int t = 0; t < tb; t++) lg[t] = NEG;
            }
        }
        int best = c.eot;
        float bv = NEG;
        for (int t = 0; t < V; t++) if (lg[t] > bv) { bv = lg[t]; best = t; }
        return best;
    }
}
