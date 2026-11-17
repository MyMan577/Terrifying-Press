package com.pressplay.media;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import org.videolan.libvlc.Dialog;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.RendererDiscoverer;
import org.videolan.libvlc.RendererItem;
import org.videolan.libvlc.interfaces.IMedia;
import org.videolan.libvlc.util.MediaBrowser;

import java.io.File;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * The VLC engine (libVLC), used next to ExoPlayer for everything ExoPlayer and the WebView cannot do:
 * <ul>
 *   <li>files in formats neither can decode (WMV/WMA, APE, RealMedia, VC-1, DTS, old AVI codecs...): video opens in
 *       {@link VlcPlayerActivity}; audio is converted once to a WAV in the cache so it still plays through the
 *       normal player with the EQ, effects, queue and notification;</li>
 *   <li>network shares (SMB / Windows shares, UPnP/DLNA servers, NFS, FTP, SFTP): browsing them, and copying a
 *       file off a share so ExoPlayer can play it.</li>
 * </ul>
 * libVLC is only shipped for 64-bit ARM phones; on anything else {@link #get} returns null and callers fall back.
 * All methods that take callbacks run them on the main thread.
 */
public final class VlcEngine {
    private static final String TAG = "PPVlc";
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static LibVLC lib;
    private static String loadError;

    /** Host of the share the app is opening right now, so a login prompt from libVLC can be answered for it. */
    static volatile String activeHost = "";
    /** Called (main thread) when a share asks for a login we have no saved answer for. */
    static volatile LoginNeeded onLoginNeeded;

    public interface LoginNeeded { void needed(String host, String text); }
    public interface Done { void ok(String uri); void fail(String message); }
    public interface Progress { void at(float fraction); }
    public interface Listing { void done(List<Item> items, String error); }
    public interface Renderers { void done(List<RendererItem> items, String error); }

    public static final class Item {
        public final String uri, name; public final boolean dir;
        Item(String uri, String name, boolean dir) { this.uri = uri; this.name = name; this.dir = dir; }
    }

    private VlcEngine() {}

    /** The shared libVLC instance, made on first use. Null when libVLC cannot load on this phone. */
    public static synchronized LibVLC get(Context ctx) {
        if (lib != null) return lib;
        if (loadError != null) return null;
        try {
            ArrayList<String> opts = new ArrayList<>(Arrays.asList(
                "--http-reconnect",
                "--audio-time-stretch",
                "--avcodec-skiploopfilter=1",     // the "nonref" loop-filter skip VLC for Android uses: faster, invisible
                "--aout=android_audiotrack",      // the output that can pass Dolby / DTS through to a receiver
                "-v"));
            lib = new LibVLC(ctx.getApplicationContext(), opts);
            Dialog.setCallbacks(lib, new Dialogs(ctx.getApplicationContext()));
            return lib;
        } catch (Throwable t) {                     // UnsatisfiedLinkError on 32-bit / x86 phones
            loadError = String.valueOf(t.getMessage());
            Log.w(TAG, "libVLC unavailable: " + loadError);
            return null;
        }
    }

    public static boolean available(Context ctx) { return get(ctx) != null; }
    public static String loadError() { return loadError; }

    // ---------------------------------------------------------------- logins

    private static SharedPreferences logins(Context ctx) { return ctx.getSharedPreferences("pp_vlc_logins", Context.MODE_PRIVATE); }

    /** Saves (or with an empty user, forgets) the login for a share's host. Stored only on the phone. */
    public static void setLogin(Context ctx, String host, String user, String pass) {
        SharedPreferences.Editor e = logins(ctx).edit();
        String h = host.toLowerCase(Locale.ROOT);
        if (user == null || user.isEmpty()) e.remove(h); else e.putString(h, user + "\n" + (pass == null ? "" : pass));
        e.apply();
    }

    static String hostOf(String uri) {
        try { String h = Uri.parse(uri).getHost(); return h == null ? "" : h.toLowerCase(Locale.ROOT); } catch (Exception e) { return ""; }
    }

    private static final class Dialogs implements Dialog.Callbacks {
        private final Context ctx;
        private final java.util.Set<String> tried = new java.util.HashSet<>();
        Dialogs(Context c) { ctx = c; }
        @Override public void onDisplay(Dialog.ErrorMessage d) { Log.w(TAG, d.getTitle() + ": " + d.getText()); }
        @Override public void onDisplay(Dialog.LoginDialog d) {
            String host = activeHost;
            String saved = logins(ctx).getString(host, null);
            // Answer once per host with the saved login; a second prompt means it was wrong, so ask the user.
            if (saved != null && tried.add(host)) {
                main.postDelayed(() -> tried.remove(host), 15000);
                int nl = saved.indexOf('\n');
                d.postLogin(saved.substring(0, nl), saved.substring(nl + 1), false);
                return;
            }
            d.dismiss();
            LoginNeeded l = onLoginNeeded;
            if (l != null) l.needed(host, d.getText());
        }
        @Override public void onDisplay(Dialog.QuestionDialog d) {
            // e.g. "this server's certificate is not trusted" for SFTP/FTPS: the user chose to open it, so accept.
            String a1 = d.getAction1Text();
            if (a1 != null && !a1.isEmpty()) d.postAction(1); else d.dismiss();
        }
        @Override public void onDisplay(Dialog.ProgressDialog d) {}
        @Override public void onCanceled(Dialog d) {}
        @Override public void onProgressUpdate(Dialog.ProgressDialog d) {}
    }

    // ---------------------------------------------------------------- media from any app URI

    /** Holds a Media plus the file descriptor behind it (content:// URIs), so both can be released together. */
    static final class Opened {
        final Media media; final ParcelFileDescriptor pfd;
        Opened(Media m, ParcelFileDescriptor p) { media = m; pfd = p; }
        void closeFd() { if (pfd != null) try { pfd.close(); } catch (Exception ignored) {} }
    }

    /** The WebView's own localhost addresses for files mean nothing to libVLC: turn them back into real URIs. */
    static String normalize(String uri) {
        if (uri == null) return "";
        int cue = uri.indexOf("#pp-cue=");           // a CUE-sheet track: the file is the whole album
        if (cue >= 0) uri = uri.substring(0, cue);
        int i = uri.indexOf("/_capacitor_file_/");
        if (i >= 0 && uri.startsWith("http")) return "file:///" + uri.substring(i + "/_capacitor_file_/".length());
        i = uri.indexOf("/_capacitor_content_/");
        if (i >= 0 && uri.startsWith("http")) return "content://" + uri.substring(i + "/_capacitor_content_/".length());
        if (uri.startsWith("/")) return "file://" + uri;
        return uri;
    }

    static Opened open(Context ctx, LibVLC lib, String uriStr) throws Exception {
        String s = normalize(uriStr);
        Uri u = Uri.parse(s);
        activeHost = hostOf(s);
        if ("content".equals(u.getScheme())) {
            ParcelFileDescriptor pfd = ctx.getContentResolver().openFileDescriptor(u, "r");
            if (pfd == null) throw new Exception("cannot open " + s);
            return new Opened(new Media(lib, pfd.getFileDescriptor()), pfd);
        }
        if ("file".equals(u.getScheme()) && u.getPath() != null) return new Opened(new Media(lib, u.getPath()), null);
        return new Opened(new Media(lib, u), null);
    }

    // ---------------------------------------------------------------- cache jobs (convert / copy)

    private static File cacheDir(Context ctx) {
        File d = new File(ctx.getCacheDir(), "pp-vlc");
        d.mkdirs();
        return d;
    }

    private static String hash(String s) {
        try {
            byte[] b = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 10; i++) sb.append(String.format("%02x", b[i]));
            return sb.toString();
        } catch (Exception e) { return Integer.toHexString(s.hashCode()); }
    }

    /** Keeps the cache to the newest few files (the current and queued tracks). */
    private static void trim(File dir, int keep) {
        File[] all = dir.listFiles();
        if (all == null) return;
        Arrays.sort(all, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (int i = keep; i < all.length; i++) if (!all[i].getName().endsWith(".part")) all[i].delete();
        long old = System.currentTimeMillis() - 3600_000L;
        for (File f : all) if (f.getName().endsWith(".part") && f.lastModified() < old) f.delete();
    }

    static String extOf(String uri) {
        String p = Uri.parse(normalize(uri)).getLastPathSegment();
        if (p == null) return "";
        int dot = p.lastIndexOf('.');
        if (dot < 0) return "";
        String e = p.substring(dot + 1).toLowerCase(Locale.ROOT);
        return e.length() <= 5 && e.matches("[a-z0-9]+") ? e : "";
    }

    /**
     * Decodes [uri] with libVLC into a 16-bit stereo WAV in the cache and hands back its file:// URI. Used for audio
     * that ExoPlayer cannot decode (APE, WMA, DTS, RealAudio, ...), so it still gets the whole normal player.
     */
    public static void convertAudio(Context ctx, String uri, Progress progress, Done done) {
        File dir = cacheDir(ctx);
        File out = new File(dir, "c_" + hash(normalize(uri)) + ".wav");
        String sout = "#transcode{acodec=s16l,channels=2}:std{access=file,mux=wav,dst='" + "%s" + "'}";
        runJob(ctx, uri, out, new String[] { ":no-sout-video", ":no-sout-spu" }, sout, progress, done);
    }

    /** Copies a file off a network share (smb, ftp, sftp, nfs, upnp...) into the cache, byte for byte. */
    public static void fetch(Context ctx, String uri, Progress progress, Done done) {
        File dir = cacheDir(ctx);
        String ext = extOf(uri);
        File out = new File(dir, "f_" + hash(normalize(uri)) + (ext.isEmpty() ? "" : "." + ext));
        runJob(ctx, uri, out, new String[] { ":demux=dump" }, null, progress, done);
    }

    /** {@link #fetch} for a background thread: waits (up to 10 minutes) and returns the copy's URI, or throws. */
    public static String fetchBlocking(Context ctx, String uri) throws java.io.IOException {
        if (Looper.myLooper() == Looper.getMainLooper()) throw new java.io.IOException("fetchBlocking on the main thread");
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
        final String[] res = new String[2];
        fetch(ctx, uri, null, new Done() {
            @Override public void ok(String u) { res[0] = u; latch.countDown(); }
            @Override public void fail(String m) { res[1] = m; latch.countDown(); }
        });
        try {
            if (!latch.await(10, java.util.concurrent.TimeUnit.MINUTES)) throw new java.io.IOException("Timed out copying from the share");
        } catch (InterruptedException e) { throw new java.io.IOException("interrupted"); }
        if (res[0] == null) throw new java.io.IOException(res[1] == null ? "copy failed" : res[1]);
        return res[0];
    }

    /** True for schemes only libVLC can open (ExoPlayer reads file, content, http(s), rtsp, rtmp itself). */
    public static boolean needsVlcAccess(String uri) {
        String s = Uri.parse(normalize(uri)).getScheme();
        if (s == null) return false;
        s = s.toLowerCase(Locale.ROOT);
        return s.equals("smb") || s.equals("ftp") || s.equals("ftps") || s.equals("ftpes") || s.equals("sftp")
            || s.equals("nfs") || s.equals("upnp") || s.equals("mms") || s.equals("mmsh") || s.equals("dav") || s.equals("davs");
    }

    private static void runJob(Context ctx, String uri, File out, String[] options, String soutFmt, Progress progress, Done done) {
        if (out.exists() && out.length() > 0) { out.setLastModified(System.currentTimeMillis()); main.post(() -> done.ok(Uri.fromFile(out).toString())); return; }
        main.post(() -> {
            LibVLC l = get(ctx);
            if (l == null) { done.fail("The VLC engine is not available on this phone"); return; }
            File part = new File(out.getParentFile(), out.getName() + "." + System.nanoTime() + ".part");
            final Opened o;
            try { o = open(ctx, l, uri); } catch (Exception e) { done.fail(String.valueOf(e.getMessage())); return; }
            for (String opt : options) o.media.addOption(opt);
            if (soutFmt != null) o.media.addOption(":sout=" + String.format(Locale.ROOT, soutFmt, part.getAbsolutePath().replace("'", "\\'")));
            else o.media.addOption(":demuxdump-file=" + part.getAbsolutePath());
            final MediaPlayer mp = new MediaPlayer(l);
            mp.setMedia(o.media);
            o.media.release();
            final boolean[] over = { false };
            final long[] lastMove = { System.currentTimeMillis() };
            final Runnable[] watchdog = new Runnable[1];
            java.util.function.BiConsumer<Boolean, String> stop = (ok, msg) -> {
                if (over[0]) return;
                over[0] = true;
                main.removeCallbacks(watchdog[0]);
                main.post(() -> {                      // never release a player from inside its own event callback
                    try { mp.setEventListener(null); mp.stop(); mp.release(); } catch (Throwable ignored) {}
                    o.closeFd();
                    if (ok && part.length() > 0 && (part.renameTo(out) || out.exists())) {
                        trim(out.getParentFile(), 8);
                        done.ok(Uri.fromFile(out).toString());
                    } else {
                        part.delete();
                        done.fail(msg != null ? msg : "The VLC engine could not read this file");
                    }
                });
            };
            mp.setEventListener(ev -> {
                switch (ev.type) {
                    case MediaPlayer.Event.EndReached: stop.accept(true, null); break;
                    case MediaPlayer.Event.EncounteredError: stop.accept(false, null); break;
                    case MediaPlayer.Event.PositionChanged:
                        lastMove[0] = System.currentTimeMillis();
                        if (progress != null) progress.at(ev.getPositionChanged());
                        break;
                    case MediaPlayer.Event.TimeChanged: case MediaPlayer.Event.Buffering:
                        lastMove[0] = System.currentTimeMillis(); break;
                    default: break;
                }
            });
            // A share that stops answering (or a login nobody gives) must not leave the job hanging forever.
            watchdog[0] = new Runnable() {
                @Override public void run() {
                    if (over[0]) return;
                    if (System.currentTimeMillis() - lastMove[0] > 45000) {
                        // dump/convert jobs report little progress; a growing output file also counts as alive
                        if (part.length() > 0 && part.lastModified() > lastMove[0]) { lastMove[0] = part.lastModified(); main.postDelayed(this, 5000); return; }
                        stop.accept(false, "Timed out reading the file");
                    } else main.postDelayed(this, 5000);
                }
            };
            main.postDelayed(watchdog[0], 5000);
            mp.play();
        });
    }

    // ---------------------------------------------------------------- multicast (discovery)

    /**
     * Many phones drop incoming multicast on Wi-Fi to save power, which hides UPnP/DLNA servers, mDNS shares and
     * Chromecasts. Held only while a discovery runs. Null when Wi-Fi is not available.
     */
    static android.net.wifi.WifiManager.MulticastLock multicast(Context ctx) {
        try {
            android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return null;
            android.net.wifi.WifiManager.MulticastLock l = wm.createMulticastLock("pp-vlc-discovery");
            l.setReferenceCounted(false);
            l.acquire();
            return l;
        } catch (Throwable t) { return null; }
    }
    static void release(android.net.wifi.WifiManager.MulticastLock l) { try { if (l != null && l.isHeld()) l.release(); } catch (Throwable ignored) {} }

    // ---------------------------------------------------------------- cast targets (Chromecast)

    private static final java.util.LinkedHashMap<String, RendererItem> renderers = new java.util.LinkedHashMap<>();
    private static final List<RendererDiscoverer> discoverers = new ArrayList<>();
    private static final Runnable stopDiscovery = VlcEngine::stopRenderers;
    private static android.net.wifi.WifiManager.MulticastLock rendererLock;

    /** A cast target found by {@link #discoverRenderers}, by its name; null when it is gone. */
    public static RendererItem renderer(String name) {
        synchronized (renderers) { return name == null ? null : renderers.get(name); }
    }

    /**
     * Looks for cast targets (Chromecast, and TVs / speakers with Chromecast built in) for [waitMs] and lists what it
     * has found by then. The search keeps running for a minute after the last call, so the list stays fresh while
     * the user picks, then stops to save battery.
     */
    public static void discoverRenderers(Context ctx, int waitMs, Renderers cb) {
        main.post(() -> {
            LibVLC l = get(ctx);
            if (l == null) { cb.done(new ArrayList<>(), "The VLC engine is not available on this phone"); return; }
            main.removeCallbacks(stopDiscovery);
            if (discoverers.isEmpty()) {
                rendererLock = multicast(ctx);
                try {
                    for (RendererDiscoverer.Description d : RendererDiscoverer.list(l)) {
                        RendererDiscoverer rd = new RendererDiscoverer(l, d.name);
                        rd.setEventListener(ev -> {
                            RendererItem it = ev.getItem();
                            if (it == null) return;
                            synchronized (renderers) {
                                if (ev.type == RendererDiscoverer.Event.ItemAdded) {
                                    if (!renderers.containsKey(it.name) && it.retain()) renderers.put(it.name, it);
                                } else if (ev.type == RendererDiscoverer.Event.ItemDeleted) {
                                    RendererItem old = renderers.remove(it.name);
                                    if (old != null) old.release();
                                }
                            }
                        });
                        if (rd.start()) discoverers.add(rd); else rd.release();
                    }
                } catch (Throwable t) { Log.w(TAG, "renderer discovery: " + t); }
            }
            main.postDelayed(() -> {
                ArrayList<RendererItem> out;
                synchronized (renderers) { out = new ArrayList<>(renderers.values()); }
                cb.done(out, discoverers.isEmpty() ? "Casting is not available" : null);
                main.postDelayed(stopDiscovery, 60000);
            }, Math.max(1000, waitMs));
        });
    }

    private static void stopRenderers() {
        for (RendererDiscoverer rd : discoverers) { try { rd.setEventListener(null); rd.stop(); rd.release(); } catch (Throwable ignored) {} }
        discoverers.clear();
        synchronized (renderers) {
            for (RendererItem it : renderers.values()) { try { it.release(); } catch (Throwable ignored) {} }
            renderers.clear();
        }
        release(rendererLock);
        rendererLock = null;
    }

    // ---------------------------------------------------------------- browsing shares

    /**
     * Lists a folder on a share, or with an empty [uri] the servers libVLC can find on the local network
     * (SMB/Windows, UPnP/DLNA, NFS, and mDNS announced ones). Discovery has no natural end, so it is cut at [waitMs].
     */
    public static void browse(Context ctx, String uri, int waitMs, Listing cb) {
        main.post(() -> {
            LibVLC l = get(ctx);
            if (l == null) { cb.done(new ArrayList<>(), "The VLC engine is not available on this phone"); return; }
            final List<Item> items = new ArrayList<>();
            final boolean[] over = { false };
            final MediaBrowser[] holder = new MediaBrowser[1];
            final Runnable finish = () -> {
                if (over[0]) return;
                over[0] = true;
                main.post(() -> { try { if (holder[0] != null) holder[0].release(); } catch (Throwable ignored) {} });
                cb.done(items, null);
            };
            MediaBrowser.EventListener ev = new MediaBrowser.EventListener() {
                @Override public void onMediaAdded(int index, IMedia media) {
                    if (over[0] || media == null) return;
                    Uri mu = media.getUri();
                    if (mu == null) return;
                    String name = media.getMeta(IMedia.Meta.Title);
                    if (name == null || name.isEmpty()) name = mu.getLastPathSegment() != null ? mu.getLastPathSegment() : mu.toString();
                    boolean dir = media.getType() == IMedia.Type.Directory || media.getType() == IMedia.Type.Unknown && extOf(mu.toString()).isEmpty();
                    items.add(new Item(mu.toString(), name, dir));
                }
                @Override public void onMediaRemoved(int index, IMedia media) {}
                @Override public void onBrowseEnd() { finish.run(); }
            };
            try {
                MediaBrowser b = new MediaBrowser(l, ev, main);
                holder[0] = b;
                b.setIgnoreFileTypes("db,nfo,ini,jpg,jpeg,ljpg,gif,png,pgm,pgmyuv,pbm,pam,tga,bmp,pnm,xpm,xcf,pcx,tif,tiff,lbm,sfv,txt,sub,idx,srt,ass,ssa,vtt,cue,log,url,lnk,exe,dll,zip,rar,7z,pdf,doc,docx,xml,json,html,htm,ds_store");
                if (uri == null || uri.isEmpty()) {
                    activeHost = "";
                    final android.net.wifi.WifiManager.MulticastLock lock = multicast(ctx);
                    b.discoverNetworkShares();
                    main.postDelayed(() -> { release(lock); finish.run(); }, Math.max(1500, waitMs));
                } else {
                    String s = normalize(uri);
                    activeHost = hostOf(s);
                    b.browse(Uri.parse(s), MediaBrowser.Flag.Interact);
                    main.postDelayed(() -> { if (!over[0]) { over[0] = true; try { b.release(); } catch (Throwable ignored) {} cb.done(items, items.isEmpty() ? "No answer from the server" : null); } }, Math.max(8000, waitMs));
                }
            } catch (Throwable t) {
                over[0] = true;
                cb.done(items, String.valueOf(t.getMessage()));
            }
        });
    }
}
