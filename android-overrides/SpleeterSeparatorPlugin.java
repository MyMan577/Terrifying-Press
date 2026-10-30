package com.pressplay.media;

import android.util.Base64;

import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/** Capacitor entry point for the native 2-stem separator. */
@CapacitorPlugin(name = "SpleeterSeparator")
public class SpleeterSeparatorPlugin extends Plugin {

    private File modelFile(String id) {
        return new File(new File(getContext().getFilesDir(), "models"), id + ".onnx");
    }

    private static String msg(Throwable e) {
        return e.getMessage() != null ? e.getMessage() : e.toString();
    }

    /** Saves the track (base64) into the cache folder and returns its path. */
    @PluginMethod
    public void writeInput(PluginCall call) {
        final String name = call.getString("name", "input.audio");
        final String data = call.getString("data");
        if (data == null) { call.reject("data is required"); return; }
        new Thread(() -> {
            try {
                File f = new File(getContext().getCacheDir(), "in_" + name.replaceAll("[^A-Za-z0-9._-]", "_"));
                try (FileOutputStream o = new FileOutputStream(f)) {
                    o.write(Base64.decode(data, Base64.NO_WRAP));
                }
                JSObject r = new JSObject();
                r.put("path", f.getAbsolutePath());
                call.resolve(r);
            } catch (Throwable e) {
                call.reject(msg(e));
            }
        }).start();
    }

    /**
     * Separates a saved track into vocals and instrumental WAV files.
     * Options: sharp (number), nnapi (boolean, default true = try GPU/NPU first).
     * Emits "progress" events. Resolves with vocals, instrumental, seconds, accel.
     */
    @PluginMethod
    public void separate(PluginCall call) {
        final String input = call.getString("input");
        if (input == null) { call.reject("input is required"); return; }
        Double sharpArg = call.getDouble("sharp", 1.0);
        final double sharp = sharpArg == null ? 1.0 : sharpArg;
        Boolean nnArg = call.getBoolean("nnapi", true);
        final boolean useNnapi = nnArg == null ? true : nnArg;
        final String tag = String.valueOf(System.currentTimeMillis());
        new Thread(() -> {
            OrtSession vS = null, aS = null;
            long t0 = System.nanoTime();
            try {
                File vm = modelFile("sp_vocals"), am = modelFile("sp_accomp");
                if (!vm.exists() || !am.exists()) {
                    throw new IllegalStateException("The 2-stem model is not downloaded yet. Press Split again to download it.");
                }
                File dir = getContext().getCacheDir();
                File inFile = new File(input);
                SpleeterNative.Audio au = SpleeterNative.decode(inFile);
                inFile.delete();

                OrtEnvironment env = OrtEnvironment.getEnvironment();
                vS = SpleeterNative.open(env, vm, useNnapi);
                aS = SpleeterNative.open(env, am, useNnapi);

                File outV = new File(dir, "sep_" + tag + "_vocals.wav");
                File outA = new File(dir, "sep_" + tag + "_instrumental.wav");
                SpleeterNative.separate(env, vS, aS, au, sharp, outV, outA, f -> {
                    JSObject e = new JSObject();
                    e.put("fraction", f);
                    notifyListeners("progress", e);
                });

                double secs = (System.nanoTime() - t0) / 1e9;
                JSObject r = new JSObject();
                r.put("vocals", outV.getAbsolutePath());
                r.put("instrumental", outA.getAbsolutePath());
                r.put("seconds", secs);
                r.put("accel", SpleeterNative.accelUsed);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject(msg(e));
            } finally {
                try { if (vS != null) vS.close(); } catch (Exception ignored) { }
                try { if (aS != null) aS.close(); } catch (Exception ignored) { }
            }
        }).start();
    }
}
