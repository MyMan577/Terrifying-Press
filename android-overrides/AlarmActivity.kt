package com.pressplay.media

import android.app.Activity
import android.app.KeyguardManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationManagerCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * What happens when an alarm goes off (Press Play Pendulum), without the app.
 *
 * The phone's player starts the alarm's songs straight away (the page worked out which songs, and in what order,
 * when the alarm was set: the item's "q", and "tq" when the alarm sound is your own songs), and the alarm screen
 * comes up by itself: over the lock screen, with the screen turned on, or, while the phone is in use, over the
 * other app when Press Play may "Display over other apps". It is a small page of its own (www/alarm.html: the
 * ringing screen's background, Snooze and Stop, and the widgets put on the ringing screen), not the whole app, so it
 * shows in a moment. Snooze and Stop are noted for the app (localStorage 'ppAlarmActV1', read by the Pendulum code
 * next time the app runs) and the snooze is set as an alarm clock right here.
 */
object AlarmRing {
    private val main = Handler(Looper.getMainLooper())
    @Volatile var item: JSONObject? = null; private set
    @Volatile var ringId: String = ""; private set
    /** What the player is doing, for the page (read from the page's thread, so it is kept as ready-made JSON). */
    @Volatile var stateJson: String = "{}"; private set
    @Volatile var screen: WeakReference<AlarmActivity>? = null
    private var musicStarted = false
    private var toneQuiet = false        // the notification is not making a sound (the songs are the alarm sound)
    private var volBefore = -1f
    // what the player had before the alarm (the app's song, where it was, repeat and shuffle): put back afterwards
    private var before: Before? = null
    private class Before(val items: List<MediaItem>, val index: Int, val pos: Long, val repeat: Int, val shuffle: Boolean)
    private var vol = 1f                 // the volume the page's slider is at (0..1)
    private var fade = 1f                // the "getting louder" part (0..1)
    private var fadeR: Runnable? = null
    private var toMusicR: Runnable? = null
    private var endR: Runnable? = null
    private val tickR = object : Runnable { override fun run() { snapState(); if (item != null) main.postDelayed(this, 250) } }

    private fun arr(o: JSONObject?, k: String): JSONArray? = o?.optJSONArray(k)?.takeIf { it.length() > 0 }

    /** An alarm went off (NotifyReceiver). Main thread or not. */
    fun fire(ctx: Context, it: JSONObject, id: String) {
        val app = ctx.applicationContext
        main.post {
            if (item != null) finishRing(app, false)          // another one was still ringing: this one takes over
            item = it; ringId = id; musicStarted = false; vol = 1f; fade = 1f
            val wake = it.optString("wake", "sound")
            val q = arr(it, "q"); val tq = arr(it, "tq")
            // the songs are the alarm sound: the notification itself stays quiet (if the player can start from here)
            val songsFirst = (wake == "music" && q != null) || (wake != "music" && tq != null)
            val canPlay = PlaybackService.tryStart(app)
            toneQuiet = songsFirst && canPlay
            NotifyReceiver.postAlarm(app, id, it, quiet = toneQuiet)
            show(app, id)
            if (canPlay) startMusic(app)
            val timeout = it.optLong("timeout", 10 * 60000L).coerceAtLeast(60000L)
            endR = Runnable { if (ringId == id) { finishRing(app, false); closeScreen() } }.also { r -> main.postDelayed(r, timeout) }
            main.removeCallbacks(tickR); main.post(tickR)
        }
    }

    /** The alarm screen: straight away when Android lets the app open it (the phone in use and no "Display over other apps": only the notification's full screen). */
    private fun show(ctx: Context, id: String) {
        try { ctx.startActivity(screenIntent(ctx, id)) } catch (_: Exception) {}
    }
    fun screenIntent(ctx: Context, id: String): Intent =
        Intent(ctx, AlarmActivity::class.java).putExtra("id", id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    fun screenPending(ctx: Context, id: String): PendingIntent =
        PendingIntent.getActivity(ctx, ("screen:" + id).hashCode(), screenIntent(ctx, id), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** Starts the songs, once per ring: from fire(), or from the alarm screen when the player could not be started from the background. */
    fun startMusic(ctx: Context) {
        val it = item ?: return
        if (musicStarted) return
        musicStarted = true
        val id = ringId
        val wake = it.optString("wake", "sound")
        val q = arr(it, "q"); val tq = arr(it, "tq")
        val fadeMin = it.optDouble("fade", 0.0)
        when {
            wake == "music" && q != null -> play(ctx, q, it.optBoolean("qLoop"), fadeMin)
            wake != "music" && tq != null -> {
                play(ctx, tq, it.optBoolean("tqLoop"), if (it.optBoolean("louder", true)) 0.5 else 0.0)
                if (wake == "both" && q != null) later(ctx, id, q, it)
            }
            wake == "both" && q != null -> later(ctx, id, q, it)      // the alarm sound (the notification) first
            else -> musicStarted = false
        }
    }
    // "Sound, then music": after half a minute the alarm sound stops and the music starts
    private fun later(ctx: Context, id: String, q: JSONArray, it: JSONObject) {
        toMusicR = Runnable {
            if (ringId != id) return@Runnable
            quietTone(ctx, id)
            play(ctx, q, it.optBoolean("qLoop"), it.optDouble("fade", 0.0))
        }.also { r -> main.postDelayed(r, 30000L) }
    }
    /** The ringing notification goes quiet (it stays up, so the alarm screen can be opened from it). */
    private fun quietTone(ctx: Context, id: String) {
        if (toneQuiet) return
        toneQuiet = true
        AlarmSound.stopFor(id)
        val it = item ?: return
        NotificationManagerCompat.from(ctx).cancel(NotifyReceiver.notifId(id))   // an insistent sound only stops with the notification
        NotifyReceiver.postAlarm(ctx, id, it, quiet = true)
    }

    private fun play(ctx: Context, list: JSONArray, loop: Boolean, fadeMin: Double) {
        val id = ringId
        if (!PlaybackService.tryStart(ctx)) { musicStarted = false; return }   // the alarm screen tries again once it is up
        PlaybackService.whenReady(ctx) { s ->
            if (ringId != id || item == null) return@whenReady
            val items = ArrayList<MediaItem>()
            for (k in 0 until list.length()) {
                val o = list.optJSONObject(k) ?: continue
                val u = o.optString("u"); if (u.isEmpty()) continue
                val md = MediaMetadata.Builder().setTitle(o.optString("t")).setArtist(o.optString("a")).setAlbumTitle(o.optString("al"))
                val art = o.optString("art"); if (art.isNotEmpty()) md.setArtworkUri(Uri.parse(if (art.startsWith("/")) "file://$art" else art))
                md.setExtras(Bundle().apply { putString("orig", u); putString("kind", "audio") })
                val b = MediaItem.Builder().setMediaId(o.optString("id").ifEmpty { u }).setUri(Uri.parse(u)).setMediaMetadata(md.build())
                val cs = o.optLong("cs", -1L); val ce = o.optLong("ce", -1L)
                if (cs > 0 || ce > 0) {
                    val clip = MediaItem.ClippingConfiguration.Builder().setStartPositionMs(maxOf(0L, cs))
                    if (ce > cs) clip.setEndPositionMs(ce)
                    b.setClippingConfiguration(clip.build())
                }
                items.add(b.build())
            }
            if (items.isEmpty()) return@whenReady
            try {
                s.clearMirror(); s.cancelCrossfade()
                if (volBefore < 0f) volBefore = s.currentUserVolume
                // on the alarm stream: the phone's alarm volume, and it is heard even when media is turned down
                s.setMediaAudio(AudioAttributes.Builder().setUsage(C.USAGE_ALARM).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
                val p = s.player
                if (before == null) before = Before((0 until p.mediaItemCount).map { k -> p.getMediaItemAt(k) },
                    maxOf(0, p.currentMediaItemIndex), maxOf(0L, p.currentPosition), p.repeatMode, p.shuffleModeEnabled)
                p.setMediaItems(items, 0, 0L)
                p.shuffleModeEnabled = false
                p.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL
                p.prepare()
                fadeIn(s, fadeMin)
                p.play()
                quietTone(ctx, id)      // the songs are playing: the phone's alarm sound (if it rang) stops
            } catch (_: Exception) {}
        }
    }
    private fun fadeIn(s: PlaybackService, minutes: Double) {
        fadeR?.let { main.removeCallbacks(it) }; fadeR = null
        if (minutes <= 0.0) { fade = 1f; s.setUserVolume(vol * fade); return }
        val ms = minutes * 60000.0; val t0 = System.currentTimeMillis()
        fade = 0.04f; s.setUserVolume(vol * fade)
        fadeR = object : Runnable { override fun run() {
            val f = ((System.currentTimeMillis() - t0) / ms).coerceIn(0.0, 1.0)
            fade = (0.04 + 0.96 * f).toFloat(); s.setUserVolume(vol * fade)
            if (f < 1.0 && item != null) main.postDelayed(this, 500) else fadeR = null
        } }.also { main.postDelayed(it, 500) }
    }

    private fun snapState() {
        val s = PlaybackService.instance
        val o = JSONObject()
        if (s != null && musicStarted) try {
            val p = s.player
            val dur = p.duration
            o.put("i", if (p.mediaItemCount > 0) p.currentMediaItemIndex else -1)
            o.put("playing", p.playWhenReady)
            o.put("pos", p.currentPosition / 1000.0)
            o.put("dur", if (dur == C.TIME_UNSET || dur < 0) 0.0 else dur / 1000.0)
        } catch (_: Exception) {} else { o.put("i", -1); o.put("playing", false); o.put("pos", 0); o.put("dur", 0) }
        o.put("vol", Math.round(vol * 100))
        stateJson = o.toString()
    }

    /** The page's controls (from the page's thread). */
    fun cmd(c: String, v: String) = main.post {
        if (item == null) return@post
        val s = PlaybackService.instance ?: return@post
        val p = s.player
        try {
            when (c) {
                "play" -> { if (!musicStarted) { val ctx = screen?.get(); if (ctx != null) startMusic(ctx) } else p.play() }
                "pause" -> p.pause()
                "next" -> if (p.hasNextMediaItem()) p.seekToNextMediaItem() else p.seekTo(0, 0L)
                "prev" -> if (p.currentPosition > 3000 || !p.hasPreviousMediaItem()) p.seekTo(0L) else p.seekToPreviousMediaItem()
                "seek" -> p.seekTo(((v.toDoubleOrNull() ?: 0.0) * 1000).toLong().coerceAtLeast(0L))
                "playAt" -> { val i = v.toIntOrNull() ?: 0; if (i in 0 until p.mediaItemCount) { p.seekTo(i, 0L); p.play() } }
                "vol" -> { vol = ((v.toFloatOrNull() ?: 100f) / 100f).coerceIn(0f, 1f); s.setUserVolume(vol * fade) }
            }
        } catch (_: Exception) {}
        snapState()
    }

    /** Snooze: rings again at [at] (the page worked it out from the alarm's snooze length). */
    fun snooze(ctx: Context, at: Long) = main.post {
        val it = item ?: return@post
        val alarm = it.optString("alarm")
        finishRing(ctx, false)
        if (at > System.currentTimeMillis() && alarm.isNotEmpty()) {
            val o = JSONObject(it.toString()).put("id", alarm + "_" + at).put("at", at)
            AlarmSched.addOne(ctx, o)
        }
        closeScreen()
    }
    /** Stop. [focus]: "Stop and focus": the app opens and starts a focus session (it reads the note the page left). */
    fun stop(ctx: Context, focus: Boolean) = main.post {
        finishRing(ctx, false)
        if (focus) {
            val a = screen?.get()
            val open = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            if (a != null && Build.VERSION.SDK_INT >= 26) {
                val km = a.getSystemService(KeyguardManager::class.java)
                if (km != null && km.isKeyguardLocked) {
                    km.requestDismissKeyguard(a, object : KeyguardManager.KeyguardDismissCallback() {
                        override fun onDismissSucceeded() { try { a.startActivity(open) } catch (_: Exception) {}; a.finish() }
                        override fun onDismissCancelled() { a.finish() }
                        override fun onDismissError() { a.finish() }
                    })
                    return@post
                }
            }
            try { ctx.startActivity(open) } catch (_: Exception) {}
        }
        closeScreen()
    }

    /** Everything about this ring stops: the sound, the music, the notification, the timers. The player goes back to normal. */
    fun finishRing(ctx: Context, @Suppress("UNUSED_PARAMETER") quietOnly: Boolean) {
        val id = ringId
        listOf(fadeR, toMusicR, endR).forEach { r -> r?.let { main.removeCallbacks(it) } }
        fadeR = null; toMusicR = null; endR = null
        main.removeCallbacks(tickR)
        if (id.isNotEmpty()) {
            NotificationManagerCompat.from(ctx).cancel(NotifyReceiver.notifId(id))
            AlarmSound.stopFor(id)
        }
        val s = PlaybackService.instance
        val b = before
        if (s != null && b != null) try {
            val p = s.player
            p.pause()
            s.setUserVolume(if (volBefore >= 0f) volBefore else 1f)
            s.setMediaAudio(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            // back to what the app had loaded, paused where it was
            if (b.items.isNotEmpty()) { p.setMediaItems(b.items, minOf(b.index, b.items.size - 1), b.pos); p.prepare() } else p.clearMediaItems()
            p.repeatMode = b.repeat; p.shuffleModeEnabled = b.shuffle
        } catch (_: Exception) {}
        before = null; volBefore = -1f; musicStarted = false; toneQuiet = false
        item = null; ringId = ""; snapState()
    }
    private fun closeScreen() { screen?.get()?.let { if (!it.isFinishing) it.finish() } }
}

/** The alarm screen: www/alarm.html in a WebView of its own, over the lock screen. */
class AlarmActivity : Activity() {
    private var web: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (AlarmRing.item == null) { finish(); return }        // it already stopped (opened from an old notification)
        AlarmRing.screen = WeakReference(this)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.setBackgroundColor(0xFF0C0D10.toInt())
        if (Build.VERSION.SDK_INT >= 28) window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        window.statusBarColor = Color.TRANSPARENT; window.navigationBarColor = Color.TRANSPARENT
        // the songs, if the player could not be started from the background when it went off
        AlarmRing.startMusic(applicationContext)

        val w = WebView(this)
        w.setBackgroundColor(0xFF0C0D10.toInt())
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true            // the app's own localStorage (same address as the app: https://localhost)
        w.settings.mediaPlaybackRequiresUserGesture = false
        w.settings.allowFileAccess = false
        w.addJavascriptInterface(Bridge(), "PPAlarm")
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = serve(req.url)
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean = req.url.host != "localhost"
        }
        setContentView(w)
        web = w
        w.loadUrl("https://localhost/alarm.html")
    }

    /** The page and its fonts from the app's own files (the same ones the app uses), song covers from the phone's storage. */
    private fun serve(u: Uri): WebResourceResponse? {
        if (u.host != "localhost") return null
        val path = u.path ?: return null
        return try {
            if (path.startsWith("/_capacitor_file_/")) {
                val f = java.io.File(path.removePrefix("/_capacitor_file_"))
                if (!f.isFile) return WebResourceResponse("text/plain", "utf-8", 404, "Not found", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
                WebResourceResponse(mime(f.name), null, java.io.FileInputStream(f))
            } else {
                val rel = "public" + (if (path == "/") "/alarm.html" else path)
                WebResourceResponse(mime(rel), if (mime(rel).startsWith("text/") || rel.endsWith(".js")) "utf-8" else null, assets.open(rel))
            }
        } catch (_: Exception) {
            WebResourceResponse("text/plain", "utf-8", 404, "Not found", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
        }
    }
    private fun mime(n: String): String = when (n.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"; "js" -> "application/javascript"; "css" -> "text/css"; "json" -> "application/json"
        "woff2" -> "font/woff2"; "woff" -> "font/woff"; "ttf" -> "font/ttf"; "otf" -> "font/otf"
        "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"; "webp" -> "image/webp"; "gif" -> "image/gif"; "svg" -> "image/svg+xml"
        else -> "application/octet-stream"
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (AlarmRing.item == null) { finish(); return }
        web?.evaluateJavascript("window.__ppAlarmPage && window.__ppAlarmPage.again && window.__ppAlarmPage.again()", null)   // a snooze rang again
    }

    @Deprecated("Back does nothing: Snooze or Stop")
    override fun onBackPressed() {}

    override fun onDestroy() {
        if (AlarmRing.screen?.get() === this) AlarmRing.screen = null
        web?.let { it.stopLoading(); it.removeJavascriptInterface("PPAlarm"); it.destroy() }
        web = null
        super.onDestroy()
    }

    /** window.PPAlarm, for the page. Called on the page's own thread. */
    inner class Bridge {
        @JavascriptInterface fun info(): String = AlarmRing.item?.toString() ?: "{}"
        @JavascriptInterface fun state(): String = AlarmRing.stateJson
        @JavascriptInterface fun cmd(c: String, v: String) { AlarmRing.cmd(c, v) }
        @JavascriptInterface fun snooze(at: String) { AlarmRing.snooze(applicationContext, at.toLongOrNull() ?: 0L) }
        @JavascriptInterface fun stop(focus: Boolean) { AlarmRing.stop(applicationContext, focus) }
    }
}

/** Whether the alarm screen can open by itself: over the lock screen (full-screen notifications) and while the phone is in use (over other apps). */
object AlarmScreenAccess {
    fun overlay(ctx: Context): Boolean = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)
    fun fullScreen(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < 34) return true
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return true
        return nm.canUseFullScreenIntent()
    }
    /** Opens the phone's settings page for one of them ("overlay" or "fullscreen"). */
    fun ask(a: Activity, what: String) {
        val pkg = Uri.parse("package:" + a.packageName)
        val i = when {
            what == "fullscreen" && Build.VERSION.SDK_INT >= 34 -> Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg)
            Build.VERSION.SDK_INT >= 23 -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg)
            else -> null
        } ?: return
        try { a.startActivity(i) } catch (_: Exception) {
            try { a.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)) } catch (_: Exception) {}
        }
    }
}
