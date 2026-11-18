package com.pressplay.media

import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MimeTypes
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.ForwardingAudioSink
import androidx.media3.exoplayer.Renderer
import androidx.media3.decoder.ffmpeg.FfmpegAudioRenderer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * The app's single ExoPlayer (audio + video), exposed as a *media library service*. That is what makes
 * Android treat Press Play as a real media app: the notification and lock-screen card, Bluetooth and
 * headset buttons (including cold-start resume), Android Auto / car kits, Wear, and Google Assistant
 * ("play <song> on Press Play") all talk to this service, with or without the web UI running.
 */
@UnstableApi
class PlaybackService : MediaLibraryService() {

    companion object {
        @Volatile var instance: PlaybackService? = null
        private val waiters = mutableListOf<(PlaybackService) -> Unit>()
        private val main = Handler(Looper.getMainLooper())

        /** Runs [cb] on the main thread once the service exists, starting it if needed. */
        fun whenReady(ctx: Context, cb: (PlaybackService) -> Unit) {
            val i = instance
            if (i != null) { main.post { cb(i) }; return }
            synchronized(waiters) { waiters.add(cb) }
            ctx.applicationContext.startService(Intent(ctx.applicationContext, PlaybackService::class.java))
        }
    }

    lateinit var player: ExoPlayer
        private set
    /** Audio quality and decoding choices this player was built with (Settings; read once, when the service starts). */
    var hiRes = false
        private set
    /** Settings, Audio decoder, as this player was built with it: "auto", "soft" (software only) or "hard" (hardware only). */
    var audioDecoderMode = "auto"
        private set
    /** Name of the audio decoder in use, for the "now playing" readout. */
    @Volatile var audioDecoder: String = ""
        private set
    lateinit var fx: FxAudioProcessor
    /** Knows which part of the audio is audible right now (for the visualizer). Null until the player builds its output. */
    @Volatile var vizClock: VizClockSink? = null
        private set
    private var session: MediaLibrarySession? = null
    private var uiPlayer: Player? = null
    private var mirrorPlayer: WebMirrorPlayer? = null

    /** Main thread. The player the outside world currently sees: ExoPlayer, or the stand-in for a web video. */
    fun sessionPlayer(): Player? = session?.player

    /** Main thread. Swaps the session's player for a stand-in that mirrors what the web engine is playing (a video),
     *  so the notification and its controls exist for it too. [send] carries notification presses back to the page. */
    fun mirror(send: (String, Long) -> Unit): WebMirrorPlayer {
        mirrorPlayer?.let { it.send = send; return it }
        val m = WebMirrorPlayer(Looper.getMainLooper(), send)
        mirrorPlayer = m
        session?.player = m
        m.addListener(object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) { NowPlayingWidget.refresh(this@PlaybackService) }
        })
        NowPlayingWidget.refresh(this)
        return m
    }

    /** Main thread. Gives the session back to ExoPlayer. */
    fun clearMirror() {
        if (mirrorPlayer == null) return
        mirrorPlayer = null
        uiPlayer?.let { session?.player = it }
        NowPlayingWidget.refresh(this)
    }

    /** Set while the web UI is alive; notification Next/Previous are forwarded to its playlist logic. */
    @Volatile var onCommand: ((String) -> Unit)? = null
    private fun uiAlive() = onCommand != null && NativePlayerPlugin.instance != null

    override fun onCreate() {
        super.onCreate()
        Catalog.ensureLoaded(this)
        fx = FxAudioProcessor()

        // Settings > Audio quality and decoding. Applied when the service starts, so a change needs an app restart.
        val opts = getSharedPreferences("pp_audio", MODE_PRIVATE)
        hiRes = opts.getBoolean("hiRes", false)
        val audioDec = opts.getString("adec", "auto") ?: "auto"
        audioDecoderMode = audioDec
        val videoDec = opts.getString("vdec", "auto") ?: "auto"
        val floatOut = hiRes

        val renderers = object : DefaultRenderersFactory(this) {
            override fun buildAudioSink(
                context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean
            ): AudioSink = VizClockSink(HiResFxSink(DefaultAudioSink.Builder(context)
                // Off: everything is played as 16-bit through the FX chain (EQ, effects, boost, visualizer).
                // Hi-res on: 24-bit and 32-bit sources go out as 32-bit float. Media3 skips its processors on that
                // path, so HiResFxSink runs the same FX chain on it itself, in float, and the speed and pitch come
                // from the AudioTrack (Media3's own speed processor only works in 16-bit). Everything works the same
                // either way; Hi-res only keeps the extra depth.
                .setEnableFloatOutput(floatOut)
                .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams || floatOut)
                .setAudioProcessors(arrayOf(fx))
                .build(), fx), fx).also { vizClock = it }

            /**
             * The phone's own audio decoders, then the FFmpeg ones (Media3's FFmpeg extension) for what the phone has
             * no decoder for: DTS, DTS-HD, TrueHD, AC-3 and E-AC-3 soundtracks. They are only tried after the phone's
             * decoders, and they play into the same output (the sink above), so the EQ, effects, visualizer, speed and
             * Bluetooth delay work on these tracks exactly as on any other. With Hi-res on they decode to 32-bit float
             * (TrueHD and DTS-HD Master Audio are 24-bit lossless), which HiResFxSink runs the effects on as well.
             */
            override fun buildAudioRenderers(
                context: Context, extensionRendererMode: Int, mediaCodecSelector: MediaCodecSelector,
                enableDecoderFallback: Boolean, audioSink: AudioSink, eventHandler: Handler,
                eventListener: AudioRendererEventListener, out: ArrayList<Renderer>
            ) {
                // Both renderers share the one output, and each one registers itself as its listener when it is made:
                // on its own the second would take the output's reports (position jumps, errors...) from the first.
                val share = SharedSinkListener(audioSink)
                super.buildAudioRenderers(context, extensionRendererMode, mediaCodecSelector, enableDecoderFallback,
                    ListenerSlot(audioSink, share, 0), eventHandler, eventListener, out)
                if (audioDec == "hard") return          // "Hardware only": the FFmpeg decoders are software
                try {
                    out.add(FfmpegAudioRenderer(eventHandler, eventListener, ListenerSlot(audioSink, share, 1)))
                } catch (t: Throwable) {          // the decoders' native library is missing or would not load
                    android.util.Log.w("PPPlayback", "FFmpeg audio decoders unavailable: $t")
                }
            }
        }
        renderers.setEnableDecoderFallback(true)
        // Settings, Audio / Video decoder. Auto: every decoder, best first, falling back to the next if one fails.
        // Software only / Hardware only: just that kind, like VLC's hardware acceleration setting. Nothing of the other
        // kind is tried, so a file the chosen kind cannot decode does not play (it is not quietly decoded another way).
        if (audioDec != "auto" || videoDec != "auto") {
            renderers.setMediaCodecSelector(MediaCodecSelector { mime, secure, tunneling ->
                val list = MediaCodecSelector.DEFAULT.getDecoderInfos(mime, secure, tunneling)
                val pref = if (MimeTypes.isVideo(mime)) videoDec else if (MimeTypes.isAudio(mime)) audioDec else "auto"
                when (pref) {
                    "soft" -> list.filter { it.softwareOnly }
                    "hard" -> list.filter { it.hardwareAccelerated && !it.softwareOnly }
                    else -> list
                }
            })
        }
        // Extensions stay off here: the one extension the app ships (FFmpeg audio) is added by buildAudioRenderers above.
        renderers.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)

        // MP3/AAC/AMR files without a seek table: fall back to constant-bitrate seeking so they still get
        // a duration and a working seek bar. Do NOT force Mp3Extractor.FLAG_ENABLE_INDEX_SEEKING here:
        // it replaces the Xing/VBRI/CBR seeker for every MP3 with an index that only knows the parts
        // already read, so duration stays unknown (0:00 / 0:00) and seeks fall back to the start.
        val extractors = DefaultExtractorsFactory()
            .setConstantBitrateSeekingEnabled(true)
            .setConstantBitrateSeekingAlwaysEnabled(true)
        player = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this, extractors))
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
        syncFocus()
        if (Build.VERSION.SDK_INT >= 31) {
            val l = AudioManager.OnModeChangedListener { syncFocus() }
            audioManager.addOnModeChangedListener(java.util.concurrent.Executor { main.post(it) }, l)
            modeListener = l
        }
        main.postDelayed(focusTick, 2000)
        player.addAnalyticsListener(object : AnalyticsListener {
            override fun onAudioDecoderInitialized(
                eventTime: AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long
            ) { audioDecoder = decoderName }
        })
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { if (!isPlaying) saveResume() }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) { saveResume() }
            // Keep the home screen widget in step with what is playing.
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) { NowPlayingWidget.refresh(this@PlaybackService); syncFocus() }
            override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) { NowPlayingWidget.refresh(this@PlaybackService) }
            override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) { NowPlayingWidget.refresh(this@PlaybackService) }
        })

        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val ui = UiForwardingPlayer(player)
        uiPlayer = ui
        session = MediaLibrarySession.Builder(this, ui, LibraryCallback())
            .setSessionActivity(openApp)
            .build()
        // Media3 only attaches the notification / foreground-service logic to a session once it is added to the
        // service, which normally happens when a MediaController binds. This app drives the player directly and
        // never binds one, so without this the session stays invisible: no media notification, no Samsung
        // quick-panel card, no lock-screen controls, and no foreground service while backgrounded.
        session?.let { addSession(it) }

        instance = this
        val pending: List<(PlaybackService) -> Unit>
        synchronized(waiters) { pending = waiters.toList(); waiters.clear() }
        pending.forEach { it(this) }
        NowPlayingWidget.refresh(this)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        // "Keep playing after the app is swiped away" off: swiping the app away ends playback too
        if (!opts().getBoolean("survive", true)) { player.stop(); hideMediaNotification(); stopSelf(); return }
        if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    // ---------- your choices (Settings > Leaving the player; NativePlayerPlugin.setPlaybackPrefs) ----------
    // other: when another app plays sound, "pause" (Media3's normal audio focus: it pauses this, this pauses it),
    //        "duck" (this keeps playing, turned down, while the other one plays) or "mix" (no audio focus at all: both play).
    // calls: "keep" playing during a call (as before) or "pause" for it and carry on afterwards.
    // notify: the media controls notification (and lock-screen controls). survive: see onTaskRemoved.
    private fun opts() = getSharedPreferences("pp_playback", MODE_PRIVATE)
    private fun otherMode() = opts().getString("other", "pause") ?: "pause"
    private fun callMode() = opts().getString("calls", "keep") ?: "keep"
    fun notifyOn() = opts().getBoolean("notify", true)
    fun prefsChanged() { focusHandled = null; syncFocus(); refreshNotification() }

    // the app's own volume, and the turning down while another app plays ("duck")
    private var userVolume = 1f
    private var duckMul = 1f
    fun setUserVolume(v: Float) { userVolume = v; applyVolume() }
    /** The player's volume: your volume, turned down while another app talks (duck), and faded in during a crossfade. */
    private fun applyVolume() {
        if (!::player.isInitialized) return
        player.volume = userVolume * duckMul * xfIn
        tail?.volume = userVolume * duckMul * xfOut
    }
    private var duckReq: Any? = null   // an AudioFocusRequest (Android 8+)
    private fun ownDuckFocus(on: Boolean) {
        if (Build.VERSION.SDK_INT < 26) return
        if (on && duckReq == null) {
            val r = android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener({ c ->
                    duckMul = if (c == AudioManager.AUDIOFOCUS_GAIN) 1f else 0.25f
                    applyVolume()
                }, main)
                .build()
            duckReq = r
            try { audioManager.requestAudioFocus(r) } catch (_: Exception) {}
        } else if (!on && duckReq != null) {
            try { audioManager.abandonAudioFocusRequest(duckReq as android.media.AudioFocusRequest) } catch (_: Exception) {}
            duckReq = null; duckMul = 1f; applyVolume()
        }
    }
    private var callWas = false
    private var pausedByCall = false
    // the call state is also checked every couple of seconds: phones before Android 12 have no listener for it
    private val focusTick = object : Runnable { override fun run() { syncFocus(); main.postDelayed(this, 2000) } }

    // the media notification: Media3 shows it through here; with it switched off it is taken away instead
    override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
        if (!notifyOn()) { hideMediaNotification(); return }
        super.onUpdateNotification(session, startInForegroundRequired)
    }
    fun hideMediaNotification() {
        try { androidx.core.app.ServiceCompat.stopForeground(this, androidx.core.app.ServiceCompat.STOP_FOREGROUND_REMOVE) } catch (_: Exception) {}
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).cancel(1001) } catch (_: Exception) {}   // Media3's media notification id
    }
    private fun refreshNotification() {
        val s = session ?: return
        if (notifyOn()) onUpdateNotification(s, player.playWhenReady) else hideMediaNotification()
    }

    // ---------- Audio focus vs. phone calls ----------
    // With Media3's audio-focus handling on, a phone or VoIP call (or the phone ringing) holds the focus, so the player
    // was held paused and Play did nothing until the call ended. While a call is on, the player stops asking for focus
    // and simply plays; when the call ends it goes back to the normal behaviour (other apps pause it, it pauses them).
    private val audioManager by lazy { getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    private var mediaAttrs: AudioAttributes = AudioAttributes.Builder().setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build()
    private var focusHandled: Boolean? = null
    private var modeListener: Any? = null   // an AudioManager.OnModeChangedListener (Android 12+ only)

    private fun inCall(): Boolean = when (audioManager.mode) {
        AudioManager.MODE_IN_CALL, AudioManager.MODE_IN_COMMUNICATION, AudioManager.MODE_RINGTONE -> true
        else -> Build.VERSION.SDK_INT >= 30 && audioManager.mode == AudioManager.MODE_CALL_SCREENING
    }

    /** The audio attributes for what is loaded (music or a movie soundtrack); focus is handled per [syncFocus]. */
    /**
     * [focus] false: the player does not take audio focus. Used for a web video's soundtrack (the page's <video> shows
     * the picture and holds the focus; this player only supplies the sound it cannot decode, and follows it).
     */
    fun setMediaAudio(attrs: AudioAttributes, focus: Boolean = true) { mediaAttrs = attrs; wantFocus = focus; focusHandled = null; syncFocus() }
    private var wantFocus = true

    /** Follows the call state. Also run before Play, for phones older than Android 12 (no mode-change listener). */
    fun syncFocus() {
        if (!::player.isInitialized) return
        val call = try { inCall() } catch (_: Exception) { false }
        if (call != callWas) {                               // a call began or ended
            callWas = call
            if (call && callMode() == "pause" && player.playWhenReady) { pausedByCall = true; player.pause() }
            else if (!call && pausedByCall) { pausedByCall = false; player.play() }
        }
        val other = otherMode()
        val handle = wantFocus && !call && other == "pause"   // Media3 handles the focus only for "pause"
        if (handle != focusHandled) { focusHandled = handle; player.setAudioAttributes(mediaAttrs, handle) }
        ownDuckFocus(wantFocus && !call && other == "duck" && player.playWhenReady)
    }

    // ---------- crossfade (Settings > Transitions) ----------
    // ExoPlayer plays one item at a time, so the end of the old song is played by a second, short-lived player
    // ("tail") while the main player moves on to the queued next item and fades it in. The tail opens the same item
    // a little ahead of the main player, waits, and starts at the exact moment the main player reaches that point,
    // so the two line up. It runs the same effects (EQ, boost...) as the song had, and follows pause and play.
    // Gapless needs none of this: ExoPlayer already goes from one queued item to the next without a gap.
    private var tail: ExoPlayer? = null
    private var xfIn = 1f
    private var xfOut = 0f
    /** Set while the main player is moved on by a crossfade, so the plugin reports it like an automatic advance. */
    @Volatile var xfAdvancing = false
    private var xfStartAt = 0L          // position in the old song where the fade starts
    private var xfLenMs = 0L
    private var xfFading = false
    private var xfElapsed = 0L
    private var xfLast = 0L
    private var xfDeadline = 0L
    private val xfTick = object : Runnable {
        override fun run() {
            val t = tail ?: return
            val p = player
            val now = android.os.SystemClock.elapsedRealtime()
            if (!xfFading) {
                // Waiting for the main player to reach the point where the tail is parked.
                val pos = p.currentPosition
                if (!p.isPlaying) xfDeadline = now + (xfStartAt - pos).coerceAtLeast(0L) + 4000   // paused: keep waiting
                if (p.currentMediaItemIndex != 0 || p.mediaItemCount < 2 || now > xfDeadline || pos > xfStartAt + 250) { cancelCrossfade(); return }
                if (t.playbackState == Player.STATE_READY && pos >= xfStartAt - 15) {
                    t.playWhenReady = p.playWhenReady
                    xfFading = true; xfElapsed = 0L; xfLast = now
                    xfIn = 0f; xfOut = 1f
                    xfAdvancing = true
                    p.seekToNextMediaItem()
                    xfAdvancing = false
                    applyVolume()
                }
                main.postDelayed(this, 8)
                return
            }
            if (p.isPlaying) xfElapsed += now - xfLast
            xfLast = now
            t.playWhenReady = p.playWhenReady
            val f = (xfElapsed.toFloat() / xfLenMs.coerceAtLeast(1L)).coerceIn(0f, 1f)
            // equal-power curves: the overall loudness holds steady through the middle of the fade
            xfIn = kotlin.math.sin(f * Math.PI / 2).toFloat()
            xfOut = kotlin.math.cos(f * Math.PI / 2).toFloat()
            applyVolume()
            if (f >= 1f || t.playbackState == Player.STATE_ENDED) { finishCrossfade(); return }
            main.postDelayed(this, 30)
        }
    }

    /**
     * Fade from the playing item into the queued next one over [ms], starting [ms] before the end of the song.
     * False when there is nothing queued or the song is too short; then the normal (gapless) advance happens.
     */
    fun startCrossfade(ms: Long): Boolean {
        if (!::player.isInitialized) return false
        val p = player
        if (p.mediaItemCount < 2 || p.currentMediaItemIndex != 0 || !p.playWhenReady) return false
        val item = p.currentMediaItem ?: return false
        val dur = p.duration
        if (dur == C.TIME_UNSET || dur <= 0) return false
        cancelCrossfade()
        val pos = p.currentPosition
        // The fade starts [ms] before the end, but never sooner than the tail can be ready (it needs a moment to open).
        val startAt = maxOf(dur - ms, pos + 600)
        val len = dur - startAt
        if (len < 400) return false
        val fx2 = FxAudioProcessor().also { it.params = fx.params }
        val rf = object : DefaultRenderersFactory(this) {
            override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): AudioSink =
                DefaultAudioSink.Builder(context).setAudioProcessors(arrayOf(fx2)).build()
        }
        rf.setEnableDecoderFallback(true)
        val t = try {
            ExoPlayer.Builder(this, rf)
                .setMediaSourceFactory(DefaultMediaSourceFactory(this, DefaultExtractorsFactory()
                    .setConstantBitrateSeekingEnabled(true).setConstantBitrateSeekingAlwaysEnabled(true)))
                .build()
        } catch (e: Exception) { return false }
        // No audio focus of its own: asking for it would pause the main player.
        t.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), false)
        t.trackSelectionParameters = t.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, true).setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
        t.playbackParameters = p.playbackParameters
        t.volume = 0f
        t.setMediaItem(item, startAt)
        t.playWhenReady = false
        t.prepare()
        tail = t
        xfStartAt = startAt; xfLenMs = len; xfFading = false; xfIn = 1f; xfOut = 0f
        xfDeadline = android.os.SystemClock.elapsedRealtime() + (startAt - pos) + 4000
        main.removeCallbacks(xfTick)
        main.post(xfTick)
        return true
    }

    private fun finishCrossfade() {
        main.removeCallbacks(xfTick)
        tail?.let { try { it.release() } catch (_: Exception) {} }
        tail = null; xfFading = false; xfIn = 1f; xfOut = 0f
        applyVolume()
    }

    /** Stop a crossfade at once (a new song was picked, playback stopped...). The main player is left at full volume. */
    fun cancelCrossfade() { if (tail != null || xfIn != 1f) finishCrossfade() }
    fun crossfading() = tail != null

    override fun onDestroy() {
        instance = null
        cancelCrossfade()
        main.removeCallbacks(focusTick)
        ownDuckFocus(false)
        if (Build.VERSION.SDK_INT >= 31) (modeListener as? AudioManager.OnModeChangedListener)?.let { try { audioManager.removeOnModeChangedListener(it) } catch (_: Exception) {} }
        modeListener = null
        clearMirror()   // so the session's player is ExoPlayer again when it is released below
        session?.run { player.release(); release() }
        session = null
        NowPlayingWidget.refresh(this)   // back to "tap to open"
        super.onDestroy()
    }

    // ---------- resume after a cold start (headset button, car connects) ----------
    private fun prefs() = getSharedPreferences("pp_resume", MODE_PRIVATE)
    private fun saveResume() {
        val it = player.currentMediaItem ?: return
        if (it.mediaMetadata.extras?.getBoolean("companion", false) == true) return   // a web video's soundtrack: the page keeps the resume point
        val md = it.mediaMetadata
        val uri = md.extras?.getString("orig") ?: it.localConfiguration?.uri?.toString() ?: return
        prefs().edit().putString("id", it.mediaId).putString("uri", uri)
            .putString("title", md.title?.toString()).putString("artist", md.artist?.toString())
            .putLong("pos", player.currentPosition.coerceAtLeast(0)).apply()
    }
    private fun lastPlayed(): Pair<MediaItem, Long>? {
        val p = prefs(); val uri = p.getString("uri", null) ?: return null
        val id = p.getString("id", null) ?: uri
        val item = Catalog.findByUri(uri) ?: MediaItem.Builder().setMediaId(id).setUri(Uri.parse(uri))
            .setMediaMetadata(MediaMetadata.Builder().setTitle(p.getString("title", null)).setArtist(p.getString("artist", null)).build()).build()
        return Pair(item, p.getLong("pos", 0))
    }

    // ---------- what controllers outside the app (Auto, Assistant, Bluetooth, Wear) can do ----------
    private inner class LibraryCallback : MediaLibrarySession.Callback {

        override fun onGetLibraryRoot(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(Catalog.root(), params))

        override fun onGetItem(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, mediaId: String
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val item = Catalog.find(mediaId)
            return Futures.immediateFuture(
                if (item != null) LibraryResult.ofItem(item, null) else LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE)
            )
        }

        override fun onGetChildren(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, parentId: String,
            page: Int, pageSize: Int, params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val all = Catalog.children(parentId)
            val from = (page.toLong() * pageSize).coerceAtMost(all.size.toLong()).toInt()
            val to = (from + pageSize).coerceAtMost(all.size)
            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(all.subList(from, to)), params))
        }

        override fun onSearch(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, params: LibraryParams?
        ): ListenableFuture<LibraryResult<Void>> {
            session.notifySearchResultChanged(browser, query, Catalog.search(query).size, params)
            return Futures.immediateFuture(LibraryResult.ofVoid())
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String,
            page: Int, pageSize: Int, params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val all = Catalog.search(query)
            val from = (page.toLong() * pageSize).coerceAtMost(all.size.toLong()).toInt()
            val to = (from + pageSize).coerceAtMost(all.size)
            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(all.subList(from, to)), params))
        }

        /** Controllers send bare media ids or a voice query; turn those into playable items. */
        override fun onAddMediaItems(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>
        ): ListenableFuture<MutableList<MediaItem>> {
            val out = mutableListOf<MediaItem>()
            for (m in mediaItems) {
                val q = m.requestMetadata.searchQuery
                when {
                    // "play <query>" from Assistant. A blank query must not become the whole library (that was the random song).
                    !q.isNullOrBlank() -> out.addAll(Catalog.search(q))
                    m.localConfiguration != null -> out.add(m)               // already playable (our own web UI)
                    else -> {
                        val f = Catalog.find(m.mediaId)
                        if (f == null) {
                            // Unknown id: resume what the user last played instead of guessing a different song.
                            lastPlayed()?.let { out.add(it.first) }
                        } else if (f.mediaMetadata.isBrowsable == true) {
                            out.addAll(Catalog.children(f.mediaId).filter { it.mediaMetadata.isPlayable == true })
                        } else out.add(f)
                    }
                }
            }
            return Futures.immediateFuture(out)
        }

        override fun onPlaybackResumption(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val last = lastPlayed() ?: return Futures.immediateFailedFuture(UnsupportedOperationException("nothing to resume"))
            return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(listOf(last.first), 0, last.second))
        }
    }
}

/**
 * Notification / car / Bluetooth "next" and "previous" go to the web playlist when the UI is running
 * (it owns shuffle, repeat and queues); otherwise they fall back to ExoPlayer's own queue.
 */
@UnstableApi
private class UiForwardingPlayer(p: Player) : ForwardingPlayer(p) {
    private val extra = intArrayOf(
        Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM
    )
    private fun ui(): ((String) -> Unit)? = PlaybackService.instance?.let { s -> if (NativePlayerPlugin.instance != null) s.onCommand else null }

    override fun getAvailableCommands(): Player.Commands {
        val b = super.getAvailableCommands().buildUpon()
        if (ui() != null) extra.forEach { b.add(it) }
        return b.build()
    }
    override fun isCommandAvailable(command: Int): Boolean =
        if (ui() != null && extra.contains(command)) true else super.isCommandAvailable(command)
    override fun hasNextMediaItem(): Boolean = ui() != null || super.hasNextMediaItem()
    override fun hasPreviousMediaItem(): Boolean = ui() != null || super.hasPreviousMediaItem()
    override fun seekToNext() { ui()?.invoke("next") ?: super.seekToNext() }
    override fun seekToNextMediaItem() { ui()?.invoke("next") ?: super.seekToNextMediaItem() }
    override fun seekToPrevious() { ui()?.invoke("prev") ?: super.seekToPrevious() }
    override fun seekToPreviousMediaItem() { ui()?.invoke("prev") ?: super.seekToPreviousMediaItem() }
}

/** One output shared by two renderers: its reports go to both (each ignores what is not about it). */
@UnstableApi
private class SharedSinkListener(private val sink: AudioSink) : AudioSink.Listener {
    private val ls = arrayOfNulls<AudioSink.Listener>(2)
    fun set(slot: Int, l: AudioSink.Listener) { ls[slot] = l; sink.setListener(this) }
    private inline fun each(f: (AudioSink.Listener) -> Unit) { for (l in ls) if (l != null) f(l) }
    override fun onPositionDiscontinuity() = each { it.onPositionDiscontinuity() }
    override fun onPositionAdvancing(playoutStartSystemTimeMs: Long) = each { it.onPositionAdvancing(playoutStartSystemTimeMs) }
    override fun onUnderrun(bufferSize: Int, bufferSizeMs: Long, elapsedSinceLastFeedMs: Long) = each { it.onUnderrun(bufferSize, bufferSizeMs, elapsedSinceLastFeedMs) }
    override fun onSkipSilenceEnabledChanged(skipSilenceEnabled: Boolean) = each { it.onSkipSilenceEnabledChanged(skipSilenceEnabled) }
    override fun onOffloadBufferEmptying() = each { it.onOffloadBufferEmptying() }
    override fun onOffloadBufferFull() = each { it.onOffloadBufferFull() }
    override fun onAudioSinkError(audioSinkError: Exception) = each { it.onAudioSinkError(audioSinkError) }
    override fun onAudioCapabilitiesChanged() = each { it.onAudioCapabilitiesChanged() }
    override fun onAudioTrackInitialized(audioTrackConfig: AudioSink.AudioTrackConfig) = each { it.onAudioTrackInitialized(audioTrackConfig) }
    override fun onAudioTrackReleased(audioTrackConfig: AudioSink.AudioTrackConfig) = each { it.onAudioTrackReleased(audioTrackConfig) }
    override fun onSilenceSkipped() = each { it.onSilenceSkipped() }
}

/** The shared output as one renderer sees it: everything passes through, except that its listener joins [share]. */
@UnstableApi
private class ListenerSlot(sink: AudioSink, private val share: SharedSinkListener, private val slot: Int) : ForwardingAudioSink(sink) {
    override fun setListener(listener: AudioSink.Listener) { share.set(slot, listener) }
}
