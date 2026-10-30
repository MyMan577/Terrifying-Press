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
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Runs ONNX models natively with ONNX Runtime (multi-threaded, XNNPACK when available).
 * JavaScript sends tensors as base64 float32 and gets base64 float32 back.
 */
@CapacitorPlugin(name = "OnnxSeparator")
public class OnnxSeparatorPlugin extends Plugin {

    private final Map<String, OrtSession> sessions = new HashMap<>();
    private final Map<String, String[]> ioNames = new HashMap<>();
    private OrtEnvironment env;

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
        final String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        final File f = modelFile(id);
        if (!f.exists()) { call.reject("Model not downloaded: " + id); return; }
        new Thread(() -> {
            try {
                OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
                int threads = Math.max(1, Math.min(6, Runtime.getRuntime().availableProcessors() - 2));
                opts.setIntraOpNumThreads(threads);
                opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
                try {
                    opts.addXnnpack(Collections.<String, String>emptyMap());   // fast CPU kernels; falls back silently if missing
                } catch (Exception ignored) { }
                OrtSession s = env().createSession(f.getAbsolutePath(), opts);
                synchronized (sessions) {
                    OrtSession old = sessions.put(id, s);
                    if (old != null) old.close();
                    ioNames.put(id, new String[] {
                        s.getInputNames().iterator().next(),
                        s.getOutputNames().iterator().next()
                    });
                }
                JSObject r = new JSObject();
                r.put("inputName", ioNames.get(id)[0]);
                r.put("outputName", ioNames.get(id)[1]);
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
            OrtSession s;
            String[] names;
            synchronized (sessions) {
                s = sessions.get(id);
                names = ioNames.get(id);
            }
            if (s == null || names == null) { call.reject("Model not loaded: " + id); return; }
            try {
                byte[] raw = Base64.decode(b64, Base64.NO_WRAP);
                FloatBuffer fb = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer();
                float[] input = new float[fb.remaining()];
                fb.get(input);

                long[] dims = new long[dimsJson.length()];
                for (int i = 0; i < dims.length; i++) dims[i] = dimsJson.getLong(i);

                try (OnnxTensor t = OnnxTensor.createTensor(env(), FloatBuffer.wrap(input), dims);
                     OrtSession.Result res = s.run(Collections.singletonMap(names[0], t))) {
                    OnnxTensor out = (OnnxTensor) res.get(0);
                    FloatBuffer ob = out.getFloatBuffer();
                    float[] o = new float[ob.remaining()];
                    ob.get(o);
                    long[] odims = out.getInfo().getShape();

                    ByteBuffer bb = ByteBuffer.allocate(o.length * 4).order(ByteOrder.LITTLE_ENDIAN);
                    bb.asFloatBuffer().put(o);

                    JSONArray od = new JSONArray();
                    for (long d : odims) od.put(d);

                    JSObject r = new JSObject();
                    r.put("data", Base64.encodeToString(bb.array(), Base64.NO_WRAP));
                    r.put("dims", od);
                    r.put("outputName", names[1]);
                    call.resolve(r);
                }
            } catch (Throwable e) {
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }).start();
    }

    @PluginMethod
    public void unload(PluginCall call) {
        String id = call.getString("id");
        if (id != null) unloadById(id);
        call.resolve();
    }

    private void unloadById(String id) {
        synchronized (sessions) {
            OrtSession s = sessions.remove(id);
            ioNames.remove(id);
            if (s != null) {
                try { s.close(); } catch (Exception ignored) { }
            }
        }
    }
}
