package com.pressplay.media;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
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

import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.interfaces.IMedia;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.Locale;

/**
 * The full-screen VLC player: the controls on top of a {@link VlcSession}. Used for files neither the WebView nor
 * ExoPlayer can play (WMV, RealMedia, VC-1, DTS soundtracks, odd AVIs, streams, shares), on request (deinterlace,
 * 360° look-around, passthrough), and as the remote while casting.
 * Closing it ends the playback. Leaving it any other way (Home, the lock screen) keeps a cast or audio going in the
 * background with a notification; a video on this screen pauses.
 */
public class VlcPlayerActivity extends Activity implements VlcSession.Listener {

    static volatile VlcPlayerActivity current;

    private final Handler main = new Handler(Looper.getMainLooper());
    private VlcSession session;
    private VLCVideoLayout videoLayout;
    private boolean userSeeking, closing, spherical360Told;

    private LinearLayout bar, top;
    private TextView playBtn, timeText, titleText, info, badge, back;
    private SeekBar seek;
    private int scaleIdx = 0;
    private static final MediaPlayer.ScaleType[] SCALES = {
        MediaPlayer.ScaleType.SURFACE_BEST_FIT, MediaPlayer.ScaleType.SURFACE_FIT_SCREEN, MediaPlayer.ScaleType.SURFACE_FILL,
        MediaPlayer.ScaleType.SURFACE_16_9, MediaPlayer.ScaleType.SURFACE_4_3, MediaPlayer.ScaleType.SURFACE_221_1,
        MediaPlayer.ScaleType.SURFACE_235_1, MediaPlayer.ScaleType.SURFACE_ORIGINAL };
    private static final String[] SCALE_NAMES = { "Fit", "Fit screen", "Fill", "16:9", "4:3", "2.21:1", "2.35:1", "Original size" };

    private final Runnable hideControls = () -> setControls(false);
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (session == null || session.over) return;
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
        Intent in = getIntent();
        // From the notification / lock screen: show the session that is already playing.
        if (in.getBooleanExtra("resume", false)) session = VlcSession.current;
        else session = VlcSession.start(this, in);
        if (session == null) { finish(); return; }
        current = this;
        session.addListener(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28)
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        buildUi();
        if (session.isLocalVideo()) session.attachViews(videoLayout);
        onPicture();
        refreshState();
        main.post(tick);
        bump();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // A new file while the screen is up: start it (resume intents just bring the screen forward).
        if (intent.getBooleanExtra("resume", false) || intent.getStringExtra("uri") == null) return;
        if (session != null) { session.removeListener(this); session.detachViews(); }
        session = VlcSession.start(this, intent);      // ends the old one
        if (session == null) { finish(); return; }
        intent.putExtra("resume", true);              // the rebuilt screen shows this session instead of starting it again
        setIntent(intent);
        recreate();
    }

    private void buildUi() {
        boolean isVideo = session.isVideo;
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        videoLayout = new VLCVideoLayout(this);
        root.addView(videoLayout, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        info = text(session.castTo != null ? "Casting to " + session.castName() + "\n\n" + session.title : (isVideo ? "" : session.title), 22, true);
        info.setGravity(Gravity.CENTER);
        info.setPadding(dp(24), 0, dp(24), 0);
        root.addView(info, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // tap anywhere: show / hide the controls; on a 360° video, drag to look around
        View tap = new View(this);
        tap.setOnClickListener(v -> setControls(bar.getVisibility() != View.VISIBLE));
        tap.setOnTouchListener(new View.OnTouchListener() {
            float lx, ly; boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN: lx = e.getX(); ly = e.getY(); moved = false; return true;
                    case MotionEvent.ACTION_MOVE: {
                        float dx = e.getX() - lx, dy = e.getY() - ly;
                        if (!moved && Math.hypot(dx, dy) < dp(8)) return true;
                        moved = true;
                        if (session.spherical && session.mp != null) {
                            float k = 90f / Math.max(1, v.getWidth());
                            session.mp.updateViewpoint(-dx * k, -dy * k, 0, 0, false);
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
        back = button(session.castTo != null ? "✕  Stop casting" : "✕  Close", v -> close());
        top.addView(back);
        titleText = text(session.title, 15, false);
        titleText.setSingleLine(true);
        titleText.setPadding(dp(12), 0, dp(8), 0);
        top.addView(titleText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        if (!session.isLocalVideo()) top.addView(button("⌄  Hide", v -> finish()));   // back to the app; keeps playing, with a notification
        badge = text(session.castTo != null ? "Casting · VLC engine" : "VLC engine", 11, false);
        badge.setAlpha(0.6f);
        badge.setPadding(dp(8), 0, 0, 0);
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
                if (fromUser && session.length > 0) timeText.setText(fmt(session.length * p / 1000) + " / " + fmt(session.length));
            }
            @Override public void onStartTrackingTouch(SeekBar s) { userSeeking = true; main.removeCallbacks(hideControls); }
            @Override public void onStopTrackingTouch(SeekBar s) {
                userSeeking = false;
                if (session.length > 0) session.seekTo(session.length * s.getProgress() / 1000);
                else if (session.mp != null) session.mp.setPosition(s.getProgress() / 1000f);
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
        btns.addView(button("−10s", v -> { session.skip(-10000); refreshTime(); }));
        playBtn = button("❚❚", v -> session.toggle());
        playBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        btns.addView(playBtn);
        btns.addView(button("+10s", v -> { session.skip(10000); refreshTime(); }));
        btns.addView(button("Audio", v -> pickAudio()));
        btns.addView(button("Subtitles", v -> pickSubs()));
        if (session.isLocalVideo()) btns.addView(button("Aspect", v -> cycleScale()));
        btns.addView(button("More", v -> more()));
        android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        hs.addView(btns);
        bar.addView(hs);
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        setContentView(root);
        immersive();
    }

    // ---------------------------------------------------------------- session events

    @Override public void changed(int what) {
        switch (what) {
            case VlcSession.CHANGED_STATE: refreshState(); break;
            case VlcSession.CHANGED_TIME: refreshTime(); break;
            case VlcSession.CHANGED_PICTURE: onPicture(); break;
            case VlcSession.CHANGED_OVER:
                if (session != null && session.error != null) Toast.makeText(this, session.error, Toast.LENGTH_LONG).show();
                closing = true;
                finish();
                break;
            default: break;
        }
    }

    private void refreshState() {
        if (playBtn != null) playBtn.setText(session.isPlaying() ? "❚❚" : "▶");
        bump();
    }

    private void onPicture() {
        IMedia.VideoTrack vt = session.videoTrack;
        if (vt == null || !session.isLocalVideo()) return;
        info.setText("");
        if (session.spherical && !spherical360Told) {
            spherical360Told = true;
            Toast.makeText(this, "360° video: drag to look around", Toast.LENGTH_LONG).show();
        }
        if (vt.width > 0 && vt.height > 0) {
            boolean sideways = vt.orientation == IMedia.VideoTrack.Orientation.LeftBottom || vt.orientation == IMedia.VideoTrack.Orientation.RightTop;
            boolean wide = sideways ? vt.height > vt.width : vt.width > vt.height;
            setRequestedOrientation(wide ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
        }
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

    /** Keeps the controls up for a few more seconds (only over a playing video; audio and casting keep them). */
    private void bump() {
        main.removeCallbacks(hideControls);
        if (session != null && session.isLocalVideo() && session.isPlaying()) main.postDelayed(hideControls, 3500);
    }

    private void close() {
        closing = true;
        if (session != null) session.end(false, null);
        finish();
    }

    private void refreshTime() {
        if (session == null || timeText == null) return;
        long t = session.time(), len = session.length;
        if (!userSeeking) {
            timeText.setText(fmt(t) + " / " + (len > 0 ? fmt(len) : "--:--"));
            seek.setProgress(len > 0 ? (int) (t * 1000 / len) : (session.mp != null ? (int) (session.mp.getPosition() * 1000) : 0));
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
        MediaPlayer mp = session.mp;
        if (mp != null) pickTrack("Audio track", mp.getAudioTracks(), mp.getAudioTrack(), id -> mp.setAudioTrack(id));
    }

    private void pickSubs() {
        MediaPlayer mp = session.mp;
        if (mp != null) pickTrack("Subtitles", mp.getSpuTracks(), mp.getSpuTrack(), id -> mp.setSpuTrack(id));
    }

    private void cycleScale() {
        if (session.mp == null) return;
        scaleIdx = (scaleIdx + 1) % SCALES.length;
        session.mp.setVideoScale(SCALES[scaleIdx]);
        Toast.makeText(this, "Aspect: " + SCALE_NAMES[scaleIdx], Toast.LENGTH_SHORT).show();
    }

    private void more() {
        MediaPlayer mp = session.mp;
        if (mp == null) return;
        String[] items = {
            "Speed: " + String.format(Locale.ROOT, "%.2gx", session.rate),
            "Audio delay: " + (mp.getAudioDelay() / 1000) + " ms",
            "Subtitle delay: " + (mp.getSpuDelay() / 1000) + " ms",
            "Chapters",
            "Deinterlace (old TV / DVD): " + (session.deint ? "on" : "off"),
            "Dolby / DTS passthrough to a receiver: " + (session.passthrough ? "on" : "off") };
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setItems(items, (d, i) -> {
                if (i == 0) choose("Speed", new String[] { "0.5x", "0.75x", "1x", "1.25x", "1.5x", "1.75x", "2x" },
                    k -> session.setRate(new float[] { 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f }[k]));
                else if (i == 1) delay("Audio delay", true);
                else if (i == 2) delay("Subtitle delay", false);
                else if (i == 3) chapters();
                else if (i == 4) {
                    session.setDeinterlace(!session.deint);
                    Toast.makeText(this, session.deint ? "Deinterlacing on (software decoding)" : "Deinterlacing off", Toast.LENGTH_SHORT).show();
                } else {
                    session.setPassthrough(!session.passthrough);
                    Toast.makeText(this, session.passthrough
                        ? "Passthrough on: Dolby / DTS go untouched to an HDMI or USB receiver that supports them"
                        : "Passthrough off", Toast.LENGTH_LONG).show();
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
            MediaPlayer mp = session.mp;
            if (mp == null) return;
            long cur = audioSide ? mp.getAudioDelay() : mp.getSpuDelay();          // microseconds
            long next = steps[k] == 0 ? 0 : cur + steps[k] * 1000;
            if (audioSide) mp.setAudioDelay(next); else mp.setSpuDelay(next);
            Toast.makeText(this, title + ": " + (next / 1000) + " ms", Toast.LENGTH_SHORT).show();
        });
    }

    private void chapters() {
        MediaPlayer mp = session.mp;
        MediaPlayer.Chapter[] ch = mp == null ? null : mp.getChapters(-1);
        if (ch == null || ch.length == 0) { Toast.makeText(this, "No chapters in this file", Toast.LENGTH_SHORT).show(); return; }
        String[] names = new String[ch.length];
        for (int i = 0; i < ch.length; i++) names[i] = (ch[i].name == null || ch[i].name.isEmpty() ? "Chapter " + (i + 1) : ch[i].name) + "  ·  " + fmt(ch[i].timeOffset);
        choose("Chapters", names, k -> session.seekTo(ch[k].timeOffset));
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
        if (session == null) return super.onKeyDown(keyCode, event);
        switch (keyCode) {
            case KeyEvent.KEYCODE_SPACE: case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_HEADSETHOOK: session.toggle(); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: session.play(); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: session.pause(); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_MEDIA_REWIND: session.skip(-10000); refreshTime(); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: session.skip(10000); refreshTime(); return true;
            default: return super.onKeyDown(keyCode, event);
        }
    }

    @Override public void onBackPressed() { close(); }

    // ---------------------------------------------------------------- lifecycle

    @Override protected void onStart() {
        super.onStart();
        if (session != null && !session.over && session.isLocalVideo() && videoLayout != null) session.attachViews(videoLayout);
    }

    @Override protected void onStop() {
        super.onStop();
        // A video needs this screen: pause it and let go of the surface. A cast or audio keeps playing (notification).
        if (session != null && !session.over && session.isLocalVideo() && !isInMultiWindowMode()) { session.pause(); session.detachViews(); }
    }

    @Override protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (session != null) {
            session.removeListener(this);
            if (!session.over) {
                session.detachViews();
                // Gone without Close (e.g. the system cleared it): a video cannot carry on without its screen.
                if (session.isLocalVideo() && !closing && !isChangingConfigurations()) session.end(false, null);
            }
        }
        if (current == this) current = null;
        super.onDestroy();
    }
}
