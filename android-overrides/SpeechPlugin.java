package com.pressplay.media;

import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Bloop's native voice: reads a sentence out loud with the phone's own text-to-speech engine. Nothing is downloaded by the app.
 * speak() resolves with done=true when the sentence was read to the end, done=false when it was cut short by stop() or a newer speak().
 */
@CapacitorPlugin(name = "PPSpeech")
public class SpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, PluginCall> calls = new ConcurrentHashMap<>();
    private final List<Runnable> waiting = new ArrayList<>();
    private TextToSpeech tts;
    private int state = 0;            // 0 not started, 1 starting, 2 ready, 3 failed
    private int seq = 0;

    private void finish(String id, boolean done, String err) {
        PluginCall c = id == null ? null : calls.remove(id);
        if (c == null) return;
        if (err != null) { c.reject(err); return; }
        JSObject o = new JSObject();
        o.put("done", done);
        c.resolve(o);
    }

    private void finishAll() {
        for (String id : new ArrayList<>(calls.keySet())) finish(id, false, null);
    }

    /** Runs `then` on the main thread once the engine has started (state 2) or failed to (state 3). */
    private void ensure(Runnable then) {
        main.post(() -> {
            if (state >= 2) { then.run(); return; }
            waiting.add(then);
            if (state == 1) return;
            state = 1;
            try {
                tts = new TextToSpeech(getContext().getApplicationContext(), status -> main.post(() -> {
                    state = status == TextToSpeech.SUCCESS ? 2 : 3;
                    if (state == 2) {
                        try {
                            tts.setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                        } catch (Throwable ignored) { }
                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override public void onStart(String id) { }
                            @Override public void onDone(String id) { finish(id, true, null); }
                            @Override public void onError(String id) { finish(id, false, "The phone's voice could not read that"); }
                            @Override public void onError(String id, int code) { finish(id, false, "The phone's voice could not read that (" + code + ")"); }
                            @Override public void onStop(String id, boolean interrupted) { finish(id, false, null); }
                        });
                    }
                    List<Runnable> w = new ArrayList<>(waiting);
                    waiting.clear();
                    for (Runnable r : w) r.run();
                }));
            } catch (Throwable e) {
                state = 3;
                List<Runnable> w = new ArrayList<>(waiting);
                waiting.clear();
                for (Runnable r : w) r.run();
            }
        });
    }

    @PluginMethod
    public void available(final PluginCall call) {
        ensure(() -> {
            JSObject o = new JSObject();
            o.put("ok", state == 2);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void speak(final PluginCall call) {
        final String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) { call.reject("text is required"); return; }
        final float rate = call.getFloat("rate", 1f), pitch = call.getFloat("pitch", 1f);
        final String lang = call.getString("lang");
        ensure(() -> {
            if (state != 2 || tts == null) { call.reject("No text-to-speech engine on this phone"); return; }
            try {
                finishAll();                                              // a newer sentence replaces whatever was being read
                if (lang != null && !lang.isEmpty()) {
                    try { tts.setLanguage(Locale.forLanguageTag(lang)); } catch (Throwable ignored) { }
                }
                tts.setSpeechRate(Math.max(0.5f, Math.min(2f, rate)));
                tts.setPitch(Math.max(0.5f, Math.min(2f, pitch)));
                final String id = "pp" + (++seq);
                calls.put(id, call);
                if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id) != TextToSpeech.SUCCESS) finish(id, false, "The phone's voice would not start");
            } catch (Throwable e) {
                call.reject(e.getMessage() == null ? "speak failed" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        main.post(() -> {
            try { if (tts != null && state == 2) tts.stop(); } catch (Throwable ignored) { }
            finishAll();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        try { if (tts != null) { tts.stop(); tts.shutdown(); } } catch (Throwable ignored) { }
        tts = null;
        state = 0;
        finishAll();
        super.handleOnDestroy();
    }
}
