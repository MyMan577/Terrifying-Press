package com.pressplay.media;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Keeps a {@link VlcSession} (the VLC player or a cast) alive when its screen is closed, and shows its media
 * notification: title, "Casting to ..." or "VLC engine", back 10 s / play-pause / forward 10 s / stop. The lock
 * screen and Bluetooth buttons reach the session through its MediaSession.
 */
public class VlcPlaybackService extends Service {
    private static final String CHANNEL = "pp_vlc_playback";
    private static final int ID = 7341;
    static volatile VlcPlaybackService instance;

    static void start(Context ctx) {
        try { ctx.getApplicationContext().startForegroundService(new Intent(ctx.getApplicationContext(), VlcPlaybackService.class)); }
        catch (Throwable ignored) {}           // e.g. not allowed from the background: playback still works, just no notification
    }
    static void stop(Context ctx) {
        VlcPlaybackService s = instance;
        if (s != null) { s.stopForeground(STOP_FOREGROUND_REMOVE); s.stopSelf(); }
    }
    static void refresh() { VlcPlaybackService s = instance; if (s != null) s.show(); }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "VLC player and casting", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        show();                                   // startForeground first: Android requires it within seconds of the start
        VlcSession s = VlcSession.current;
        String a = intent == null ? null : intent.getAction();
        if (s == null) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY; }
        if ("toggle".equals(a)) s.toggle();
        else if ("rew".equals(a)) s.skip(-10000);
        else if ("fwd".equals(a)) s.skip(10000);
        else if ("stop".equals(a)) { s.end(false, null); VlcPlayerActivity a2 = VlcPlayerActivity.current; if (a2 != null) a2.finish(); }
        return START_NOT_STICKY;
    }

    private PendingIntent act(String action, int code) {
        return PendingIntent.getService(this, code, new Intent(this, VlcPlaybackService.class).setAction(action),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @SuppressWarnings("deprecation")
    private void show() {
        VlcSession s = VlcSession.current;
        int icon = getResources().getIdentifier("pp_w_note", "drawable", getPackageName());
        if (icon == 0) icon = android.R.drawable.ic_media_play;
        Intent open = new Intent(this, VlcPlayerActivity.class).putExtra("resume", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        boolean playing = s != null && s.isPlaying();
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(icon)
            .setContentTitle(s == null ? "Press Play" : s.title)
            .setContentText(s == null ? "" : (s.castTo != null ? "Casting to " + s.castName() : "VLC engine"))
            .setContentIntent(PendingIntent.getActivity(this, 8, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .setDeleteIntent(act("stop", 14))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOngoing(playing)
            .setShowWhen(false)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_rew, "Back 10 seconds", act("rew", 11)).build())
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play", act("toggle", 12)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_ff, "Forward 10 seconds", act("fwd", 13)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, s != null && s.castTo != null ? "Stop casting" : "Stop", act("stop", 14)).build());
        Notification.MediaStyle style = new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (s != null && s.token() != null) style.setMediaSession(s.token());
        b.setStyle(style);
        Notification n = b.build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(ID, n);
        } catch (Throwable t) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(ID, n);
        }
    }

    /** Swiped out of recents: a cast or audio keeps going (that is what the notification is for); a video on this screen stops. */
    @Override public void onTaskRemoved(Intent rootIntent) {
        VlcSession s = VlcSession.current;
        if (s != null && s.isLocalVideo()) s.end(false, null);
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }
}
