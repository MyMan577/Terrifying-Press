package com.pressplay.media;

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

    @PluginMethod
    public void load(PluginCall call) {
        Accel.init(getContext());
        final String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        final File f = modelFile(id);
        if (!f.exists()) { call.reject("Model not downloaded: " + id); return; }
        final boolean wantNnapi = call.getBoolean("nnapi", false);
        new Thread(() -> {
            try {
                Accel.Sess x = Accel.open(env(), id, f, wantNnapi, null);   // no timing here: reuses the verdict from native runs
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

                try (OrtSession.Result res = Accel.run(env(), x, in, dims)) {
                    OnnxTensor out = (OnnxTensor) res.get(0);
                    FloatBuffer ob = out.getFloatBuffer();
                    byte[] ba = new byte[ob.remaining() * 4];
                    ByteBuffer.wrap(ba).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().put(ob);   // one copy out
                    JSONArray od = new JSONArray();
                    for (long dd : out.getInfo().getShape()) od.put(dd);
                    JSObject r = new JSObject();
                    r.put("data", Base64.encodeToString(ba, Base64.NO_WRAP));
                    r.put("dims", od);
                    r.put("outputName", x.outName);
                    call.resolve(r);
                }
            } catch (Throwable e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }).start();
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
        final int nfft = call.getInt("nfft", 7680), dimF = call.getInt("dimF", 3072);
        final double comp = call.getDouble("comp", 1.021);
        if (kind == null || input == null || stemsJ == null) { call.reject("kind, input and stems are required"); return; }
        new Thread(() -> {
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
                        try { ss[i] = Accel.open(env(), prefix + names[i], mf, nnapi, new long[] {2, 1, SpleeterNative.T, SpleeterNative.F}); }
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
                    try { s = Accel.open(env(), model, mf, nnapi, new long[] {1, 4, dimF, 256}); }
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
    @PluginMethod
    public void keepAlive(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        try {
            Intent i = new Intent(getContext(), KeepAliveService.class);
            if (on) ContextCompat.startForegroundService(getContext(), i);
            else getContext().stopService(i);
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
