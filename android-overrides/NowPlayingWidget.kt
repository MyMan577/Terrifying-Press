package com.pressplay.media

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.RemoteViews
import androidx.media3.common.util.UnstableApi

/**
 * Home screen widget: what is playing, with previous / play-pause / next.
 * While the playback service is alive the buttons drive its player directly. When it is not (the app was closed),
 * every part of the widget opens the app instead, showing the last played title.
 */
@UnstableApi
class NowPlayingWidget : AppWidgetProvider() {

    companion object {
        private const val ACT = "com.pressplay.media.WIDGET_CMD"
        private const val FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

        /** Main thread. Redraws every placed widget from the current player state. Cheap no-op when none is placed. */
        fun refresh(ctx: Context) {
            try {
                val app = ctx.applicationContext
                val mgr = AppWidgetManager.getInstance(app)
                val ids = mgr.getAppWidgetIds(ComponentName(app, NowPlayingWidget::class.java))
                if (ids.isEmpty()) return
                mgr.updateAppWidget(ids, build(app))
            } catch (_: Exception) {}
        }

        private fun id(ctx: Context, name: String, type: String) = ctx.resources.getIdentifier(name, type, ctx.packageName)

        private fun openApp(ctx: Context, req: Int): PendingIntent = PendingIntent.getActivity(
            ctx, req, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), FLAGS
        )

        private fun cmd(ctx: Context, name: String, req: Int): PendingIntent = PendingIntent.getBroadcast(
            ctx, req, Intent(ctx, NowPlayingWidget::class.java).setAction(ACT).putExtra("cmd", name), FLAGS
        )

        private fun small(b: Bitmap?): Bitmap? {
            if (b == null) return null
            val max = maxOf(b.width, b.height)
            if (max <= 256) return b
            val k = 256f / max
            return Bitmap.createScaledBitmap(b, (b.width * k).toInt().coerceAtLeast(1), (b.height * k).toInt().coerceAtLeast(1), true)
        }

        private fun build(ctx: Context): RemoteViews {
            val v = RemoteViews(ctx.packageName, id(ctx, "pp_widget", "layout"))
            val p = PlaybackService.instance?.sessionPlayer()
            val live = p != null && p.mediaItemCount > 0
            var title: String? = null
            var artist: String? = null
            var art: Bitmap? = null
            var playing = false
            if (p != null && live) {
                val md = p.mediaMetadata
                title = md.title?.toString()
                artist = md.artist?.toString()
                playing = p.playWhenReady
                try {
                    val data = md.artworkData
                    val uri = md.artworkUri
                    art = if (data != null) small(BitmapFactory.decodeByteArray(data, 0, data.size))
                    else if (uri != null && (uri.scheme == null || uri.scheme == "file")) small(BitmapFactory.decodeFile(uri.path))
                    else null
                } catch (_: Throwable) { art = null }
            } else {
                val prefs = ctx.getSharedPreferences("pp_resume", Context.MODE_PRIVATE)
                title = prefs.getString("title", null)
                artist = prefs.getString("artist", null)
            }
            v.setTextViewText(id(ctx, "pp_w_title", "id"), if (title.isNullOrBlank()) "Press Play" else title)
            v.setTextViewText(id(ctx, "pp_w_artist", "id"), if (artist.isNullOrBlank()) (if (live) "" else "Tap to open") else artist)
            val artId = id(ctx, "pp_w_art", "id")
            if (art != null) v.setImageViewBitmap(artId, art) else v.setImageViewResource(artId, id(ctx, "pp_w_note", "drawable"))
            v.setImageViewResource(id(ctx, "pp_w_play", "id"), id(ctx, if (playing) "pp_w_ic_pause" else "pp_w_ic_play", "drawable"))
            v.setOnClickPendingIntent(id(ctx, "pp_w_root", "id"), openApp(ctx, 10))
            v.setOnClickPendingIntent(id(ctx, "pp_w_prev", "id"), if (live) cmd(ctx, "prev", 11) else openApp(ctx, 10))
            v.setOnClickPendingIntent(id(ctx, "pp_w_play", "id"), if (live) cmd(ctx, "toggle", 12) else openApp(ctx, 10))
            v.setOnClickPendingIntent(id(ctx, "pp_w_next", "id"), if (live) cmd(ctx, "next", 13) else openApp(ctx, 10))
            return v
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) { refresh(context) }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != ACT) return
        try {
            val p = PlaybackService.instance?.sessionPlayer()
            if (p == null || p.mediaItemCount == 0) {
                // The service went away since the widget was drawn: open the app instead.
                context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } else when (intent.getStringExtra("cmd")) {
                "toggle" -> if (p.playWhenReady) p.pause() else p.play()
                "next" -> p.seekToNext()
                "prev" -> p.seekToPrevious()
            }
        } catch (_: Exception) {}
        refresh(context)
    }
}
