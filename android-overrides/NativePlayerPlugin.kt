package com.pressplay.media

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.view.PixelCopy
import android.view.SurfaceView
import java.io.ByteArrayOutputStream
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * JS <-> ExoPlayer bridge. The web app keeps the playlist and all UI; this plugin only
 * plays the item it is handed, plus (optionally) one "next" item for gapless / background advance.
 */
@UnstableApi
@CapacitorPlugin(name = "PPPlayer")
class NativePlayerPlugin : Plugin() {

    companion object {
        @Volatile var instance: NativePlayerPlugin? = null
        @Volatile var videoPlaying = false
        @Volatile var videoAspect = 16f / 9f
    }

    private val main = Handler(Looper.getMainLooper())
    private var svc: PlaybackService? = null
    private var kind = "audio"
    private var currentItem: MediaItem? = null
    private var nextUri: String? = null
    private var ticking = false
    private var vizTicking = false
    private var viz = false
    private val freq = ByteArray(512)
    private val wave = ByteArray(512)

    override fun load() { instance = this }
    fun emitPip(on: Boolean) { notifyListeners("pip", JSObject().put("on", on)) }
    override fun handleOnDestroy() { main.removeCallbacksAndMessages(null); instance = null }

    // ---------- plumbing ----------
    private fun withSvc(call: PluginCall?, block: (PlaybackService) -> Unit) {
        PlaybackService.whenReady(context) { s ->
            attach(s)
            try { block(s) } catch (e: Exception) { call?.reject(e.message ?: "native player error") }
        }
    }

    private fun attach(s: PlaybackService) {
        if (svc === s) return
        svc = s
        s.player.addListener(listener)
        s.onCommand = { c -> notifyListeners("cmd", JSObject().put("name", c)) }
        MainActivity.playerView?.player = s.player
    }

    private fun snapshot(why: String): JSObject {
        val p = svc?.player
        val o = JSObject()
        o.put("why", why)
        if (p == null) return o
        o.put("playing", p.isPlaying)
        o.put("playWhenReady", p.playWhenReady)
        o.put("state", when (p.playbackState) {
            Player.STATE_IDLE -> "idle"; Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> "ready"; else -> "ended"
        })
        o.put("posMs", p.currentPosition)
        o.put("durMs", if (p.duration == C.TIME_UNSET) -1L else p.duration)
        o.put("rate", p.playbackParameters.speed.toDouble())
        o.put("uri", p.currentMediaItem?.localConfiguration?.uri?.toString())
        val vs = p.videoSize
        o.put("vw", vs.width); o.put("vh", vs.height)
        return o
    }

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) { notifyListeners("state", snapshot("state")); updateTicker() }
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            videoPlaying = isPlaying && kind == "video"
            MainActivity.instance?.keepScreenOn(videoPlaying)
            notifyListeners("state", snapshot("playing")); updateTicker()
        }
        override fun onPositionDiscontinuity(o: Player.PositionInfo, n: Player.PositionInfo, reason: Int) {
            if (reason == Player.DISCONTINUITY_REASON_SEEK || reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT)
                notifyListeners("state", snapshot("seeked"))
        }
        override fun onMediaItemTransition(item: MediaItem?, reason: Int) {
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED && item != null) {
                // Something outside the web UI (Android Auto, Assistant, a car kit, resume-on-button) started an item.
                val u = item.localConfiguration?.uri?.toString()
                if (u != null && u != currentItem?.localConfiguration?.uri?.toString()) {
                    currentItem = item; nextUri = null
                    kind = if (item.mediaMetadata.mediaType == MediaMetadata.MEDIA_TYPE_VIDEO) "video" else "audio"
                    main.post { MainActivity.instance?.showVideoLayer(kind == "video") }
                    notifyListeners("external", snapshot("external"))
                }
            }
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                val p = svc?.player ?: return
                // Drop the finished item so the queue is just [current]; JS will queue the next one.
                if (p.currentMediaItemIndex > 0) p.removeMediaItems(0, p.currentMediaItemIndex)
                currentItem = p.currentMediaItem
                nextUri = null
                notifyListeners("advanced", snapshot("advanced"))
            }
        }
        override fun onPlaybackParametersChanged(pp: PlaybackParameters) { notifyListeners("state", snapshot("rate")) }
        override fun onVideoSizeChanged(v: VideoSize) {
            if (v.width > 0 && v.height > 0) videoAspect = v.width * v.pixelWidthHeightRatio / v.height
            notifyListeners("state", snapshot("size"))
        }
        override fun onTracksChanged(tracks: Tracks) { notifyListeners("tracks", JSObject()) }
        override fun onPlayerError(e: PlaybackException) {
            notifyListeners("error", JSObject().put("code", e.errorCodeName).put("message", e.message ?: "playback error"))
        }
    }

    private val ticker = object : Runnable {
        override fun run() {
            val p = svc?.player
            if (p != null && p.isPlaying) {
                notifyListeners("time", JSObject().put("posMs", p.currentPosition)
                    .put("durMs", if (p.duration == C.TIME_UNSET) -1L else p.duration))
                main.postDelayed(this, 250)
            } else ticking = false
        }
    }
    private fun updateTicker() {
        if (!ticking && svc?.player?.isPlaying == true) { ticking = true; main.post(ticker) }
        if (viz && !vizTicking && svc?.player?.isPlaying == true) { vizTicking = true; main.post(vizTick) }
    }

    private val vizTick = object : Runnable {
        override fun run() {
            val s = svc
            if (!viz || s == null || !s.player.isPlaying) { vizTicking = false; return }
            s.fx.spectrum(freq); s.fx.waveform(wave)
            notifyListeners("fft", JSObject()
                .put("f", Base64.encodeToString(freq, Base64.NO_WRAP))
                .put("t", Base64.encodeToString(wave, Base64.NO_WRAP)))
            main.postDelayed(this, 33)
        }
    }

    // ---------- transport ----------
    @PluginMethod
    fun loadMedia(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("uri required")
        kind = call.getString("kind") ?: "audio"
        val startMs = call.getLong("startMs") ?: 0L
        val autoplay = call.getBoolean("autoplay", false) ?: false
        withSvc(call) { s ->
            val item = buildItem(uri, call.data)
            currentItem = item; nextUri = null
            s.player.setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
                    .setContentType(if (kind == "video") C.AUDIO_CONTENT_TYPE_MOVIE else C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            s.player.setMediaItem(item, startMs)
            s.player.prepare()
            s.player.playWhenReady = autoplay
            main.post { MainActivity.instance?.showVideoLayer(kind == "video") }
            call.resolve()
        }
    }

    private fun buildItem(uri: String, d: JSObject): MediaItem {
        val md = MediaMetadata.Builder()
            .setTitle(d.optString("title", "")).setArtist(d.optString("artist", ""))
            .setAlbumTitle(d.optString("album", ""))
        val art = d.optString("artUri", "")
        if (art.isNotEmpty()) md.setArtworkUri(Uri.parse(art))
        val b64 = d.optString("artBase64", "")
        if (b64.isNotEmpty()) md.setArtworkData(Base64.decode(b64, Base64.DEFAULT), MediaMetadata.PICTURE_TYPE_FRONT_COVER)
        val id = d.optString("id", "")
        return MediaItem.Builder().setMediaId(if (id.isNotEmpty()) id else uri).setUri(Uri.parse(uri)).setMediaMetadata(md.build()).build()
    }

    @PluginMethod fun play(call: PluginCall) = withSvc(call) { it.player.play(); call.resolve() }
    @PluginMethod fun pause(call: PluginCall) = withSvc(call) { it.player.pause(); call.resolve() }
    @PluginMethod fun seek(call: PluginCall) {
        val ms = call.getLong("ms") ?: 0L
        withSvc(call) { it.player.seekTo(ms.coerceAtLeast(0)); call.resolve() }
    }
    @PluginMethod fun stop(call: PluginCall) = withSvc(call) {
        it.player.stop(); it.player.clearMediaItems(); videoPlaying = false
        MainActivity.instance?.keepScreenOn(false); call.resolve()
    }
    @PluginMethod fun setRate(call: PluginCall) {
        val rate = (call.getFloat("rate") ?: 1f).coerceIn(0.25f, 4f)
        val keepPitch = call.getBoolean("preservePitch", true) ?: true
        withSvc(call) { it.player.playbackParameters = PlaybackParameters(rate, if (keepPitch) 1f else rate); call.resolve() }
    }
    @PluginMethod fun setVolume(call: PluginCall) {
        val v = (call.getFloat("volume") ?: 1f).coerceIn(0f, 1f)
        withSvc(call) { it.player.volume = v; call.resolve() }
    }
    @PluginMethod fun setLoop(call: PluginCall) {
        val on = call.getBoolean("loop", false) ?: false
        withSvc(call) { it.player.repeatMode = if (on) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF; call.resolve() }
    }
    @PluginMethod fun getState(call: PluginCall) = withSvc(call) { call.resolve(snapshot("get")) }

    /** Queue the item JS will play next so ExoPlayer advances by itself (gapless, works with the screen off). */
    @PluginMethod
    fun setNext(call: PluginCall) {
        val uri = call.getString("uri")
        withSvc(call) { s ->
            val p = s.player
            if (p.mediaItemCount > 1) p.removeMediaItems(1, p.mediaItemCount)
            nextUri = null
            if (!uri.isNullOrEmpty()) { p.addMediaItem(buildItem(uri, call.data)); nextUri = uri }
            call.resolve()
        }
    }

    /** Refresh title/artist/art on the live notification without restarting playback. */
    @PluginMethod
    fun updateMeta(call: PluginCall) {
        withSvc(call) { s ->
            val cur = currentItem
            val uri = cur?.localConfiguration?.uri?.toString()
            if (uri != null && s.player.mediaItemCount > 0) s.player.replaceMediaItem(0, buildItem(uri, call.data))
            call.resolve()
        }
    }

    // ---------- effects ----------
    @PluginMethod
    fun setFx(call: PluginCall) {
        val d = call.data
        val arr = d.optJSONArray("eq")
        val eq = FloatArray(10) { i -> arr?.optDouble(i, 0.0)?.toFloat() ?: 0f }
        val params = FxParams(
            eqOn = d.optBoolean("eqOn", false), eq = eq,
            gain = d.optDouble("gain", 1.0).toFloat(), bass = d.optDouble("bass", 0.0).toFloat(),
            reverb = d.optDouble("reverb", 0.0).toFloat(), filter = d.optDouble("filter", 0.0).toFloat(),
            distortion = d.optDouble("distortion", 0.0).toFloat(), bitcrush = d.optDouble("bitcrush", 0.0).toFloat(),
            echo = d.optDouble("echo", 0.0).toFloat(), tremolo = d.optDouble("tremolo", 0.0).toFloat()
        )
        withSvc(call) { it.fx.params = params; call.resolve() }
    }

    /** The web app's library, mirrored for Android Auto / Assistant / car kits (see Catalog). */
    @PluginMethod
    fun setCatalog(call: PluginCall) {
        val items = call.data.optJSONArray("items"); val pls = call.data.optJSONArray("playlists")
        Thread { Catalog.set(context, items, pls); call.resolve() }.start()
    }

    @PluginMethod
    fun setViz(call: PluginCall) {
        viz = call.getBoolean("on", false) ?: false
        withSvc(call) { it.fx.vizOn = viz; updateTicker(); call.resolve() }
    }

    // ---------- video ----------
    @PluginMethod
    fun setVideoRect(call: PluginCall) {
        val x = call.getInt("x") ?: 0; val y = call.getInt("y") ?: 0
        val w = call.getInt("w") ?: 0; val h = call.getInt("h") ?: 0
        val vis = call.getBoolean("visible", true) ?: true
        main.post { MainActivity.instance?.placeVideo(x, y, w, h, vis) }
        call.resolve()
    }

    private val filterParams = FilterParams()
    private val filterEffect = FilterEffect(filterParams)
    private var filterOn = false

    /**
     * The page's whole filter chain (presets, auto-levels, posterize, duotone, sharpen, clarity, adjust
     * sliders) as an ordered list of 8-float ops; see [FilterParams]. Runs on the GPU in one pass.
     */
    @PluginMethod
    fun setVideoFilter(call: PluginCall) {
        val arr = call.data.optJSONArray("ops")
        val n = (arr?.length() ?: 0) / 8
        val flat = FloatArray(n * 8) { k -> arr!!.optDouble(k, 0.0).toFloat() }
        filterParams.set(flat, n)
        val want = n > 0
        withSvc(call) { svc ->
            if (want != filterOn) {          // only rebuild the GL pipeline when switching on/off, not per slider tick
                filterOn = want
                svc.player.setVideoEffects(if (want) listOf<Effect>(filterEffect) else emptyList<Effect>())
            }
            call.resolve()
        }
    }

    /** What is on screen right now (filters included), as PNG. The surface can't be read from JS. */
    @PluginMethod
    fun snapshot(call: PluginCall) {
        main.post {
            val sv = MainActivity.playerView?.videoSurfaceView as? SurfaceView
            if (Build.VERSION.SDK_INT < 24 || sv == null || sv.width <= 0 || sv.height <= 0) { call.reject("no video on screen"); return@post }
            val bmp = Bitmap.createBitmap(sv.width, sv.height, Bitmap.Config.ARGB_8888)
            PixelCopy.request(sv, bmp, { result ->
                if (result != PixelCopy.SUCCESS) { call.reject("copy failed ($result)"); return@request }
                Thread {
                    try {
                        val out = ByteArrayOutputStream()
                        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
                        call.resolve(JSObject().put("png", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)).put("w", bmp.width).put("h", bmp.height))
                    } catch (e: Exception) { call.reject(e.message ?: "encode failed") }
                }.start()
            }, main)
        }
    }

    /** Called by MainActivity: no point decoding video while the app is off-screen. */
    fun setBackground(bg: Boolean) {
        val p = svc?.player ?: return
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, bg).build()
    }

    /** Window colour behind the transparent WebView, so the area around the video matches the page. */
    @PluginMethod
    fun setBackdrop(call: PluginCall) {
        val c = call.getString("color")
        if (c != null) try {
            val col = Color.parseColor(c)
            main.post { MainActivity.instance?.window?.setBackgroundDrawable(ColorDrawable(col)) }
        } catch (_: Exception) {}
        call.resolve()
    }

    @PluginMethod
    fun enterPip(call: PluginCall) { main.post { MainActivity.instance?.enterPip() }; call.resolve() }

    // ---------- embedded audio / subtitle tracks (MKV etc.) ----------
    @PluginMethod
    fun getTracks(call: PluginCall) = withSvc(call) { s ->
        val out = JSArray()
        s.player.currentTracks.groups.forEachIndexed { gi, g ->
            val type = when (g.type) { C.TRACK_TYPE_AUDIO -> "audio"; C.TRACK_TYPE_TEXT -> "text"; else -> null }
            if (type != null) for (ti in 0 until g.length) {
                val f = g.getTrackFormat(ti)
                out.put(JSObject().put("group", gi).put("track", ti).put("type", type)
                    .put("lang", f.language).put("label", f.label).put("codec", f.sampleMimeType)
                    .put("channels", f.channelCount).put("selected", g.isTrackSelected(ti)).put("supported", g.isTrackSupported(ti)))
            }
        }
        call.resolve(JSObject().put("tracks", out))
    }

    @PluginMethod
    fun selectTrack(call: PluginCall) {
        val type = call.getString("type") ?: "audio"
        val group = call.getInt("group") ?: -1
        val track = call.getInt("track") ?: 0
        withSvc(call) { s ->
            val ts = s.player.trackSelectionParameters.buildUpon()
            val tt = if (type == "text") C.TRACK_TYPE_TEXT else C.TRACK_TYPE_AUDIO
            if (group < 0) ts.setTrackTypeDisabled(tt, true)
            else {
                val g = s.player.currentTracks.groups.getOrNull(group)
                if (g == null) { call.reject("no such group"); return@withSvc }
                ts.setTrackTypeDisabled(tt, false).setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, track))
            }
            s.player.trackSelectionParameters = ts.build()
            call.resolve()
        }
    }
}
