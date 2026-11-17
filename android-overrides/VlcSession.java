package com.pressplay.media;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.RendererItem;
import org.videolan.libvlc.interfaces.IMedia;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;
import java.util.List;

/**
 * One playback on the VLC engine (a file in the VLC player, or a cast). It lives apart from the screen so it keeps
 * going while the player screen is closed: casting and audio carry on in the background, with a media notification,
 * lock-screen controls and Bluetooth buttons ({@link VlcPlaybackService}). {@link VlcPlayerActivity} is only the
 * controls on top of it. Main thread only.
 */
public final class VlcSession {

    public interface Closed { void closed(String uri, long posMs, long durMs, boolean ended, String error); }
    public interface Listener { void changed(int what); }
    public static final int CHANGED_STATE = 1, CHANGED_TIME = 2, CHANGED_PICTURE = 3, CHANGED_OVER = 4;

    /** Set by {@link VlcPlugin}; told once when a session ends, with where it stopped. */
    static volatile Closed onClosed;
    /** The running session, or null. */
    static VlcSession current;

    private final Context app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Listener> listeners = new ArrayList<>();
    final String uri, title, subUri;
    final boolean isVideo;
    final long stopMs;
    /** Set while casting: picture and sound go to this device and the phone is the remote. */
    RendererItem castTo;

    MediaPlayer mp;
    private VlcEngine.Opened opened;
    private final SharedPreferences prefs;
    boolean deint, passthrough, spherical, ended, over;
    String error;
    long lastTime, length;
    float rate = 1f;
    IMedia.VideoTrack videoTrack;

    private MediaSession ms;
    private AudioManager audio;
    private AudioFocusRequest focusReq;
    private boolean pausedByFocus;

    /** Starts playing what [in] describes (see {@link VlcPlayerActivity#intent}), ending any earlier session. Null on failure. */
    static VlcSession start(Context ctx, Intent in) {
        if (current != null) current.end(false, null);
        String rName = in.getStringExtra("renderer");
        RendererItem r = null;
        if (rName != null && !rName.isEmpty()) {
            r = VlcEngine.renderer(rName);
            if (r == null) { report(in.getStringExtra("uri"), 0, 0, false, "That cast device is no longer available. Search again."); return null; }
        }
        VlcSession s = new VlcSession(ctx, in, r);
        current = s;
        if (!s.startMedia(in.getLongExtra("startMs", 0))) { if (current == s) current = null; return null; }
        s.requestFocus();
        VlcPlaybackService.start(ctx);
        return s;
    }

    private VlcSession(Context ctx, Intent in, RendererItem r) {
        app = ctx.getApplicationContext();
        String u = in.getStringExtra("uri");
        uri = u == null ? "" : u;
        String t = in.getStringExtra("title");
        title = t == null ? "" : t;
        subUri = in.getStringExtra("sub");
        isVideo = !"audio".equals(in.getStringExtra("kind"));
        stopMs = in.getLongExtra("stopMs", 0);
        castTo = r;
        prefs = app.getSharedPreferences("pp_vlc_player", Context.MODE_PRIVATE);
        deint = prefs.getBoolean("deinterlace", false);
        passthrough = prefs.getBoolean("passthrough", false);
        setUpMediaSession();
    }

    /** Playing a video on this phone's own screen (it needs the player screen; casting and audio do not). */
    boolean isLocalVideo() { return isVideo && castTo == null; }
    boolean isPlaying() { return mp != null && mp.isPlaying(); }
    String castName() { return castTo == null ? null : (castTo.displayName == null || castTo.displayName.isEmpty() ? castTo.name : castTo.displayName); }

    void addListener(Listener l) { if (!listeners.contains(l)) listeners.add(l); }
    void removeListener(Listener l) { listeners.remove(l); }
    private void emit(int what) { for (Listener l : new ArrayList<>(listeners)) l.changed(what); }

    long time() {
        if (mp != null) { long t = mp.getTime(); if (t >= 0) lastTime = t; long l = mp.getLength(); if (l > 0) length = l; }
        return lastTime;
    }

    // ---------------------------------------------------------------- playback

    /**
     * (Re)opens the file at [startMs] with the current options. Used at start, and when deinterlacing or passthrough
     * is switched (both only take effect on a fresh start of the media).
     */
    boolean startMedia(long startMs) {
        LibVLC lib = VlcEngine.get(app);
        if (lib == null) { end(false, "The VLC engine is not available on this phone"); return false; }
        VlcEngine.Opened o;
        try { o = VlcEngine.open(app, lib, uri); }
        catch (Exception e) { end(false, "Could not open the file: " + e.getMessage()); return false; }
        IMedia m = o.media;
        // Settings, Video decoder. Auto: hardware first, software when the phone's decoder cannot take it.
        // Software only: VLC's own decoders. Hardware only: the phone's chip and nothing else (VLC's "force").
        // The deinterlacer works on decoded pictures, so with it on decoding stays in software (the S24 does 1080i
        // that way with ease).
        String vdec = app.getSharedPreferences("pp_audio", Context.MODE_PRIVATE).getString("vdec", "auto");
        if (deint || "soft".equals(vdec)) m.setHWDecoderEnabled(false, false);
        else m.setHWDecoderEnabled(true, "hard".equals(vdec));
        if (deint && isVideo) { m.addOption(":deinterlace=1"); m.addOption(":deinterlace-mode=yadif2x"); }
        if (startMs > 1000) m.addOption(":start-time=" + (startMs / 1000.0));
        if (stopMs > startMs) m.addOption(":stop-time=" + (stopMs / 1000.0));     // a CUE-sheet track ends here
        if (!isVideo) m.addOption(":no-video");
        if (mp == null) {
            mp = new MediaPlayer(lib);
            mp.setEventListener(this::onVlcEvent);
            if (castTo != null) mp.setRenderer(castTo);
        } else {
            mp.stop();
        }
        mp.setAudioDigitalOutputEnabled(passthrough);
        mp.setMedia(m);
        m.release();
        if (opened != null) opened.closeFd();
        opened = o;
        if (subUri != null && !subUri.isEmpty()) mp.addSlave(IMedia.Slave.Type.Subtitle, Uri.parse(VlcEngine.normalize(subUri)), true);
        ended = false;
        mp.play();
        if (rate != 1f) mp.setRate(rate);
        updateMediaSession();
        return true;
    }

    void restartHere() { if (mp != null) startMedia(time()); }

    void attachViews(VLCVideoLayout layout) {
        if (mp == null || castTo != null || !isVideo) return;
        if (!mp.getVLCVout().areViewsAttached()) mp.attachViews(layout, null, true, false);
    }
    void detachViews() {
        if (mp != null && mp.getVLCVout().areViewsAttached()) mp.detachViews();
    }

    void play() { if (mp == null || over) return; if (ended) { startMedia(0); return; } requestFocus(); mp.play(); }
    void pause() { if (mp != null && mp.isPlaying()) mp.pause(); }
    void toggle() { if (isPlaying()) pause(); else play(); }
    void seekTo(long ms) {
        if (mp == null) return;
        long t = Math.max(0, ms);
        if (length > 0) t = Math.min(t, length - 500);
        mp.setTime(t, false);
        lastTime = t;
        updateMediaSession();
    }
    void skip(long ms) { seekTo(time() + ms); }
    void setRate(float r) { rate = r; if (mp != null) mp.setRate(r); updateMediaSession(); }
    void setDeinterlace(boolean on) { deint = on; prefs.edit().putBoolean("deinterlace", on).apply(); restartHere(); }
    void setPassthrough(boolean on) { passthrough = on; prefs.edit().putBoolean("passthrough", on).apply(); restartHere(); }

    private void onVlcEvent(MediaPlayer.Event ev) {
        switch (ev.type) {
            case MediaPlayer.Event.Playing: case MediaPlayer.Event.Paused: case MediaPlayer.Event.Stopped:
                updateMediaSession(); VlcPlaybackService.refresh(); emit(CHANGED_STATE); break;
            case MediaPlayer.Event.LengthChanged: length = ev.getLengthChanged(); updateMediaSession(); emit(CHANGED_TIME); break;
            case MediaPlayer.Event.TimeChanged: lastTime = ev.getTimeChanged(); break;
            case MediaPlayer.Event.Vout:
                if (ev.getVoutCount() > 0) {
                    videoTrack = mp.getCurrentVideoTrack();
                    if (videoTrack != null && videoTrack.projection != IMedia.VideoTrack.Projection.Rectangular) spherical = true;
                    emit(CHANGED_PICTURE);
                }
                break;
            case MediaPlayer.Event.EndReached: ended = true; end(true, null); break;
            case MediaPlayer.Event.EncounteredError: end(false, "The VLC engine could not play this file either"); break;
            default: break;
        }
    }

    /** Ends the session: tells the page where it stopped, releases the player, and drops the notification. */
    void end(boolean finished, String err) {
        if (over) return;
        over = true;
        if (err != null) error = err;
        long pos = time();
        if (current == this) current = null;
        final MediaPlayer p = mp;
        mp = null;
        main.post(() -> {                         // never release a player from inside its own event callback
            if (p != null) { try { p.setEventListener(null); p.stop(); p.detachViews(); p.release(); } catch (Throwable ignored) {} }
            if (opened != null) opened.closeFd();
        });
        if (audio != null && focusReq != null) audio.abandonAudioFocusRequest(focusReq);
        if (ms != null) { try { ms.setActive(false); ms.release(); } catch (Throwable ignored) {} ms = null; }
        VlcPlaybackService.stop(app);
        report(uri, Math.max(0, pos), length, finished, error);
        emit(CHANGED_OVER);
    }

    private static void report(String uri, long pos, long len, boolean finished, String err) {
        Closed c = onClosed;
        if (c != null) c.closed(uri == null ? "" : uri, pos, len, finished, err);
    }

    // ---------------------------------------------------------------- audio focus

    private final AudioManager.OnAudioFocusChangeListener focus = change -> {
        if (mp == null || castTo != null) return;            // a cast plays on the TV: the phone's other sounds don't matter
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if (mp.isPlaying()) { pausedByFocus = change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT; mp.pause(); }
        } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedByFocus) { pausedByFocus = false; mp.play(); }
    };

    private void requestFocus() {
        if (castTo != null) return;
        if (audio == null) audio = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        if (focusReq == null) focusReq = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(isVideo ? AudioAttributes.CONTENT_TYPE_MOVIE : AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setOnAudioFocusChangeListener(focus, main).build();
        if (audio != null) audio.requestAudioFocus(focusReq);
    }

    // ---------------------------------------------------------------- media session (lock screen, Bluetooth, watch)

    MediaSession.Token token() { return ms == null ? null : ms.getSessionToken(); }

    private void setUpMediaSession() {
        try {
            ms = new MediaSession(app, "PressPlayVLC");
            ms.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { play(); }
                @Override public void onPause() { pause(); }
                @Override public void onStop() { end(false, null); }
                @Override public void onSeekTo(long pos) { seekTo(pos); }
                @Override public void onFastForward() { skip(10000); }
                @Override public void onRewind() { skip(-10000); }
                @Override public void onSkipToNext() { skip(30000); }
                @Override public void onSkipToPrevious() { skip(-10000); }
            }, main);
            Intent open = new Intent(app, VlcPlayerActivity.class).putExtra("resume", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            ms.setSessionActivity(android.app.PendingIntent.getActivity(app, 7, open,
                android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT));
            ms.setActive(true);
        } catch (Throwable t) { ms = null; }
    }

    private void updateMediaSession() {
        if (ms == null) return;
        String sub = castTo != null ? "Casting to " + castName() : "VLC engine";
        ms.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, sub)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, length > 0 ? length : -1)
            .build());
        boolean playing = isPlaying();
        ms.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, time(), playing ? rate : 0f)
            .build());
    }
}
