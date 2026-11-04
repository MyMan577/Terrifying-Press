package com.pressplay.media

import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * A stand-in "player" that only mirrors what the web engine is playing (a video in the WebView's <video> /
 * its background <audio>), so the media session can show a real notification with working controls.
 * It decodes nothing. State comes from the page via [update]; play / pause / seek / next / previous pressed in
 * the notification are forwarded back to the page through [send] ("play", "pause", "seek", "next", "prev").
 *
 * The playlist is [previous placeholder, current, next placeholder] so the notification always offers
 * next / previous; pressing them never changes the current item here, the page loads the new track and
 * reports it through [update].
 */
@UnstableApi
class WebMirrorPlayer(looper: Looper, var send: (String, Long) -> Unit) : SimpleBasePlayer(looper) {

    private var item: MediaItem = MediaItem.EMPTY
    private var durMs: Long = C.TIME_UNSET
    private var playing = false
    private var posMs = 0L
    private var baseAt = SystemClock.elapsedRealtime()
    private var rate = 1f

    private val commands: Player.Commands = Player.Commands.Builder().addAll(
        Player.COMMAND_PLAY_PAUSE, Player.COMMAND_PREPARE, Player.COMMAND_STOP,
        Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, Player.COMMAND_SEEK_TO_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        Player.COMMAND_GET_CURRENT_MEDIA_ITEM, Player.COMMAND_GET_METADATA, Player.COMMAND_GET_TIMELINE
    ).build()

    /** Main thread only. */
    fun update(newItem: MediaItem, pos: Long, dur: Long, nowPlaying: Boolean, r: Float) {
        item = newItem
        posMs = pos.coerceAtLeast(0)
        durMs = if (dur > 0) dur else C.TIME_UNSET
        playing = nowPlaying
        rate = r
        baseAt = SystemClock.elapsedRealtime()
        invalidateState()
    }

    private fun nowPos(): Long {
        var p = if (playing) posMs + ((SystemClock.elapsedRealtime() - baseAt) * rate).toLong() else posMs
        if (durMs != C.TIME_UNSET) p = p.coerceAtMost(durMs)
        return p.coerceAtLeast(0)
    }

    override fun getState(): SimpleBasePlayer.State {
        val cur = SimpleBasePlayer.MediaItemData.Builder(if (item.mediaId.isEmpty()) "pp-web-current" else item.mediaId)
            .setMediaItem(item)
            .setMediaMetadata(item.mediaMetadata)
            .setDurationUs(if (durMs != C.TIME_UNSET) durMs * 1000 else C.TIME_UNSET)
            .setIsSeekable(durMs != C.TIME_UNSET)
            .build()
        val prev = SimpleBasePlayer.MediaItemData.Builder("pp-web-prev").build()
        val next = SimpleBasePlayer.MediaItemData.Builder("pp-web-next").build()
        return SimpleBasePlayer.State.Builder()
            .setAvailableCommands(commands)
            .setPlayWhenReady(playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackState(Player.STATE_READY)
            .setPlaylist(listOf(prev, cur, next))
            .setCurrentMediaItemIndex(1)
            .setContentPositionMs(SimpleBasePlayer.PositionSupplier { nowPos() })
            .setPlaybackParameters(PlaybackParameters(rate))
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        // Optimistic, so the notification does not flicker while the page catches up; the page confirms via update().
        posMs = nowPos(); baseAt = SystemClock.elapsedRealtime(); playing = playWhenReady
        send(if (playWhenReady) "play" else "pause", -1L)
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        when {
            seekCommand == Player.COMMAND_SEEK_TO_NEXT || seekCommand == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> send("next", -1L)
            seekCommand == Player.COMMAND_SEEK_TO_PREVIOUS || seekCommand == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> send("prev", -1L)
            mediaItemIndex > 1 -> send("next", -1L)
            mediaItemIndex < 1 -> send("prev", -1L)
            else -> {
                val p = if (positionMs == C.TIME_UNSET) 0L else positionMs.coerceAtLeast(0)
                posMs = p; baseAt = SystemClock.elapsedRealtime()
                send("seek", p)
            }
        }
        return Futures.immediateVoidFuture()
    }

    override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()

    override fun handleStop(): ListenableFuture<*> {
        send("pause", -1L)
        return Futures.immediateVoidFuture()
    }
}
