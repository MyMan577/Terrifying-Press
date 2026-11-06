package com.pressplay.media

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLES30
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sign
import kotlin.math.sqrt

/**
 * The native video picture. ExoPlayer decodes into a SurfaceTexture, and this view draws every frame itself with
 * OpenGL ES 3 on its own thread "pp-video-gl".
 *
 * Two paths:
 *  - Direct (smoothing off, no picture delay): each decoded frame is drawn straight from the decoder's texture with
 *    the page's filter chain, fit mode, zoom, pan and forced ratio, in one pass.
 *  - Engine (motion smoothing on, or a Bluetooth picture delay): a port of the page's WebGL2 MEMC engine
 *    (index.html, "Motion smoothing"). Frames are copied into a ring; Simple cross-fades neighbours, Advanced does
 *    block-matching motion estimation + a motion-compensated warp, Ultra refines to 4px with a two-way field and
 *    occlusion handling; optional bicubic upscaling. The shaders are the page's, unchanged (GLSL ES 3.00).
 *    The result goes through the same filter + view pass to the screen.
 *
 * Timing: the decoder stamps each frame with the system time it is meant to be shown at (releaseOutputBuffer's
 * render time) and usually hands it over a little early. The engine works in that display-time domain, so playback
 * speed needs no special handling and the "lookahead" interpolation needs is mostly free: extra delay is only added
 * when frames arrive later than the gap between them.
 *
 * Threads: [player] and the public setters run on the main thread; all GL on "pp-video-gl".
 */
@UnstableApi
class NativeVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

    /**
     * Where the picture sits in the box. [fit] is the page's object-fit ("contain", "cover", "fill"). [sx]/[sy]
     * and [tx]/[ty] are the page's CSS transform on the video (zoom, forced-ratio scaling and pan), with the
     * translation already in device pixels. Scaling is about the centre of the box, like CSS.
     */
    data class ViewParams(val fit: String = "contain", val sx: Float = 1f, val sy: Float = 1f, val tx: Float = 0f, val ty: Float = 0f)

    /**
     * Motion smoothing settings, as the page's menu sets them. [mode]: "off", "blend" (Simple), "motion" (Advanced),
     * "ultra". [delayMs]: Bluetooth picture delay. [maxIn]: smooth videos up to this many fps. [outFps]: output cap.
     * [strength]: Advanced/Ultra fallback strength 0..1. [quality]: 0 Low .. 3 4K. [upscale]: 0 off, 1 1080p, 2 1440p, 3 4K.
     */
    data class MemcConfig(val mode: String = "off", val delayMs: Float = 0f, val maxIn: Int = 50, val outFps: Int = 120,
                          val strength: Float = 0.5f, val quality: Int = 1, val upscale: Int = 0)

    private val main = Handler(Looper.getMainLooper())
    private val thread = HandlerThread("pp-video-gl").apply { start() }
    private val gl = Handler(thread.looper)

    // ---- GL thread state ----
    private var dpy: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var ectx: EGLContext = EGL14.EGL_NO_CONTEXT
    private var ecfg: EGLConfig? = null
    private var win: EGLSurface = EGL14.EGL_NO_SURFACE
    private var dummy: EGLSurface = EGL14.EGL_NO_SURFACE
    private var outW = 0
    private var outH = 0
    private var oes = 0
    private var st: SurfaceTexture? = null
    private val texM = FloatArray(16)
    private val identity = FloatArray(16).also { android.opengl.Matrix.setIdentityM(it, 0) }
    private var hasFrame = false
    private var glOk = false
    private val pos: FloatBuffer = floatBuf(8)
    private val uv: FloatBuffer = floatBuf(8).apply { put(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 1f, 1f)); position(0) }
    private var lumaFbo = 0; private var lumaTex = 0
    private var progOes: FilterProg? = null      // filters + view, from the decoder's texture
    private var prog2d: FilterProg? = null       // filters + view, from the engine's output texture

    // ---- shared (written on main, read on GL) ----
    @Volatile private var view = ViewParams()
    @Volatile private var aspect = 16f / 9f
    @Volatile private var frameW = 1
    @Volatile private var frameH = 1
    @Volatile private var released = false
    @Volatile private var playing = false
    @Volatile private var cfg = MemcConfig()
    /** The page's filter chain. Null or empty = no filters. */
    @Volatile var filter: FilterParams? = null
        set(v) { field = v; requestRender() }
    /** Engine status for the page's motion smoothing menu (JSON-able map). Called on the main thread. */
    var onStatus: ((Map<String, Any>) -> Unit)? = null

    /** The decoder writes here. Created on the GL thread; handed to the player on main once ready. */
    private var input: Surface? = null

    /** Motion smoothing / picture delay engine. Only touched on the GL thread. */
    private val E = Engine()

    var player: Player? = null
        set(p) {
            if (field === p) return
            field?.let { old -> old.removeListener(playerListener); input?.let { old.clearVideoSurface(it) } }
            field = p
            p?.let { np -> np.addListener(playerListener); input?.let { np.setVideoSurface(it) }; readVideo(np); playing = np.isPlaying }
        }

    private val playerListener = object : Player.Listener {
        override fun onVideoSizeChanged(videoSize: VideoSize) { player?.let { readVideo(it) } }
        override fun onTracksChanged(tracks: Tracks) { player?.let { readVideo(it) } }
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            playing = isPlaying
            gl.post { if (isPlaying) kickLoop() else { E.resetTiming(); present(hold = true) } }
        }
        override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
            gl.post { E.resetStream() }                      // seek: never blend across it
        }
    }

    init {
        holder.setFormat(PixelFormat.RGBA_8888)
        holder.addCallback(this)
        gl.post { setupGl() }
    }

    // ---------------------------------------------------------------- public (main thread)

    fun setView(p: ViewParams) {
        if (p == view) return
        view = p
        requestRender()
    }

    fun setMemc(c: MemcConfig) {
        if (c == cfg) return
        cfg = c
        gl.post { E.configChanged(); kickLoop(); requestRenderGl() }
        applyFrameRate()
    }

    /**
     * A 32x18 grid of the current frame's luma (0..255), for the page's auto-levels. The page can't read native
     * frames, so it asks for this instead. [cb] runs on the main thread; null if there is no frame yet.
     */
    fun sampleLuma(cb: (FloatArray?) -> Unit) {
        gl.post {
            val r = try { readLuma() } catch (e: Throwable) { Log.w(TAG, "luma sample failed", e); null }
            main.post { cb(r) }
        }
    }

    /** Stops drawing, gives the decoder's surface back and frees everything. The view can't be reused. */
    fun release() {
        if (released) return
        released = true
        player = null
        holder.removeCallback(this)
        gl.post {
            try { E.free(); teardownGl() } catch (_: Throwable) {}
            thread.quitSafely()
        }
    }

    // ---------------------------------------------------------------- video properties (main thread)

    private var videoFps = -1f

    private fun readVideo(p: Player) {
        val vs = p.videoSize
        if (vs.width > 0 && vs.height > 0) {
            val rot = vs.unappliedRotationDegrees == 90 || vs.unappliedRotationDegrees == 270
            val w = if (rot) vs.height else vs.width
            val h = if (rot) vs.width else vs.height
            frameW = w; frameH = h
            aspect = w * vs.pixelWidthHeightRatio / h
            NativePlayerPlugin.videoAspect = aspect
            requestRender()
        }
        videoFps = (p as? ExoPlayer)?.videoFormat?.frameRate ?: -1f   // Player has no format; the app's player is an ExoPlayer
        applyFrameRate()
    }

    /**
     * Asks the screen for a refresh rate: the video's own rate when frames are shown as they are (24 fps on a 120 Hz
     * panel = 5 refreshes per frame, no judder), or the smoothing output rate when frames are being interpolated.
     * Android treats this as a hint and never forces a mode.
     */
    private fun applyFrameRate() {
        if (Build.VERSION.SDK_INT < 30) return
        val c = cfg
        val (fps, compat) = if (c.mode != "off") Pair(c.outFps.toFloat(), Surface.FRAME_RATE_COMPATIBILITY_DEFAULT)
                            else Pair(videoFps, Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE)
        if (fps <= 0f) return
        try { holder.surface?.takeIf { it.isValid }?.setFrameRate(fps, compat) } catch (_: Throwable) {}
    }

    private fun requestRender() { if (!released) gl.post { requestRenderGl() } }

    // ---------------------------------------------------------------- SurfaceHolder.Callback (main thread)

    override fun surfaceCreated(h: SurfaceHolder) {
        val s = h.surface
        gl.post { makeWindow(s); requestRenderGl() }
        player?.let { readVideo(it) }
    }

    override fun surfaceChanged(h: SurfaceHolder, format: Int, width: Int, height: Int) {
        gl.post { outW = width; outH = height; E.boxChanged(); requestRenderGl() }
    }

    override fun surfaceDestroyed(h: SurfaceHolder) {
        // The window surface must be gone before this returns, or EGL keeps drawing into a dead surface.
        val done = CountDownLatch(1)
        gl.post { try { dropWindow() } finally { done.countDown() } }
        try { done.await(500, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) {}
    }

    // ---------------------------------------------------------------- GL thread: setup

    private fun setupGl() {
        try {
            dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val ver = IntArray(2)
            if (!EGL14.eglInitialize(dpy, ver, 0, ver, 1)) throw RuntimeException("eglInitialize failed")
            val attrs = intArrayOf(
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_RENDERABLE_TYPE, EGLExt.EGL_OPENGL_ES3_BIT_KHR,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT or EGL14.EGL_PBUFFER_BIT,
                EGL14.EGL_NONE)
            val cfgs = arrayOfNulls<EGLConfig>(1); val n = IntArray(1)
            if (!EGL14.eglChooseConfig(dpy, attrs, 0, cfgs, 0, 1, n, 0) || n[0] < 1) throw RuntimeException("no EGL config")
            ecfg = cfgs[0]
            ectx = EGL14.eglCreateContext(dpy, ecfg, EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0)
            if (ectx == EGL14.EGL_NO_CONTEXT) throw RuntimeException("eglCreateContext failed")
            dummy = EGL14.eglCreatePbufferSurface(dpy, ecfg, intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
            EGL14.eglMakeCurrent(dpy, dummy, dummy, ectx)

            progOes = FilterProg(FRAGMENT_OES, true)
            prog2d = FilterProg(FILTER_FRAGMENT, false)

            val t = IntArray(1)
            GLES20.glGenTextures(1, t, 0); oes = t[0]
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
            val tex = SurfaceTexture(oes)
            tex.setOnFrameAvailableListener({ onFrame() }, gl)
            st = tex
            val s = Surface(tex)
            glOk = true
            main.post {
                if (released) { s.release(); return@post }
                input = s
                player?.setVideoSurface(s)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "video GL setup failed", e)
            glOk = false
        }
    }

    private fun makeWindow(s: Surface) {
        if (!glOk) return
        dropWindow()
        win = EGL14.eglCreateWindowSurface(dpy, ecfg, s, intArrayOf(EGL14.EGL_NONE), 0)
        if (win == EGL14.EGL_NO_SURFACE) Log.e(TAG, "eglCreateWindowSurface failed: " + EGL14.eglGetError())
        main.post { applyFrameRate() }
    }

    private fun dropWindow() {
        if (win != EGL14.EGL_NO_SURFACE) {
            EGL14.eglMakeCurrent(dpy, dummy, dummy, ectx)
            EGL14.eglDestroySurface(dpy, win)
            win = EGL14.EGL_NO_SURFACE
        }
    }

    /** Makes the context current on the window when there is one, else on the 1x1 placeholder. */
    private fun current() {
        val s = if (win != EGL14.EGL_NO_SURFACE) win else dummy
        EGL14.eglMakeCurrent(dpy, s, s, ectx)
    }

    // ---------------------------------------------------------------- GL thread: frames and drawing

    private fun onFrame() {
        if (released || !glOk) return
        val t = st ?: return
        current()
        try { t.updateTexImage(); t.getTransformMatrix(texM); hasFrame = true } catch (e: Throwable) { Log.w(TAG, "updateTexImage", e); return }
        if (E.wanted()) {
            val arrival = System.nanoTime()
            var ts = t.timestamp
            // The decoder's render time, in System.nanoTime. If it looks wrong (some decoders), fall back to "now".
            if (ts <= 0L || abs(ts - arrival) > 2_000_000_000L) ts = arrival
            try { E.capture(ts, arrival) } catch (e: Throwable) { E.fail(e) }
            if (!playing) present(hold = true) else kickLoop()
        } else {
            drawDirect()
        }
    }

    /** Redraw after a view/filter change: re-show what is on screen, with the new view. */
    private fun requestRenderGl() {
        if (E.wanted() && E.ready()) { if (!E.redrawLast()) present(hold = !playing) } else drawDirect()
    }

    private fun beginWindow(): Boolean {
        if (released || !glOk || win == EGL14.EGL_NO_SURFACE || outW <= 0 || outH <= 0) return false
        current()
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        GLES20.glViewport(0, 0, outW, outH)
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        return true
    }

    private fun drawDirect() {
        if (!beginWindow()) return
        if (hasFrame) {
            placeQuad(outW.toFloat(), outH.toFloat(), view)
            progOes?.draw(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes, texM, frameW, frameH, filter)
        }
        EGL14.eglSwapBuffers(dpy, win)
    }

    /** Engine output texture -> screen, with filters and the view. */
    private fun drawEngineOut(tex: Int, w: Int, h: Int) {
        if (!beginWindow()) return
        placeQuad(outW.toFloat(), outH.toFloat(), view)
        prog2d?.draw(GLES20.GL_TEXTURE_2D, tex, identity, w, h, filter)
        EGL14.eglSwapBuffers(dpy, win)
    }

    /** The picture's rectangle in the box, as CSS would lay it out: object-fit, then the transform about the centre. */
    private fun placeQuad(w: Float, h: Float, v: ViewParams) {
        val a = aspect
        var dw: Float; var dh: Float
        when (v.fit) {
            "fill" -> { dw = w; dh = h }
            "cover" -> if (w / h > a) { dw = w; dh = w / a } else { dh = h; dw = h * a }
            else -> if (w / h > a) { dh = h; dw = h * a } else { dw = w; dh = w / a }
        }
        dw *= v.sx; dh *= v.sy
        val cx = w / 2f + v.tx; val cy = h / 2f + v.ty
        val x0 = (cx - dw / 2f) / w * 2f - 1f; val x1 = (cx + dw / 2f) / w * 2f - 1f
        val yT = 1f - (cy - dh / 2f) / h * 2f; val yB = 1f - (cy + dh / 2f) / h * 2f
        pos.position(0); pos.put(floatArrayOf(x0, yB, x1, yB, x0, yT, x1, yT)); pos.position(0)
    }

    // ---- display loop (engine only): one present per screen refresh while playing ----
    private var choreo: Choreographer? = null
    private var looping = false
    private var vsyncNs = 16_666_667L
    private var lastVsync = 0L
    private val frameCb = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            looping = false
            if (released || !E.wanted() || !playing) return
            if (lastVsync != 0L) {
                val d = frameTimeNanos - lastVsync
                if (d in 4_000_000L..50_000_000L) vsyncNs = (vsyncNs * 7 + d) / 8
            }
            lastVsync = frameTimeNanos
            try { present(hold = false, nowNs = frameTimeNanos + vsyncNs) } catch (e: Throwable) { E.fail(e) }
            kickLoop()
        }
    }
    private fun kickLoop() {
        if (looping || released || !playing || !E.wanted()) return
        val c = choreo ?: Choreographer.getInstance().also { choreo = it }
        looping = true
        c.postFrameCallback(frameCb)
    }

    private fun present(hold: Boolean, nowNs: Long = System.nanoTime()) {
        if (!E.wanted()) { drawDirect(); return }
        if (!beginWindowCheck()) return
        current()
        val out = E.present(nowNs, hold) ?: return
        drawEngineOut(out.first, out.second, out.third)
    }
    private fun beginWindowCheck() = !released && glOk && win != EGL14.EGL_NO_SURFACE && outW > 0 && outH > 0

    // ---------------------------------------------------------------- luma sample for auto-levels

    private fun readLuma(): FloatArray? {
        if (!glOk || !hasFrame) return null
        current()
        val lw = 32; val lh = 18
        if (lumaFbo == 0) {
            val t = IntArray(1); GLES20.glGenTextures(1, t, 0); lumaTex = t[0]
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, lumaTex)
            GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, lw, lh, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            val fb = IntArray(1); GLES20.glGenFramebuffers(1, fb, 0); lumaFbo = fb[0]
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, lumaFbo)
            GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, lumaTex, 0)
        }
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, lumaFbo)
        GLES20.glViewport(0, 0, lw, lh)
        pos.position(0); pos.put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); pos.position(0)
        progOes?.draw(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes, texM, frameW, frameH, null)   // the plain frame: measured before the filters
        val px = ByteBuffer.allocateDirect(lw * lh * 4).order(ByteOrder.nativeOrder())
        GLES20.glReadPixels(0, 0, lw, lh, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, px)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        val out = FloatArray(lw * lh)
        for (i in 0 until lw * lh) {
            val r = px.get(i * 4).toInt() and 0xff; val g = px.get(i * 4 + 1).toInt() and 0xff; val b = px.get(i * 4 + 2).toInt() and 0xff
            out[i] = r * 0.299f + g * 0.587f + b * 0.114f
        }
        requestRenderGl()                                 // the window's viewport was changed: redraw it
        return out
    }

    private fun teardownGl() {
        dropWindow()
        st?.setOnFrameAvailableListener(null)
        st?.release(); st = null
        main.post { input?.release(); input = null }
        if (glOk) {
            current()
            if (lumaFbo != 0) GLES20.glDeleteFramebuffers(1, intArrayOf(lumaFbo), 0)
            if (lumaTex != 0) GLES20.glDeleteTextures(1, intArrayOf(lumaTex), 0)
            if (oes != 0) GLES20.glDeleteTextures(1, intArrayOf(oes), 0)
            progOes?.free(); prog2d?.free()
        }
        if (dpy != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(dpy, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            if (dummy != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(dpy, dummy)
            if (ectx != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(dpy, ectx)
            EGL14.eglReleaseThread()
            EGL14.eglTerminate(dpy)
        }
        glOk = false
    }

    // ================================================================ filter + view program (GLSL ES 1.00)

    private inner class FilterProg(fragment: String, private val external: Boolean) {
        val p = link(VERTEX, fragment)
        private val locPos = GLES20.glGetAttribLocation(p, "aPos")
        private val locTex = GLES20.glGetAttribLocation(p, "aTex")
        private val locTexM = GLES20.glGetUniformLocation(p, "uTexM")
        private val locSampler = GLES20.glGetUniformLocation(p, "uTexSampler")
        private val locTexel = GLES20.glGetUniformLocation(p, "uTexel")
        private val locCount = GLES20.glGetUniformLocation(p, "uCount")
        private val locA = GLES20.glGetUniformLocation(p, "uOpA[0]")
        private val locB = GLES20.glGetUniformLocation(p, "uOpB[0]")
        private val opA = FloatArray(FilterParams.MAX * 4)
        private val opB = FloatArray(FilterParams.MAX * 4)

        fun draw(target: Int, tex: Int, m: FloatArray, tw: Int, th: Int, f: FilterParams?) {
            GLES30.glBindVertexArray(0)
            GLES20.glUseProgram(p)
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(target, tex)
            GLES20.glUniform1i(locSampler, 0)
            GLES20.glUniformMatrix4fv(locTexM, 1, false, m, 0)
            GLES20.glUniform2f(locTexel, 1f / max(1, tw), 1f / max(1, th))
            val n = f?.n ?: 0
            if (n > 0) {
                val ops = f!!.ops
                for (i in 0 until FilterParams.MAX) for (k in 0 until 4) { opA[i * 4 + k] = ops[i * 8 + k]; opB[i * 4 + k] = ops[i * 8 + 4 + k] }
                GLES20.glUniform4fv(locA, FilterParams.MAX, opA, 0)
                GLES20.glUniform4fv(locB, FilterParams.MAX, opB, 0)
            }
            GLES20.glUniform1i(locCount, n)
            GLES20.glEnableVertexAttribArray(locPos)
            GLES20.glVertexAttribPointer(locPos, 2, GLES20.GL_FLOAT, false, 0, pos)
            GLES20.glEnableVertexAttribArray(locTex)
            GLES20.glVertexAttribPointer(locTex, 2, GLES20.GL_FLOAT, false, 0, uv)
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            GLES20.glDisableVertexAttribArray(locPos)
            GLES20.glDisableVertexAttribArray(locTex)
            if (external) GLES20.glBindTexture(target, 0)
        }
        fun free() { GLES20.glDeleteProgram(p) }
    }

    // ================================================================ motion smoothing engine (port of index.html)

    private inner class Prog(fs: String, names: List<String>, ext: String = "") {
        val p = link(MVS, "#version 300 es\n" + ext + MHEAD + fs)
        val u: Map<String, Int> = names.associateWith { GLES20.glGetUniformLocation(p, it) }
        fun use() { GLES20.glUseProgram(p) }
        fun i(n: String, v: Int) = GLES20.glUniform1i(u[n] ?: -1, v)
        fun f(n: String, v: Float) = GLES20.glUniform1f(u[n] ?: -1, v)
        fun f2(n: String, a: Float, b: Float) = GLES20.glUniform2f(u[n] ?: -1, a, b)
        fun i2(n: String, a: Int, b: Int) = GLES20.glUniform2i(u[n] ?: -1, a, b)
    }

    private class Tex(val tex: Int, val fbo: Int, val w: Int, val h: Int)

    private class Slot(val img: Tex, val mv: Tex?, val mvB: Tex?) {
        var t = 0.0              // display time, seconds (System.nanoTime domain)
        var valid = false; var disc = false; var dup = false; var hasMv = false
        var seq = 0; var prevSeq = 0
    }

    private class Tier(val motionW: Int, val simpleW: Int, val mb: Int, val ana: Int)

    private inner class Engine {
        private val TIERS = arrayOf(Tier(960, 1280, 96, 384), Tier(1600, 1920, 256, 448), Tier(2560, 2560, 512, 576), Tier(3840, 3840, 1024, 704))
        private val UP_CAPS = intArrayOf(0, 1080, 1440, 2160)

        private var progs: Map<String, Prog>? = null
        private var failed = false
        private var failWhy = ""
        private var floatOk = false
        private var ring = ArrayList<Slot>()
        private var luma = ArrayList<Tex>()
        private var mvRaw: Tex? = null
        private var mvRef: Tex? = null
        private var anaW = 0; private var anaH = 0; private var gw = 0; private var gh = 0; private var fw = 0; private var fh = 0
        private var ringW = 0; private var ringH = 0
        private var resKey = ""
        private var write = 0
        private var seq = 0; private var prevSeq = 0
        private var prevLumaValid = false; private var lumaIdx = 0
        private var prevSlot: Slot? = null; private var uniqSlot: Slot? = null
        private var dupTex: Tex? = null
        private val dupBuf: ByteBuffer = ByteBuffer.allocateDirect(8 * 8 * 4).order(ByteOrder.nativeOrder())
        private var dupMs = 0.0; private var dupN = 0; private var dupOff = false
        private var out: Tex? = null
        private var lastT: Double? = null
        private var period = 1.0 / 30; private var periodN = 0
        private val dts = ArrayList<Double>()
        private val udts = ArrayList<Double>()
        private var lastUniqT: Double? = null
        private var bypass = false
        private val leads = ArrayList<Double>()       // how early frames arrive (s): free lookahead for interpolation
        private var lEff: Double? = null; private var lEffAt = 0L
        private var lastTT = Double.NEGATIVE_INFINITY
        private var lastKey = ""
        private var lastDrawNs = 0L
        private var outValid = false
        private var qualityDrop = 0                   // tiers dropped after running out of GPU memory
        private var lastStatus = ""; private var lastStatusAt = 0L
        var extraSec = 0.0; private set

        fun wanted(): Boolean { val c = cfg; return !failed && (smoothing(c) || c.delayMs > 0f) }
        fun ready() = ring.isNotEmpty() && outValid
        private fun smoothing(c: MemcConfig = cfg) = c.mode != "off" && !bypass
        private fun motion(c: MemcConfig = cfg) = (c.mode == "motion" || c.mode == "ultra") && !bypass
        private fun quality() = max(0, cfg.quality.coerceIn(0, 3) - qualityDrop)

        fun fail(e: Throwable) {
            Log.w(TAG, "motion smoothing failed", e)
            failed = true; failWhy = e.message ?: e.toString()
            free()
            status(force = true)
            drawDirect()
        }

        // ---- lifecycle ----
        private fun init(): Boolean {
            if (progs != null) return true
            if (failed) return false
            try {
                val ext = GLES20.glGetString(GLES20.GL_EXTENSIONS) ?: ""
                floatOk = ext.contains("GL_EXT_color_buffer_float") || ext.contains("GL_EXT_color_buffer_half_float")
                progs = mapOf(
                    "copy" to Prog(FS_COPY, listOf("uTex")),
                    "luma" to Prog(FS_LUMA, listOf("uTex", "uOff")),
                    "dup" to Prog(FS_DUP, listOf("uA", "uB")),
                    "me" to Prog(FS_ME, listOf("uCur", "uPrev", "uSize", "uLambda")),
                    "med" to Prog(FS_MED, listOf("uRaw", "uGrid")),
                    "blend" to Prog(FS_BLEND, listOf("uF0", "uF1", "uA", "uUp")),
                    "mc" to Prog(FS_MC, listOf("uF0", "uF1", "uMv", "uA", "uInvAna", "uFall", "uUp")),
                    "ref" to Prog(FS_REF, listOf("uCur", "uPrev", "uRaw", "uPrior", "uHasPrior", "uSize", "uGrid")),
                    "mc2" to Prog(FS_MC2, listOf("uF0", "uF1", "uMvF", "uMvB", "uA", "uInvAna", "uFall", "uUp")),
                    "cap" to Prog(FS_CAP_OES, listOf("uTex", "uTexM", "uOff"), EXT_OES3))
                dupTex = makeTex(8, 8, GLES20.GL_NEAREST, GLES30.GL_RGBA8)
            } catch (e: Throwable) { fail(e); return false }
            return true
        }

        fun free() {
            ring.forEach { s -> del(s.img); s.mv?.let { del(it) }; s.mvB?.let { del(it) } }
            luma.forEach { del(it) }
            mvRaw?.let { del(it) }; mvRef?.let { del(it) }; out?.let { del(it) }
            ring = ArrayList(); luma = ArrayList(); mvRaw = null; mvRef = null; out = null
            resKey = ""; write = 0; prevSeq = 0; prevLumaValid = false; lumaIdx = 0
            prevSlot = null; uniqSlot = null; lastKey = ""; outValid = false
        }

        private fun invalidate() {
            ring.forEach { it.valid = false; it.hasMv = false }
            prevSeq = 0; prevLumaValid = false; lastKey = ""; prevSlot = null; uniqSlot = null
        }
        /** Seek / pause / mode change: forget timing history. */
        fun resetStream() { invalidate(); lastT = null; lastTT = Double.NEGATIVE_INFINITY; lastUniqT = null; lEff = null }
        fun resetTiming() { lastTT = Double.NEGATIVE_INFINITY; lEff = null }
        fun configChanged() {
            bypass = false; failed = false; qualityDrop = 0
            free(); resetStream()
            period = 1.0 / 30; periodN = 0; dts.clear(); udts.clear(); dupMs = 0.0; dupN = 0; dupOff = false; leads.clear()
            status(force = true)
        }
        fun boxChanged() { out?.let { del(it) }; out = null; lastKey = "" }

        // ---- resources ----
        private fun makeTex(w: Int, h: Int, filter: Int, fmt: Int): Tex {
            val t = IntArray(1); GLES20.glGenTextures(1, t, 0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t[0])
            GLES30.glTexStorage2D(GLES20.GL_TEXTURE_2D, 1, fmt, w, h)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, filter)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, filter)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
            val f = IntArray(1); GLES20.glGenFramebuffers(1, f, 0)
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, f[0])
            GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, t[0], 0)
            return Tex(t[0], f[0], w, h)
        }
        private fun del(t: Tex) {
            GLES20.glDeleteFramebuffers(1, intArrayOf(t.fbo), 0)
            GLES20.glDeleteTextures(1, intArrayOf(t.tex), 0)
        }
        private fun vecFmt() = if (floatOk) GLES30.GL_RGBA16F else GLES30.GL_RGBA8

        private fun makeSlot(mot: Boolean): Slot {
            val img = makeTex(ringW, ringH, GLES20.GL_LINEAR, GLES30.GL_RGBA8)
            if (!mot || anaW == 0) return Slot(img, null, null)
            val fine = fw > 0
            val mw = if (fine) fw else gw; val mh = if (fine) fh else gh
            val mv = makeTex(mw, mh, GLES20.GL_LINEAR, if (fine) vecFmt() else GLES30.GL_RGBA8)
            val mvB = if (fine) makeTex(mw, mh, GLES20.GL_LINEAR, vecFmt()) else null
            return Slot(img, mv, mvB)
        }

        private fun ensure(vw: Int, vh: Int) {
            val c = cfg
            val sm = smoothing(c); val mot = motion(c)
            val fps = min(120.0, 1.0 / max(period, 0.004))
            val need = ceil((min(max(c.delayMs.toDouble(), 0.0), 2000.0) / 1000.0 + (if (sm) 0.4 else 0.3)) * fps).toInt() + 4
            val wantN = max(12, ((need + 7) / 8) * 8)
            val q = quality(); val tier = TIERS[q]
            val key = (if (mot) (if (c.mode == "ultra") "u" else "m") else "b") + q + ":" + vw + "x" + vh
            if (key == resKey && wantN <= ring.size) return
            free()
            val budget = (if (sm) tier.mb else max(tier.mb, 160)).toDouble() * 1048576.0
            var scale = min(1.0, (if (mot) tier.motionW else tier.simpleW).toDouble() / vw)
            scale = min(scale, sqrt(budget / (wantN.toDouble() * 4 * vw * vh)))
            ringW = max(64, ((vw * scale / 2).roundToInt()) * 2)
            ringH = max(36, ((vh * scale / 2).roundToInt()) * 2)
            anaW = 0; anaH = 0; gw = 0; gh = 0; fw = 0; fh = 0
            if (mot) {
                anaW = max(64, ((min(ringW, tier.ana) / 8.0).roundToInt()) * 8)
                anaH = max(24, ((anaW.toDouble() * ringH / ringW / 8.0).roundToInt()) * 8)
                gw = anaW / 8; gh = anaH / 8
                for (i in 0 until 2) luma.add(makeTex(anaW, anaH, GLES20.GL_NEAREST, GLES30.GL_RGBA8))
                mvRaw = makeTex(gw, gh, GLES20.GL_NEAREST, GLES30.GL_RGBA8)
                if (c.mode == "ultra") { fw = gw * 2; fh = gh * 2; mvRef = makeTex(fw, fh, GLES20.GL_NEAREST, vecFmt()) }
            }
            for (i in 0 until wantN) ring.add(makeSlot(mot))
            if (GLES20.glGetError() == GLES20.GL_OUT_OF_MEMORY && q > 0) {   // drop one tier and rebuild on the next frame
                free(); qualityDrop++; status(force = true); return
            }
            resKey = key
        }

        /** Output texture: the processing size, or larger (up to the upscale cap and the box) when upscaling. */
        private fun ensureOut(): Tex? {
            if (ringW == 0) return null
            val capH = UP_CAPS[cfg.upscale.coerceIn(0, 3)]
            var s = 1.0
            if (capH > 0 && outW > 0 && outH > 0) {
                val fit = min(outW.toDouble() / ringW, outH.toDouble() / ringH)
                s = max(1.0, min(fit, capH.toDouble() / ringH))
            }
            val w = ((ringW * s / 2).roundToInt()) * 2; val h = ((ringH * s / 2).roundToInt()) * 2
            val o = out
            if (o != null && o.w == w && o.h == h) return o
            o?.let { del(it) }
            val n = makeTex(w, h, GLES20.GL_LINEAR, GLES30.GL_RGBA8)
            out = n; lastKey = ""
            return n
        }

        private fun bind(unit: Int, tex: Int) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex)
        }
        private fun target(t: Tex) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fbo)
            GLES20.glViewport(0, 0, t.w, t.h)
        }
        private fun tri() { GLES30.glBindVertexArray(0); GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3) }

        // ---- capture: one per decoded frame ----
        fun capture(tsNs: Long, arrivalNs: Long) {
            if (!init()) return
            val P = progs!!
            val t = tsNs / 1e9
            leads.add((tsNs - arrivalNs) / 1e9); if (leads.size > 32) leads.removeAt(0)
            var disc = false
            val lt = lastT
            if (lt != null) {
                val dt = t - lt
                if (dt <= 0.0) { if (dt < 0.0) { invalidate(); disc = true } else return }
                else {
                    if (dt > 0.004 && dt < 0.25) {
                        dts.add(dt); if (dts.size > 32) dts.removeAt(0)
                        periodN = dts.size
                        period = dts.sorted()[dts.size / 2]
                    }
                    if (dt > period * 2.6) disc = true
                }
            }
            lastT = t

            ensure(frameW, frameH)
            if (ring.isEmpty()) return

            val slot = ring[write]
            write = (write + 1) % ring.size

            // decoder texture -> slot (4 taps when shrinking, so fine detail doesn't shimmer)
            target(slot.img)
            val cap = P.getValue("cap"); cap.use()
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes)
            cap.i("uTex", 0)
            GLES20.glUniformMatrix4fv(cap.u["uTexM"] ?: -1, 1, false, texM, 0)
            val shrink = ringW < frameW * 0.7
            cap.f2("uOff", if (shrink) 0.25f / ringW else 0f, if (shrink) 0.25f / ringH else 0f)
            tri()
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, 0)

            var dup = false
            val ps = prevSlot
            if (smoothing() && !dupOff && ps != null && ps.valid && !disc) {
                val r = dupCheck(ps, slot)
                dup = r.first
                if (r.second) disc = true                  // hard cut: never blend across it
            }
            prevSlot = slot
            slot.t = t; slot.valid = true; slot.disc = disc; slot.dup = dup; slot.hasMv = false
            slot.seq = ++seq; slot.prevSeq = prevSeq
            val pu = uniqSlot
            if (!dup) {
                uniqSlot = slot
                prevSeq = slot.seq
                val lu = lastUniqT
                if (!disc && lu != null) { val ug = t - lu; if (ug > 0.004 && ug < 0.5) { udts.add(ug); if (udts.size > 24) udts.removeAt(0) } }
                lastUniqT = t
            }

            if (motion() && anaW > 0 && !dup) {
                val cur = lumaIdx; val prev = 1 - cur
                target(luma[cur])
                val L = P.getValue("luma"); L.use()
                bind(0, slot.img.tex); L.i("uTex", 0); L.f2("uOff", 0.25f / anaW, 0.25f / anaH)
                tri()
                if (prevLumaValid && !disc && cfg.mode != "ultra") {
                    runMe(luma[cur], luma[prev])
                    target(slot.mv!!)
                    val M = P.getValue("med"); M.use()
                    bind(0, mvRaw!!.tex); M.i("uRaw", 0); M.i2("uGrid", gw, gh)
                    tri()
                    slot.hasMv = true
                } else if (prevLumaValid && !disc && mvRef != null) {
                    ultraMv(slot, cur, prev, pu)
                }
                prevLumaValid = true
                lumaIdx = prev
            }

            // Too fast (above "Smooth up to") or too slow to interpolate: just show frames (with the delay, if any).
            val c = cfg
            if (c.mode != "off" && periodN >= 30 && !bypass && (1.0 / uniqGap() > c.maxIn + 1.5 || period > 0.125)) {
                bypass = true; free(); status(force = true)
            }
            status()
        }

        private fun runMe(a: Tex, b: Tex) {
            val P = progs!!
            target(mvRaw!!)
            val M = P.getValue("me"); M.use()
            bind(0, a.tex); bind(1, b.tex)
            M.i("uCur", 0); M.i("uPrev", 1); M.i2("uSize", anaW, anaH); M.f("uLambda", 0.0006f)
            tri()
        }

        private fun ultraMv(slot: Slot, cur: Int, prev: Int, pu: Slot?) {
            val P = progs!!
            val havePrior = pu != null && pu.hasMv && pu.mv != null && pu.mvB != null && pu.seq == slot.prevSeq
            fun run(la: Tex, lb: Tex, outT: Tex, prior: Tex?) {
                runMe(la, lb)
                target(mvRef!!)
                val R = P.getValue("ref"); R.use()
                bind(0, la.tex); bind(1, lb.tex); bind(2, mvRaw!!.tex); bind(3, prior?.tex ?: mvRaw!!.tex)
                R.i("uCur", 0); R.i("uPrev", 1); R.i("uRaw", 2); R.i("uPrior", 3); R.f("uHasPrior", if (prior != null) 1f else 0f)
                R.i2("uSize", anaW, anaH); R.i2("uGrid", gw, gh)
                tri()
                bind(2, 0); bind(3, 0)
                target(outT)
                val M = P.getValue("med"); M.use()
                bind(0, mvRef!!.tex); M.i("uRaw", 0); M.i2("uGrid", fw, fh)
                tri()
            }
            run(luma[cur], luma[prev], slot.mv!!, if (havePrior) pu!!.mv else null)
            run(luma[prev], luma[cur], slot.mvB!!, if (havePrior) pu!!.mvB else null)
            slot.hasMv = true
        }

        /** (duplicate, hard cut) comparing frame b with the previous capture a. Switches itself off if the readback is slow. */
        private fun dupCheck(a: Slot, b: Slot): Pair<Boolean, Boolean> {
            val P = progs!!.getValue("dup")
            target(dupTex!!)
            P.use()
            bind(0, a.img.tex); bind(1, b.img.tex); P.i("uA", 0); P.i("uB", 1)
            tri()
            val t0 = SystemClock.elapsedRealtimeNanos()
            dupBuf.position(0)
            GLES20.glReadPixels(0, 0, 8, 8, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, dupBuf)
            dupMs += ((SystemClock.elapsedRealtimeNanos() - t0) / 1e6 - dupMs) * 0.1
            if (++dupN >= 24 && dupMs > 10) dupOff = true
            var maxMean = 0.0; var cnt = 0; var coarse = 0.0
            for (i in 0 until 64) {
                val m = (dupBuf.get(i * 4).toInt() and 0xff) / 255.0 / 32
                if (m > maxMean) maxMean = m
                cnt += ((dupBuf.get(i * 4 + 1).toInt() and 0xff) / 255.0 * 15).roundToInt()
                coarse += (dupBuf.get(i * 4 + 2).toInt() and 0xff) / 255.0 / 2
            }
            coarse /= 64
            return Pair(maxMean < 0.006 && cnt <= 2, coarse > 0.25)
        }

        /** Typical gap between UNIQUE frames (longer than the period when pictures are held for 2-3 frames). */
        private fun uniqGap(): Double {
            var g = period
            if (udts.size >= 6) { val s = udts.sorted(); g = max(g, s[min(s.size - 1, (s.size * 0.8).toInt())]) }
            return min(g, period * 4)
        }

        // ---- present: one per screen refresh while playing; returns (texture, w, h) to draw, or null to keep the screen ----
        fun present(nowNs: Long, hold: Boolean): Triple<Int, Int, Int>? {
            if (!init() || ring.isEmpty()) return null
            val c = cfg
            val target = max(c.delayMs.toDouble(), 0.0) / 1000.0
            // Ease toward a new delay instead of jumping, so dragging the slider doesn't stutter.
            var L = target
            val le = lEff
            if (hold || le == null) lEff = target
            else {
                val dt = min(0.1, max(0.0, (nowNs - lEffAt) / 1e9))
                val diff = target - le
                lEff = if (abs(diff) > 0.8) target else { val stp = 0.35 * dt; if (abs(diff) <= stp) target else le + sign(diff) * stp }
                L = lEff!!
            }
            lEffAt = nowNs
            val sm = smoothing(c)
            val uGap = uniqGap()
            // Interpolating needs the NEXT frame. Frames usually arrive early, so only the part of the gap that isn't
            // covered by that head start becomes extra delay.
            val lead = if (leads.size >= 4) leads.sorted()[leads.size / 5] else 0.0
            val minE = max(0.0, uGap * 1.15 + 0.004 - max(0.0, lead))
            extraSec = if (hold || !sm) 0.0 else max(0.0, minE - L)
            val now = nowNs / 1e9
            var tt = now - (if (hold || !sm) L else max(L, minE))
            val outStep = 1.0 / max(1, c.outFps)
            val smoothOn = !hold && sm && outStep < period * 0.95
            if (hold) lastTT = Double.NEGATIVE_INFINITY
            else { if (tt < lastTT && lastTT - tt < 0.12) tt = lastTT; lastTT = tt }
            if (smoothOn && nowNs - lastDrawNs < (0.8e9 / c.outFps).toLong()) return null

            var f0: Slot? = null; var f1: Slot? = null; var f0a: Slot? = null; var oldest: Slot? = null; var newest: Slot? = null
            for (s in ring) {
                if (!s.valid) continue
                if (oldest == null || s.t < oldest.t) oldest = s
                if (newest == null || s.t > newest.t) newest = s
                val skip = smoothOn && s.dup
                if (s.t <= tt) {
                    if (f0a == null || s.t > f0a.t) f0a = s
                    if (!skip && (f0 == null || s.t > f0.t)) f0 = s
                } else if (!skip && (f1 == null || s.t < f1.t)) f1 = s
            }
            if (newest == null) return null
            if (hold && target <= 0.0) { f0 = newest; f1 = null }   // paused: show the latest frame right away
            if (f0 == null) f0 = f0a
            if (f0 == null) { f0 = oldest; f1 = null }
            var a = 0.0
            val f1v = f1
            if (smoothOn && f1v != null && !f1v.disc) {
                val gap = f1v.t - f0!!.t
                if (gap > 0 && gap <= max(period * 2.6, uGap * 1.25)) a = min(1.0, max(0.0, (tt - f0.t) / gap))
            } else f1 = null
            val key = "${f0!!.seq}:${f1?.seq ?: 0}:${(a * 64).roundToInt()}:${c.mode}:${c.strength}"
            val o = ensureOut() ?: return null
            if (key == lastKey && outValid) return null
            lastKey = key
            lastDrawNs = nowNs
            draw(o, f0!!, f1, a.toFloat())
            outValid = true
            return Triple(o.tex, o.w, o.h)
        }

        /** Re-show the last engine picture (view or filter change while paused). */
        fun redrawLast(): Boolean {
            val o = out ?: return false
            if (!outValid) return false
            drawEngineOut(o.tex, o.w, o.h)
            return true
        }

        private fun draw(o: Tex, f0: Slot, f1: Slot?, a: Float) {
            val P = progs!!
            val c = cfg
            target(o)
            val up = if (o.w > ringW) 1f else 0f
            if (f1 != null && a > 0f && motion(c) && anaW > 0 && f1.hasMv && f1.prevSeq == f0.seq && (c.mode != "ultra" || f1.mvB != null)) {
                val ultra = c.mode == "ultra"
                val M = P.getValue(if (ultra) "mc2" else "mc"); M.use()
                bind(0, f0.img.tex); bind(1, f1.img.tex); bind(2, f1.mv!!.tex)
                M.i("uF0", 0); M.i("uF1", 1)
                if (ultra) { bind(3, f1.mvB!!.tex); M.i("uMvF", 2); M.i("uMvB", 3) } else M.i("uMv", 2)
                M.f("uA", a)
                M.f2("uInvAna", 1f / anaW, 1f / anaH)
                M.f("uUp", up)
                M.f2("uFall", 0.06f + 0.24f * c.strength, 0.15f + 0.6f * c.strength)
            } else {
                val B = P.getValue("blend"); B.use()
                val second = if (f1 != null && a > 0f) f1 else f0
                bind(0, f0.img.tex); bind(1, second.img.tex)
                B.i("uF0", 0); B.i("uF1", 1)
                B.f("uA", if (f1 != null && a > 0f) a else 0f)
                B.f("uUp", up)
            }
            tri()
        }

        // ---- status for the page's menu ----
        fun status(force: Boolean = false) {
            val now = SystemClock.elapsedRealtime()
            if (!force && now - lastStatusAt < 1000) return
            val c = cfg
            val inFps = if (periodN >= 8) 1.0 / max(uniqGap(), 0.004) else 0.0
            val m = mapOf<String, Any>(
                "mode" to c.mode, "failed" to failed, "why" to failWhy, "bypass" to bypass,
                "smoothing" to (smoothing(c) && !failed), "inFps" to (inFps * 10).roundToInt() / 10.0, "outFps" to c.outFps,
                "extraMs" to (extraSec * 1000).roundToInt(), "qualityDrop" to qualityDrop, "ring" to "${ringW}x${ringH}")
            val k = m.toString()
            if (!force && k == lastStatus) return
            lastStatus = k; lastStatusAt = now
            main.post { onStatus?.invoke(m) }
        }
    }

    // ================================================================ helpers

    private fun link(vsSrc: String, fsSrc: String): Int {
        fun compile(type: Int, src: String): Int {
            val s = GLES20.glCreateShader(type)
            GLES20.glShaderSource(s, src); GLES20.glCompileShader(s)
            val ok = IntArray(1); GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) { val log = GLES20.glGetShaderInfoLog(s); GLES20.glDeleteShader(s); throw RuntimeException("shader compile failed: $log") }
            return s
        }
        val vs = compile(GLES20.GL_VERTEX_SHADER, vsSrc); val fs = compile(GLES20.GL_FRAGMENT_SHADER, fsSrc)
        val p = GLES20.glCreateProgram()
        GLES20.glAttachShader(p, vs); GLES20.glAttachShader(p, fs); GLES20.glLinkProgram(p)
        val ok = IntArray(1); GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0)
        if (ok[0] == 0) throw RuntimeException("shader link failed: " + GLES20.glGetProgramInfoLog(p))
        GLES20.glDeleteShader(vs); GLES20.glDeleteShader(fs)
        return p
    }

    companion object {
        private const val TAG = "PPVideo"

        private fun floatBuf(n: Int): FloatBuffer = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

        // ---- filter + view pass (GLSL ES 1.00) ----
        private const val VERTEX = """
            attribute vec2 aPos;
            attribute vec2 aTex;
            uniform mat4 uTexM;
            varying vec2 vTexSamplingCoord;
            void main() {
              gl_Position = vec4(aPos, 0.0, 1.0);
              vTexSamplingCoord = (uTexM * vec4(aTex, 0.0, 1.0)).xy;
            }
        """

        /** The shared filter shader, reading the decoder's external (OES) texture. */
        private val FRAGMENT_OES: String = "#extension GL_OES_EGL_image_external : require\n" +
            FILTER_FRAGMENT.replace("uniform sampler2D uTexSampler;", "uniform samplerExternalOES uTexSampler;")

        // ---- motion smoothing (GLSL ES 3.00): the page's shaders, unchanged ----
        private const val MVS = "#version 300 es\n" +
            "out vec2 vUv;\n" +
            "void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));" +
            " vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }\n"
        /** #version must be first and #extension right after it, so programs are built as "#version" + ext + MHEAD + body. */
        private const val MHEAD = "precision highp float;\nprecision highp int;\nprecision highp sampler2D;\nin vec2 vUv;\nout vec4 oc;\n"

        /** Decoder texture -> ring slot. With uOff > 0, 4 taps (a cheap box filter for big downscales). */
        private const val EXT_OES3 = "#extension GL_OES_EGL_image_external_essl3 : require\n"
        private const val FS_CAP_OES = "uniform samplerExternalOES uTex; uniform mat4 uTexM; uniform vec2 uOff;\n" +
            "vec3 at(vec2 uv){ return texture(uTex, (uTexM * vec4(uv, 0.0, 1.0)).xy).rgb; }\n" +
            "void main(){\n" +
            "  if (uOff.x <= 0.0){ oc = vec4(at(vUv), 1.0); return; }\n" +
            "  vec3 c = at(vUv + vec2(uOff.x, uOff.y)) + at(vUv + vec2(-uOff.x, uOff.y)) + at(vUv + vec2(uOff.x, -uOff.y)) + at(vUv + vec2(-uOff.x, -uOff.y));\n" +
            "  oc = vec4(c * 0.25, 1.0);\n" +
            "}\n"

        private const val FS_COPY = "uniform sampler2D uTex;\n" +
            "void main(){ oc = vec4(texture(uTex, vUv).rgb, 1.0); }\n"

        private const val FS_LUMA = "uniform sampler2D uTex; uniform vec2 uOff;\n" +
            "float lum(vec2 uv){ return dot(texture(uTex, uv).rgb, vec3(0.299, 0.587, 0.114)); }\n" +
            "void main(){\n" +
            "  float y = 0.25 * (lum(vUv + vec2(uOff.x, uOff.y)) + lum(vUv + vec2(-uOff.x, uOff.y))\n" +
            "                  + lum(vUv + vec2(uOff.x, -uOff.y)) + lum(vUv + vec2(-uOff.x, -uOff.y)));\n" +
            "  oc = vec4(y, y, y, 1.0);\n" +
            "}\n"

        private const val FS_ME = "uniform sampler2D uCur; uniform sampler2D uPrev; uniform ivec2 uSize; uniform float uLambda;\n" +
            "float sad(ivec2 c, ivec2 d){\n" +
            "  float s = 0.0;\n" +
            "  for (int j = -8; j < 8; j += 2){\n" +
            "    for (int i = -8; i < 8; i += 2){\n" +
            "      ivec2 p = c + ivec2(i, j);\n" +
            "      float a = texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r;\n" +
            "      float b = texelFetch(uPrev, clamp(p + d, ivec2(0), uSize - 1), 0).r;\n" +
            "      s += abs(a - b);\n" +
            "    }\n" +
            "  }\n" +
            "  return s * (1.0 / 64.0);\n" +
            "}\n" +
            "void main(){\n" +
            "  ivec2 c = ivec2(gl_FragCoord.xy) * 8 + 4;\n" +
            "  ivec2 best = ivec2(0);\n" +
            "  float s0 = sad(c, best);\n" +
            "  float bestCost = s0;\n" +
            "  float bestSad = s0;\n" +
            "  int stp = 32;\n" +
            "  for (int l = 0; l < 6; l++){\n" +
            "    ivec2 ctr = best;\n" +
            "    for (int j = -1; j <= 1; j++){\n" +
            "      for (int i = -1; i <= 1; i++){\n" +
            "        if (i == 0 && j == 0) continue;\n" +
            "        ivec2 d = ctr + ivec2(i, j) * stp;\n" +
            "        float s = sad(c, d);\n" +
            "        float cost = s + uLambda * length(vec2(d));\n" +
            "        if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n" +
            "      }\n" +
            "    }\n" +
            "    stp = stp / 2;\n" +
            "  }\n" +
            "  if (bestSad > s0 * 0.9 - 0.004){ best = ivec2(0); bestSad = s0; }\n" +
            "  float conf = 1.0 - smoothstep(0.05, 0.16, bestSad);\n" +
            "  vec2 dv = clamp(vec2(best), -63.0, 63.0);\n" +
            "  oc = vec4((dv + 64.0) / 128.0, conf, 1.0);\n" +
            "}\n"

        private const val FS_MED = "uniform sampler2D uRaw; uniform ivec2 uGrid;\n" +
            "vec3 fetchMv(ivec2 p){\n" +
            "  vec4 t = texelFetch(uRaw, clamp(p, ivec2(0), uGrid - 1), 0);\n" +
            "  return vec3(t.rg * 128.0 - 64.0, t.b);\n" +
            "}\n" +
            "void main(){\n" +
            "  ivec2 p = ivec2(gl_FragCoord.xy);\n" +
            "  vec3 v[9];\n" +
            "  for (int j = 0; j < 3; j++){\n" +
            "    for (int i = 0; i < 3; i++){\n" +
            "      v[j * 3 + i] = fetchMv(p + ivec2(i - 1, j - 1));\n" +
            "    }\n" +
            "  }\n" +
            "  float bestS = 1e9;\n" +
            "  int bi = 4;\n" +
            "  for (int a = 0; a < 9; a++){\n" +
            "    float s = 0.0;\n" +
            "    for (int b = 0; b < 9; b++) s += length(v[a].xy - v[b].xy);\n" +
            "    if (a == 4) s -= 0.75;\n" +
            "    if (s < bestS){ bestS = s; bi = a; }\n" +
            "  }\n" +
            "  vec3 m = v[bi];\n" +
            "  oc = vec4((m.xy + 64.0) / 128.0, m.z, 1.0);\n" +
            "}\n"

        private const val FS_DUP = "uniform sampler2D uA; uniform sampler2D uB;\n" +
            "void main(){\n" +
            "  vec2 cell = floor(gl_FragCoord.xy);\n" +
            "  float s = 0.0; float n = 0.0;\n" +
            "  for (int j = 0; j < 16; j++){\n" +
            "    for (int i = 0; i < 16; i++){\n" +
            "      vec2 uv = (cell + (vec2(float(i), float(j)) + 0.5) * (1.0 / 16.0)) * 0.125;\n" +
            "      vec3 d = abs(texture(uA, uv).rgb - texture(uB, uv).rgb);\n" +
            "      float m = max(d.r, max(d.g, d.b));\n" +
            "      s += m; if (m > 0.05) n += 1.0;\n" +
            "    }\n" +
            "  }\n" +
            "  s *= (1.0 / 256.0);\n" +
            "  oc = vec4(clamp(s * 32.0, 0.0, 1.0), min(n, 15.0) / 15.0, clamp(s * 2.0, 0.0, 1.0), 1.0);\n" +
            "}\n"

        private const val SAMP = "uniform float uUp;\n" +
            "vec3 samp(sampler2D t, vec2 uv){\n" +
            "  if (uUp < 0.5) return texture(t, uv).rgb;\n" +
            "  vec2 sz = vec2(textureSize(t, 0));\n" +
            "  vec2 pos = uv * sz;\n" +
            "  vec2 c = floor(pos - 0.5) + 0.5;\n" +
            "  vec2 f = pos - c;\n" +
            "  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));\n" +
            "  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);\n" +
            "  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));\n" +
            "  vec2 w3 = f * f * (-0.5 + 0.5 * f);\n" +
            "  vec2 w12 = w1 + w2;\n" +
            "  vec2 p0 = (c - 1.0) / sz, p3 = (c + 2.0) / sz, p12 = (c + w2 / w12) / sz;\n" +
            "  vec3 r = texture(t, vec2(p0.x, p0.y)).rgb * (w0.x * w0.y)\n" +
            "         + texture(t, vec2(p12.x, p0.y)).rgb * (w12.x * w0.y)\n" +
            "         + texture(t, vec2(p3.x, p0.y)).rgb * (w3.x * w0.y)\n" +
            "         + texture(t, vec2(p0.x, p12.y)).rgb * (w0.x * w12.y)\n" +
            "         + texture(t, vec2(p12.x, p12.y)).rgb * (w12.x * w12.y)\n" +
            "         + texture(t, vec2(p3.x, p12.y)).rgb * (w3.x * w12.y)\n" +
            "         + texture(t, vec2(p0.x, p3.y)).rgb * (w0.x * w3.y)\n" +
            "         + texture(t, vec2(p12.x, p3.y)).rgb * (w12.x * w3.y)\n" +
            "         + texture(t, vec2(p3.x, p3.y)).rgb * (w3.x * w3.y);\n" +
            "  return clamp(r, 0.0, 1.0);\n" +
            "}\n"

        private const val FS_REF = "uniform sampler2D uCur; uniform sampler2D uPrev; uniform sampler2D uRaw; uniform sampler2D uPrior; uniform float uHasPrior; uniform ivec2 uSize; uniform ivec2 uGrid;\n" +
            "float sad4(ivec2 c, ivec2 d){\n" +
            "  float s = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c + ivec2(i, j);\n" +
            "    s += abs(texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r - texelFetch(uPrev, clamp(p + d, ivec2(0), uSize - 1), 0).r);\n" +
            "  } }\n" +
            "  return s * (1.0 / 64.0);\n" +
            "}\n" +
            "void main(){\n" +
            "  ivec2 f = ivec2(gl_FragCoord.xy);\n" +
            "  ivec2 c = f * 4 + 2;\n" +
            "  ivec2 par = f / 2;\n" +
            "  float s0 = sad4(c, ivec2(0));\n" +
            "  ivec2 best = ivec2(0); float bestCost = s0 + 0.0015; float bestSad = s0;\n" +
            "  for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n" +
            "    vec4 t = texelFetch(uRaw, clamp(par + ivec2(i, j), ivec2(0), uGrid - 1), 0);\n" +
            "    ivec2 d = ivec2(round(t.rg * 128.0 - 64.0));\n" +
            "    float s = sad4(c, d);\n" +
            "    float cost = s + 0.0006 * length(vec2(d)) + ((i != 0 || j != 0) ? 0.002 : 0.0);\n" +
            "    if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n" +
            "  } }\n" +
            "  if (uHasPrior > 0.5){\n" +
            "    vec4 t = texelFetch(uPrior, f, 0);\n" +
            "    ivec2 d = ivec2(round(t.rg * 128.0 - 64.0));\n" +
            "    float s = sad4(c, d);\n" +
            "    float cost = s + 0.0006 * length(vec2(d)) + 0.0005;\n" +
            "    if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n" +
            "  }\n" +
            "  for (int l = 0; l < 2; l++){\n" +
            "    ivec2 ctr = best;\n" +
            "    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n" +
            "      if (i == 0 && j == 0) continue;\n" +
            "      ivec2 d = ctr + ivec2(i, j);\n" +
            "      float s = sad4(c, d);\n" +
            "      float cost = s + 0.0006 * length(vec2(d));\n" +
            "      if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n" +
            "    } }\n" +
            "  }\n" +
            "  if (bestSad > s0 * 0.9 - 0.004){ best = ivec2(0); bestSad = s0; }\n" +
            "  vec2 sub = vec2(0.0);\n" +
            "  float xm = sad4(c, best + ivec2(-1, 0)); float xp = sad4(c, best + ivec2(1, 0));\n" +
            "  float ym = sad4(c, best + ivec2(0, -1)); float yp = sad4(c, best + ivec2(0, 1));\n" +
            "  float dx = xm - 2.0 * bestSad + xp; float dy = ym - 2.0 * bestSad + yp;\n" +
            "  if (dx > 1e-5) sub.x = clamp(0.5 * (xm - xp) / dx, -0.5, 0.5);\n" +
            "  if (dy > 1e-5) sub.y = clamp(0.5 * (ym - yp) / dy, -0.5, 0.5);\n" +
            "  float conf = 1.0 - smoothstep(0.05, 0.16, bestSad);\n" +
            "  vec2 dv = clamp(vec2(best) + sub, -63.0, 63.0);\n" +
            "  oc = vec4((dv + 64.0) / 128.0, conf, 1.0);\n" +
            "}\n"

        private const val FS_BLEND = SAMP + "uniform sampler2D uF0; uniform sampler2D uF1; uniform float uA;\n" +
            "void main(){ oc = vec4(mix(samp(uF0, vUv), samp(uF1, vUv), uA), 1.0); }\n"

        private const val FS_MC = SAMP + "uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMv;\n" +
            "uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n" +
            "void main(){\n" +
            "  vec4 t = texture(uMv, vUv);\n" +
            "  vec2 d = (t.rg * 128.0 - 64.0) * t.b;\n" +
            "  for (int k = 0; k < 2; k++){\n" +
            "    vec4 t2 = texture(uMv, clamp(vUv - d * uInvAna * (1.0 - uA), 0.0, 1.0));\n" +
            "    d = (t2.rg * 128.0 - 64.0) * t2.b;\n" +
            "  }\n" +
            "  vec2 duv = d * uInvAna;\n" +
            "  vec3 c0 = samp(uF0, vUv + duv * uA);\n" +
            "  vec3 c1 = samp(uF1, vUv - duv * (1.0 - uA));\n" +
            "  vec3 s0 = samp(uF0, vUv);\n" +
            "  vec3 s1 = samp(uF1, vUv);\n" +
            "  vec3 still = mix(s0, s1, uA);\n" +
            "  vec3 moved = mix(c0, c1, uA);\n" +
            "  vec3 dm = abs(c0 - c1);\n" +
            "  vec3 ds = abs(s0 - s1);\n" +
            "  float em = max(dm.r, max(dm.g, dm.b));\n" +
            "  float es = max(ds.r, max(ds.g, ds.b));\n" +
            "  bool useMoved = em + 0.03 < es;\n" +
            "  vec3 m = useMoved ? moved : still;\n" +
            "  float err = useMoved ? em : es;\n" +
            "  float bad = smoothstep(uFall.x, uFall.y, err);\n" +
            "  oc = vec4(mix(m, still, bad), 1.0);\n" +
            "}\n"

        private const val FS_MC2 = SAMP + "uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMvF; uniform sampler2D uMvB;\n" +
            "uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n" +
            "vec2 dec(vec4 t){ return (t.rg * 128.0 - 64.0) * t.b; }\n" +
            "float mx(vec3 v){ return max(v.r, max(v.g, v.b)); }\n" +
            "void main(){\n" +
            "  vec2 inv = uInvAna;\n" +
            "  vec2 d = dec(texture(uMvF, vUv));\n" +
            "  vec2 e = dec(texture(uMvB, vUv));\n" +
            "  for (int k = 0; k < 2; k++){\n" +
            "    d = dec(texture(uMvF, clamp(vUv - d * inv * (1.0 - uA), 0.0, 1.0)));\n" +
            "    e = dec(texture(uMvB, clamp(vUv - e * inv * uA, 0.0, 1.0)));\n" +
            "  }\n" +
            "  vec2 p1f = clamp(vUv - d * inv * (1.0 - uA), 0.0, 1.0);\n" +
            "  vec2 q0b = clamp(vUv - e * inv * uA, 0.0, 1.0);\n" +
            "  float rF = length(d + dec(texture(uMvB, clamp(p1f + d * inv, 0.0, 1.0))));\n" +
            "  float rB = length(e + dec(texture(uMvF, clamp(q0b + e * inv, 0.0, 1.0))));\n" +
            "  vec3 fa0 = samp(uF0, vUv + d * inv * uA);\n" +
            "  vec3 fa1 = samp(uF1, vUv - d * inv * (1.0 - uA));\n" +
            "  vec3 ba0 = samp(uF0, vUv - e * inv * uA);\n" +
            "  vec3 ba1 = samp(uF1, vUv + e * inv * (1.0 - uA));\n" +
            "  vec3 s0 = samp(uF0, vUv); vec3 s1 = samp(uF1, vUv);\n" +
            "  float ef = mx(abs(fa0 - fa1)); float eb = mx(abs(ba0 - ba1)); float es = mx(abs(s0 - s1));\n" +
            "  bool useF = (ef + 0.02 * min(rF, 4.0)) <= (eb + 0.02 * min(rB, 4.0));\n" +
            "  vec3 c0 = useF ? fa0 : ba0; vec3 c1 = useF ? fa1 : ba1;\n" +
            "  float em = useF ? ef : eb;\n" +
            "  float rr = useF ? rF : rB;\n" +
            "  vec3 still = mix(s0, s1, uA);\n" +
            "  bool useMoved = em + 0.03 < es;\n" +
            "  vec3 m = useMoved ? mix(c0, c1, uA) : still;\n" +
            "  float err = useMoved ? em : es;\n" +
            "  float bad = max(smoothstep(uFall.x, uFall.y, err), useMoved ? smoothstep(1.5, 4.0, rr) : 0.0);\n" +
            "  vec3 nearest = mix(s0, s1, smoothstep(0.35, 0.65, uA));\n" +
            "  oc = vec4(mix(m, nearest, bad), 1.0);\n" +
            "}\n"
    }
}
