package com.pressplay.media;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.Map;

/**
 * One place for the hardware decisions: how many threads (big cores only), NNAPI vs CPU
 * (measured once per model per phone and remembered), and a safe fall back to CPU if an
 * NNAPI session breaks while running. Also hands out direct buffers so tensors are not copied.
 */
final class Accel {
    private static SharedPreferences prefs;
    private static int threadsCache = 0;
    /** Upper limit for inference threads. 4 fast cores finish about as quickly as 6 (the slower mid cores
     *  make the pool wait at every sync point) and draw noticeably less power. Raise to 5 or 6 if you prefer speed. */
    private static final int MAX_THREADS = 4;
    /** Bump this when session settings change, so old "NNAPI vs CPU" timing verdicts are measured again. */
    private static final String TUNE_VER = ":v2";
    private static String tuneKey(String key, File f) { return key + ":" + f.length() + TUNE_VER; }
    private static final Map<OrtSession, Sess> REG = Collections.synchronizedMap(new IdentityHashMap<OrtSession, Sess>());

    static synchronized void init(Context c) {
        if (prefs == null) prefs = c.getApplicationContext().getSharedPreferences("ppv_accel", Context.MODE_PRIVATE);
    }

    static void clearTune() {
        if (prefs != null) prefs.edit().clear().apply();
    }

    private static void remember(String k, String v) {
        if (prefs != null) prefs.edit().putString(k, v).apply();
    }

    /** A loaded model plus where it runs. s is replaced if NNAPI fails at run time. */
    static final class Sess {
        OrtSession s;
        final File f;
        final String key;
        boolean nn;
        String inName, outName;

        Sess(OrtSession s, File f, String key, boolean nn) throws Exception {
            this.s = s; this.f = f; this.key = key; this.nn = nn;
            inName = s.getInputNames().iterator().next();
            outName = s.getOutputNames().iterator().next();
        }
        String accel() { return nn ? "NNAPI" : "CPU"; }
    }

    private static Sess reg(Sess x) { REG.put(x.s, x); return x; }

    /** Look up the Sess for a session opened through open(); unknown sessions are wrapped as CPU. */
    static Sess wrap(OrtSession s) {
        Sess x = REG.get(s);
        if (x != null) return x;
        try { return new Sess(s, null, null, false); } catch (Exception e) { throw new RuntimeException(e); }
    }

    static void close(Sess x) {
        if (x == null) return;
        REG.remove(x.s);
        try { x.s.close(); } catch (Exception ignored) { }
    }

    /** Threads = the fast cores only. Little cores slow the whole pool down. */
    static synchronized int threads() {
        if (threadsCache > 0) return threadsCache;
        int n = Math.max(1, Runtime.getRuntime().availableProcessors());
        long[] fr = new long[n];
        long max = 0;
        for (int i = 0; i < n; i++) {
            try (BufferedReader r = new BufferedReader(new FileReader("/sys/devices/system/cpu/cpu" + i + "/cpufreq/cpuinfo_max_freq"))) {
                fr[i] = Long.parseLong(r.readLine().trim());
                max = Math.max(max, fr[i]);
            } catch (Throwable ignored) { }
        }
        int big = 0;
        if (max > 0) for (int i = 0; i < n; i++) if (fr[i] >= max * 7 / 10) big++;
        int t = big > 0 ? big : n - 2;
        threadsCache = Math.max(1, Math.min(MAX_THREADS, Math.min(t, n > 1 ? n - 1 : 1)));
        return threadsCache;
    }

    static OrtSession build(OrtEnvironment env, File f, boolean nnapi) throws Exception {
        return build(env, f, nnapi, f.length() > 100000000L);
    }

    /** lowMem = no extra memory pools or copies of the weights (right for one huge model, wrong for loops that run a session thousands of times). */
    static OrtSession build(OrtEnvironment env, File f, boolean nnapi, boolean lowMem) throws Exception {
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        int th = threads();
        o.setIntraOpNumThreads(th);
        try { o.setInterOpNumThreads(1); } catch (Throwable ignored) { }
        // Idle pool threads normally busy-wait for the next op, which burns power for nothing.
        // These models are big convolutions, so sleeping between ops costs almost no speed.
        try { o.addConfigEntry("session.intra_op.allow_spinning", "0"); } catch (Throwable ignored) { }
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        if (lowMem) {   // Demucs (316 MB)
            try {
                o.setCPUArenaAllocator(false);
                o.setMemoryPatternOptimization(false);
                o.setExecutionMode(OrtSession.SessionOptions.ExecutionMode.SEQUENTIAL);
            } catch (Throwable ignored) { }
        }
        if (nnapi) {
            addNnapi(o);                                    // phone GPU / NPU, fp16 maths when the runtime supports the flag
        } else {
            try {
                Map<String, String> xo = new HashMap<>();
                xo.put("intra_op_num_threads", String.valueOf(th));
                o.addXnnpack(xo);                           // fast CPU kernels; skipped silently if missing
            } catch (Throwable ignored) { }
        }
        return env.createSession(f.getAbsolutePath(), o);
    }

    /** NNAPI with the FP16 flag (the NPU is far faster and cooler in half precision). Falls back to plain NNAPI on older runtimes. */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void addNnapi(OrtSession.SessionOptions o) throws Exception {
        try {
            Class<?> fc = Class.forName("ai.onnxruntime.providers.NNAPIFlags");
            Enum fp16 = Enum.valueOf((Class) fc, "USE_FP16");
            o.getClass().getMethod("addNnapi", EnumSet.class).invoke(o, EnumSet.of(fp16));
        } catch (Throwable t) {
            o.getClass().getMethod("addNnapi").invoke(o);
        }
    }

    static FloatBuffer directFloats(int n) {
        return ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
    }

    static void fill(FloatBuffer b, float[] a) {
        b.clear();
        b.put(a);
        b.rewind();
    }

    /**
     * Opens a model on the best road. With wantNnapi, the first time (and shape known) both roads
     * are timed on one real-sized input and the faster one is remembered for this model on this phone.
     * Pass shape = null to skip the timing (NNAPI is then used unless a past result says CPU).
     */
    static Sess open(OrtEnvironment env, String key, File f, boolean wantNnapi, long[] shape) throws Exception {
        if (!wantNnapi) return reg(new Sess(build(env, f, false), f, key, false));
        String tk = tuneKey(key, f);
        String v = prefs == null ? null : prefs.getString(tk, null);
        if ("CPU".equals(v)) return reg(new Sess(build(env, f, false), f, key, false));
        if ("NNAPI".equals(v)) {
            try { return reg(new Sess(build(env, f, true), f, key, true)); }
            catch (Throwable e) { remember(tk, "CPU"); return reg(new Sess(build(env, f, false), f, key, false)); }
        }
        OrtSession nn;
        try { nn = build(env, f, true); }
        catch (Throwable e) { remember(tk, "CPU"); return reg(new Sess(build(env, f, false), f, key, false)); }
        if (shape == null) return reg(new Sess(nn, f, key, true));
        OrtSession cp = build(env, f, false);
        long tn;
        try { tn = time(env, nn, shape); }
        catch (Throwable e) {
            try { nn.close(); } catch (Exception ignored) { }
            remember(tk, "CPU");
            return reg(new Sess(cp, f, key, false));
        }
        long tc = time(env, cp, shape);
        boolean useNn = tn < tc * 0.85;   // NNAPI must win clearly: it can differ slightly in precision
        remember(tk, useNn ? "NNAPI" : "CPU");
        if (useNn) { try { cp.close(); } catch (Exception ignored) { } return reg(new Sess(nn, f, key, true)); }
        try { nn.close(); } catch (Exception ignored) { }
        return reg(new Sess(cp, f, key, false));
    }

    private static long time(OrtEnvironment env, OrtSession s, long[] shape) throws Exception {
        int n = 1;
        for (long d : shape) n *= (int) d;
        FloatBuffer b = directFloats(n);
        for (int i = 0; i < n; i++) b.put(i, 0.05f + (i % 13) * 0.01f);
        String in = s.getInputNames().iterator().next();
        long t = 0;
        for (int r = 0; r < 2; r++) {                 // run 1 warms up (NNAPI compiles here), run 2 is timed
            b.rewind();
            long t0 = System.nanoTime();
            try (OnnxTensor x = OnnxTensor.createTensor(env, b, shape);
                 OrtSession.Result res = s.run(Collections.singletonMap(in, x))) {
                res.get(0);
            }
            t = System.nanoTime() - t0;
        }
        return t;
    }

    private static OrtSession.Result once(OrtEnvironment env, Sess x, FloatBuffer in, long[] dims) throws Exception {
        in.rewind();
        try (OnnxTensor t = OnnxTensor.createTensor(env, in, dims)) {   // direct buffer: no copy
            return x.s.run(Collections.singletonMap(x.inName, t));
        }
    }

    /** Runs the model. If an NNAPI session fails, swaps it for a CPU one, remembers that, and retries once. */
    static OrtSession.Result run(OrtEnvironment env, Sess x, FloatBuffer in, long[] dims) throws Exception {
        try {
            return once(env, x, in, dims);
        } catch (Exception e) {
            if (!x.nn || x.f == null) throw e;
            OrtSession old = x.s;
            x.s = build(env, x.f, false);
            x.nn = false;
            REG.remove(old);
            REG.put(x.s, x);
            try { old.close(); } catch (Exception ignored) { }
            remember(tuneKey(x.key, x.f), "CPU");
            return once(env, x, in, dims);
        }
    }
}
