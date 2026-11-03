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
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Map;

/**
 * Native sentence embeddings (MiniLM style BERT encoders). The page tokenizes and downloads the model with
 * OnnxSeparator.download (file lands in files/models/<id>.onnx); this runs the forward pass, mean-pools over the
 * attention mask and L2-normalizes, so only token ids go in and finished vectors come out.
 */
@CapacitorPlugin(name = "PPEmbed")
public class EmbedPlugin extends Plugin {
    private final Object lock = new Object();
    private OrtEnvironment env;
    private OrtSession session;
    private String loadedId;
    private boolean wantsTypeIds;

    @PluginMethod
    public void load(final PluginCall call) {
        final String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        new Thread(() -> {
            try {
                synchronized (lock) {
                    if (session != null && id.equals(loadedId)) { call.resolve(); return; }
                    closeLocked();
                    Accel.init(getContext());
                    File f = new File(new File(getContext().getFilesDir(), "models"), id + ".onnx");
                    if (!f.exists() || f.length() < 1024) throw new IllegalStateException("Model not downloaded: " + id);
                    env = OrtEnvironment.getEnvironment();
                    session = Accel.build(env, f, false, false);   // plain CPU session (XNNPACK + big cores)
                    wantsTypeIds = session.getInputNames().contains("token_type_ids");
                    loadedId = id;
                }
                call.resolve();
            } catch (Throwable e) {
                call.reject("Embedding model: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    /** ids / mask: arrays of equal-length rows (the page pads). Returns base64 float32 [count x dim]. */
    @PluginMethod
    public void run(final PluginCall call) {
        final JSONArray ids = call.getArray("ids"), mask = call.getArray("mask");
        if (ids == null || mask == null || ids.length() == 0 || ids.length() != mask.length()) { call.reject("ids and mask are required"); return; }
        new Thread(() -> {
            try {
                synchronized (lock) {
                    if (session == null) throw new IllegalStateException("Model not loaded");
                    int b = ids.length(), l = ids.getJSONArray(0).length();
                    long[] idv = new long[b * l], mv = new long[b * l];
                    for (int i = 0; i < b; i++) {
                        JSONArray ri = ids.getJSONArray(i), rm = mask.getJSONArray(i);
                        for (int j = 0; j < l; j++) { idv[i * l + j] = ri.getLong(j); mv[i * l + j] = rm.getLong(j); }
                    }
                    long[] shape = new long[]{b, l};
                    Map<String, OnnxTensor> in = new HashMap<>();
                    in.put("input_ids", OnnxTensor.createTensor(env, LongBuffer.wrap(idv), shape));
                    in.put("attention_mask", OnnxTensor.createTensor(env, LongBuffer.wrap(mv), shape));
                    if (wantsTypeIds) in.put("token_type_ids", OnnxTensor.createTensor(env, LongBuffer.wrap(new long[b * l]), shape));
                    float[][][] h;
                    try (OrtSession.Result r = session.run(in)) {
                        h = (float[][][]) r.get(0).getValue();   // last_hidden_state [b, l, dim]
                    } finally {
                        for (OnnxTensor t : in.values()) t.close();
                    }
                    int dim = h[0][0].length;
                    ByteBuffer out = ByteBuffer.allocate(b * dim * 4).order(ByteOrder.LITTLE_ENDIAN);
                    for (int i = 0; i < b; i++) {
                        float[] v = new float[dim];
                        float n = 0;
                        for (int j = 0; j < l; j++) {
                            if (mv[i * l + j] == 0) continue;
                            n++;
                            for (int k = 0; k < dim; k++) v[k] += h[i][j][k];
                        }
                        double norm = 0;
                        for (int k = 0; k < dim; k++) { v[k] /= Math.max(1f, n); norm += v[k] * v[k]; }
                        float inv = (float) (1.0 / Math.max(1e-12, Math.sqrt(norm)));
                        for (int k = 0; k < dim; k++) out.putFloat(v[k] * inv);
                    }
                    JSObject res = new JSObject();
                    res.put("data", Base64.encodeToString(out.array(), Base64.NO_WRAP));
                    res.put("dim", dim);
                    res.put("count", b);
                    call.resolve(res);
                }
            } catch (Throwable e) {
                call.reject("Embedding: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    @PluginMethod
    public void unload(final PluginCall call) {
        new Thread(() -> { synchronized (lock) { closeLocked(); } call.resolve(); }).start();
    }

    private void closeLocked() {
        try { if (session != null) session.close(); } catch (Throwable ignored) { }
        session = null;
        loadedId = null;
    }
}
