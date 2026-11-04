package com.pressplay.media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
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
