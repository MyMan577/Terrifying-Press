package com.pressplay.media

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Long-running work (vocal separation, MP3 conversion) keeps running in the background with a
 * progress notification. The heavy lifting is still done by the web code; this keeps the process
 * alive and visible to the user so Android doesn't freeze or kill it mid-job.
 */
@CapacitorPlugin(name = "PPJobs")
class JobsPlugin : Plugin() {
    private fun send(action: String, call: PluginCall) {
        val d = call.data
        val i = Intent(context, JobService::class.java).setAction(action)
            .putExtra("id", d.optString("id", "job")).putExtra("title", d.optString("title", "Working"))
            .putExtra("text", d.optString("text", "")).putExtra("progress", d.optInt("progress", -1))
            .putExtra("ok", d.optBoolean("ok", true))
        if (action == JobService.START) ContextCompat.startForegroundService(context, i) else context.startService(i)
        call.resolve()
    }
    @PluginMethod fun start(call: PluginCall) = send(JobService.START, call)
    @PluginMethod fun update(call: PluginCall) = send(JobService.UPDATE, call)
    @PluginMethod fun finish(call: PluginCall) = send(JobService.FINISH, call)
}

class JobService : Service() {
    companion object {
        const val START = "pp.job.start"; const val UPDATE = "pp.job.update"; const val FINISH = "pp.job.finish"
        private const val CH = "pp_jobs"; private const val CH_DONE = "pp_jobs_done"
        private const val FG_ID = 4201
    }
    private class Job(var title: String, var text: String, var progress: Int)
    private val jobs = LinkedHashMap<String, Job>()
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CH, "Background tasks", NotificationManager.IMPORTANCE_LOW))
            nm.createNotificationChannel(NotificationChannel(CH_DONE, "Finished tasks", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }

    private fun build(): Notification {
        val j = jobs.values.lastOrNull()
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val b = NotificationCompat.Builder(this, CH)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(j?.title ?: "Working").setContentText(j?.text ?: "")
            .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open)
        if (j != null && j.progress in 0..100) b.setProgress(100, j.progress, false) else b.setProgress(0, 0, true)
        if (jobs.size > 1) b.setSubText("${jobs.size} tasks")
        return b.build()
    }

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        val id = i?.getStringExtra("id") ?: "job"
        when (i?.action) {
            START, UPDATE -> {
                val j = jobs.getOrPut(id) { Job("", "", -1) }
                i?.getStringExtra("title")?.let { if (it.isNotEmpty()) j.title = it }
                i?.getStringExtra("text")?.let { j.text = it }
                j.progress = i?.getIntExtra("progress", -1) ?: -1
                if (i?.action == START) {
                    if (Build.VERSION.SDK_INT >= 29) startForeground(FG_ID, build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                    else startForeground(FG_ID, build())
                    if (wake == null) {
                        wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pressplay:job")
                            .apply { setReferenceCounted(false); acquire(4 * 60 * 60 * 1000L) }
                    }
                } else if (NotificationManagerCompat.from(this).areNotificationsEnabled()) {
                    getSystemService(NotificationManager::class.java).notify(FG_ID, build())
                }
            }
            FINISH -> {
                val j = jobs.remove(id)
                val ok = i?.getBooleanExtra("ok", true) ?: true
                if (j != null && NotificationManagerCompat.from(this).areNotificationsEnabled()) {
                    val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                    val n = NotificationCompat.Builder(this, CH_DONE)
                        .setSmallIcon(if (ok) android.R.drawable.stat_sys_download_done else android.R.drawable.stat_notify_error)
                        .setContentTitle(if (ok) "${j.title} finished" else "${j.title} failed")
                        .setContentText(i?.getStringExtra("text") ?: "").setAutoCancel(true).setContentIntent(open).build()
                    getSystemService(NotificationManager::class.java).notify(FG_ID + 1 + (id.hashCode() and 0xfff), n)
                }
                if (jobs.isEmpty()) {
                    wake?.let { if (it.isHeld) it.release() }; wake = null
                    stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() { wake?.let { if (it.isHeld) it.release() }; super.onDestroy() }
}

/**
 * Reminders, tips and rewards (pp-notify.js decides what and when; Settings > Notifications turns each kind off).
 * They are scheduled with AlarmManager, so they arrive with the app closed. Inexact on purpose: no exact-alarm
 * permission, and Android may batch them by a few minutes to save battery. A reboot clears them; the page schedules
 * them again every time the app is opened or left.
 */
@CapacitorPlugin(name = "PPNotify")
class NotifyPlugin : Plugin() {
    /** Cancels every scheduled one, then schedules items: [{ id, at (ms), title, text, kind: "tip" | "reward" }]. */
    @PluginMethod fun replace(call: PluginCall) {
        val list = call.getArray("items") ?: JSArray()
        NotifyReceiver.cancelAll(context)
        val ids = HashSet<String>(); val now = System.currentTimeMillis()
        for (i in 0 until list.length()) {
            val o = list.optJSONObject(i) ?: continue
            val id = o.optString("id"); val at = o.optLong("at")
            if (id.isEmpty() || at <= now) continue
            NotifyReceiver.schedule(context, id, at, o.optString("title"), o.optString("text"), o.optString("kind", "tip"))
            ids.add(id)
        }
        context.getSharedPreferences(NotifyReceiver.PREFS, 0).edit().putStringSet("ids", ids).apply()
        call.resolve(JSObject().put("scheduled", ids.size))
    }
    /** Shows one now (the Preview button in Settings). */
    @PluginMethod fun show(call: PluginCall) {
        NotifyReceiver.post(context, call.getString("id") ?: "now", call.getString("title") ?: "", call.getString("text") ?: "", call.getString("kind") ?: "tip")
        call.resolve()
    }
    /**
     * Alarms (Press Play Pendulum): [{ id, at (ms), title, text }] replaces the last list. Unlike the tips above these
     * are exact (an alarm clock, shown in the status bar), ring loudly on the Alarms channel until dismissed, and are
     * set again after the phone restarts. Resolves { exact }: false when Android (12+) has not allowed exact alarms,
     * and they come a few minutes late at worst.
     */
    @PluginMethod fun alarms(call: PluginCall) {
        AlarmSched.replace(context, (call.getArray("items") ?: JSArray()).toString())
        call.resolve(JSObject().put("exact", AlarmSched.exactAllowed(context)))
    }
    /**
     * Plays an alarm sound the page made (a WAV, base64): { wav, loop, speaker, louder }. speaker: on the alarm stream,
     * which Android plays on the speaker even with headphones in (and at the alarm volume); otherwise on the media
     * stream, which goes to the headphones when they are in. louder: starts at a quarter and rises over 30 seconds.
     */
    @PluginMethod fun playSound(call: PluginCall) {
        val data = try { android.util.Base64.decode(call.getString("wav") ?: "", android.util.Base64.DEFAULT) } catch (e: Exception) { null }
        if (data == null || data.isEmpty()) { call.reject("no sound"); return }
        try {
            AlarmSound.play(context, data, call.getBoolean("loop", true) ?: true, call.getBoolean("speaker", false) ?: false, call.getBoolean("louder", false) ?: false)
            call.resolve()
        } catch (e: Exception) { call.reject(e.message ?: "could not play") }
    }
    @PluginMethod fun stopSound(call: PluginCall) { AlarmSound.stop(); call.resolve() }
    /** Takes a ringing alarm's notification away (the app has started the music). */
    @PluginMethod fun dismiss(call: PluginCall) {
        NotificationManagerCompat.from(context).cancel(NotifyReceiver.notifId(call.getString("id") ?: ""))
        call.resolve()
    }
    /** Whether Android lets the app show notifications at all (the person can switch them off for the app). */
    @PluginMethod fun status(call: PluginCall) {
        call.resolve(JSObject().put("enabled", NotificationManagerCompat.from(context).areNotificationsEnabled()))
    }
}

class NotifyReceiver : BroadcastReceiver() {
    companion object {
        const val PREFS = "pp_notify"
        private const val CH_TIPS = "pp_tips"; private const val CH_REWARDS = "pp_rewards"; private const val CH_ALARMS = "pp_alarms"
        fun notifId(id: String) = 0x5000 + (id.hashCode() and 0xfff)
        // one PendingIntent per id: the action carries the id (extras do not count when Android matches them)
        private fun pending(ctx: Context, id: String, extras: Bundle?): PendingIntent {
            val i = Intent(ctx, NotifyReceiver::class.java).setAction("pp.notify.$id")
            if (extras != null) i.putExtras(extras)
            return PendingIntent.getBroadcast(ctx, id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        fun schedule(ctx: Context, id: String, at: Long, title: String, text: String, kind: String) {
            val b = Bundle().apply { putString("id", id); putString("title", title); putString("text", text); putString("kind", kind) }
            val am = ctx.getSystemService(AlarmManager::class.java) ?: return
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx, id, b))
            else am.set(AlarmManager.RTC_WAKEUP, at, pending(ctx, id, b))
        }
        fun cancelAll(ctx: Context) {
            val am = ctx.getSystemService(AlarmManager::class.java) ?: return
            for (id in ctx.getSharedPreferences(PREFS, 0).getStringSet("ids", emptySet()) ?: emptySet()) am.cancel(pending(ctx, id, null))
        }
        fun post(ctx: Context, id: String, title: String, text: String, kind: String) {
            if (title.isEmpty() || !NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
            val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
            if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(NotificationChannel(CH_TIPS, "Reminders and tips", NotificationManager.IMPORTANCE_DEFAULT))
                nm.createNotificationChannel(NotificationChannel(CH_REWARDS, "Rewards", NotificationManager.IMPORTANCE_DEFAULT))
                if (kind == "alarm") {
                    val ch = NotificationChannel(CH_ALARMS, "Alarms", NotificationManager.IMPORTANCE_HIGH)
                    ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    ch.enableVibration(true); ch.vibrationPattern = longArrayOf(0, 700, 400, 700, 400, 700)
                    ch.setBypassDnd(true)
                    nm.createNotificationChannel(ch)
                }
            }
            val alarm = kind == "alarm"
            val open = PendingIntent.getActivity(ctx, 7, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val b = NotificationCompat.Builder(ctx, if (alarm) CH_ALARMS else if (kind == "reward") CH_REWARDS else CH_TIPS)
                .setSmallIcon(R.drawable.pp_w_note)
                .setContentTitle(title).setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true).setContentIntent(open)
            if (alarm) {
                // rings (and keeps ringing) until it is tapped or swiped away; on a locked phone it shows full screen
                b.setCategory(NotificationCompat.CATEGORY_ALARM).setPriority(NotificationCompat.PRIORITY_MAX)
                    .setFullScreenIntent(open, true)
                    .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                    .setVibrate(longArrayOf(0, 700, 400, 700, 400, 700))
            }
            val n = b.build()
            if (alarm) n.flags = n.flags or Notification.FLAG_INSISTENT
            nm.notify(notifId(id), n)
        }
    }
    override fun onReceive(ctx: Context, i: Intent) {
        post(ctx, i.getStringExtra("id") ?: "n", i.getStringExtra("title") ?: "", i.getStringExtra("text") ?: "", i.getStringExtra("kind") ?: "tip")
    }
}

/** Exact alarms for Press Play Pendulum, kept apart from the tips (NotifyPlugin.replace cancels only those). */
object AlarmSched {
    private const val KEY = "alarm_items"
    fun exactAllowed(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 31) return true
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return false
        return am.canScheduleExactAlarms()
    }
    private fun pending(ctx: Context, id: String, extras: Bundle?): PendingIntent {
        val i = Intent(ctx, NotifyReceiver::class.java).setAction("pp.alarm.$id")
        if (extras != null) i.putExtras(extras)
        return PendingIntent.getBroadcast(ctx, ("alarm:" + id).hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    private fun read(ctx: Context): org.json.JSONArray =
        try { org.json.JSONArray(ctx.getSharedPreferences(NotifyReceiver.PREFS, 0).getString(KEY, "[]")) } catch (e: Exception) { org.json.JSONArray() }
    fun replace(ctx: Context, json: String) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val old = read(ctx)
        for (k in 0 until old.length()) { val o = old.optJSONObject(k) ?: continue; am.cancel(pending(ctx, o.optString("id"), null)) }
        ctx.getSharedPreferences(NotifyReceiver.PREFS, 0).edit().putString(KEY, json).apply()
        scheduleAll(ctx)
    }
    fun scheduleAll(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val list = read(ctx); val now = System.currentTimeMillis()
        for (k in 0 until list.length()) {
            val o = list.optJSONObject(k) ?: continue
            val id = o.optString("id"); val at = o.optLong("at")
            if (id.isEmpty() || at <= now) continue
            val b = Bundle().apply { putString("id", id); putString("title", o.optString("title")); putString("text", o.optString("text")); putString("kind", "alarm") }
            val p = pending(ctx, id, b)
            try {
                if (exactAllowed(ctx)) {
                    val show = PendingIntent.getActivity(ctx, 8, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                    am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), p)
                } else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
            } catch (e: SecurityException) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
            }
        }
    }
}

/** A restart (or an app update) clears every alarm: set them again from the saved list. */
class AlarmBootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) {
        if (i.action == Intent.ACTION_BOOT_COMPLETED || i.action == Intent.ACTION_MY_PACKAGE_REPLACED) AlarmSched.scheduleAll(ctx)
    }
}

/** The alarm and Pomodoro sounds, played on the alarm stream (speaker, even with headphones in) or the media stream. */
object AlarmSound {
    private var mp: android.media.MediaPlayer? = null
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    fun play(ctx: Context, data: ByteArray, loop: Boolean, speaker: Boolean, louder: Boolean) {
        val f = java.io.File(ctx.cacheDir, "pp_alarm_sound.wav")
        f.writeBytes(data)
        main.post {
            stopNow()
            val p = android.media.MediaPlayer()
            try {
                p.setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(if (speaker) AudioAttributes.USAGE_ALARM else AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                p.setDataSource(f.absolutePath)
                p.isLooping = loop
                p.setOnCompletionListener { if (!loop && mp === it) stopNow() }
                p.prepare()
                val v0 = if (louder) 0.25f else 1f
                p.setVolume(v0, v0)
                p.start()
                mp = p
                if (louder) {
                    val t0 = android.os.SystemClock.uptimeMillis()
                    main.postDelayed(object : Runnable {
                        override fun run() {
                            val m = mp ?: return
                            if (m !== p) return
                            val v = minOf(1f, 0.25f + 0.75f * (android.os.SystemClock.uptimeMillis() - t0) / 30000f)
                            m.setVolume(v, v)
                            if (v < 1f) main.postDelayed(this, 500)
                        }
                    }, 500)
                }
            } catch (e: Exception) {
                try { p.release() } catch (x: Exception) {}
            }
        }
    }
    /** Stops it (on the main thread, where it was started). */
    fun stop() { main.post { stopNow() } }
    private fun stopNow() {
        val p = mp ?: return
        mp = null
        try { p.stop() } catch (e: Exception) {}
        try { p.release() } catch (e: Exception) {}
    }
}
