package com.pressplay.media;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * Keeps long separations (MDX-Net, Demucs, Spleeter) from cooking the chip.
 * Call tick() once per finished chunk on the worker thread.
 * Full speed while the phone is cool. When it warms up, sleeps a share of each chunk's
 * own working time, so it eases off smoothly instead of hitting a hard thermal throttle.
 * Reads three signals, because OEMs differ: thermal headroom (API 30+, forecast),
 * thermal status (API 29+), and battery temperature (every device).
 */
final class Throttle {
    private final Context ctx;
    private final PowerManager pm;
    private final double baseline;   // fixed extra duty from the app (0 = adaptive only)
    private long last = 0;           // when the current chunk started
    private long probedAt = 0;
    private double cached = 0;

    Throttle(Context c, double baselineDuty) {
        ctx = c.getApplicationContext();
        pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        baseline = Math.max(0, Math.min(2, baselineDuty));
    }

    /** Sleeps (if needed) after a chunk. Sleep = chunk working time x factor, capped at 8 s. */
    void tick() {
        long now = SystemClock.elapsedRealtime();
        if (last == 0) { last = now; return; }                 // first chunk: just start the clock
        long work = Math.max(1, now - last);
        double f = Math.max(baseline, factor(now));
        long ms = (long) Math.min(8000, work * f);
        if (ms > 20) {
            try { Thread.sleep(ms); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }
        last = SystemClock.elapsedRealtime();
    }

    private double factor(long now) {
        if (now - probedAt < 1500) return cached;              // headroom must not be polled faster than ~1/s
        probedAt = now;
        double f = 0;
        try {
            if (Build.VERSION.SDK_INT >= 30 && pm != null) {   // forecast 10 s ahead; 1.0 = severe throttling
                float h = pm.getThermalHeadroom(10);
                if (!Float.isNaN(h)) f = Math.max(f, h >= 1f ? 2.0 : ramp(h, 0.75, 1.0, 1.0));
            }
            if (Build.VERSION.SDK_INT >= 29 && pm != null) {
                int s = pm.getCurrentThermalStatus();
                f = Math.max(f, s <= 1 ? 0 : s == 2 ? 0.5 : s == 3 ? 1.5 : 4.0);
            }
            Intent b = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b != null) {                                   // fallback for phones that report no thermal data
                double t = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0;
                if (t > 0) f = Math.max(f, ramp(t, 39, 45, 1.5));
            }
        } catch (Throwable ignored) { }
        return (cached = f);
    }

    private static double ramp(double v, double lo, double hi, double max) {
        return v <= lo ? 0 : v >= hi ? max : (v - lo) / (hi - lo) * max;
    }
}
