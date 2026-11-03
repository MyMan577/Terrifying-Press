package com.pressplay.media

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
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
    lateinit var fx: FxAudioProcessor
        private set
    private var session: MediaLibrarySession? = null

    /** Set while the web UI is alive; notification Next/Previous are forwarded to its playlist logic. */
    @Volatile var onCommand: ((String) -> Unit)? = null
    private fun uiAlive() = onCommand != null && NativePlayerPlugin.instance != null

    override fun onCreate() {
        super.onCreate()
        Catalog.ensureLoaded(this)
        fx = FxAudioProcessor()

        val renderers = object : DefaultRenderersFactory(this) {
            override fun buildAudioSink(
                context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean
            ): AudioSink = DefaultAudioSink.Builder(context)
                .setEnableFloatOutput(false) // keep 16-bit so the FX chain stays active
                .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                .setAudioProcessors(arrayOf(fx))
                .build()
        }
        renderers.setEnableDecoderFallback(true)
        renderers.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)

        player = ExoPlayer.Builder(this, renderers)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { if (!isPlaying) saveResume() }
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) { saveResume() }
        })

        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        session = MediaLibrarySession.Builder(this, UiForwardingPlayer(player), LibraryCallback())
            .setSessionActivity(openApp)
            .build()

        instance = this
        val pending: List<(PlaybackService) -> Unit>
        synchronized(waiters) { pending = waiters.toList(); waiters.clear() }
        pending.forEach { it(this) }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        instance = null
        session?.run { player.release(); release() }
        session = null
        super.onDestroy()
    }

    // ---------- resume after a cold start (headset button, car connects) ----------
    private fun prefs() = getSharedPreferences("pp_resume", MODE_PRIVATE)
    private fun saveResume() {
        val it = player.currentMediaItem ?: return
        val uri = it.localConfiguration?.uri?.toString() ?: return
        val md = it.mediaMetadata
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
