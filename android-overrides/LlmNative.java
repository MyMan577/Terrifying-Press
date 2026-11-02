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
import java.nio.LongBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Random;
import java.util.Set;

/**
 * Runs a decoder-only chat model (SmolLM2 style ONNX with past_key_values.N.key/value inputs) on the CPU.
 * Tokenizing stays in JavaScript; this class does the forward passes, the KV cache and the sampling,
 * so only token ids cross the bridge instead of a 49k-wide logits row per word.
 */
final class LlmNative {
    interface TokenSink { void on(int id); }

    private OrtSession s;
    private final List<String> pastIn = new ArrayList<>();            // past_key_values.N.key / .value
    private final Map<String, long[]> pastShape = new HashMap<>();
    private final Map<String, Integer> presentIdx = new HashMap<>();  // past input name -> index of its "present" output
    private List<String> outNames;
    private int logitsIdx = 0;
    private boolean hasMask, hasPos;
    private volatile boolean cancel;
    private final Random rnd = new Random();

    synchronized void load(OrtEnvironment env, File f) throws Exception {
        close();
        // plain CPU session (XNNPACK + big-core threads from Accel). NNAPI is deliberately not used for LLM decoding.
        s = Accel.build(env, f, false, false);
        outNames = new ArrayList<>(s.getOutputNames());
        logitsIdx = outNames.indexOf("logits");
        if (logitsIdx < 0) logitsIdx = 0;
        for (Map.Entry<String, NodeInfo> e : s.getInputInfo().entrySet()) {
            String n = e.getKey();
            if (n.startsWith("past_key_values")) {
                TensorInfo ti = (TensorInfo) e.getValue().getInfo();
                if (ti.type != OnnxJavaType.FLOAT) throw new IllegalStateException("KV cache type " + ti.type + " is not supported (use the int8/fp32 model)");
                long[] sh = ti.getShape();
                if (sh.length != 4) throw new IllegalStateException("Unexpected KV cache rank " + sh.length);
                pastIn.add(n);
                pastShape.put(n, sh);
                int oi = outNames.indexOf(n.replace("past_key_values", "present"));
                if (oi < 0) throw new IllegalStateException("No present output for " + n);
                presentIdx.put(n, oi);
            } else if (n.equals("attention_mask")) hasMask = true;
            else if (n.equals("position_ids")) hasPos = true;
        }
        if (pastIn.isEmpty()) throw new IllegalStateException("This model has no past_key_values inputs");
    }

    synchronized void close() {
        if (s != null) { try { s.close(); } catch (Exception ignored) { } s = null; }
        pastIn.clear(); pastShape.clear(); presentIdx.clear(); hasMask = false; hasPos = false;
    }

    boolean loaded() { return s != null; }
    void cancel() { cancel = true; }

    private static OnnxTensor longs(OrtEnvironment env, long[] v, long... shape) throws Exception {
        LongBuffer lb = ByteBuffer.allocateDirect(v.length * 8).order(ByteOrder.nativeOrder()).asLongBuffer();
        lb.put(v); lb.rewind();
        return OnnxTensor.createTensor(env, lb, shape);
    }

    /**
     * Generates up to maxNew tokens after the prompt. Stops early on any id in eos (that id is not returned).
     * The first step feeds a 1-slot zero "past" that the attention mask hides, so no zero-length tensors are needed.
     */
    synchronized int[] generate(OrtEnvironment env, int[] prompt, int maxNew, int[] eos, boolean sample, double temp,
                                double topP, double rep, TokenSink sink) throws Exception {
        if (s == null) throw new IllegalStateException("Chat model not loaded");
        cancel = false;
        Set<Integer> stop = new HashSet<>();
        for (int e : eos) stop.add(e);
        List<Integer> hist = new ArrayList<>();
        for (int p : prompt) hist.add(p);
        List<Integer> made = new ArrayList<>();

        OrtSession.Result prev = null;
        List<OnnxTensor> dummy = new ArrayList<>();
        Map<String, OnnxTensor> past = new LinkedHashMap<>();
        try {
            for (String n : pastIn) {
                long[] sh = pastShape.get(n).clone();
                sh[0] = 1; sh[2] = 1;
                long cnt = 1;
                for (long d : sh) { if (d <= 0) throw new IllegalStateException("Dynamic KV dimension in " + n); cnt *= d; }
                FloatBuffer z = ByteBuffer.allocateDirect((int) cnt * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
                OnnxTensor t = OnnxTensor.createTensor(env, z, sh);
                dummy.add(t); past.put(n, t);
            }
            int total = 1;                 // slots in the cache, including the hidden dummy one
            int real = 0;                  // real tokens seen so far
            int[] cur = prompt;
            for (int it = 0; it < maxNew && !cancel; it++) {
                int n = cur.length;
                List<OnnxTensor> mine = new ArrayList<>();
                Map<String, OnnxTensor> in = new HashMap<>(past);
                long[] idv = new long[n];
                for (int i = 0; i < n; i++) idv[i] = cur[i];
                OnnxTensor ids = longs(env, idv, 1, n); mine.add(ids); in.put("input_ids", ids);
                if (hasMask) {
                    long[] m = new long[total + n];
                    Arrays.fill(m, 1L); m[0] = 0L;                      // slot 0 is the dummy
                    OnnxTensor mt = longs(env, m, 1, m.length); mine.add(mt); in.put("attention_mask", mt);
                }
                if (hasPos) {
                    long[] pv = new long[n];
                    for (int i = 0; i < n; i++) pv[i] = real + i;
                    OnnxTensor pt = longs(env, pv, 1, n); mine.add(pt); in.put("position_ids", pt);
                }
                OrtSession.Result res;
                try { res = s.run(in); }
                finally { for (OnnxTensor t : mine) t.close(); }
                if (prev != null) prev.close();
                for (OnnxTensor t : dummy) t.close();
                dummy.clear();
                prev = res;
                past.clear();
                for (String name : pastIn) past.put(name, (OnnxTensor) res.get(presentIdx.get(name)));
                total += n; real += n;

                OnnxTensor lt = (OnnxTensor) res.get(logitsIdx);
                long[] ls = lt.getInfo().getShape();
                int vocab = (int) ls[ls.length - 1];
                FloatBuffer fb = lt.getFloatBuffer();
                int off = (n - 1) * vocab;
                float[] z = new float[vocab];
                for (int i = 0; i < vocab; i++) z[i] = fb.get(off + i);
                int tok = pick(z, hist, rep, sample, temp, topP);
                if (stop.contains(tok)) break;
                made.add(tok); hist.add(tok);
                if (sink != null) sink.on(tok);
                cur = new int[] {tok};
            }
        } finally {
            if (prev != null) { try { prev.close(); } catch (Exception ignored) { } }
            for (OnnxTensor t : dummy) { try { t.close(); } catch (Exception ignored) { } }
        }
        int[] out = new int[made.size()];
        for (int i = 0; i < out.length; i++) out[i] = made.get(i);
        return out;
    }

    /** Repetition penalty (HF style), temperature, top-k 64 then top-p, then a weighted draw. */
    private int pick(float[] z, List<Integer> hist, double rep, boolean sample, double temp, double topP) {
        if (rep > 1.0001) {
            Set<Integer> seen = new HashSet<>(hist);
            for (int t : seen) if (t >= 0 && t < z.length) z[t] = z[t] > 0 ? (float) (z[t] / rep) : (float) (z[t] * rep);
        }
        if (!sample || temp <= 1e-4) {
            int b = 0;
            for (int i = 1; i < z.length; i++) if (z[i] > z[b]) b = i;
            return b;
        }
        final int K = 64;
        PriorityQueue<int[]> heap = new PriorityQueue<>(K + 1, (a, b) -> Float.compare(z[a[0]], z[b[0]]));   // smallest on top
        for (int i = 0; i < z.length; i++) {
            if (heap.size() < K) heap.add(new int[] {i});
            else if (z[i] > z[heap.peek()[0]]) { heap.poll(); heap.add(new int[] {i}); }
        }
        int k = heap.size();
        int[] idx = new int[k];
        for (int i = k - 1; i >= 0; i--) idx[i] = heap.poll()[0];      // descending
        double mx = z[idx[0]], sum = 0;
        double[] p = new double[k];
        for (int i = 0; i < k; i++) { p[i] = Math.exp((z[idx[i]] - mx) / temp); sum += p[i]; }
        double cum = 0; int keep = k;
        for (int i = 0; i < k; i++) { p[i] /= sum; cum += p[i]; if (cum >= topP) { keep = i + 1; break; } }
        double tot = 0;
        for (int i = 0; i < keep; i++) tot += p[i];
        double r = rnd.nextDouble() * tot, a = 0;
        for (int i = 0; i < keep; i++) { a += p[i]; if (r <= a) return idx[i]; }
        return idx[keep - 1];
    }
}
