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
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Native sentence embeddings (MiniLM style BERT encoders), all on background threads so the page never waits on them.
 *
 * Fully native route (new): loadVocab reads the model's tokenizer.json, then embed takes plain strings, tokenizes them
 * in Java (MiniTokenizer), runs the model, mean-pools over the attention mask and L2-normalizes. The page no longer
 * loads transformers.js or tokenizes anything for MiniLM.
 *
 * Older route (kept so an older page keeps working): the page tokenizes and sends ids/mask to run().
 *
 * The model and tokenizer.json are downloaded with OnnxSeparator.download (files land in files/models/<id>.onnx).
 */
@CapacitorPlugin(name = "PPEmbed")
public class EmbedPlugin extends Plugin {
    private final Object lock = new Object();
    private OrtEnvironment env;
    private OrtSession session;
    private String loadedId;
    private boolean wantsTypeIds;
    private MiniTokenizer tok;
    private String tokId;

    private File modelFile(String id) { return new File(new File(getContext().getFilesDir(), "models"), id + ".onnx"); }

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
                    File f = modelFile(id);
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

    /** Reads the WordPiece vocabulary out of a downloaded tokenizer.json (model.vocab maps token to id). */
    @PluginMethod
    public void loadVocab(final PluginCall call) {
        final String id = call.getString("id");
        if (id == null) { call.reject("id is required"); return; }
        new Thread(() -> {
            try {
                synchronized (lock) {
                    if (tok != null && id.equals(tokId)) { call.resolve(); return; }
                    File f = modelFile(id);
                    if (!f.exists() || f.length() < 1024) throw new IllegalStateException("Tokenizer not downloaded: " + id);
                    ByteArrayOutputStream buf = new ByteArrayOutputStream((int) f.length());
                    try (InputStream in = new FileInputStream(f)) {
                        byte[] b = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                    }
                    JSONObject vocabJson = new JSONObject(new String(buf.toByteArray(), "UTF-8")).getJSONObject("model").getJSONObject("vocab");
                    Map<String, Integer> vocab = new HashMap<>(vocabJson.length() * 2);
                    Iterator<String> keys = vocabJson.keys();
                    while (keys.hasNext()) { String k = keys.next(); vocab.put(k, vocabJson.getInt(k)); }
                    tok = new MiniTokenizer(vocab);
                    tokId = id;
                }
                call.resolve();
            } catch (Throwable e) {
                call.reject("Tokenizer: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    /** texts: array of strings. Tokenizes natively, pads to the longest in the batch. Returns base64 float32 [count x dim]. */
    @PluginMethod
    public void embed(final PluginCall call) {
        final JSONArray texts = call.getArray("texts");
        final Integer ml = call.getInt("maxLen", 128);
        final int maxLen = Math.max(8, Math.min(512, ml == null ? 128 : ml));
        if (texts == null || texts.length() == 0) { call.reject("texts are required"); return; }
        new Thread(() -> {
            try {
                synchronized (lock) {
                    if (session == null) throw new IllegalStateException("Model not loaded");
                    if (tok == null) throw new IllegalStateException("Vocabulary not loaded");
                    int b = texts.length(), l = 2;
                    int[][] enc = new int[b][];
                    for (int i = 0; i < b; i++) { enc[i] = tok.encode(texts.optString(i, ""), maxLen); l = Math.max(l, enc[i].length); }
                    long[] idv = new long[b * l], mv = new long[b * l];
                    for (int i = 0; i < b; i++) {
                        for (int j = 0; j < l; j++) {
                            if (j < enc[i].length) { idv[i * l + j] = enc[i][j]; mv[i * l + j] = 1; }
                            else idv[i * l + j] = tok.pad;
                        }
                    }
                    call.resolve(forward(idv, mv, b, l));
                }
            } catch (Throwable e) {
                call.reject("Embedding: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    /** Older route: ids / mask are arrays of equal-length rows (the page tokenized and padded). Returns base64 float32 [count x dim]. */
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
                    call.resolve(forward(idv, mv, b, l));
                }
            } catch (Throwable e) {
                call.reject("Embedding: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    /** Forward pass, mean-pool over the attention mask, L2-normalize. Caller holds the lock. */
    private JSObject forward(long[] idv, long[] mv, int b, int l) throws Exception {
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
        return res;
    }

    @PluginMethod
    public void unload(final PluginCall call) {
        new Thread(() -> { synchronized (lock) { closeLocked(); } call.resolve(); }).start();
    }

    private void closeLocked() {
        try { if (session != null) session.close(); } catch (Throwable ignored) { }
        session = null;
        loadedId = null;
        // the tokenizer is small and independent of the session, so it stays loaded
    }
}
