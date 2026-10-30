package com.pressplay.media;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Foreground service that exists only to keep a stem split alive while the screen is off or the app is in the background. */
public class KeepAliveService extends Service {
    private static final String CH = "ppv_keepalive";
    private PowerManager.WakeLock wl;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm != null) nm.createNotificationChannel(new NotificationChannel(CH, "Stem splitting", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CH);
        } else {
            b = new Notification.Builder(this);
        }
        Notification n = b.setContentTitle("Splitting stems")
                .setContentText("Keeping the split running")
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(4417, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(4417, n);
        if (wl == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pressplay:split");
                wl.acquire(4L * 60 * 60 * 1000);   // safety cap: 4 hours
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wl != null && wl.isHeld()) wl.release();
        wl = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
