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
    // Per-split overrides from the page's "Custom" optimization level. Set at the start of a split, cleared when it ends.
    private static volatile int customThreads = 0;       // 0 = automatic (fast cores only, max MAX_THREADS)
    private static volatile boolean customSpin = false;  // true = idle pool threads busy-wait (faster, hotter)
    private static volatile boolean customLean = false;  // true = low-RAM session settings even for small models
    private static volatile boolean fastMode = false;    // no optimization level: spinning pool, and the memory arena stays on for big models when RAM allows
    private static long totalRam = 0;

    static void setCustom(int threads, boolean spin, boolean lean) { setCustom(threads, spin, lean, false); }

    static void setCustom(int threads, boolean spin, boolean lean, boolean fast) {
        customThreads = Math.max(0, threads); customSpin = spin || fast; customLean = lean; fastMode = fast && !lean;
    }

    static void clearCustom() { customThreads = 0; customSpin = false; customLean = false; fastMode = false; }

    /** Demucs (316 MB) with the arena on peaks around 1-1.5 GB: only on phones with about 6 GB of RAM or more. */
    private static boolean roomy() { return totalRam >= 5_500_000_000L; }
    /** Upper limit for inference threads. 4 fast cores finish about as quickly as 6 (the slower mid cores
     *  make the pool wait at every sync point) and draw noticeably less power. Raise to 5 or 6 if you prefer speed. */
    private static final int MAX_THREADS = 4;
    /** Bump this when session settings change, so old "NNAPI vs CPU" timing verdicts are measured again. */
    private static final String TUNE_VER = ":v4";   // v4: the accelerated road is the Qualcomm NPU (QNN HTP) on Snapdragon
    private static String tuneKey(String key, File f) { return key + ":" + f.length() + TUNE_VER; }
    private static final Map<OrtSession, Sess> REG = Collections.synchronizedMap(new IdentityHashMap<OrtSession, Sess>());

    static synchronized void init(Context c) {
        if (prefs == null) prefs = c.getApplicationContext().getSharedPreferences("ppv_accel", Context.MODE_PRIVATE);
        if (libDir == null) {
            libDir = c.getApplicationInfo().nativeLibraryDir;
            // The NPU (cDSP) loads its half of QNN (libQnnHtpV**Skel.so) from these folders: the app's own libraries first.
            try { android.system.Os.setenv("ADSP_LIBRARY_PATH", libDir + ";/vendor/dsp/cdsp;/vendor/lib/rfsa/adsp;/system/lib/rfsa/adsp;/dsp", true); } catch (Throwable ignored) { }
        }
        if (totalRam == 0) {
            try {
                android.app.ActivityManager am = (android.app.ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
                android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                totalRam = mi.totalMem;
            } catch (Throwable ignored) { totalRam = -1; }
        }
    }

    static void clearTune() {
        if (prefs != null) prefs.edit().clear().apply();
    }

    private static void remember(String k, String v) {
        if (prefs != null) prefs.edit().putString(k, v).apply();
    }

    private static String libDir = null;
    private static Boolean qnnOk = null;

    /** Snapdragon phone with the QNN HTP backend packed in the APK. */
    static synchronized boolean qnn() {
        if (qnnOk != null) return qnnOk;
        boolean soc = false;
        try {
            String m = android.os.Build.VERSION.SDK_INT >= 31 ? android.os.Build.SOC_MANUFACTURER : "";
            soc = "QTI".equalsIgnoreCase(m) || "Qualcomm".equalsIgnoreCase(m) || android.os.Build.HARDWARE.toLowerCase().contains("qcom");
        } catch (Throwable ignored) { }
        return qnnOk = soc && libDir != null && new File(libDir, "libQnnHtp.so").exists();
    }

    /** Name of the accelerated road on this phone, for the result line. */
    static String accelName() { return qnn() ? "NPU" : "NNAPI"; }

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
        String accel() { return nn ? accelName() : "CPU"; }
        String guard, guardVal;   // openDemucs crash guard: pref key to settle after the first good accelerated run
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
        if (customThreads > 0) return Math.max(1, Math.min(customThreads, Runtime.getRuntime().availableProcessors()));   // the user's pick wins over the automatic limit
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
        return build(env, f, nnapi, customLean || (f.length() > 100000000L && !(fastMode && roomy())));
    }

    /** lowMem = no extra memory pools or copies of the weights (right for one huge model, wrong for loops that run a session thousands of times). */
    static OrtSession build(OrtEnvironment env, File f, boolean nnapi, boolean lowMem) throws Exception {
        if (nnapi && qnn()) return buildQnn(env, f);
        return buildPlain(env, f, nnapi, lowMem);
    }

    /** Compiled NPU graph saved next to the model, so only the first load pays the (long) compile. */
    static File qnnCache(File f) { return new File(f.getParentFile(), f.getName() + ".qnn.onnx"); }

    /**
     * Qualcomm NPU (HTP) in fp16. Ops the NPU cannot take stay on the CPU. Free batch dims are fixed to 1 (the NPU
     * needs static shapes). The first load compiles the graph and saves it (EP context); later loads read that file.
     */
    private static OrtSession buildQnn(OrtEnvironment env, File f) throws Exception {
        File ctx = qnnCache(f);
        if (ctx.exists() && ctx.lastModified() < f.lastModified()) ctx.delete();   // model replaced: compile again
        if (ctx.exists()) {
            try { return env.createSession(ctx.getAbsolutePath(), qnnOpts(false, ctx)); }
            catch (Throwable e) { ctx.delete(); }
        }
        try { return env.createSession(f.getAbsolutePath(), qnnOpts(true, ctx)); }
        catch (Throwable e) {
            ctx.delete();
            return env.createSession(f.getAbsolutePath(), qnnOpts(false, ctx));    // the context dump itself can fail on some graphs
        }
    }

    private static OrtSession.SessionOptions qnnOpts(boolean dump, File ctx) throws Exception {
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        o.setIntraOpNumThreads(threads());                  // for the ops left on the CPU
        try { o.addConfigEntry("session.intra_op.allow_spinning", customSpin ? "1" : "0"); } catch (Throwable ignored) { }
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        for (String d : new String[] {"batch_size", "batch", "N"}) { try { o.setSymbolicDimensionValue(d, 1); } catch (Throwable ignored) { } }
        if (dump) {
            o.addConfigEntry("ep.context_enable", "1");
            o.addConfigEntry("ep.context_embed_mode", "1");
            o.addConfigEntry("ep.context_file_path", ctx.getAbsolutePath());
        }
        Map<String, String> q = new HashMap<>();
        q.put("backend_path", "libQnnHtp.so");
        q.put("htp_performance_mode", "sustained_high_performance");   // long splits: fast without the burst-mode heat spike
        q.put("enable_htp_fp16_precision", "1");                       // float models run in fp16 on the NPU
        o.addQnn(q);
        return o;
    }

    private static OrtSession buildPlain(OrtEnvironment env, File f, boolean nnapi, boolean lowMem) throws Exception {
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        int th = threads();
        o.setIntraOpNumThreads(th);
        try { o.setInterOpNumThreads(1); } catch (Throwable ignored) { }
        // Idle pool threads normally busy-wait for the next op, which burns power for nothing.
        // These models are big convolutions, so sleeping between ops costs almost no speed.
        try { o.addConfigEntry("session.intra_op.allow_spinning", customSpin ? "1" : "0"); } catch (Throwable ignored) { }
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
        return open(env, key, f, wantNnapi, shape, true);
    }

    /** tune = false: never run the NNAPI-vs-CPU race. A verdict from an earlier race is still honoured, otherwise NNAPI is used
     *  as asked (run() already swaps to CPU on a crash or NaN and remembers it). */
    static Sess open(OrtEnvironment env, String key, File f, boolean wantNnapi, long[] shape, boolean tune) throws Exception {
        if (!tune) shape = null;
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

    /**
     * Demucs on the Qualcomm NPU (QNN HTP). Plain NNAPI rejects or crawls on Demucs, so other phones stay on the CPU.
     * The NPU takes the convolutions and attention, and the ops it can't run (the STFT inside the graph) stay on the CPU.
     * tune (the "Speed test NPU vs CPU" checkbox): time one real segment on both roads and remember the faster one.
     * Without it the NPU is used as asked, and only a crash or NaN output moves Demucs to the CPU (remembered), like other models.
     * Crash guard: "TRYING" is written (synchronously) before the NPU is touched and cleared after the first good NPU run. If the
     * app dies in between (compile, race or first run), the next split finds "TRYING" and uses the CPU for good.
     * Needs a roomy phone: a race loads both copies of the 316 MB model.
     */
    static final int NPU_LIMIT_S = 150;

    /** True when this Demucs load will compile the NPU graph first (slow, once): the page shows a note. */
    static boolean demucsCompiles(String key, File f, boolean wantNpu) {
        if (!wantNpu || !qnn() || !roomy() || prefs == null) return false;
        String v = prefs.getString(tuneKey(key, f), null);
        return !"CPU".equals(v) && !"TRYING".equals(v) && !qnnCache(f).exists();
    }

    static Sess openDemucs(OrtEnvironment env, String key, File f, boolean wantNpu, int seg, boolean tune) throws Exception {
        if (!wantNpu || !qnn() || !roomy() || prefs == null) return open(env, key, f, false, null);
        String tk = tuneKey(key, f), v = prefs.getString(tk, null);
        if ("TRYING".equals(v)) { remember(tk, "CPU"); v = "CPU"; }
        if ("CPU".equals(v)) return open(env, key, f, false, null);
        final boolean race = tune && v == null;               // a verdict from an earlier race is honoured
        prefs.edit().putString(tk, "TRYING").commit();
        // Time limit: the first NPU load compiles the whole 316 MB graph. If that (plus the race) is not done in
        // NPU_LIMIT_S, this split goes to the CPU and Demucs stays on the CPU (unless that late load was a speed test it won),
        // and the late NPU session is closed. The compiled graph it saves makes any later NPU load quick.
        final Sess[] got = new Sess[1];
        final Throwable[] err = new Throwable[1];
        final boolean[] late = new boolean[1];
        Thread t = new Thread(() -> {
            Sess r = null; Throwable e0 = null;
            try { r = open(env, key, f, true, race ? new long[] {1, 2, seg} : null, race); } catch (Throwable e) { e0 = e; }
            synchronized (got) {
                if (late[0]) { if (r != null) close(r); return; }
                got[0] = r; err[0] = e0; got.notifyAll();
            }
        }, "demucs-npu-load");
        t.start();
        Sess s;
        synchronized (got) {
            long end = System.currentTimeMillis() + NPU_LIMIT_S * 1000L;
            while (got[0] == null && err[0] == null) {
                long left = end - System.currentTimeMillis();
                if (left <= 0) break;
                got.wait(left);
            }
            if (got[0] == null && err[0] == null) late[0] = true;
            s = got[0];
        }
        if (s == null) { remember(tk, "CPU"); return open(env, key, f, false, null); }   // too slow, or failed: CPU
        if (!s.nn) return s;                                  // the race or the NPU build already wrote "CPU"
        prefs.edit().putString(tk, "TRYING").commit();        // the race wrote "NNAPI": guard the first real run too
        s.guard = tk;
        s.guardVal = race || "NNAPI".equals(v) ? "NNAPI" : null;   // after the first good run: keep the verdict, or no note at all
        return s;
    }

    /** True when the first output has no NaN/Inf (NNAPI fp16 can overflow). Anything unreadable counts as fine. */
    private static boolean allFinite(OrtSession.Result r) {
        try {
            Object o = r.get(0);
            if (!(o instanceof OnnxTensor)) return true;
            FloatBuffer fb = ((OnnxTensor) o).getFloatBuffer();
            int p = fb.position(), n = fb.remaining();
            for (int i = 0; i < n; i++) { float v = fb.get(p + i); if (Float.isNaN(v) || Float.isInfinite(v)) return false; }
            return true;
        } catch (Throwable t) { return true; }
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
                if (!allFinite(res)) return Long.MAX_VALUE;   // a road that gives NaN never wins the race
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

    /** Runs the model. If an NNAPI session fails or returns NaN/Inf, swaps it for a CPU one, remembers that, and retries once. */
    static OrtSession.Result run(OrtEnvironment env, Sess x, FloatBuffer in, long[] dims) throws Exception {
        try {
            OrtSession.Result r = once(env, x, in, dims);
            if (!x.nn || x.f == null || allFinite(r)) {
                if (x.nn && x.guard != null && prefs != null) {   // first good NPU run: the crash guard is no longer needed
                    if (x.guardVal == null) prefs.edit().remove(x.guard).apply(); else remember(x.guard, x.guardVal);
                    x.guard = null;
                }
                return r;
            }
            try { r.close(); } catch (Exception ignored) { }
        } catch (Exception e) {
            if (!x.nn || x.f == null) throw e;
        }
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
