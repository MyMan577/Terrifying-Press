package com.pressplay.media

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Bundle
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.Executors
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

    // Source handling. The player is only ever handed a source that is verified seekable with a known
    // length (see SourceResolver); the duration is probed independently so the UI never depends on
    // what an extractor happens to report. [loadGen]/[nextGen] discard results of superseded loads.
    private val bg = Executors.newCachedThreadPool()
    private var loadGen = 0
    private var nextGen = 0
    private var srcOrig: String? = null            // the uri the web app asked for (what JS compares against)
    @Volatile private var probedDurMs = -1L

    override fun load() { instance = this }
    fun emitPip(on: Boolean) { notifyListeners("pip", JSObject().put("on", on)) }
    override fun handleOnDestroy() { PlaybackService.instance?.clearMirror(); main.removeCallbacksAndMessages(null); bg.shutdownNow(); instance = null }

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

    /** ExoPlayer's duration, or the independently probed one when the extractor could not tell. */
    private fun durMs(p: Player): Long = if (p.duration != C.TIME_UNSET) p.duration else probedDurMs

    /** The uri the web app knows this item by (the playable uri may be a verified local copy). */
    private fun origOf(item: MediaItem?): String? =
        item?.mediaMetadata?.extras?.getString("orig") ?: item?.localConfiguration?.uri?.toString()

    private fun probeAsync(orig: String?) {
        probedDurMs = -1L
        if (orig == null) return
        bg.execute {
            val d = SourceResolver.probeDurationMs(context, orig)
            if (srcOrig == orig) probedDurMs = d
        }
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
        o.put("durMs", durMs(p))
        o.put("rate", p.playbackParameters.speed.toDouble())
        o.put("uri", origOf(p.currentMediaItem))
        val vs = p.videoSize
        o.put("vw", vs.width); o.put("vh", vs.height)
        val fps = p.videoFormat?.frameRate ?: -1f
        if (fps > 0f) o.put("fps", fps.toDouble())
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
                    srcOrig = origOf(item); probeAsync(srcOrig)
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
                srcOrig = origOf(currentItem); probeAsync(srcOrig)
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
                    .put("durMs", durMs(p)))
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
        val orig = call.getString("uri") ?: return call.reject("uri required")
        kind = call.getString("kind") ?: "audio"
        val startMs = call.data.optLong("startMs", 0L).coerceAtLeast(0)   // PluginCall.getLong ignores JSON ints (returns null), so every value < 2^31 became 0
        val autoplay = call.getBoolean("autoplay", false) ?: false
        main.post { PlaybackService.instance?.clearMirror() }     // ExoPlayer owns the notification again
        val gen = ++loadGen
        nextGen++                                   // any queued "next" belongs to the previous track
        srcOrig = orig; probedDurMs = -1L
        bg.execute {
            // Off the main thread: verify the source can be seeked (copy it locally if it can't) and probe its length.
            val play = try { SourceResolver.playable(context, orig) } catch (e: Exception) { orig }
            val dur = SourceResolver.probeDurationMs(context, play)
            main.post {
                if (gen != loadGen) { call.resolve(); return@post }   // a newer load superseded this one
                withSvc(call) { s ->
                    val item = buildItem(orig, play, call.data)
                    currentItem = item; nextUri = null; probedDurMs = dur
                    s.player.setAudioAttributes(
                        AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
                            .setContentType(if (kind == "video") C.AUDIO_CONTENT_TYPE_MOVIE else C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
                    s.player.setMediaItem(item, startMs)
                    s.player.prepare()
                    s.player.playWhenReady = autoplay
                    MainActivity.instance?.showVideoLayer(kind == "video")
                    call.resolve()
                }
            }
        }
    }

    /** [orig] is what the web app asked for; [play] is what ExoPlayer actually opens (same, or a verified local copy). */
    private fun buildItem(orig: String, play: String, d: JSObject): MediaItem {
        val md = MediaMetadata.Builder()
            .setTitle(d.optString("title", "")).setArtist(d.optString("artist", ""))
            .setAlbumTitle(d.optString("album", ""))
            .setExtras(Bundle().apply { putString("orig", orig) })
        val art = d.optString("artUri", "")
        if (art.isNotEmpty()) md.setArtworkUri(Uri.parse(art))
        val b64 = d.optString("artBase64", "")
        if (b64.isNotEmpty()) md.setArtworkData(Base64.decode(b64, Base64.DEFAULT), MediaMetadata.PICTURE_TYPE_FRONT_COVER)
        val id = d.optString("id", "")
        return MediaItem.Builder().setMediaId(if (id.isNotEmpty()) id else orig).setUri(Uri.parse(play)).setMediaMetadata(md.build()).build()
    }

    @PluginMethod fun play(call: PluginCall) = withSvc(call) { it.player.play(); call.resolve() }
    @PluginMethod fun pause(call: PluginCall) = withSvc(call) { it.player.pause(); call.resolve() }
    @PluginMethod fun seek(call: PluginCall) {
        val ms = call.data.optLong("ms", 0L).coerceAtLeast(0)         // see loadMedia: getLong("ms") was always null here, so every seek went to 0
        withSvc(call) { s ->
            val p = s.player
            if (ms > 1500 && p.playbackState == Player.STATE_READY && !p.isCurrentMediaItemSeekable) recoverSeek(s, ms)
            else p.seekTo(ms)
            call.resolve()
        }
    }

    /**
     * The source turned out not to be seekable (ExoPlayer would silently restart it from 0). Make a local copy,
     * which always is, and continue from the requested position. The queued "next" item is dropped; JS re-queues it.
     */
    private fun recoverSeek(s: PlaybackService, ms: Long) {
        val orig = srcOrig
        val cur = s.player.currentMediaItem
        if (orig == null || cur == null) { s.player.seekTo(ms); return }
        val gen = loadGen
        val resume = s.player.playWhenReady
        bg.execute {
            val play = try { SourceResolver.localCopy(context, orig) } catch (e: Exception) { null }
            main.post {
                val p = svc?.player ?: return@post
                if (gen != loadGen) return@post
                if (play == null) { p.seekTo(ms); return@post }
                val item = cur.buildUpon().setUri(Uri.parse(play)).build()
                currentItem = item; nextUri = null
                p.setMediaItem(item, ms)
                p.prepare()
                p.playWhenReady = resume
            }
        }
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
        val orig = call.getString("uri")
        val gen = ++nextGen
        if (orig.isNullOrEmpty()) { withSvc(call) { s -> clearNext(s); call.resolve() }; return }
        bg.execute {
            val play = try { SourceResolver.playable(context, orig) } catch (e: Exception) { orig }
            main.post {
                if (gen != nextGen) { call.resolve(); return@post }
                withSvc(call) { s ->
                    clearNext(s)
                    s.player.addMediaItem(buildItem(orig, play, call.data)); nextUri = orig
                    call.resolve()
                }
            }
        }
    }

    private fun clearNext(s: PlaybackService) {
        val p = s.player
        if (p.mediaItemCount > 1) p.removeMediaItems(1, p.mediaItemCount)
        nextUri = null
    }

    /** Refresh title/artist/art on the live notification without restarting playback. */
    @PluginMethod
    fun updateMeta(call: PluginCall) {
        withSvc(call) { s ->
            val play = currentItem?.localConfiguration?.uri?.toString()
            if (play != null && s.player.mediaItemCount > 0) s.player.replaceMediaItem(0, buildItem(srcOrig ?: play, play, call.data))
            call.resolve()
        }
    }

    /**
     * The track the UI is on while the web engine (not ExoPlayer) plays it, e.g. a video. Written to the same
     * prefs PlaybackService.lastPlayed() reads, so a headset / notification / car "play" resumes what the person
     * actually sees instead of whatever ExoPlayer last paused on.
     */
    @PluginMethod
    fun setResume(call: PluginCall) {
        val uri = call.getString("uri")
        if (uri.isNullOrEmpty()) { call.resolve(); return }
        context.getSharedPreferences("pp_resume", Context.MODE_PRIVATE).edit()
            .putString("id", call.getString("id") ?: uri)
            .putString("uri", uri)
            .putString("title", call.getString("title"))
            .putString("artist", call.getString("artist"))
            .putLong("pos", call.data.optLong("posMs", 0L).coerceAtLeast(0))
            .apply()
        call.resolve()
    }

    /**
     * A video is playing in the web engine (the WebView's <video>), not in ExoPlayer. Show it in the media
     * notification anyway: the page reports its state here, and notification presses come back as "cmd" events
     * (play / pause / seek / next / prev). on=false hands the session back to ExoPlayer.
     */
    @PluginMethod
    fun mirror(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        if (!on) { main.post { PlaybackService.instance?.clearMirror() }; call.resolve(); return }
        val d = call.data
        val id = d.optString("id", "")
        val uri = d.optString("uri", "").ifEmpty { "pp://web/$id" }
        val item = buildItem(uri, uri, d)
        val pos = d.optLong("posMs", 0L).coerceAtLeast(0)
        val dur = d.optLong("durMs", -1L)
        val playing = d.optBoolean("playing", false)
        val rate = d.optDouble("rate", 1.0).toFloat().coerceIn(0.25f, 4f)
        PlaybackService.whenReady(context) { s ->
            try {
                s.mirror { name, p -> notifyListeners("cmd", JSObject().put("name", name).put("posMs", p)) }
                    .update(item, pos, dur, playing, rate)
                call.resolve()
            } catch (e: Exception) { call.reject(e.message ?: "mirror failed") }
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
        val vp = NativeVideoView.ViewParams(
            fit = call.getString("fit") ?: "contain",
            sx = (call.getDouble("sx") ?: 1.0).toFloat(), sy = (call.getDouble("sy") ?: 1.0).toFloat(),
            tx = (call.getDouble("tx") ?: 0.0).toFloat(), ty = (call.getDouble("ty") ?: 0.0).toFloat())
        main.post { MainActivity.instance?.let { it.setVideoView(vp); it.placeVideo(x, y, w, h, vis) } }
        call.resolve()
    }

    /** 32x18 luma grid of the current native frame, for the page's auto-levels (it can't read native frames). */
    @PluginMethod
    fun sampleLuma(call: PluginCall) {
        main.post {
            val pv = MainActivity.playerView ?: run { call.reject("no native video"); return@post }
            pv.sampleLuma { arr ->
                if (arr == null) { call.reject("no frame yet"); return@sampleLuma }
                val ja = org.json.JSONArray()
                for (v in arr) ja.put(v.toDouble())
                call.resolve(JSObject().put("w", 32).put("h", 18).put("luma", ja))
            }
        }
    }

    /** The "Native video player (beta)" setting: installs or removes the native video layer and remembers it. */
    @PluginMethod
    fun setNativeVideo(call: PluginCall) {
        val on = call.getBoolean("on", false) ?: false
        main.post {
            MainActivity.instance?.setNativeVideo(on)
            MainActivity.playerView?.let { pv -> svc?.let { pv.player = it.player } }
            call.resolve(JSObject().put("on", MainActivity.nativeVideo))
        }
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
        MainActivity.playerView?.let { pv ->
            // Our own renderer draws the filters itself, in the same pass as the picture: keep Media3's pipeline out of it.
            pv.filter = if (want) filterParams else null
            withSvc(call) { svc ->
                if (filterOn) { filterOn = false; svc.player.setVideoEffects(emptyList<Effect>()) }
                call.resolve()
            }
            return
        }
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
            val sv: SurfaceView? = MainActivity.playerView
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
            main.post { MainActivity.instance?.setBackdropColor(col) }
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


/**
 * Makes sure ExoPlayer is only ever given a source it can seek, and finds a track's duration without
 * relying on the extractor. A source that cannot be randomly read (a pipe-backed content:// provider) is
 * copied to the app cache once; local files and normal providers are used as they are.
 */
internal object SourceResolver {
    private fun randomAccess(ctx: Context, u: Uri): Boolean {
        if (u.scheme != "content") return true      // file paths: fine; http(s): the server decides, see recoverSeek
        return try {
            val afd = ctx.contentResolver.openAssetFileDescriptor(u, "r") ?: return false
            afd.use {
                try { Os.lseek(it.fileDescriptor, 0L, OsConstants.SEEK_CUR); true }
                catch (e: ErrnoException) { false }      // ESPIPE: a pipe, cannot seek
            }
        } catch (e: Exception) { true }
    }

    /** [uriStr] itself when it is seekable, otherwise a file:// copy of it. */
    fun playable(ctx: Context, uriStr: String): String =
        if (randomAccess(ctx, Uri.parse(uriStr))) uriStr else localCopy(ctx, uriStr)

    private fun hash(s: String) = MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    fun localCopy(ctx: Context, uriStr: String): String {
        val u = Uri.parse(uriStr)
        val dir = File(ctx.cacheDir, "pp-seekable").apply { mkdirs() }
        val ext = (u.lastPathSegment ?: "").substringAfterLast('.', "").lowercase()
            .takeIf { it.length in 1..5 && it.all { c -> c.isLetterOrDigit() } } ?: "bin"
        val out = File(dir, hash(uriStr) + "." + ext)
        if (out.exists() && out.length() > 0) { out.setLastModified(System.currentTimeMillis()); return Uri.fromFile(out).toString() }
        val tmp = File(dir, out.name + "." + System.nanoTime() + ".part")
        val input = (if (u.scheme == "http" || u.scheme == "https") java.net.URL(uriStr).openStream()
                     else ctx.contentResolver.openInputStream(u)) ?: throw IOException("cannot open $uriStr")
        try {
            input.use { i -> tmp.outputStream().use { o -> i.copyTo(o, 64 * 1024) } }
            if (!tmp.renameTo(out) && !out.exists()) throw IOException("cannot store copy")
        } finally { tmp.delete() }
        // keep the cache small: the newest few copies cover the current and queued tracks
        dir.listFiles()?.filter { !it.name.endsWith(".part") }?.sortedByDescending { it.lastModified() }?.drop(6)?.forEach { it.delete() }
        return Uri.fromFile(out).toString()
    }

    /** Duration from the platform's own parser; -1 when it cannot tell. */
    fun probeDurationMs(ctx: Context, uriStr: String): Long {
        val r = MediaMetadataRetriever()
        return try {
            val u = Uri.parse(uriStr)
            if (u.scheme == "http" || u.scheme == "https") r.setDataSource(uriStr, HashMap<String, String>()) else r.setDataSource(ctx, u)
            r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: -1L
        } catch (e: Exception) { -1L } finally { try { r.release() } catch (e: Exception) {} }
    }
}
