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

    private static volatile VlcPlugin instance;
    private static final java.util.ArrayList<String> pendingUrls = new java.util.ArrayList<>();

    /** A stream or share link opened from another app ("Open with"): handed to the page as an "openUrl" event. */
    public static void queueUrl(String url) {
        synchronized (pendingUrls) { pendingUrls.add(url); }
        VlcPlugin p = instance;
        if (p != null) p.flushUrls();
    }

    private void flushUrls() {
        java.util.ArrayList<String> list;
        synchronized (pendingUrls) { list = new java.util.ArrayList<>(pendingUrls); pendingUrls.clear(); }
        for (String u : list) { JSObject o = new JSObject(); o.put("url", u); notifyListeners("openUrl", o, true); }
    }

    /** Links that arrived before the page was listening. Resolves {urls: [...]}. */
    @PluginMethod
    public void takeUrls(PluginCall call) {
        JSArray arr = new JSArray();
        synchronized (pendingUrls) { for (String u : pendingUrls) arr.put(u); pendingUrls.clear(); }
        JSObject o = new JSObject();
        o.put("urls", arr);
        call.resolve(o);
    }

    @Override protected void handleOnDestroy() { if (instance == this) instance = null; }

    @Override public void load() {
        instance = this;
        VlcEngine.onLoginNeeded = (host, text) -> {
            JSObject o = new JSObject();
            o.put("host", host == null ? "" : host);
            o.put("text", text == null ? "" : text);
            notifyListeners("login", o);
        };
        VlcSession.onClosed = (uri, posMs, durMs, ended, error) -> {
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
        i.putExtra("stopMs", call.getData().optLong("stopMs", 0L));
        if (act != null) { i.removeFlags(Intent.FLAG_ACTIVITY_NEW_TASK); act.runOnUiThread(() -> act.startActivity(i)); }
        else ctx.startActivity(i);
        call.resolve();
    }

    /** Cast targets on the Wi-Fi (Chromecast and built-in Chromecast). Resolves {devices: [{name, label, type}], error?}. */
    @PluginMethod
    public void castDevices(PluginCall call) {
        int waitMs = call.getInt("waitMs", 4000);
        VlcEngine.discoverRenderers(getContext(), waitMs, (items, error) -> {
            JSArray arr = new JSArray();
            for (org.videolan.libvlc.RendererItem it : items) {
                JSObject o = new JSObject();
                o.put("name", it.name);
                o.put("label", it.displayName == null || it.displayName.isEmpty() ? it.name : it.displayName);
                o.put("type", it.type == null ? "" : it.type);
                arr.put(o);
            }
            JSObject res = new JSObject();
            res.put("devices", arr);
            if (error != null) res.put("error", error);
            call.resolve(res);
        });
    }

    /**
     * Plays a file on a cast target ({@link #castDevices} name). The VLC engine converts whatever the device cannot
     * play by itself, on the fly. The VLC player opens as the remote; closing it stops casting ("closed" as usual).
     */
    @PluginMethod
    public void cast(PluginCall call) {
        String uri = call.getString("uri", "");
        String device = call.getString("device", "");
        if (uri == null || uri.isEmpty() || device == null || device.isEmpty()) { call.reject("uri and device required"); return; }
        if (VlcEngine.renderer(device) == null) { call.reject("That cast device is no longer available. Search again."); return; }
        Context ctx = getContext();
        Activity act = getActivity();
        long startMs = call.getData().optLong("startMs", 0L);
        Intent i = VlcPlayerActivity.intent(ctx, uri, call.getString("title", ""), call.getString("kind", "video"), startMs, "", device);
        i.putExtra("stopMs", call.getData().optLong("stopMs", 0L));
        if (act != null) { i.removeFlags(Intent.FLAG_ACTIVITY_NEW_TASK); act.runOnUiThread(() -> act.startActivity(i)); }
        else ctx.startActivity(i);
        call.resolve();
    }

    /** Brings the running VLC playback / cast screen back. Resolves {running}. */
    @PluginMethod
    public void show(PluginCall call) {
        Activity act = getActivity();
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            boolean running = VlcSession.current != null;
            if (running) {
                Intent i = new Intent(getContext(), VlcPlayerActivity.class).putExtra("resume", true);
                if (act != null) act.startActivity(i);
                else getContext().startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
            JSObject o = new JSObject();
            o.put("running", running);
            call.resolve(o);
        });
    }

    /** Closes the VLC player if it is open (e.g. the page moved on to another track). */
    @PluginMethod
    public void close(PluginCall call) {
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            VlcSession s = VlcSession.current;
            if (s != null) s.end(false, null);
            VlcPlayerActivity a = VlcPlayerActivity.current;
            if (a != null) a.finish();
        });
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

    /**
     * What streams a file holds, read by the VLC engine: {audio, video, text, codecs: "h264, ac3, ..."}.
     * The page asks when its own player shows no picture or plays no sound, to tell an unsupported stream from a
     * file that simply has none.
     */
    @PluginMethod
    public void probe(PluginCall call) {
        String uri = call.getString("uri", "");
        if (uri == null || uri.isEmpty()) { call.reject("uri required"); return; }
        new Thread(() -> {
            org.videolan.libvlc.LibVLC lib = VlcEngine.get(getContext());
            if (lib == null) { call.reject("The VLC engine is not available on this phone"); return; }
            VlcEngine.Opened o = null;
            try {
                o = VlcEngine.open(getContext(), lib, uri);
                o.media.parse(org.videolan.libvlc.interfaces.IMedia.Parse.ParseLocal | org.videolan.libvlc.interfaces.IMedia.Parse.ParseNetwork);
                int a = 0, v = 0, t = 0;
                boolean spherical = false;
                StringBuilder codecs = new StringBuilder();
                for (int i = 0; i < o.media.getTrackCount(); i++) {
                    org.videolan.libvlc.interfaces.IMedia.Track tr = o.media.getTrack(i);
                    if (tr == null) continue;
                    if (tr.type == org.videolan.libvlc.interfaces.IMedia.Track.Type.Audio) a++;
                    else if (tr.type == org.videolan.libvlc.interfaces.IMedia.Track.Type.Video) {
                        v++;
                        if (tr instanceof org.videolan.libvlc.interfaces.IMedia.VideoTrack
                            && ((org.videolan.libvlc.interfaces.IMedia.VideoTrack) tr).projection != org.videolan.libvlc.interfaces.IMedia.VideoTrack.Projection.Rectangular)
                            spherical = true;
                    }
                    else if (tr.type == org.videolan.libvlc.interfaces.IMedia.Track.Type.Text) t++;
                    if (tr.codec != null && !tr.codec.isEmpty()) { if (codecs.length() > 0) codecs.append(", "); codecs.append(tr.codec); }
                }
                JSObject r = new JSObject();
                r.put("audio", a); r.put("video", v); r.put("text", t);
                r.put("spherical", spherical);
                r.put("codecs", codecs.toString());
                r.put("durMs", o.media.getDuration());
                call.resolve(r);
            } catch (Throwable e) {
                call.reject(String.valueOf(e.getMessage()));
            } finally {
                if (o != null) { try { o.media.release(); } catch (Throwable ignored) {} o.closeFd(); }
            }
        }, "pp-vlc-probe").start();
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
