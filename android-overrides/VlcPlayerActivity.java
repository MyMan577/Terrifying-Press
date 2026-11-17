package com.pressplay.media;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.RendererItem;
import org.videolan.libvlc.interfaces.IMedia;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.Locale;

/**
 * Full-screen player on the VLC engine, for videos (and streams) that neither the WebView nor ExoPlayer can play:
 * WMV, RealMedia, VC-1, MPEG-2 in odd containers, DTS soundtracks, network shares, and so on.
 * Has the controls a film needs: play/pause, seek, skip, audio track, subtitles (embedded or a file), aspect ratio,
 * audio and subtitle delay, and speed. When it closes, the page is told where playback stopped.
 */
public class VlcPlayerActivity extends Activity {

    public interface Closed { void closed(String uri, long posMs, long durMs, boolean ended, String error); }
    /** Set by {@link VlcPlugin}; told once when the player closes. */
    static volatile Closed onClosed;
    static volatile VlcPlayerActivity current;

    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaPlayer mp;
    private VLCVideoLayout videoLayout;
    private VlcEngine.Opened opened;
    private String uri = "";
    private boolean ended, reported, userSeeking, isVideo = true;
    private String error;
    private long lastTime, length;

    private LinearLayout bar, top;
    private TextView playBtn, timeText, titleText, info;
    private SeekBar seek;
    private int scaleIdx = 0;
    private float rate = 1f;
    private static final MediaPlayer.ScaleType[] SCALES = {
        MediaPlayer.ScaleType.SURFACE_BEST_FIT, MediaPlayer.ScaleType.SURFACE_FIT_SCREEN, MediaPlayer.ScaleType.SURFACE_FILL,
        MediaPlayer.ScaleType.SURFACE_16_9, MediaPlayer.ScaleType.SURFACE_4_3, MediaPlayer.ScaleType.SURFACE_221_1,
        MediaPlayer.ScaleType.SURFACE_235_1, MediaPlayer.ScaleType.SURFACE_ORIGINAL };
    private static final String[] SCALE_NAMES = { "Fit", "Fit screen", "Fill", "16:9", "4:3", "2.21:1", "2.35:1", "Original size" };

    /** Set while casting: the picture and sound go to this device and this screen is the remote. */
    private RendererItem castTo;
    private boolean deint, passthrough, spherical;
    private android.content.SharedPreferences prefs;
    private String subUri;
    private long stopMs;

    private AudioManager audio;
    private AudioFocusRequest focusReq;
    private boolean pausedByFocus;

    private final Runnable hideControls = () -> setControls(false);
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (mp == null) return;
            refreshTime();
            main.postDelayed(this, 500);
        }
    };

    public static Intent intent(Context ctx, String uri, String title, String kind, long startMs, String subtitle) {
        return intent(ctx, uri, title, kind, startMs, subtitle, null);
    }

    /** [renderer]: the name of a cast target from {@link VlcEngine#discoverRenderers}, or null to play here. */
    public static Intent intent(Context ctx, String uri, String title, String kind, long startMs, String subtitle, String renderer) {
        return new Intent(ctx, VlcPlayerActivity.class)
            .putExtra("renderer", renderer == null ? "" : renderer)
            .putExtra("uri", uri).putExtra("title", title == null ? "" : title)
            .putExtra("kind", kind == null ? "video" : kind).putExtra("startMs", startMs)
            .putExtra("sub", subtitle == null ? "" : subtitle)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
    }

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        current = this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28)
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        Intent in = getIntent();
        uri = in.getStringExtra("uri") == null ? "" : in.getStringExtra("uri");
        isVideo = !"audio".equals(in.getStringExtra("kind"));
        String title = in.getStringExtra("title");
        long startMs = in.getLongExtra("startMs", 0);
        String sub = in.getStringExtra("sub");

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        videoLayout = new VLCVideoLayout(this);
        root.addView(videoLayout, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        info = text(isVideo ? "" : (title == null ? "" : title), 22, true);
        info.setGravity(Gravity.CENTER);
        info.setPadding(dp(24), 0, dp(24), 0);
        root.addView(info, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // tap anywhere: show / hide the controls
        View tap = new View(this);
        tap.setOnClickListener(v -> setControls(bar.getVisibility() != View.VISIBLE));
        // A 360° video: drag to look around (a tap still shows / hides the controls)
        tap.setOnTouchListener(new View.OnTouchListener() {
            float lx, ly; boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN: lx = e.getX(); ly = e.getY(); moved = false; return true;
                    case MotionEvent.ACTION_MOVE: {
                        float dx = e.getX() - lx, dy = e.getY() - ly;
                        if (!moved && Math.hypot(dx, dy) < dp(8)) return true;
                        moved = true;
                        if (spherical && mp != null) {
                            float k = 90f / Math.max(1, v.getWidth());
                            mp.updateViewpoint(-dx * k, -dy * k, 0, 0, false);
                        }
                        lx = e.getX(); ly = e.getY();
                        return true;
                    }
                    case MotionEvent.ACTION_UP: if (!moved) v.performClick(); return true;
                    default: return false;
                }
            }
        });
        root.addView(tap, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(12), dp(16), dp(12), dp(8));
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { 0xCC000000, 0x00000000 }));
        TextView back = button("✕  Close", v -> finish());
        top.addView(back);
        titleText = text(title == null ? "" : title, 15, false);
        titleText.setSingleLine(true);
        titleText.setPadding(dp(12), 0, dp(8), 0);
        top.addView(titleText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView badge = text("VLC engine", 11, false);
        badge.setAlpha(0.6f);
        top.addView(badge);
        root.addView(top, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.setPadding(dp(12), dp(16), dp(12), dp(14));
        bar.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[] { 0xDD000000, 0x00000000 }));
        LinearLayout seekRow = new LinearLayout(this);
        seekRow.setGravity(Gravity.CENTER_VERTICAL);
        seek = new SeekBar(this);
        seek.setMax(1000);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                if (fromUser && length > 0) timeText.setText(fmt(length * p / 1000) + " / " + fmt(length));
            }
            @Override public void onStartTrackingTouch(SeekBar s) { userSeeking = true; main.removeCallbacks(hideControls); }
            @Override public void onStopTrackingTouch(SeekBar s) {
                userSeeking = false;
                if (mp != null && length > 0) mp.setTime(length * s.getProgress() / 1000, false);
                else if (mp != null) mp.setPosition(s.getProgress() / 1000f);
                bump();
            }
        });
        seekRow.addView(seek, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        timeText = text("0:00 / 0:00", 13, false);
        seekRow.addView(timeText);
        bar.addView(seekRow);

        LinearLayout btns = new LinearLayout(this);
        btns.setGravity(Gravity.CENTER);
        btns.setPadding(0, dp(6), 0, 0);
        btns.addView(button("−10s", v -> skip(-10000)));
        playBtn = button("❚❚", v -> togglePlay());
        playBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        btns.addView(playBtn);
        btns.addView(button("+10s", v -> skip(10000)));
        btns.addView(button("Audio", v -> pickAudio()));
        btns.addView(button("Subtitles", v -> pickSubs()));
        if (isVideo) btns.addView(button("Aspect", v -> cycleScale()));
        btns.addView(button("More", v -> more()));
        android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        hs.addView(btns);
        bar.addView(hs);
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        setContentView(root);
        immersive();

        prefs = getSharedPreferences("pp_vlc_player", MODE_PRIVATE);
        deint = prefs.getBoolean("deinterlace", false);
        passthrough = prefs.getBoolean("passthrough", false);
        subUri = sub;
        stopMs = in.getLongExtra("stopMs", 0);
        String rName = in.getStringExtra("renderer");
        if (rName != null && !rName.isEmpty()) {
            castTo = VlcEngine.renderer(rName);
            if (castTo == null) { fail("That cast device is no longer available. Search again."); return; }
            info.setText("Casting to " + castTo.displayName + "\n\n" + (title == null ? "" : title));
            badge.setText("Casting · VLC engine");
            back.setText("✕  Stop casting");
        }
        if (!startMedia(startMs)) return;
        requestFocus();
        main.post(tick);
        bump();
    }

    /**
     * (Re)opens the file at [startMs] with the current options. Used at start, and when deinterlacing or
     * passthrough is switched (both only take effect on a fresh start of the media).
     */
    private boolean startMedia(long startMs) {
        LibVLC lib = VlcEngine.get(this);
        if (lib == null) { fail("The VLC engine is not available on this phone"); return false; }
        VlcEngine.Opened o;
        try { o = VlcEngine.open(this, lib, uri); }
        catch (Exception e) { fail("Could not open the file: " + e.getMessage()); return false; }
        IMedia m = o.media;
        // Hardware first, software when the phone's decoder cannot take it. The deinterlacer works on decoded
        // pictures, so with it on decoding stays in software (the S24 does 1080i that way with ease).
        m.setHWDecoderEnabled(!deint, false);
        if (deint && isVideo) { m.addOption(":deinterlace=1"); m.addOption(":deinterlace-mode=yadif2x"); }
        if (startMs > 1000) m.addOption(":start-time=" + (startMs / 1000.0));
        if (stopMs > startMs) m.addOption(":stop-time=" + (stopMs / 1000.0));     // a CUE-sheet track ends here
        if (!isVideo) m.addOption(":no-video");
        if (mp == null) {
            mp = new MediaPlayer(lib);
            mp.setEventListener(this::onVlcEvent);
            if (castTo != null) mp.setRenderer(castTo);
            else mp.attachViews(videoLayout, null, true, false);
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
        return true;
    }

    private void restartHere() {
        if (mp == null) return;
        startMedia(Math.max(lastTime, mp.getTime()));
    }

    private void onVlcEvent(MediaPlayer.Event ev) {
        switch (ev.type) {
            case MediaPlayer.Event.Playing: playBtn.setText("❚❚"); break;
            case MediaPlayer.Event.Paused: case MediaPlayer.Event.Stopped: playBtn.setText("▶"); break;
            case MediaPlayer.Event.LengthChanged: length = ev.getLengthChanged(); break;
            case MediaPlayer.Event.TimeChanged: lastTime = ev.getTimeChanged(); break;
            case MediaPlayer.Event.Vout:
                if (ev.getVoutCount() > 0) {
                    info.setText("");
                    IMedia.VideoTrack vt = mp.getCurrentVideoTrack();
                    if (vt != null && vt.projection != IMedia.VideoTrack.Projection.Rectangular && !spherical) {
                        spherical = true;
                        Toast.makeText(this, "360° video: drag to look around", Toast.LENGTH_LONG).show();
                    }
                    if (vt != null && vt.width > 0 && vt.height > 0) {
                        boolean sideways = vt.orientation == IMedia.VideoTrack.Orientation.LeftBottom || vt.orientation == IMedia.VideoTrack.Orientation.RightTop;
                        boolean wide = sideways ? vt.height > vt.width : vt.width > vt.height;
                        setRequestedOrientation(wide ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
                    }
                }
                break;
            case MediaPlayer.Event.EndReached: ended = true; finish(); break;
            case MediaPlayer.Event.EncounteredError: fail("The VLC engine could not play this file either"); break;
            default: break;
        }
    }

    private void fail(String msg) {
        error = msg;
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        finish();
    }

    // ---------------------------------------------------------------- controls

    private TextView text(String s, float sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        return t;
    }

    private TextView button(String label, View.OnClickListener l) {
        TextView t = text(label, 14, false);
        t.setPadding(dp(14), dp(10), dp(14), dp(10));
        t.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x33FFFFFF);
        bg.setCornerRadius(dp(18));
        t.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(4), 0, dp(4), 0);
        t.setLayoutParams(lp);
        t.setOnClickListener(v -> { l.onClick(v); bump(); });
        return t;
    }

    private void setControls(boolean on) {
        bar.setVisibility(on ? View.VISIBLE : View.GONE);
        top.setVisibility(on ? View.VISIBLE : View.GONE);
        if (on) bump(); else immersive();
    }

    /** Keeps the controls up for a few more seconds (only while a video is showing; audio keeps them). */
    private void bump() {
        main.removeCallbacks(hideControls);
        if (isVideo && castTo == null && mp != null && mp.isPlaying()) main.postDelayed(hideControls, 3500);
    }

    private void togglePlay() {
        if (mp == null) return;
        if (mp.isPlaying()) mp.pause();
        else { if (ended) { ended = false; mp.stop(); } requestFocus(); mp.play(); }
    }

    private void skip(long ms) {
        if (mp == null) return;
        long t = Math.max(0, mp.getTime() + ms);
        if (length > 0) t = Math.min(t, length - 500);
        mp.setTime(t, false);
        refreshTime();
    }

    private void refreshTime() {
        if (mp == null) return;
        long t = mp.getTime();
        if (t >= 0) lastTime = t;
        long len = mp.getLength();
        if (len > 0) length = len;
        if (!userSeeking) {
            timeText.setText(fmt(lastTime) + " / " + (length > 0 ? fmt(length) : "--:--"));
            seek.setProgress(length > 0 ? (int) (lastTime * 1000 / length) : (int) (mp.getPosition() * 1000));
        }
    }

    private static String fmt(long ms) {
        long s = Math.max(0, ms / 1000), h = s / 3600, m = (s % 3600) / 60;
        return h > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", h, m, s % 60) : String.format(Locale.ROOT, "%d:%02d", m, s % 60);
    }

    private void pickTrack(String title, MediaPlayer.TrackDescription[] tracks, int currentId, java.util.function.IntConsumer pick) {
        if (tracks == null || tracks.length == 0) { Toast.makeText(this, "No " + title.toLowerCase(Locale.ROOT) + " in this file", Toast.LENGTH_SHORT).show(); return; }
        String[] names = new String[tracks.length];
        int checked = -1;
        for (int i = 0; i < tracks.length; i++) { names[i] = tracks[i].name == null ? ("Track " + tracks[i].id) : tracks[i].name; if (tracks[i].id == currentId) checked = i; }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(title)
            .setSingleChoiceItems(names, checked, (d, i) -> { pick.accept(tracks[i].id); d.dismiss(); })
            .show();
    }

    private void pickAudio() {
        if (mp == null) return;
        pickTrack("Audio track", mp.getAudioTracks(), mp.getAudioTrack(), id -> mp.setAudioTrack(id));
    }

    private void pickSubs() {
        if (mp == null) return;
        pickTrack("Subtitles", mp.getSpuTracks(), mp.getSpuTrack(), id -> mp.setSpuTrack(id));
    }

    private void cycleScale() {
        if (mp == null) return;
        scaleIdx = (scaleIdx + 1) % SCALES.length;
        mp.setVideoScale(SCALES[scaleIdx]);
        Toast.makeText(this, "Aspect: " + SCALE_NAMES[scaleIdx], Toast.LENGTH_SHORT).show();
    }

    private void more() {
        if (mp == null) return;
        String[] items = {
            "Speed: " + String.format(Locale.ROOT, "%.2gx", rate),
            "Audio delay: " + (mp.getAudioDelay() / 1000) + " ms",
            "Subtitle delay: " + (mp.getSpuDelay() / 1000) + " ms",
            "Chapters",
            "Deinterlace (old TV / DVD): " + (deint ? "on" : "off"),
            "Dolby / DTS passthrough to a receiver: " + (passthrough ? "on" : "off") };
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setItems(items, (d, i) -> {
                if (i == 0) choose("Speed", new String[] { "0.5x", "0.75x", "1x", "1.25x", "1.5x", "1.75x", "2x" },
                    k -> { rate = new float[] { 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f }[k]; mp.setRate(rate); });
                else if (i == 1) delay("Audio delay", true);
                else if (i == 2) delay("Subtitle delay", false);
                else if (i == 3) chapters();
                else if (i == 4) {
                    deint = !deint;
                    prefs.edit().putBoolean("deinterlace", deint).apply();
                    Toast.makeText(this, deint ? "Deinterlacing on (software decoding)" : "Deinterlacing off", Toast.LENGTH_SHORT).show();
                    restartHere();
                } else {
                    passthrough = !passthrough;
                    prefs.edit().putBoolean("passthrough", passthrough).apply();
                    Toast.makeText(this, passthrough
                        ? "Passthrough on: Dolby / DTS go untouched to an HDMI or USB receiver that supports them"
                        : "Passthrough off", Toast.LENGTH_LONG).show();
                    restartHere();
                }
            }).show();
    }

    private void choose(String title, String[] names, java.util.function.IntConsumer pick) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(title).setItems(names, (d, k) -> pick.accept(k)).show();
    }

    private void delay(String title, boolean audioSide) {
        String[] names = { "−500 ms", "−100 ms", "−50 ms", "Reset", "+50 ms", "+100 ms", "+500 ms" };
        long[] steps = { -500, -100, -50, 0, 50, 100, 500 };
        choose(title, names, k -> {
            long cur = audioSide ? mp.getAudioDelay() : mp.getSpuDelay();          // microseconds
            long next = steps[k] == 0 ? 0 : cur + steps[k] * 1000;
            if (audioSide) mp.setAudioDelay(next); else mp.setSpuDelay(next);
            Toast.makeText(this, title + ": " + (next / 1000) + " ms", Toast.LENGTH_SHORT).show();
        });
    }

    private void chapters() {
        MediaPlayer.Chapter[] ch = mp.getChapters(-1);
        if (ch == null || ch.length == 0) { Toast.makeText(this, "No chapters in this file", Toast.LENGTH_SHORT).show(); return; }
        String[] names = new String[ch.length];
        for (int i = 0; i < ch.length; i++) names[i] = (ch[i].name == null || ch[i].name.isEmpty() ? "Chapter " + (i + 1) : ch[i].name) + "  ·  " + fmt(ch[i].timeOffset);
        choose("Chapters", names, k -> mp.setTime(ch[k].timeOffset, false));
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && bar != null && bar.getVisibility() != View.VISIBLE) immersive();
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_SPACE: case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_HEADSETHOOK: togglePlay(); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (mp != null && !mp.isPlaying()) togglePlay(); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: if (mp != null && mp.isPlaying()) mp.pause(); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_MEDIA_REWIND: skip(-10000); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: skip(10000); return true;
            default: return super.onKeyDown(keyCode, event);
        }
    }

    // ---------------------------------------------------------------- audio focus

    private final AudioManager.OnAudioFocusChangeListener focus = change -> {
        if (mp == null) return;
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if (mp.isPlaying()) { pausedByFocus = change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT; mp.pause(); }
        } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedByFocus) { pausedByFocus = false; mp.play(); }
    };

    private void requestFocus() {
        if (audio == null) audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (focusReq == null) focusReq = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(isVideo ? AudioAttributes.CONTENT_TYPE_MOVIE : AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setOnAudioFocusChangeListener(focus, main).build();
        audio.requestAudioFocus(focusReq);
    }

    // ---------------------------------------------------------------- lifecycle

    @Override protected void onPause() {
        super.onPause();
        if (castTo == null && mp != null && mp.isPlaying() && !isInMultiWindowMode() && isVideo) mp.pause();
    }

    @Override public void finish() {
        report();
        super.finish();
    }

    private void report() {
        if (reported) return;
        reported = true;
        long pos = mp != null ? Math.max(lastTime, mp.getTime()) : lastTime;
        Closed c = onClosed;
        if (c != null) c.closed(uri, Math.max(0, pos), length, ended, error);
    }

    @Override protected void onDestroy() {
        report();
        main.removeCallbacksAndMessages(null);
        if (audio != null && focusReq != null) audio.abandonAudioFocusRequest(focusReq);
        if (mp != null) {
            try { mp.setEventListener(null); mp.stop(); mp.detachViews(); mp.release(); } catch (Throwable ignored) {}
            mp = null;
        }
        if (opened != null) opened.closeFd();
        if (current == this) current = null;
        super.onDestroy();
    }
}
