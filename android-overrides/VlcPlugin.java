package com.pressplay.media;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * The page's door to the VLC engine ({@link VlcEngine}): the full-screen VLC player, network share browsing,
 * share logins, and converting / copying files the normal player cannot read.
 * Events: "closed" {uri, posMs, durMs, ended, error} when the VLC player closes; "login" {host, text} when a share
 * wants a login the app has not saved; "progress" {uri, pct} while converting or copying.
 */
@CapacitorPlugin(name = "PPVlc")
public class VlcPlugin extends Plugin {

    @Override public void load() {
        VlcEngine.onLoginNeeded = (host, text) -> {
            JSObject o = new JSObject();
            o.put("host", host == null ? "" : host);
            o.put("text", text == null ? "" : text);
            notifyListeners("login", o);
        };
        VlcPlayerActivity.onClosed = (uri, posMs, durMs, ended, error) -> {
            JSObject o = new JSObject();
            o.put("uri", uri);
            o.put("posMs", posMs);
            o.put("durMs", durMs);
            o.put("ended", ended);
            if (error != null) o.put("error", error);
            notifyListeners("closed", o);
        };
    }

    @PluginMethod
    public void available(PluginCall call) {
        new Thread(() -> {
            boolean ok = VlcEngine.available(getContext());
            JSObject o = new JSObject();
            o.put("ok", ok);
            if (!ok && VlcEngine.loadError() != null) o.put("reason", VlcEngine.loadError());
            call.resolve(o);
        }).start();
    }

    /** Plays a file or stream in the full-screen VLC player. Resolves once it is opening. */
    @PluginMethod
    public void open(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri == null || uri.isEmpty()) { call.reject("uri required"); return; }
        Context ctx = getContext();
        Activity act = getActivity();
        long startMs = call.getData().optLong("startMs", 0L);
        Intent i = VlcPlayerActivity.intent(ctx, uri, call.getString("title", ""), call.getString("kind", "video"), startMs, call.getString("subtitle", ""));
        if (act != null) { i.removeFlags(Intent.FLAG_ACTIVITY_NEW_TASK); act.runOnUiThread(() -> act.startActivity(i)); }
        else ctx.startActivity(i);
        call.resolve();
    }

    /** Closes the VLC player if it is open (e.g. the page moved on to another track). */
    @PluginMethod
    public void close(PluginCall call) {
        VlcPlayerActivity a = VlcPlayerActivity.current;
        if (a != null) a.runOnUiThread(a::finish);
        call.resolve();
    }

    private VlcEngine.Progress progressFor(String uri) {
        final long[] last = { 0 };
        return f -> {
            long now = System.currentTimeMillis();
            if (now - last[0] < 400) return;
            last[0] = now;
            JSObject o = new JSObject();
            o.put("uri", uri);
            o.put("pct", Math.round(Math.max(0, Math.min(1, f)) * 100));
            notifyListeners("progress", o);
        };
    }

    private VlcEngine.Done doneFor(PluginCall call) {
        return new VlcEngine.Done() {
            @Override public void ok(String uri) { JSObject o = new JSObject(); o.put("uri", uri); call.resolve(o); }
            @Override public void fail(String message) { call.reject(message == null ? "failed" : message); }
        };
    }

    /** Decodes audio the normal player cannot read into a WAV in the cache. Resolves {uri} of the WAV. */
    @PluginMethod
    public void convert(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri == null || uri.isEmpty()) { call.reject("uri required"); return; }
        VlcEngine.convertAudio(getContext(), uri, progressFor(uri), doneFor(call));
    }

    /** Copies a file off a network share into the cache. Resolves {uri} of the copy. */
    @PluginMethod
    public void fetch(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri == null || uri.isEmpty()) { call.reject("uri required"); return; }
        VlcEngine.fetch(getContext(), uri, progressFor(uri), doneFor(call));
    }

    /** Lists a share folder, or (no uri) the servers on the local network. Resolves {items: [{uri, name, dir}], error?}. */
    @PluginMethod
    public void browse(PluginCall call) {
        String uri = call.getString("uri", "");
        int waitMs = call.getInt("waitMs", 5000);
        VlcEngine.browse(getContext(), uri, waitMs, (List<VlcEngine.Item> items, String error) -> {
            JSArray arr = new JSArray();
            for (VlcEngine.Item it : items) {
                JSObject o = new JSObject();
                o.put("uri", it.uri);
                o.put("name", it.name);
                o.put("dir", it.dir);
                arr.put(o);
            }
            JSObject res = new JSObject();
            res.put("items", arr);
            if (error != null) res.put("error", error);
            call.resolve(res);
        });
    }

    /** Saves the login for a share's host (empty user forgets it). Kept on the phone only. */
    @PluginMethod
    public void setLogin(PluginCall call) {
        String host = call.getString("host", "");
        if (host == null || host.isEmpty()) { call.reject("host required"); return; }
        VlcEngine.setLogin(getContext(), host, call.getString("user", ""), call.getString("pass", ""));
        call.resolve();
    }
}
