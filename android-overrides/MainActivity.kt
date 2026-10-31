package com.pressplay.media

import android.Manifest
import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.getcapacitor.BridgeActivity

/**
 * Hosts the WebView UI on top of a native video surface. The video is decoded by MediaCodec and
 * drawn by a SurfaceView sitting *under* a transparent WebView, so frames never pass through the
 * page compositor (that path is what dropped frames). HTML controls and subtitles still draw over it.
 */
@UnstableApi
class MainActivity : BridgeActivity() {

    companion object {
        @Volatile var instance: MainActivity? = null
        @Volatile var playerView: PlayerView? = null
        /** Native SurfaceView video under a transparent WebView. Off: it blanked the picture and slowed the UI. */
        const val NATIVE_VIDEO = false
    }

    private var inPip = false
    private var rect = intArrayOf(0, 0, 0, 0)
    private var rectVisible = false

    override fun onCreate(savedInstanceState: Bundle?) {
        // existing vocal-separation plugins (Java)
        registerPlugin(OnnxSeparatorPlugin::class.java)
        registerPlugin(SpleeterSeparatorPlugin::class.java)
        // native player layer
        registerPlugin(NativePlayerPlugin::class.java)
        registerPlugin(LibraryPlugin::class.java)
        registerPlugin(JobsPlugin::class.java)
        super.onCreate(savedInstanceState)
        instance = this
        installVideoLayer()
        handleIntent(intent)
        askNotificationPermission()
    }

    private fun installVideoLayer() {
        if (!NATIVE_VIDEO) return      // video plays in the normal web <video>; keeps the WebView opaque and fast
        val web = bridge.webView
        web.setBackgroundColor(Color.TRANSPARENT)
        val parent = web.parent as ViewGroup
        val pv = PlayerView(this).apply {
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            setShutterBackgroundColor(Color.BLACK)
            setKeepContentOnPlayerReset(true)
            visibility = View.GONE
            layoutParams = ViewGroup.MarginLayoutParams(0, 0)
        }
        parent.addView(pv, 0)          // index 0 = behind the WebView
        playerView = pv
        PlaybackService.instance?.let { pv.player = it.player }
    }

    // ---------- called from NativePlayerPlugin (main thread) ----------
    fun showVideoLayer(show: Boolean) {
        val pv = playerView ?: return
        if (!show) { pv.visibility = View.GONE; return }
        if (rectVisible || inPip) pv.visibility = View.VISIBLE
    }

    /** x/y/w/h are device pixels relative to the WebView's top-left. */
    fun placeVideo(x: Int, y: Int, w: Int, h: Int, visible: Boolean) {
        rect = intArrayOf(x, y, w, h); rectVisible = visible && w > 0 && h > 0
        if (inPip) return
        val pv = playerView ?: return
        val lp = pv.layoutParams
        lp.width = w; lp.height = h
        pv.layoutParams = lp
        pv.translationX = x.toFloat(); pv.translationY = y.toFloat()
        pv.visibility = if (rectVisible && NativePlayerPlugin.instance != null) View.VISIBLE else View.GONE
    }

    fun keepScreenOn(on: Boolean) {
        runOnUiThread {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // ---------- Picture-in-picture ----------
    fun enterPip() {
        if (Build.VERSION.SDK_INT < 26 || !packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return
        val a = NativePlayerPlugin.videoAspect.coerceIn(0.42f, 2.39f)
        val b = PictureInPictureParams.Builder().setAspectRatio(Rational((a * 1000).toInt(), 1000))
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(NativePlayerPlugin.videoPlaying)
        try { enterPictureInPictureMode(b.build()) } catch (_: Exception) {}
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (NativePlayerPlugin.videoPlaying) enterPip()
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        inPip = isInPictureInPictureMode
        val pv = playerView ?: return
        val web = bridge.webView
        if (inPip) {
            web.visibility = View.INVISIBLE
            val lp = pv.layoutParams; lp.width = ViewGroup.LayoutParams.MATCH_PARENT; lp.height = ViewGroup.LayoutParams.MATCH_PARENT
            pv.layoutParams = lp; pv.translationX = 0f; pv.translationY = 0f; pv.visibility = View.VISIBLE
        } else {
            web.visibility = View.VISIBLE
            placeVideo(rect[0], rect[1], rect[2], rect[3], rectVisible)
        }
        NativePlayerPlugin.instance?.emitPip(isInPictureInPictureMode)
    }

    // ---------- lifecycle: don't decode video nobody can see ----------
    override fun onStart() { super.onStart(); NativePlayerPlugin.instance?.setBackground(false) }
    override fun onStop() {
        super.onStop()
        if (!inPip) NativePlayerPlugin.instance?.setBackground(true)
    }

    // ---------- "Open with" / "Share to" ----------
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
        LibraryPlugin.instance?.pushOpen()
    }

    private fun handleIntent(i: Intent?) {
        i ?: return
        val uris = mutableListOf<Uri>()
        when (i.action) {
            "android.media.action.MEDIA_PLAY_FROM_SEARCH" -> LibraryPlugin.queueSearch(i.getStringExtra(android.app.SearchManager.QUERY) ?: "")
            Intent.ACTION_VIEW -> i.data?.let { uris.add(it) }
            Intent.ACTION_SEND -> streamExtra(i)?.let { uris.add(it) }
            Intent.ACTION_SEND_MULTIPLE ->
                if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)?.let { uris.addAll(it) }
                else @Suppress("DEPRECATION") i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
        }
        if (uris.isNotEmpty()) LibraryPlugin.queueOpen(uris)
    }

    private fun streamExtra(i: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else @Suppress("DEPRECATION") i.getParcelableExtra(Intent.EXTRA_STREAM)

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7)
        }
    }

    override fun onDestroy() {
        if (instance === this) { instance = null; playerView = null }
        super.onDestroy()
    }
}
