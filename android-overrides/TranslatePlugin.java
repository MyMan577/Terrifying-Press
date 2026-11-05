package com.pressplay.media;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.nl.languageid.LanguageIdentification;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;

import org.json.JSONArray;

/**
 * Native on-device translation (Google ML Kit). Language packs (about 30 MB each) download the first time a language is used,
 * then everything runs offline. Non-English pairs also use the English pack as a bridge. Lines go in, translated lines come out in the same order.
 */
@CapacitorPlugin(name = "PPTranslate")
public class TranslatePlugin extends Plugin {
    private final Object lock = new Object();
    private Translator translator;
    private String pair;

    private String lang(String code) {
        if (code == null || code.isEmpty()) return null;
        return TranslateLanguage.fromLanguageTag(code);
    }

    /** lines: string[], from: language code or "" to detect it, to: language code. Resolves {lines, from}. */
    @PluginMethod
    public void translate(final PluginCall call) {
        final JSONArray in = call.getArray("lines");
        final String fromIn = call.getString("from", ""), toIn = call.getString("to", "");
        if (in == null || in.length() == 0) { call.reject("lines are required"); return; }
        new Thread(() -> {
            try {
                String to = lang(toIn);
                if (to == null) throw new IllegalArgumentException("The device translator does not support \"" + toIn + "\".");
                String from = lang(fromIn);
                if (from == null) {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < in.length() && sb.length() < 600; i++) sb.append(in.getString(i)).append('\n');
                    String id = Tasks.await(LanguageIdentification.getClient().identifyLanguage(sb.toString()));
                    from = "und".equals(id) ? null : lang(id);
                    if (from == null) throw new IllegalStateException("Could not tell which language these lyrics are in.");
                }
                final JSArray out = new JSArray();
                if (from.equals(to)) {
                    for (int i = 0; i < in.length(); i++) out.put(in.getString(i));
                } else {
                    Translator tr;
                    synchronized (lock) {
                        String key = from + ">" + to;
                        if (translator == null || !key.equals(pair)) {
                            if (translator != null) translator.close();
                            translator = Translation.getClient(new TranslatorOptions.Builder().setSourceLanguage(from).setTargetLanguage(to).build());
                            pair = key;
                        }
                        tr = translator;
                    }
                    Tasks.await(tr.downloadModelIfNeeded(new DownloadConditions.Builder().build()));
                    for (int i = 0; i < in.length(); i++) {
                        String line = in.getString(i);
                        out.put(line.trim().isEmpty() ? line : Tasks.await(tr.translate(line)));
                    }
                }
                JSObject o = new JSObject();
                o.put("lines", out);
                o.put("from", from);
                call.resolve(o);
            } catch (Throwable e) {
                Throwable c = e.getCause() != null ? e.getCause() : e;
                call.reject("Device translator: " + (c.getMessage() != null ? c.getMessage() : c.toString()));
            }
        }).start();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (lock) { if (translator != null) { translator.close(); translator = null; } }
    }
}
