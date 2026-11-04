package com.pressplay.media;

import android.os.Process;
import android.util.Base64;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import androidx.core.content.ContextCompat;
import android.content.Intent;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Runs ONNX models natively with ONNX Runtime (multi-threaded, XNNPACK when available).
 * JavaScript sends tensors as base64 float32 and gets base64 float32 back.
 */
@CapacitorPlugin(name = "OnnxSeparator")
public class OnnxSeparatorPlugin extends Plugin {

    private final Map<String, Accel.Sess> sessions = new HashMap<>();
    private OrtEnvironment env;

    @Override
    public void load() {
        Accel.init(getContext());
    }

    private synchronized OrtEnvironment env() {
        if (env == null) env = OrtEnvironment.getEnvironment();
        return env;
    }

    private File modelFile(String id) {
        File dir = new File(getContext().getFilesDir(), "models");
        dir.mkdirs();
        return new File(dir, id + ".onnx");
    }

    @PluginMethod
    public void exists(PluginCall call) {
        String id = call.getString("id");
        JSObject r = new JSObject();
        r.put("ready", id != null && modelFile(id).exists() && modelFile(id).length() > 1024);
        call.resolve(r);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            unloadById(id);
            if (id.startsWith("llm_")) { llm.cancel(); llm.close(); }
            modelFile(id).delete();
        }
        call.resolve();
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String id = call.getString("id");
        final String url = call.getString("url");
        if (id == null || url == null) { call.reject("id and url are required"); return; }
        new Thread(() -> {
            File out = modelFile(id);
            File tmp = new File(out.getParentFile(), id + ".part");
            try {
                if (out.exists() && out.length() > 1024) { call.resolve(); return; }
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(20000);
                c.setReadTimeout(60000);
                c.connect();
                int code = c.getResponseCode();
                if (code / 100 != 2) throw new IOException("Download failed (HTTP " + code + ")");
                long total = c.getContentLength();
                long got = 0;
                int last = -1;
                byte[] buf = new byte[1 << 16];
                try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(tmp)) {
                    int r;
                    while ((r = in.read(buf)) > 0) {
                        o.write(buf, 0, r);
                        got += r;
                        if (total > 0) {
                            int p = (int) (got * 100 / total);
                            if (p != last) {
                                last = p;
                                JSObject e = new JSObject();
                                e.put("id", id);
                                e.put("percent", p);
                                notifyListeners("download", e);
                            }
                        }
                    }
                }
                if (!tmp.renameTo(out)) throw new IOException("Could not save the model file");
                call.resolve();
            } catch (Exception e) {
                tmp.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }).start();
    }

    private final WhisperNative whisper = new WhisperNative();

    private static int[] ints(JSONArray a) throws org.json.JSONException {
        int[] r = new int[a == null ? 0 : a.length()];
        for (int i = 0; i < r.length; i++) r[i] = a.getInt(i);
        return r;
    }

    /** One 30 s Whisper window: log-mel features in (base64 float32), generated token ids out. Models: <id>.onnx in the models folder. */
    @PluginMethod
    public void whisperRun(PluginCall call) {
        Accel.init(getContext());
        final String encId = call.getString("enc"), decId = call.getString("dec"), b64 = call.getString("mel");
        final JSONArray dimsJ = call.getArray("dims"), langIdsJ = call.getArray("langIds"), supJ = call.getArray("suppress"), bsupJ = call.getArray("beginSuppress");
        if (encId == null || decId == null || b64 == null || dimsJ == null) { call.reject("enc, dec, mel and dims are required"); return; }
        final File ef = modelFile(encId), df = modelFile(decId);
        if (!ef.exists() || !df.exists()) { call.reject("Whisper model not downloaded"); return; }
        final WhisperNative.Cfg c = new WhisperNative.Cfg();
        c.sot = call.getInt("sot", 0); c.eot = call.getInt("eot", 0); c.noTs = call.getInt("noTs", 0); c.tsBegin = call.getInt("tsBegin", 0);
        c.task = call.getInt("task", 0); c.lang = call.getInt("lang", 0); c.maxTokens = call.getInt("maxTokens", 224);
        c.useLang = call.getBoolean("useLang", false); c.timestamps = call.getBoolean("timestamps", true);
        new Thread(() -> {
            try { Process.setThreadPriority(5); } catch (Throwable ignored) { }   // before the sessions open, so the ORT thread pool inherits it
            try {
                c.langIds = ints(langIdsJ); c.suppress = ints(supJ); c.beginSuppress = ints(bsupJ);
                byte[] raw = Base64.decode(b64, Base64.NO_WRAP);
                ByteBuffer d = ByteBuffer.allocateDirect(raw.length).order(ByteOrder.nativeOrder());
                d.put(raw);
                d.rewind();
                long[] dims = new long[dimsJ.length()];
                for (int i = 0; i < dims.length; i++) dims[i] = dimsJ.getLong(i);
                WhisperNative.Out o = whisper.run(env(), encId + "|" + decId, ef, df, d.asFloatBuffer(), dims, c);
                JSONArray t = new JSONArray();
                for (int v : o.tokens) t.put(v);
                JSObject r = new JSObject();
                r.put("tokens", t);
                r.put("lang", o.lang);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("Whisper: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    @PluginMethod
    public void whisperUnload(PluginCall call) {
        whisper.close();
        call.resolve();
    }

    // ---------- Parakeet TDT (ParakeetNative): preprocessor + encoder + greedy token-and-duration decoding, all native ----------
    private final ParakeetNative parakeet = new ParakeetNative();

    /** One chunk of 16 kHz mono audio (base64 float32, n samples). Models: <pre>.onnx, <enc>.onnx, <dec>.onnx in the models folder. */
    @PluginMethod
    public void parakeetRun(PluginCall call) {
        Accel.init(getContext());
        final String preId = call.getString("pre"), encId = call.getString("enc"), decId = call.getString("dec"), b64 = call.getString("pcm");
        final int n = call.getInt("n", 0), vocab = call.getInt("vocab", 0), blank = call.getInt("blank", -1);
        if (preId == null || encId == null || decId == null || b64 == null || n <= 0 || blank < 0) { call.reject("pre, enc, dec, pcm, n and blank are required"); return; }
        final File pf = modelFile(preId), ef = modelFile(encId), df = modelFile(decId);
        if (!pf.exists() || !ef.exists() || !df.exists()) { call.reject("Parakeet model not downloaded"); return; }
        new Thread(() -> {
            try { Process.setThreadPriority(5); } catch (Throwable ignored) { }
            try {
                final String k = preId + "|" + encId + "|" + decId;
                if (!parakeet.loaded(k)) whisper.close();                    // never hold both big models in memory
                byte[] raw = Base64.decode(b64, Base64.NO_WRAP);
                ByteBuffer d = ByteBuffer.allocateDirect(raw.length).order(ByteOrder.nativeOrder());
                d.put(raw);
                d.rewind();
                ParakeetNative.Out o = parakeet.run(env(), k, pf, ef, df, d.asFloatBuffer(), Math.min(n, raw.length / 4), vocab, blank);
                JSONArray t = new JSONArray(), f = new JSONArray(), u = new JSONArray();
                for (int i = 0; i < o.tokens.length; i++) { t.put(o.tokens[i]); f.put(o.frames[i]); u.put(o.durs[i]); }
                JSObject r = new JSObject();
                r.put("tokens", t);
                r.put("frames", f);
                r.put("durs", u);
                r.put("nFrames", o.nFrames);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("Parakeet: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    @PluginMethod
    public void parakeetUnload(PluginCall call) {
        parakeet.close();
        call.resolve();
    }

    // ---------- Chat model (LlmNative): tokenizing stays in JS, only token ids cross the bridge ----------
    private final LlmNative llm = new LlmNative();

    /** Loads a decoder-only ONNX chat model with past_key_values inputs (e.g. SmolLM2 int8). File: <id>.onnx in the models folder. */
    @PluginMethod
    public void llmLoad(PluginCall call) {
        Accel.init(getContext());
        final String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        final File f = modelFile(id);
        if (!f.exists()) { call.reject("Chat model not downloaded: " + id); return; }
        new Thread(() -> {
            try { llm.load(env(), f); call.resolve(); }
            catch (Throwable e) { llm.close(); call.reject("Chat model: " + (e.getMessage() != null ? e.getMessage() : e.toString())); }
        }).start();
    }

    /** prompt = token ids. Emits "llmToken" {id} for every new token, resolves with all new ids (the stop token is not included). */
    @PluginMethod
    public void llmGenerate(PluginCall call) {
        final JSONArray promptJ = call.getArray("prompt"), eosJ = call.getArray("eos");
        if (promptJ == null || promptJ.length() == 0) { call.reject("prompt is required"); return; }
        if (!llm.loaded()) { call.reject("Chat model not loaded"); return; }
        final int maxNew = call.getInt("maxNew", 60);
        final Boolean sampleArg = call.getBoolean("sample", true);
        final Double tempArg = call.getDouble("temp", 0.5), topPArg = call.getDouble("topP", 0.9), repArg = call.getDouble("rep", 1.1);
        final boolean sample = sampleArg == null || sampleArg;
        final double temp = tempArg == null ? 0.5 : tempArg, topP = topPArg == null ? 0.9 : topPArg, rep = repArg == null ? 1.1 : repArg;
        new Thread(() -> {
            try { Process.setThreadPriority(5); } catch (Throwable ignored) { }
            try {
                int[] out = llm.generate(env(), ints(promptJ), maxNew, ints(eosJ), sample, temp, topP, rep, id -> {
                    JSObject e = new JSObject();
                    e.put("id", id);
                    notifyListeners("llmToken", e);
                });
                JSONArray t = new JSONArray();
                for (int v : out) t.put(v);
                JSObject r = new JSObject();
                r.put("tokens", t);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("Chat model: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    @PluginMethod
    public void llmCancel(PluginCall call) {
        llm.cancel();
        call.resolve();
    }

    @PluginMethod
    public void llmUnload(PluginCall call) {
        llm.cancel();
        new Thread(() -> { llm.close(); call.resolve(); }).start();   // close() waits for a running generate() to stop
    }

    private Throttle thermalProbe;

    /** Lets the page ask how warm the phone is: factor 0 = cool, higher = rest more between units of work. */
    @PluginMethod
    public synchronized void thermal(PluginCall call) {
        if (thermalProbe == null) thermalProbe = new Throttle(getContext(), 0);
        JSObject r = new JSObject();
        r.put("factor", thermalProbe.peek());
        call.resolve(r);
    }

    @PluginMethod
    public void load(PluginCall call) {
        Accel.init(getContext());
        final String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        final File f = modelFile(id);
        if (!f.exists()) { call.reject("Model not downloaded: " + id); return; }
        final boolean wantNnapi = call.getBoolean("nnapi", false);
        final boolean tune = call.getBoolean("tune", true);   // false = skip the NNAPI vs CPU timing race
        final JSONArray shapeJ = call.getArray("shape");   // optional: lets Accel time NNAPI vs CPU once for this model and keep the winner
        new Thread(() -> {
            try {
                long[] shape = null;
                if (shapeJ != null && shapeJ.length() > 0) { shape = new long[shapeJ.length()]; for (int i = 0; i < shape.length; i++) shape[i] = shapeJ.getLong(i); }
                Accel.Sess x = Accel.open(env(), id, f, wantNnapi, shape, tune);
                synchronized (sessions) {
                    Accel.Sess old = sessions.put(id, x);
                    if (old != null) Accel.close(old);
                }
                JSObject r = new JSObject();
                r.put("inputName", x.inName);
                r.put("outputName", x.outName);
                r.put("accel", x.accel());
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("Could not load model " + id + ": " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    @PluginMethod
    public void run(PluginCall call) {
        final String id = call.getString("id");
        final String b64 = call.getString("data");
        final JSONArray dimsJson = call.getArray("dims");
        new Thread(() -> {
            Accel.Sess x;
            synchronized (sessions) { x = sessions.get(id); }
            if (x == null) { call.reject("Model not loaded: " + id); return; }
            try {
                byte[] raw = Base64.decode(b64, Base64.NO_WRAP);
                ByteBuffer d = ByteBuffer.allocateDirect(raw.length).order(ByteOrder.nativeOrder());
                d.put(raw);
                d.rewind();
                FloatBuffer in = d.asFloatBuffer();
                long[] dims = new long[dimsJson.length()];
                for (int i = 0; i < dims.length; i++) dims[i] = dimsJson.getLong(i);

                JSObject r = runOnce(x, in, dims);
                if (r == null && !"CPU".equals(x.accel())) {
                    // NNAPI (fp16) produced NaN/Inf: reopen this model on the plain CPU, keep it there, and redo the call
                    Accel.Sess cpu = Accel.open(env(), id, modelFile(id), false, null);
                    synchronized (sessions) { Accel.Sess old = sessions.put(id, cpu); if (old != null) Accel.close(old); }
                    x = cpu;
                    in.rewind();
                    r = runOnce(x, in, dims);
                }
                if (r == null) { call.reject("Model " + id + " returned NaN/Inf"); return; }
                call.resolve(r);
            } catch (Throwable e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }).start();
    }

    /** Runs one session; returns null when the output holds NaN/Inf. */
    private JSObject runOnce(Accel.Sess x, FloatBuffer in, long[] dims) throws Exception {
        try (OrtSession.Result res = Accel.run(env(), x, in, dims)) {
            OnnxTensor out = (OnnxTensor) res.get(0);
            FloatBuffer ob = out.getFloatBuffer();
            int n = ob.remaining();
            for (int i = 0; i < n; i++) { float v = ob.get(ob.position() + i); if (Float.isNaN(v) || Float.isInfinite(v)) return null; }
            byte[] ba = new byte[n * 4];
            ByteBuffer.wrap(ba).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().put(ob);   // one copy out
            JSONArray od = new JSONArray();
            for (long dd : out.getInfo().getShape()) od.put(dd);
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(ba, Base64.NO_WRAP));
            r.put("dims", od);
            r.put("outputName", x.outName);
            return r;
        }
    }

    /**
     * Whole separation in Java (decode, STFT, model, masks, WAV out) for Spleeter 4 stems and MDX-Net.
     * kind "demucs": model, sources (model order). kind "sp4": prefix ("sp4_" or "sp4f_"), stems = wanted names. kind "mdx": model, nfft, dimF, comp.
     */
    @PluginMethod
    public void separate(PluginCall call) {
        Accel.init(getContext());
        final String kind = call.getString("kind");
        final String input = call.getString("input");
        final JSONArray stemsJ = call.getArray("stems");
        final String prefix = call.getString("prefix", "sp4_");
        final String model = call.getString("model", "mdx_voc");
        final JSONArray srcJ = call.getArray("sources");
        final boolean nnapi = call.getBoolean("nnapi", true);
        final boolean tune = call.getBoolean("tune", true);   // false = skip the NNAPI vs CPU timing race
        final int nfft = call.getInt("nfft", 7680), dimF = call.getInt("dimF", 3072);
        final double comp = call.getDouble("comp", 1.021);
        final double duty = call.getDouble("duty", 0.0);   // optional fixed extra rest (0.2 = sleep 20% of each chunk's time); thermal easing is always on
        if (kind == null || input == null || stemsJ == null) { call.reject("kind, input and stems are required"); return; }
        new Thread(() -> {
            // Slightly below the UI/audio threads, but NOT the background cgroup (that pins work to the little cores).
            // Set before any session opens so the ONNX Runtime thread pool inherits it.
            try { Process.setThreadPriority(5); } catch (Throwable ignored) { }
            final Throttle th = new Throttle(getContext(), duty);
            final List<Accel.Sess> open = new ArrayList<>();
            final Map<String, File> outs = new LinkedHashMap<>();
            long t0 = System.currentTimeMillis();
            try {
                final String[] want = new String[stemsJ.length()];
                for (int i = 0; i < want.length; i++) want[i] = stemsJ.getString(i);
                File dir = new File(getContext().getCacheDir(), "stems");
                dir.mkdirs();
                String stamp = String.valueOf(System.currentTimeMillis());
                for (String n : want) outs.put(n, new File(dir, stamp + "-" + n + ".wav"));
                SpleeterNative.Progress prog = fr -> {
                    JSObject e = new JSObject();
                    e.put("fraction", fr);
                    notifyListeners("progress", e);
                    if (fr < 1.0) th.tick();   // runs per chunk on this worker thread: eases off when the phone warms up
                };
                File inFile = new File(input);
                SpleeterNative.Audio au = SpleeterNative.decode(inFile);
                inFile.delete();   // the decoded audio is in memory now
                String accel;
                if ("sp4".equals(kind)) {
                    String[] names = {"vocals", "drums", "bass", "other"};
                    Accel.Sess[] ss = new Accel.Sess[4];
                    for (int i = 0; i < 4; i++) {
                        File mf = modelFile(prefix + names[i]);
                        if (!mf.exists()) throw new IOException("Model not downloaded: " + prefix + names[i]);
                        try { ss[i] = Accel.open(env(), prefix + names[i], mf, nnapi, new long[] {2, 1, SpleeterNative.T, SpleeterNative.F}, tune); }
                        catch (Throwable e) { throw new IOException("Could not load model " + prefix + names[i] + ": " + (e.getMessage() != null ? e.getMessage() : e.toString())); }
                        open.add(ss[i]);
                    }
                    int[][] idx = new int[want.length][];
                    File[] files = new File[want.length];
                    for (int i = 0; i < want.length; i++) {
                        switch (want[i]) {
                            case "Vocals": idx[i] = new int[] {0}; break;
                            case "Drums": idx[i] = new int[] {1}; break;
                            case "Bass": idx[i] = new int[] {2}; break;
                            case "Other": idx[i] = new int[] {3}; break;
                            default: idx[i] = new int[] {1, 2, 3}; break;   // Instrumental
                        }
                        files[i] = outs.get(want[i]);
                    }
                    StemNative.sp4(env(), ss, au, idx, files, prog);
                    int nn = 0;
                    for (Accel.Sess s : ss) if (s.nn) nn++;
                    accel = nn == 4 ? "NNAPI" : nn == 0 ? "CPU" : "NNAPI+CPU";
                } else if ("demucs".equals(kind)) {
                    File mf = modelFile(model);
                    if (!mf.exists()) throw new IOException("Model not downloaded: " + model);
                    Accel.Sess s;
                    try { s = Accel.open(env(), model, mf, false, null); }   // CPU: NNAPI rejects or crawls on Demucs
                    catch (Throwable e) { throw new IOException("Could not load model " + model + ": " + (e.getMessage() != null ? e.getMessage() : e.toString())); }
                    open.add(s);
                    List<String> srcs = new ArrayList<>();
                    for (int i = 0; i < srcJ.length(); i++) srcs.add(srcJ.getString(i));
                    int[][] rows = new int[want.length][];
                    File[] files = new File[want.length];
                    for (int i = 0; i < want.length; i++) {
                        if ("Instrumental".equals(want[i])) {
                            List<Integer> r = new ArrayList<>();
                            for (int k = 0; k < srcs.size(); k++) if (!"vocals".equals(srcs.get(k))) r.add(k);
                            rows[i] = new int[r.size()];
                            for (int k = 0; k < rows[i].length; k++) rows[i][k] = r.get(k);
                        } else {
                            rows[i] = new int[] {srcs.indexOf(want[i].toLowerCase())};
                        }
                        files[i] = outs.get(want[i]);
                    }
                    StemNative.demucs(env(), s, au, rows, files, prog);
                    accel = s.accel();
                } else {
                    File mf = modelFile(model);
                    if (!mf.exists()) throw new IOException("Model not downloaded: " + model);
                    Accel.Sess s;
                    try { s = Accel.open(env(), model, mf, nnapi, new long[] {1, 4, dimF, 256}, tune); }
                    catch (Throwable e) { throw new IOException("Could not load model " + model + ": " + (e.getMessage() != null ? e.getMessage() : e.toString())); }
                    open.add(s);
                    StemNative.mdx(env(), s, au, nfft, dimF, comp, outs.get("Vocals"), outs.get("Instrumental"), prog);
                    accel = s.accel();
                }
                JSObject files = new JSObject();
                for (Map.Entry<String, File> e : outs.entrySet()) files.put(e.getKey(), e.getValue().getAbsolutePath());
                JSObject r = new JSObject();
                r.put("files", files);
                r.put("seconds", (System.currentTimeMillis() - t0) / 1000.0);
                r.put("accel", accel);
                call.resolve(r);
            } catch (Throwable e) {
                for (File f : outs.values()) f.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            } finally {
                for (Accel.Sess s : open) Accel.close(s);
            }
        }).start();
    }

    /** Keeps the process alive and the CPU awake while a split runs (screen off, app in background). */
    private static boolean keepSplit = false, keepPlay = false;

    /** mode "split" (default) = a stem split is running; mode "play" = background playback without the native player.
     *  The two are tracked separately and the service only stops when neither wants it, so pausing playback can't kill a split. */
    @PluginMethod
    public void keepAlive(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        String mode = call.getString("mode", "split");
        try {
            synchronized (OnnxSeparatorPlugin.class) {
                if ("play".equals(mode)) keepPlay = on; else keepSplit = on;
                Intent i = new Intent(getContext(), KeepAliveService.class);
                if (keepSplit || keepPlay) {
                    i.putExtra("mode", keepSplit ? "split" : "play");
                    ContextCompat.startForegroundService(getContext(), i);
                } else {
                    getContext().stopService(i);
                }
            }
        } catch (Throwable ignored) { }   // never block a split because the service could not start
        call.resolve();
    }

    @PluginMethod
    public void clearTune(PluginCall call) {
        Accel.init(getContext());
        Accel.clearTune();
        call.resolve();
    }

    @PluginMethod
    public void deleteFiles(PluginCall call) {
        JSONArray a = call.getArray("paths");
        if (a != null) for (int i = 0; i < a.length(); i++) {
            try { new File(a.getString(i)).delete(); } catch (Exception ignored) { }
        }
        call.resolve();
    }

    @PluginMethod
    public void unload(PluginCall call) {
        String id = call.getString("id");
        if (id != null) unloadById(id);
        call.resolve();
    }

    private void unloadById(String id) {
        synchronized (sessions) {
            Accel.close(sessions.remove(id));
        }
    }
}
