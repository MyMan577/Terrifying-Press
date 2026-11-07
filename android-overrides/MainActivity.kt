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
        /** The native video picture (our own GL renderer), when the native video setting is on. */
        @Volatile var playerView: NativeVideoView? = null
        /**
         * Native SurfaceView video under the WebView: the "Native video player (beta)" setting (default off).
         * The page asks for it through PPPlayer.setNativeVideo, which also saves it here for the next start.
         */
        @Volatile var nativeVideo = false
        private const val PREFS = "pp_video"
        private const val PAGE_BG = 0xFF0C0D10.toInt()   // until the page reports its own colour
    }
    private var backdrop = PAGE_BG
    private var seeThrough = false

    private var inPip = false
    private var rect = intArrayOf(0, 0, 0, 0)
    private var rectVisible = false

    override fun onCreate(savedInstanceState: Bundle?) {
        // existing vocal-separation plugins (Java)
        registerPlugin(OnnxSeparatorPlugin::class.java)
        registerPlugin(SpleeterSeparatorPlugin::class.java)
        registerPlugin(BackupPlugin::class.java)   // streams big exports (library backup) straight into Download/Press Play
        registerPlugin(EmbedPlugin::class.java)     // native MiniLM sentence embeddings
        registerPlugin(StoragePlugin::class.java)   // real device free/used space for the Storage bar
        registerPlugin(TranslatePlugin::class.java) // on-device lyrics translation (ML Kit)
        // native player layer
        registerPlugin(NativePlayerPlugin::class.java)
        registerPlugin(LibraryPlugin::class.java)
        registerPlugin(JobsPlugin::class.java)
        registerPlugin(GameModePlugin::class.java)   // games page: 120 Hz lock, screen awake, renderer priority
        super.onCreate(savedInstanceState)
        instance = this
        nativeVideo = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("native", false)
        installVideoLayer()
        handleIntent(intent)
        askPermissions()
    }

    private fun installVideoLayer() {
        if (!nativeVideo || playerView != null) return      // off: video plays in the normal web <video>
        val web = bridge.webView
        val parent = web.parent as ViewGroup
        val pv = NativeVideoView(this).apply {
            visibility = View.GONE
            layoutParams = ViewGroup.MarginLayoutParams(0, 0)
        }
        parent.addView(pv, 0)          // index 0 = behind the WebView
        playerView = pv
        PlaybackService.instance?.let { pv.player = it.player }
    }

    /** Switches the native video layer on or off right away and remembers it. Main thread. */
    fun setNativeVideo(on: Boolean) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("native", on).apply()
        nativeVideo = on
        if (on) { installVideoLayer(); return }
        val pv = playerView ?: return
        pv.release()
        (pv.parent as? ViewGroup)?.removeView(pv)
        playerView = null
        setSeeThrough(false)
    }

    /**
     * The WebView is only see-through while a native video is actually on screen. A transparent WebView
     * makes every page frame blend over the window, so keeping it opaque the rest of the time keeps the UI fast.
     */
    private fun setSeeThrough(on: Boolean) {
        if (on == seeThrough) return
        seeThrough = on
        bridge?.webView?.setBackgroundColor(if (on) Color.TRANSPARENT else backdrop)
    }

    fun setBackdropColor(c: Int) {
        backdrop = c
        window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(c))
        if (!seeThrough) bridge?.webView?.setBackgroundColor(c)
    }

    /** Fit mode, zoom, pan and forced ratio, as the page's view menu and gestures set them. */
    fun setVideoView(p: NativeVideoView.ViewParams) { playerView?.setView(p) }

    // ---------- called from NativePlayerPlugin (main thread) ----------
    fun showVideoLayer(show: Boolean) {
        val pv = playerView ?: return
        if (!show) { pv.visibility = View.GONE; setSeeThrough(false); return }
        if (rectVisible || inPip) { pv.visibility = View.VISIBLE; setSeeThrough(true) }
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
        val show = rectVisible && NativePlayerPlugin.instance != null
        pv.visibility = if (show) View.VISIBLE else View.GONE
        setSeeThrough(show)
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

    /**
     * Asks for notifications (Android 13+) and for access to the device's audio and video, in one system prompt.
     * Media access is only asked once so a "Don't allow" is never nagged about; the system picker keeps working either way.
     */
    private fun askPermissions() {
        val need = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS))
            need.add(Manifest.permission.POST_NOTIFICATIONS)

        val prefs = getSharedPreferences("pp_permissions", MODE_PRIVATE)
        if (!prefs.getBoolean("asked_media", false)) {
            val missing = mediaPermissions().filter { !granted(it) }
            if (missing.isNotEmpty()) need.addAll(missing)
            prefs.edit().putBoolean("asked_media", true).apply()
        }

        if (need.isNotEmpty()) ActivityCompat.requestPermissions(this, need.toTypedArray(), 7)
    }

    private fun mediaPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_MEDIA_VIDEO)
        else arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)

    private var mediaDone: (() -> Unit)? = null

    /** Called from LibraryPlugin ("Scan phone"): shows the media prompt if needed, then runs [done] either way. */
    fun requestMediaAccess(done: () -> Unit) {
        val need = mediaPermissions().filter { !granted(it) }
        if (need.isEmpty()) { done(); return }
        mediaDone = done
        ActivityCompat.requestPermissions(this, need.toTypedArray(), 8)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 8) { val cb = mediaDone; mediaDone = null; cb?.invoke() }
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    override fun onDestroy() {
        if (instance === this) { instance = null; playerView?.release(); playerView = null }
        super.onDestroy()
    }
}
