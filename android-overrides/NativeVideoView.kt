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
     * Picture enhance: [sharp] adaptive sharpening 0..1, [deband], [deblock] (compression clean-up), [anime] line art,
     * [compare] before/after split. Any of these (or upscaling) runs the engine even with smoothing and delay off.
     */
    data class MemcConfig(val mode: String = "off", val delayMs: Float = 0f, val maxIn: Int = 50, val outFps: Int = 120,
                          val strength: Float = 0.5f, val quality: Int = 1, val upscale: Int = 0,
                          val sharp: Float = 0f, val deband: Boolean = false, val deblock: Boolean = false,
                          val anime: Boolean = false, val compare: Boolean = false, val ai: String = "off", val split: Float = 0.5f) {
        fun enhOn() = upscale > 0 || sharp > 0f || deband || deblock || anime || ai != "off"
        /** Same settings apart from picture enhance: no need to rebuild the frame ring. */
        fun sameBut(o: MemcConfig) = copy(sharp = o.sharp, deband = o.deband, deblock = o.deblock, anime = o.anime, compare = o.compare, ai = o.ai, split = o.split) == o
    }

    /**
     * An AI upscaler (2x) exactly as the page builds it (index.html, srSpec): one fragment shader per pass, each writing
     * the output textures [outs] of map [out] from the textures in [slots] (map name, texture index; "x" = the picture).
     * The final pass [fin] turns map [final] into the 2x picture ([kind] "rgb": depth-to-space; "luma": a detail value
     * added to the enlarged picture). Built for frames stored bottom row first, as this engine stores them.
     */
    class SrPassSpec(val src: String, val out: String, val outs: IntArray, val slots: List<Pair<String, Int>>)
    class SrSpec(val name: String, val kind: String, val final: String, val chans: Map<String, Int>, val passes: List<SrPassSpec>, val fin: String)

    /** Hands over an AI upscaler; it is built on the GL thread the first time it is used. */
    fun setSrModel(id: String, spec: SrSpec) {
        gl.post { E.setSr(id, spec); requestRenderGl() }
    }

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
        val enhOnly = c.sameBut(cfg) && c.enhOn() == cfg.enhOn()
        cfg = c
        gl.post { if (enhOnly) E.enhanceChanged() else E.configChanged(); kickLoop(); requestRenderGl() }
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
        // The buffers follow the new size a little later; redraw once they have, so the picture is laid out for them.
        gl.postDelayed({ requestRenderGl() }, 80)
        gl.postDelayed({ requestRenderGl() }, 300)
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
        // Draw for the buffer's real size, not the size the last surfaceChanged reported: after the box is resized
        // those can differ for a frame or two, and a picture laid out for one size then shown in the other is
        // squashed or stretched (a paused picture stays that way until the next frame).
        val qw = IntArray(1); val qh = IntArray(1)
        if (EGL14.eglQuerySurface(dpy, win, EGL14.EGL_WIDTH, qw, 0) && EGL14.eglQuerySurface(dpy, win, EGL14.EGL_HEIGHT, qh, 0)
            && qw[0] > 0 && qh[0] > 0) { outW = qw[0]; outH = qh[0] }
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

    // mvD/mvDB: fast-object candidates for mv/mvB (FS_DIL)
    private class Slot(val img: Tex, val mv: Tex?, val mvB: Tex?, val mvD: Tex? = null, val mvDB: Tex? = null) {
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
        private var enhMid: Tex? = null; private var enhPre: Tex? = null; private var enhUp: Tex? = null
        private var enhSeed = 0
        private var enhStale = false                  // enhance settings changed: the last picture must be drawn again, not re-shown
        private var srcW = 0                          // the video's own width (the codec's 8x8 grid for clean-up)
        private var fullOom = false                   // full-size frames ran out of GPU memory once: use the tier size
        private val SR_MAX_PX = 1280 * 736            // AI upscalers only run on pictures up to ~720p (bigger would not keep up)
        private val srSpecs = HashMap<String, SrSpec>()
        private val srNets = HashMap<String, SrNet>()
        private val srBroken = HashSet<String>()
        private var srInfo = ""                       // what the AI upscaler did last, for the page's menu
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

        fun wanted(): Boolean { val c = cfg; return !failed && (smoothing(c) || c.delayMs > 0f || c.enhOn()) }
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
                    "me" to Prog(FS_ME, listOf("uCur", "uPrev", "uSize", "uLambda", "uPrior", "uHasPrior")),
                    "med" to Prog(FS_MED, listOf("uRaw", "uGrid", "uCur", "uPrev", "uSize", "uPrior", "uHasPrior")),
                    "dil" to Prog(FS_DIL, listOf("uMv", "uGrid", "uSize")),
                    "blend" to Prog(FS_BLEND, listOf("uF0", "uF1", "uA", "uUp")),
                    "mc" to Prog(FS_MC, listOf("uF0", "uF1", "uMv", "uMvD", "uA", "uInvAna", "uFall", "uUp")),
                    "ref" to Prog(FS_REF, listOf("uCur", "uPrev", "uRaw", "uPrior", "uHasPrior", "uSize", "uGrid")),
                    "mc2" to Prog(FS_MC2, listOf("uF0", "uF1", "uMvF", "uMvB", "uMvDF", "uMvDB", "uA", "uInvAna", "uFall", "uUp")),
                    "cap" to Prog(FS_CAP_OES, listOf("uTex", "uTexM", "uOff"), EXT_OES3),
                    "enhPre" to Prog(FS_ENH_PRE, listOf("uTex", "uSize", "uDeblock", "uDeband", "uAnime", "uBlock", "uRad", "uSeed", "uFlipY")),
                    "enhUp" to Prog(FS_ENH_UP, listOf("uTex", "uSrc")),
                    "enhFin" to Prog(FS_ENH_FIN, listOf("uTex", "uBefore", "uCon", "uSplit")))
                dupTex = makeTex(8, 8, GLES20.GL_NEAREST, GLES30.GL_RGBA8)
            } catch (e: Throwable) { fail(e); return false }
            return true
        }

        fun free() {
            ring.forEach { s -> del(s.img); s.mv?.let { del(it) }; s.mvB?.let { del(it) }; s.mvD?.let { del(it) }; s.mvDB?.let { del(it) } }
            luma.forEach { del(it) }
            mvRaw?.let { del(it) }; mvRef?.let { del(it) }; out?.let { del(it) }
            enhMid?.let { del(it) }; enhPre?.let { del(it) }; enhUp?.let { del(it) }
            srNets.values.forEach { it.free(false) }
            enhMid = null; enhPre = null; enhUp = null
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
        fun boxChanged() { out?.let { del(it) }; out = null; enhUp?.let { del(it) }; enhUp = null; lastKey = "" }
        /** Only picture-enhance settings changed: keep the ring, redraw with the new passes. */
        fun enhanceChanged() { lastKey = ""; enhStale = true }
        fun setSr(id: String, spec: SrSpec) {
            if (srSpecs[id] === spec) return
            srSpecs[id] = spec
            srNets.remove(id)?.let { try { it.free(true) } catch (e: Throwable) {} }
            srBroken.remove(id)
            lastKey = ""; enhStale = true
        }

        // ---- resources ----
        /** [levels] > 1: a mip chain (read with texelFetch at a chosen level; filled by glGenerateMipmap). */
        private fun makeTex(w: Int, h: Int, filter: Int, fmt: Int, levels: Int = 1): Tex {
            val t = IntArray(1); GLES20.glGenTextures(1, t, 0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t[0])
            GLES30.glTexStorage2D(GLES20.GL_TEXTURE_2D, levels, fmt, w, h)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, if (levels > 1) GLES20.GL_NEAREST_MIPMAP_NEAREST else filter)
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
            val fmt = if (fine) vecFmt() else GLES30.GL_RGBA8
            val mv = makeTex(mw, mh, GLES20.GL_LINEAR, fmt)
            val mvB = if (fine) makeTex(mw, mh, GLES20.GL_LINEAR, fmt) else null
            val mvD = makeTex(mw, mh, GLES20.GL_NEAREST, fmt)
            val mvDB = if (fine) makeTex(mw, mh, GLES20.GL_NEAREST, fmt) else null
            return Slot(img, mv, mvB, mvD, mvDB)
        }

        private fun ensure(vw: Int, vh: Int) {
            val c = cfg
            val sm = smoothing(c); val mot = motion(c)
            val fps = min(120.0, 1.0 / max(period, 0.004))
            val need = ceil((min(max(c.delayMs.toDouble(), 0.0), 2000.0) / 1000.0 + (if (sm) 0.4 else 0.3)) * fps).toInt() + 4
            val wantN = max(12, ((need + 7) / 8) * 8)
            val q = quality(); val tier = TIERS[q]
            val key = (if (mot) (if (c.mode == "ultra") "u" else "m") else if (sm) "b" else "d") + q + ":" + vw + "x" + vh
            srcW = vw
            if (key == resKey && wantN <= ring.size) return
            free()
            // Not smoothing (picture delay / enhance only): keep the video's own size, up to the box's pixels, as the page does.
            val full = !sm && !fullOom
            val budget = (if (full) 400 else if (sm) tier.mb else max(tier.mb, 160)).toDouble() * 1048576.0
            var scale = if (full) min(1.0, max(max(outW, outH), 1280).toDouble() / max(vw, vh))
                        else min(1.0, (if (mot) tier.motionW else tier.simpleW).toDouble() / vw)
            scale = min(scale, sqrt(budget / (wantN.toDouble() * 4 * vw * vh)))
            ringW = max(64, ((vw * scale / 2).roundToInt()) * 2)
            ringH = max(36, ((vh * scale / 2).roundToInt()) * 2)
            anaW = 0; anaH = 0; gw = 0; gh = 0; fw = 0; fh = 0
            if (mot) {
                anaW = max(64, ((min(ringW, tier.ana) / 8.0).roundToInt()) * 8)
                anaH = max(24, ((anaW.toDouble() * ringH / ringW / 8.0).roundToInt()) * 8)
                gw = anaW / 8; gh = anaH / 8
                for (i in 0 until 2) luma.add(makeTex(anaW, anaH, GLES20.GL_NEAREST, GLES30.GL_RGBA8, 3))   // mip 2: the coarse search level
                mvRaw = makeTex(gw, gh, GLES20.GL_NEAREST, GLES30.GL_RGBA8)
                if (c.mode == "ultra") { fw = gw * 2; fh = gh * 2; mvRef = makeTex(fw, fh, GLES20.GL_NEAREST, vecFmt()) }
            }
            for (i in 0 until wantN) ring.add(makeSlot(mot))
            if (full && GLES20.glGetError() == GLES20.GL_OUT_OF_MEMORY) { free(); fullOom = true; return }   // tier size next time
            if (!full && GLES20.glGetError() == GLES20.GL_OUT_OF_MEMORY && q > 0) {   // drop one tier and rebuild on the next frame
                free(); qualityDrop++; status(force = true); return
            }
            resKey = key
        }

        /** Output texture: the processing size, or larger (up to the upscale cap and the box) when upscaling. */
        private fun ensureOut(): Tex? {
            if (ringW == 0) return null
            val capH = UP_CAPS[cfg.upscale.coerceIn(0, 3)].let { if (it == 0 && cfg.ai != "off") 2160 else it }   // an AI upscaler enlarges up to the box
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
                bind(0, luma[cur].tex); GLES30.glGenerateMipmap(GLES20.GL_TEXTURE_2D)
                if (prevLumaValid && !disc && cfg.mode != "ultra") {
                    // The previous unique frame's field seeds the search and steadies the track (not across a cut or gap).
                    val prior = if (pu != null && pu.hasMv && pu.mv != null && pu.seq == slot.prevSeq) pu.mv else null
                    meVec(luma[cur], luma[prev], slot.mv!!, mvRaw!!, prior, 1f, slot.mvD!!)
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

        /**
         * One motion field (same as the page's memcMeVec): ME (8px blocks, into mvRaw) -> [Ultra: REF to 4px blocks, into
         * mvRef] -> MED clean-up (into [out]) -> fast-object candidates (into [dil]). [la]/[lb]: luma of the frame the field
         * sits on / points into. [prior]: the previous unique frame's forward field or null; [sgn] +1 if this field points
         * the same way, -1 if the other way (the backward field), so it is negated when read.
         */
        private fun meVec(la: Tex, lb: Tex, out: Tex, medIn: Tex, prior: Tex?, sgn: Float, dil: Tex) {
            val P = progs!!
            val hp = if (prior != null) sgn else 0f
            target(mvRaw!!)
            val M = P.getValue("me"); M.use()
            bind(0, la.tex); bind(1, lb.tex); bind(2, prior?.tex ?: la.tex)
            M.i("uCur", 0); M.i("uPrev", 1); M.i("uPrior", 2); M.f("uHasPrior", hp)
            M.i2("uSize", anaW, anaH); M.f("uLambda", 0.0006f)
            tri()
            if (medIn === mvRef) {
                target(mvRef!!)
                val R = P.getValue("ref"); R.use()
                bind(0, la.tex); bind(1, lb.tex); bind(2, mvRaw!!.tex); bind(3, prior?.tex ?: mvRaw!!.tex)
                R.i("uCur", 0); R.i("uPrev", 1); R.i("uRaw", 2); R.i("uPrior", 3); R.f("uHasPrior", hp)
                R.i2("uSize", anaW, anaH); R.i2("uGrid", gw, gh)
                tri()
            }
            target(out)
            val D = P.getValue("med"); D.use()
            bind(0, medIn.tex); bind(1, la.tex); bind(2, lb.tex); bind(3, prior?.tex ?: medIn.tex)
            D.i("uRaw", 0); D.i("uCur", 1); D.i("uPrev", 2); D.i("uPrior", 3); D.f("uHasPrior", hp)
            D.i2("uGrid", out.w, out.h); D.i2("uSize", anaW, anaH)
            tri()
            bind(1, 0); bind(2, 0); bind(3, 0)
            target(dil)
            val X = P.getValue("dil"); X.use()
            bind(0, out.tex); X.i("uMv", 0); X.i2("uGrid", out.w, out.h); X.i2("uSize", anaW, anaH)
            tri()
        }

        /** Ultra: both fields. The previous unique frame's forward field seeds both (negated for the backward one). */
        private fun ultraMv(slot: Slot, cur: Int, prev: Int, pu: Slot?) {
            val prior = if (pu != null && pu.hasMv && pu.mv != null && pu.seq == slot.prevSeq) pu.mv else null
            meVec(luma[cur], luma[prev], slot.mv!!, mvRef!!, prior, 1f, slot.mvD!!)
            meVec(luma[prev], luma[cur], slot.mvB!!, mvRef!!, prior, -1f, slot.mvDB!!)
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
            if (!outValid || enhStale) return false
            drawEngineOut(o.tex, o.w, o.h)
            return true
        }

        private fun draw(o: Tex, f0: Slot, f1: Slot?, a: Float) {
            val P = progs!!
            val c = cfg
            enhStale = false
            // Picture enhance: the frame goes to a texture at the ring size first, then enhPasses draws it into [o].
            val mid = if (c.enhOn()) enhTex(enhMid, ringW, ringH).also { enhMid = it } else null
            target(mid ?: o)
            val up = if (mid == null && o.w > ringW) 1f else 0f
            if (f1 != null && a > 0f && motion(c) && anaW > 0 && f1.hasMv && f1.prevSeq == f0.seq && (c.mode != "ultra" || f1.mvB != null)) {
                val ultra = c.mode == "ultra"
                val M = P.getValue(if (ultra) "mc2" else "mc"); M.use()
                bind(0, f0.img.tex); bind(1, f1.img.tex); bind(2, f1.mv!!.tex)
                M.i("uF0", 0); M.i("uF1", 1)
                if (ultra) {
                    bind(3, f1.mvB!!.tex); bind(4, f1.mvD!!.tex); bind(5, f1.mvDB!!.tex)
                    M.i("uMvF", 2); M.i("uMvB", 3); M.i("uMvDF", 4); M.i("uMvDB", 5)
                } else { bind(3, f1.mvD!!.tex); M.i("uMv", 2); M.i("uMvD", 3) }
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
            if (mid != null) enhPasses(mid, o)
        }

        private fun enhTex(t: Tex?, w: Int, h: Int): Tex {
            if (t != null && t.w == w && t.h == h) return t
            t?.let { del(it) }
            return makeTex(w, h, GLES20.GL_LINEAR, GLES30.GL_RGBA8)
        }

        /** The page's memcEnhPasses: [clean-up / deband / anime] -> [edge-aware upscale] -> adaptive sharpening (+ split). */
        private fun enhPasses(mid: Tex, o: Tex) {
            val P = progs!!
            val c = cfg
            var src = mid
            if (c.deblock || c.deband || c.anime) {
                val pre = enhTex(enhPre, mid.w, mid.h).also { enhPre = it }
                target(pre)
                val R = P.getValue("enhPre"); R.use()
                bind(0, mid.tex); R.i("uTex", 0); R.f2("uSize", mid.w.toFloat(), mid.h.toFloat())
                R.f("uDeblock", if (c.deblock) 1f else 0f); R.f("uDeband", if (c.deband) 1f else 0f); R.f("uAnime", if (c.anime) 1f else 0f)
                R.f("uBlock", 8f * mid.w / max(1, if (srcW > 0) srcW else mid.w))
                R.f("uRad", max(2f, 8f * mid.h / 1080f))
                enhSeed = (enhSeed + 1) % 997; R.f("uSeed", enhSeed * 1.37f); R.f("uFlipY", 1f)
                tri()
                src = pre
            }
            // AI upscaler: 2x when the picture has to be enlarged and is small enough to keep up; the edge-aware pass
            // below then fits its result to the output size.
            if (c.ai != "off") {
                val spec = srSpecs[c.ai]
                srInfo = when {
                    !floatOk -> "Not available on this phone (no half-float rendering)."
                    c.ai in srBroken -> "Could not start this model on this phone."
                    spec == null -> "Loading\u2026"
                    o.w <= src.w * 1.15f && o.h <= src.h * 1.15f -> "Not needed: the picture is already as sharp as the screen."
                    src.w * src.h > SR_MAX_PX -> "Skipped: over 720p is too big to run live (standard upscaler used)."
                    else -> try {
                        val sp: SrSpec = spec!!
                        val r = srNets.getOrPut(c.ai) { SrNet(sp) }.run(src)
                        val info = sp.name + ": " + src.w + "\u00d7" + src.h + " \u2192 " + r.w + "\u00d7" + r.h
                        src = r; info
                    } catch (e: Throwable) {
                        Log.w(TAG, "AI upscaler failed", e)
                        srBroken.add(c.ai); srNets.remove(c.ai)?.let { try { it.free(true) } catch (x: Throwable) {} }
                        "Could not start this model on this phone."
                    }
                }
            } else srInfo = ""
            if (o.w != src.w || o.h != src.h) {
                val upT = enhTex(enhUp, o.w, o.h).also { enhUp = it }
                target(upT)
                val U = P.getValue("enhUp"); U.use()
                bind(0, src.tex); U.i("uTex", 0); U.f2("uSrc", src.w.toFloat(), src.h.toFloat())
                tri()
                src = upT
            }
            target(o)
            val F = P.getValue("enhFin"); F.use()
            bind(0, src.tex); bind(1, mid.tex); F.i("uTex", 0); F.i("uBefore", 1)
            F.f("uCon", c.sharp.coerceIn(0f, 1f)); F.f("uSplit", if (c.compare) c.split.coerceIn(0f, 1f) else -1f)
            tri()
        }

        /** One AI upscaler on this GL context: its programs, its feature textures (half floats) and the 2x picture. */
        private inner class SrNet(val spec: SrSpec) {
            private val progs = ArrayList<Int>()
            private val uSize = ArrayList<Int>()
            private val locs = ArrayList<IntArray>()
            private val fbos = IntArray(spec.passes.size)
            private var fin = 0
            private val finLoc = HashMap<String, Int>()
            private val tex = HashMap<String, IntArray>()
            private var w = 0; private var h = 0
            private var hr: Tex? = null

            init {
                val maxDb = IntArray(1); GLES20.glGetIntegerv(GLES30.GL_MAX_DRAW_BUFFERS, maxDb, 0)
                for (P in spec.passes) {
                    if (P.outs.size > maxDb[0]) throw RuntimeException("needs ${P.outs.size} render targets, this GPU has ${maxDb[0]}")
                    val p = link(MVS, P.src)
                    progs.add(p)
                    uSize.add(GLES20.glGetUniformLocation(p, "uSize"))
                    locs.add(IntArray(P.slots.size) { GLES20.glGetUniformLocation(p, "s$it") })
                }
                fin = link(MVS, spec.fin)
                for (n in listOf("s0", "s1", "s2", "sx", "uHr")) finLoc[n] = GLES20.glGetUniformLocation(fin, n)
            }

            fun free(all: Boolean) {
                for (t in tex.values) GLES20.glDeleteTextures(t.size, t, 0)
                tex.clear()
                if (fbos.any { it != 0 }) GLES20.glDeleteFramebuffers(fbos.size, fbos, 0)
                fbos.fill(0)
                hr?.let { del(it) }; hr = null; w = 0; h = 0
                if (all) {
                    for (p in progs) GLES20.glDeleteProgram(p)
                    progs.clear()
                    if (fin != 0) GLES20.glDeleteProgram(fin)
                    fin = 0
                }
            }

            private fun alloc(W: Int, H: Int) {
                if (W == w && H == h && hr != null) return
                free(false); w = W; h = H
                for ((name, c) in spec.chans) {
                    if (name == "x") continue
                    val t = IntArray(c / 4)
                    GLES20.glGenTextures(t.size, t, 0)
                    for (id in t) {
                        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
                        GLES30.glTexStorage2D(GLES20.GL_TEXTURE_2D, 1, GLES30.GL_RGBA16F, W, H)
                        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST)
                        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_NEAREST)
                        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
                        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
                    }
                    tex[name] = t
                }
                GLES20.glGenFramebuffers(fbos.size, fbos, 0)
                spec.passes.forEachIndexed { i, P ->
                    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbos[i])
                    val targets = tex.getValue(P.out)
                    P.outs.forEachIndexed { k, j ->
                        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0 + k, GLES20.GL_TEXTURE_2D, targets[j], 0)
                    }
                    GLES30.glDrawBuffers(P.outs.size, IntArray(P.outs.size) { GLES30.GL_COLOR_ATTACHMENT0 + it }, 0)
                }
                hr = makeTex(W * 2, H * 2, GLES20.GL_LINEAR, GLES30.GL_RGBA8)
            }

            fun run(src: Tex): Tex {
                alloc(src.w, src.h)
                GLES20.glViewport(0, 0, src.w, src.h)
                spec.passes.forEachIndexed { i, P ->
                    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbos[i])
                    GLES20.glUseProgram(progs[i])
                    GLES30.glUniform2i(uSize[i], src.w, src.h)
                    P.slots.forEachIndexed { k, slot ->
                        bind(k, if (slot.first == "x") src.tex else tex.getValue(slot.first)[slot.second])
                        GLES20.glUniform1i(locs[i][k], k)
                    }
                    tri()
                }
                val o = hr!!
                target(o)
                GLES20.glUseProgram(fin)
                val f = tex.getValue(spec.final)
                if (spec.kind == "rgb") {
                    for (k in 0..2) { bind(k, f[k]); GLES20.glUniform1i(finLoc.getValue("s$k"), k) }
                } else {
                    bind(0, f[0]); GLES20.glUniform1i(finLoc.getValue("s0"), 0)
                    bind(1, src.tex); GLES20.glUniform1i(finLoc.getValue("sx"), 1)
                    GLES20.glUniform2f(finLoc.getValue("uHr"), o.w.toFloat(), o.h.toFloat())
                }
                tri()
                return o
            }
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
                "extraMs" to (extraSec * 1000).roundToInt(), "qualityDrop" to qualityDrop, "ring" to "${ringW}x${ringH}", "ai" to srInfo)
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

        // ---- picture enhance (GLSL ES 3.00): the page's shaders (index.html, "Picture enhance"), unchanged ----
        private const val FS_ENH_PRE = "uniform sampler2D uTex; uniform vec2 uSize; uniform float uDeblock; uniform float uDeband; uniform float uAnime; uniform float uBlock; uniform float uRad; uniform float uSeed; uniform float uFlipY;\n" +
            "float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }\n" +
            "vec3 tx(vec2 p){ return texture(uTex, p / uSize).rgb; }\n" +
            "float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }\n" +
            "vec3 deblockAxis(vec3 c, vec2 p, float fq, vec2 ax){\n" +
            "  float dl = fq, dr = uBlock - fq;\n" +
            "  float k = floor(min(dl, dr));\n" +
            "  if (k > 1.0) return c;\n" +
            "  vec2 s = dl < dr ? -ax : ax;\n" +
            "  vec3 A = tx(p + s * k), B = tx(p + s * (k + 1.0));\n" +
            "  vec3 A2 = tx(p + s * (k - 1.0)), B2 = tx(p + s * (k + 2.0));\n" +
            "  float step0 = abs(lum(B) - lum(A));\n" +
            "  if (step0 > 0.09 || abs(lum(A2) - lum(A)) > 0.03 || abs(lum(B2) - lum(B)) > 0.03) return c;\n" +
            "  return c + (B - A) * (k < 0.5 ? 0.375 : 0.125);\n" +
            "}\n" +
            "void main(){\n" +
            "  vec2 p = vUv * uSize;\n" +
            "  vec3 c = tx(p);\n" +
            "  if (uDeblock > 0.5){\n" +
            "    if (uBlock >= 4.0){\n" +
            "      float ty = uFlipY > 0.5 ? uSize.y - p.y : p.y;\n" +
            "      c = deblockAxis(c, p, mod(p.x, uBlock), vec2(1.0, 0.0));\n" +
            "      c = deblockAxis(c, p, mod(ty, uBlock), vec2(0.0, uFlipY > 0.5 ? -1.0 : 1.0));\n" +
            "    }\n" +
            "    vec3 acc = vec3(0.0); float ws = 0.0; float l0 = lum(c);\n" +
            "    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n" +
            "      vec3 s = (i == 0 && j == 0) ? c : tx(p + vec2(float(i), float(j)));\n" +
            "      float d = lum(s) - l0;\n" +
            "      float w = exp(-d * d * 900.0) * ((i == 0 || j == 0) ? 1.0 : 0.6);\n" +
            "      acc += s * w; ws += w;\n" +
            "    } }\n" +
            "    c = mix(c, acc / ws, 0.5);\n" +
            "  }\n" +
            "  if (uDeband > 0.5){\n" +
            "    vec3 a = c;\n" +
            "    for (int it = 1; it <= 2; it++){\n" +
            "      float fi = float(it);\n" +
            "      float r = uRad * fi * (0.5 + hash(p + fi * 17.0));\n" +
            "      float an = hash(p * 1.7 + fi * 31.0) * 6.2831853;\n" +
            "      vec2 o = vec2(cos(an), sin(an)) * r;\n" +
            "      vec3 s1 = tx(p + o), s2 = tx(p - o), s3 = tx(p + vec2(-o.y, o.x)), s4 = tx(p + vec2(o.y, -o.x));\n" +
            "      vec3 av = (s1 + s2 + s3 + s4) * 0.25;\n" +
            "      vec3 df = max(max(abs(s1 - a), abs(s2 - a)), max(abs(s3 - a), abs(s4 - a)));\n" +
            "      a = mix(av, a, step(vec3(0.011 / fi), df));\n" +
            "    }\n" +
            "    c = a + (hash(p + uSeed) - hash(p.yx + uSeed + 7.0)) * (1.0 / 255.0);\n" +
            "  }\n" +
            "  if (uAnime > 0.5){\n" +
            "    float t00 = lum(tx(p + vec2(-1.0, -1.0))), t10 = lum(tx(p + vec2(0.0, -1.0))), t20 = lum(tx(p + vec2(1.0, -1.0)));\n" +
            "    float t01 = lum(tx(p + vec2(-1.0, 0.0))), t11 = lum(tx(p)), t21 = lum(tx(p + vec2(1.0, 0.0)));\n" +
            "    float t02 = lum(tx(p + vec2(-1.0, 1.0))), t12 = lum(tx(p + vec2(0.0, 1.0))), t22 = lum(tx(p + vec2(1.0, 1.0)));\n" +
            "    vec2 g = vec2(t20 + 2.0 * t21 + t22 - t00 - 2.0 * t01 - t02, t02 + 2.0 * t12 + t22 - t00 - 2.0 * t10 - t20);\n" +
            "    float m = length(g);\n" +
            "    float e = smoothstep(0.1, 0.45, m);\n" +
            "    float mean = (t00 + t10 + t20 + t01 + t11 + t21 + t02 + t12 + t22) * (1.0 / 9.0);\n" +
            "    c -= vec3(max(0.0, mean - t11) * 1.2 * e);\n" +
            "  }\n" +
            "  oc = vec4(clamp(c, 0.0, 1.0), 1.0);\n" +
            "}\n"

        private const val FS_ENH_UP = "uniform sampler2D uTex; uniform vec2 uSrc;\n" +
            "void main(){\n" +
            "  vec2 pos = vUv * uSrc - 0.5;\n" +
            "  vec2 fp = floor(pos); vec2 f = pos - fp;\n" +
            "  ivec2 ip = ivec2(fp); ivec2 mx = ivec2(uSrc) - 1;\n" +
            "  vec3 c[16]; float l[16];\n" +
            "  for (int j = 0; j < 4; j++){ for (int i = 0; i < 4; i++){\n" +
            "    vec3 s = texelFetch(uTex, clamp(ip + ivec2(i - 1, j - 1), ivec2(0), mx), 0).rgb;\n" +
            "    c[j * 4 + i] = s; l[j * 4 + i] = dot(s, vec3(0.299, 0.587, 0.114));\n" +
            "  } }\n" +
            "  float sxx = 0.0, syy = 0.0, sxy = 0.0;\n" +
            "  for (int j = 1; j <= 2; j++){ for (int i = 1; i <= 2; i++){\n" +
            "    float w = (i == 1 ? 1.0 - f.x : f.x) * (j == 1 ? 1.0 - f.y : f.y);\n" +
            "    float gx = l[j * 4 + i + 1] - l[j * 4 + i - 1];\n" +
            "    float gy = l[(j + 1) * 4 + i] - l[(j - 1) * 4 + i];\n" +
            "    sxx += w * gx * gx; syy += w * gy * gy; sxy += w * gx * gy;\n" +
            "  } }\n" +
            "  float tr = sxx + syy;\n" +
            "  float dd = sqrt((sxx - syy) * (sxx - syy) + 4.0 * sxy * sxy);\n" +
            "  float l1 = 0.5 * (tr + dd), l2 = 0.5 * (tr - dd);\n" +
            "  vec2 v = vec2(l1 - syy, sxy);\n" +
            "  float vl = length(v);\n" +
            "  vec2 dir = vl > 1e-8 ? v / vl : vec2(1.0, 0.0);\n" +
            "  float len = tr > 1e-7 ? (l1 - l2) / (l1 + l2) : 0.0;\n" +
            "  len *= smoothstep(0.0002, 0.003, tr);\n" +
            "  float stretch = 1.0 / max(abs(dir.x), abs(dir.y));\n" +
            "  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);\n" +
            "  float lob = 0.5 + ((0.25 - 0.04) - 0.5) * len;\n" +
            "  float clp = 1.0 / lob;\n" +
            "  vec3 acc = vec3(0.0); float ws = 0.0;\n" +
            "  for (int j = 0; j < 4; j++){ for (int i = 0; i < 4; i++){\n" +
            "    vec2 d = vec2(float(i - 1), float(j - 1)) - f;\n" +
            "    vec2 r = vec2(dot(d, dir), dot(d, vec2(-dir.y, dir.x))) * len2;\n" +
            "    float x2 = min(dot(r, r), clp);\n" +
            "    float wB = 0.4 * x2 - 1.0; float wA = lob * x2 - 1.0;\n" +
            "    float w = (1.5625 * wB * wB - 0.5625) * (wA * wA);\n" +
            "    acc += c[j * 4 + i] * w; ws += w;\n" +
            "  } }\n" +
            "  vec3 o = acc / ws;\n" +
            "  vec3 mn = min(min(c[5], c[6]), min(c[9], c[10]));\n" +
            "  vec3 mxv = max(max(c[5], c[6]), max(c[9], c[10]));\n" +
            "  oc = vec4(clamp(o, mn, mxv), 1.0);\n" +
            "}\n"

        private const val FS_ENH_FIN = "uniform sampler2D uTex; uniform sampler2D uBefore; uniform float uCon; uniform float uSplit;\n" +
            "void main(){\n" +
            "  ivec2 q = ivec2(gl_FragCoord.xy); ivec2 mx = textureSize(uTex, 0) - 1;\n" +
            "  vec3 e = texelFetch(uTex, clamp(q, ivec2(0), mx), 0).rgb;\n" +
            "  vec3 o = e;\n" +
            "  if (uCon > 0.0){\n" +
            "    vec3 b = texelFetch(uTex, clamp(q + ivec2(0, -1), ivec2(0), mx), 0).rgb;\n" +
            "    vec3 d = texelFetch(uTex, clamp(q + ivec2(-1, 0), ivec2(0), mx), 0).rgb;\n" +
            "    vec3 f = texelFetch(uTex, clamp(q + ivec2(1, 0), ivec2(0), mx), 0).rgb;\n" +
            "    vec3 h = texelFetch(uTex, clamp(q + ivec2(0, 1), ivec2(0), mx), 0).rgb;\n" +
            "    vec3 mn4 = min(min(b, d), min(f, h)); vec3 mx4 = max(max(b, d), max(f, h));\n" +
            "    vec3 hitMin = min(mn4, e) / (4.0 * mx4 + 1e-4);\n" +
            "    vec3 hitMax = (1.0 - max(mx4, e)) / (4.0 * min(mn4, e) - 4.0 - 1e-4);\n" +
            "    vec3 lr = max(-hitMin, hitMax);\n" +
            "    float lobe = max(-0.1875, min(max(lr.r, max(lr.g, lr.b)), 0.0)) * uCon;\n" +
            "    vec3 W = vec3(0.299, 0.587, 0.114);\n" +
            "    float bL = dot(b, W), dL = dot(d, W), eL = dot(e, W), fL = dot(f, W), hL = dot(h, W);\n" +
            "    float nz = 0.25 * (bL + dL + fL + hL) - eL;\n" +
            "    float rng = max(max(max(bL, dL), max(eL, fL)), hL) - min(min(min(bL, dL), min(eL, fL)), hL);\n" +
            "    nz = clamp(abs(nz) / max(rng, 1e-4), 0.0, 1.0);\n" +
            "    lobe *= 1.0 - 0.5 * nz;\n" +
            "    o = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);\n" +
            "  }\n" +
            "  if (uSplit >= 0.0){\n" +
            "    vec2 uv = (vec2(q) + 0.5) / vec2(mx + 1);\n" +
            "    if (uv.x < uSplit) o = texture(uBefore, uv).rgb;\n" +
            "  }\n" +
            "  oc = vec4(clamp(o, 0.0, 1.0), 1.0);\n" +
            "}\n"

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
            "uniform sampler2D uPrior; uniform float uHasPrior;\n" +
            "const float MVR = 128.0;\n" +
            "vec2 mvDec(vec2 e){ vec2 s = e * 2.0 - 1.0; return s * abs(s) * MVR; }\n" +
            "vec4 mvEnc(vec2 v, float conf){ vec2 s = clamp(v / MVR, -1.0, 1.0); return vec4(0.5 + 0.5 * sign(s) * sqrt(abs(s)), conf, 1.0); }\n" +
            "float lc(ivec2 p){ return texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r; }\n" +
            "float lp(ivec2 p){ return texelFetch(uPrev, clamp(p, ivec2(0), uSize - 1), 0).r; }\n" +
            "vec2 priorAt(ivec2 p){\n" +
            "  ivec2 n = textureSize(uPrior, 0);\n" +
            "  ivec2 q = clamp((p * n) / uSize, ivec2(0), n - 1);\n" +
            "  return mvDec(texelFetch(uPrior, q, 0).rg) * uHasPrior;\n" +
            "}\n" +
            "float sadW(ivec2 c, ivec2 d, int st){\n" +
            "  float s = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c + ivec2(i, j) * st;\n" +
            "    s += abs(lc(p) - lp(p + d));\n" +
            "  } }\n" +
            "  return s * (1.0 / 64.0);\n" +
            "}\n" +
            "vec2 zeroAct(ivec2 c, int st){\n" +
            "  float s = 0.0, g = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c + ivec2(i, j) * st;\n" +
            "    float a = lc(p);\n" +
            "    s += abs(a - lp(p));\n" +
            "    g += abs(a - lc(p + ivec2(1, 0))) + abs(a - lc(p + ivec2(0, 1)));\n" +
            "  } }\n" +
            "  return vec2(s * (1.0 / 64.0), g * (1.0 / 128.0));\n" +
            "}\n" +
            "float zbias(vec2 za){ return min(0.35 * za.x, 0.004 + 0.15 * za.y); }\n" +
            "float trust(float sb, vec2 za, bool moving){\n" +
            "  float r = sb / (0.006 + 0.5 * za.y);\n" +
            "  float m = 1.0 - smoothstep(1.2, 2.8, r);\n" +
            "  float g = moving ? smoothstep(0.05, 0.4, (za.x - sb) / (za.x + 0.002)) * (1.0 - smoothstep(2.5, 5.0, r)) : 0.0;\n" +
            "  return max(m, g);\n" +
            "}\n" +
            "float lenPen(vec2 d){ return 0.0006 * min(length(d), 8.0); }\n" +
            "void tryV(ivec2 c, ivec2 d, float zb, inout ivec2 best, inout float bestCost, inout float bestSad){\n" +
            "  float s = sadW(c, d, 2);\n" +
            "  float cost = s + (d == ivec2(0) ? 0.0 : zb) + uLambda * min(length(vec2(d)), 8.0);\n" +
            "  if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n" +
            "}\n" +
            "float sad2(ivec2 c2, ivec2 d2){\n" +
            "  ivec2 n2 = uSize >> 2;\n" +
            "  float s = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c2 + ivec2(i, j);\n" +
            "    s += abs(texelFetch(uCur, clamp(p, ivec2(0), n2 - 1), 2).r - texelFetch(uPrev, clamp(p + d2, ivec2(0), n2 - 1), 2).r);\n" +
            "  } }\n" +
            "  return s * (1.0 / 64.0);\n" +
            "}\n" +
            "void main(){\n" +
            "  ivec2 c = ivec2(gl_FragCoord.xy) * 8 + 4;\n" +
            "  vec2 za = zeroAct(c, 2);\n" +
            "  float zb = zbias(za);\n" +
            "  ivec2 best = ivec2(0); float bestCost = za.x; float bestSad = za.x;\n" +
            "  if (uHasPrior != 0.0){\n" +
            "    ivec2 v = ivec2(round(priorAt(c)));\n" +
            "    tryV(c, v, zb, best, bestCost, bestSad);\n" +
            "    if (uHasPrior > 0.0) tryV(c, ivec2(round(priorAt(c + v))), zb, best, bestCost, bestSad);\n" +
            "    tryV(c, ivec2(round(priorAt(c + ivec2(16, 0)))), zb, best, bestCost, bestSad);\n" +
            "    tryV(c, ivec2(round(priorAt(c - ivec2(16, 0)))), zb, best, bestCost, bestSad);\n" +
            "    tryV(c, ivec2(round(priorAt(c + ivec2(0, 16)))), zb, best, bestCost, bestSad);\n" +
            "    tryV(c, ivec2(round(priorAt(c - ivec2(0, 16)))), zb, best, bestCost, bestSad);\n" +
            "  }\n" +
            "  int stp;\n" +
            "  if (bestSad > 0.4 * (0.006 + 0.5 * za.y)){\n" +
            "    ivec2 c2 = c >> 2; ivec2 cb = ivec2(0); float cc = sad2(c2, cb);\n" +
            "    for (int j = -5; j <= 5; j++){ for (int i = -5; i <= 5; i++){\n" +
            "      if (i == 0 && j == 0) continue;\n" +
            "      ivec2 d = ivec2(i, j) * 5;\n" +
            "      float s = sad2(c2, d) + 0.0015 + uLambda * min(4.0 * length(vec2(d)), 8.0);\n" +
            "      if (s < cc){ cc = s; cb = d; }\n" +
            "    } }\n" +
            "    stp = 2;\n" +
            "    for (int l = 0; l < 2; l++){\n" +
            "      ivec2 ctr = cb;\n" +
            "      for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n" +
            "        if (i == 0 && j == 0) continue;\n" +
            "        ivec2 d = ctr + ivec2(i, j) * stp;\n" +
            "        float s = sad2(c2, d) + 0.0015 + uLambda * min(4.0 * length(vec2(d)), 8.0);\n" +
            "        if (s < cc){ cc = s; cb = d; }\n" +
            "      } }\n" +
            "      stp = stp / 2;\n" +
            "    }\n" +
            "    tryV(c, cb * 4, zb, best, bestCost, bestSad);\n" +
            "  }\n" +
            "  stp = 4;\n" +
            "  for (int l = 0; l < 3; l++){\n" +
            "    ivec2 ctr = best;\n" +
            "    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n" +
            "      if (i == 0 && j == 0) continue;\n" +
            "      tryV(c, ctr + ivec2(i, j) * stp, zb, best, bestCost, bestSad);\n" +
            "    } }\n" +
            "    stp = stp / 2;\n" +
            "  }\n" +
            "  vec2 sub = vec2(0.0);\n" +
            "  bool moving = best != ivec2(0);\n" +
            "  if (moving){\n" +
            "    float xm = sadW(c, best + ivec2(-1, 0), 2); float xp = sadW(c, best + ivec2(1, 0), 2);\n" +
            "    float ym = sadW(c, best + ivec2(0, -1), 2); float yp = sadW(c, best + ivec2(0, 1), 2);\n" +
            "    float dx = xm - 2.0 * bestSad + xp; float dy = ym - 2.0 * bestSad + yp;\n" +
            "    if (dx > 1e-5) sub.x = clamp(0.5 * (xm - xp) / dx, -0.5, 0.5);\n" +
            "    if (dy > 1e-5) sub.y = clamp(0.5 * (ym - yp) / dy, -0.5, 0.5);\n" +
            "  }\n" +
            "  float cf = trust(bestSad, za, moving) * (0.25 + 0.75 * smoothstep(0.004, 0.03, za.y));\n" +
            "  oc = mvEnc(vec2(best) + sub, cf);\n" +
            "}\n"

        private const val FS_MED = "uniform sampler2D uRaw; uniform ivec2 uGrid;\n" +
            "uniform sampler2D uCur; uniform sampler2D uPrev; uniform ivec2 uSize; uniform sampler2D uPrior; uniform float uHasPrior;\n" +
            "const float MVR = 128.0;\n" +
            "vec2 mvDec(vec2 e){ vec2 s = e * 2.0 - 1.0; return s * abs(s) * MVR; }\n" +
            "vec4 mvEnc(vec2 v, float conf){ vec2 s = clamp(v / MVR, -1.0, 1.0); return vec4(0.5 + 0.5 * sign(s) * sqrt(abs(s)), conf, 1.0); }\n" +
            "float lc(ivec2 p){ return texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r; }\n" +
            "float lp(ivec2 p){ return texelFetch(uPrev, clamp(p, ivec2(0), uSize - 1), 0).r; }\n" +
            "vec2 priorAt(ivec2 p){\n" +
            "  ivec2 n = textureSize(uPrior, 0);\n" +
            "  ivec2 q = clamp((p * n) / uSize, ivec2(0), n - 1);\n" +
            "  return mvDec(texelFetch(uPrior, q, 0).rg) * uHasPrior;\n" +
            "}\n" +
            "float sadW(ivec2 c, ivec2 d, int st){\n" +
            "  float s = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c + ivec2(i, j) * st;\n" +
            "    s += abs(lc(p) - lp(p + d));\n" +
            "  } }\n" +
            "  return s * (1.0 / 64.0);\n" +
            "}\n" +
            "vec2 zeroAct(ivec2 c, int st){\n" +
            "  float s = 0.0, g = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c + ivec2(i, j) * st;\n" +
            "    float a = lc(p);\n" +
            "    s += abs(a - lp(p));\n" +
            "    g += abs(a - lc(p + ivec2(1, 0))) + abs(a - lc(p + ivec2(0, 1)));\n" +
            "  } }\n" +
            "  return vec2(s * (1.0 / 64.0), g * (1.0 / 128.0));\n" +
            "}\n" +
            "float zbias(vec2 za){ return min(0.35 * za.x, 0.004 + 0.15 * za.y); }\n" +
            "float trust(float sb, vec2 za, bool moving){\n" +
            "  float r = sb / (0.006 + 0.5 * za.y);\n" +
            "  float m = 1.0 - smoothstep(1.2, 2.8, r);\n" +
            "  float g = moving ? smoothstep(0.05, 0.4, (za.x - sb) / (za.x + 0.002)) * (1.0 - smoothstep(2.5, 5.0, r)) : 0.0;\n" +
            "  return max(m, g);\n" +
            "}\n" +
            "float lenPen(vec2 d){ return 0.0006 * min(length(d), 8.0); }\n" +
            "void main(){\n" +
            "  ivec2 g = ivec2(gl_FragCoord.xy);\n" +
            "  int bs = uSize.x / uGrid.x; int st = max(bs / 4, 1);\n" +
            "  ivec2 c = g * bs + bs / 2;\n" +
            "  vec2 v[9]; float w[9];\n" +
            "  for (int j = 0; j < 3; j++){ for (int i = 0; i < 3; i++){\n" +
            "    vec4 t = texelFetch(uRaw, clamp(g + ivec2(i - 1, j - 1), ivec2(0), uGrid - 1), 0);\n" +
            "    v[j * 3 + i] = mvDec(t.rg); w[j * 3 + i] = 0.1 + t.b;\n" +
            "  } }\n" +
            "  vec2 za = zeroAct(c, st);\n" +
            "  float zb = zbias(za);\n" +
            "  float lam = 0.003 + 0.2 * za.y;\n" +
            "  float tex = smoothstep(0.004, 0.03, za.y);\n" +
            "  bool hp = uHasPrior != 0.0;\n" +
            "  vec2 pv = hp ? priorAt(uHasPrior > 0.0 ? c + ivec2(round(v[4])) : c) : vec2(0.0);\n" +
            "  vec2 bestV = vec2(0.0); float bestCost = 1e9; float bestSad = za.x;\n" +
            "  for (int k = 0; k < 11; k++){\n" +
            "    if (k == 10 && !hp) continue;\n" +
            "    vec2 cand = k < 9 ? v[k] : (k == 9 ? vec2(0.0) : pv);\n" +
            "    ivec2 d = ivec2(round(cand));\n" +
            "    bool z = d == ivec2(0);\n" +
            "    float s = z ? za.x : sadW(c, d, st);\n" +
            "    float sm = 0.0, ws = 0.0;\n" +
            "    for (int n = 0; n < 9; n++){ if (n == 4) continue; sm += w[n] * min(length(cand - v[n]), 6.0); ws += w[n]; }\n" +
            "    float tp = hp ? 0.25 * min(length(cand - pv), 6.0) : 0.0;\n" +
            "    float cost = s + (z ? 0.0 : zb) + lam * (0.5 * sm / ws + tp) + tex * (lenPen(cand) + (k == 4 ? 0.0 : 0.0005));\n" +
            "    if (cost < bestCost){ bestCost = cost; bestV = cand; bestSad = s; }\n" +
            "  }\n" +
            "  if (hp && length(bestV - pv) < 1.0) bestV = mix(bestV, pv, 0.3);\n" +
            "  oc = mvEnc(bestV, trust(bestSad, za, length(bestV) >= 0.5));\n" +
            "}\n"

        private const val FS_DIL = "uniform sampler2D uMv; uniform ivec2 uGrid; uniform ivec2 uSize;\n" +
            "const float MVR = 128.0;\n" +
            "vec2 mvDec(vec2 e){ vec2 s = e * 2.0 - 1.0; return s * abs(s) * MVR; }\n" +
            "vec4 mvEnc(vec2 v, float conf){ vec2 s = clamp(v / MVR, -1.0, 1.0); return vec4(0.5 + 0.5 * sign(s) * sqrt(abs(s)), conf, 1.0); }\n" +
            "void main(){\n" +
            "  ivec2 g = ivec2(gl_FragCoord.xy);\n" +
            "  int bs = uSize.x / uGrid.x; int st = max(8 / bs, 1);\n" +
            "  vec2 p = (vec2(g) + 0.5) * float(bs);\n" +
            "  float reach = 0.75 * float(bs * st) + float(bs);\n" +
            "  vec2 best = vec2(0.0); float bm = 3.0; float btr = 0.0;\n" +
            "  for (int j = -16; j <= 16; j++){ for (int i = -16; i <= 16; i++){\n" +
            "    ivec2 q = g + ivec2(i, j) * st;\n" +
            "    if (q.x < 0 || q.y < 0 || q.x >= uGrid.x || q.y >= uGrid.y) continue;\n" +
            "    vec4 t = texelFetch(uMv, q, 0);\n" +
            "    vec2 v = mvDec(t.rg); float L = length(v);\n" +
            "    if (L <= bm || t.b < 0.5) continue;\n" +
            "    vec2 o = p - (vec2(q) + 0.5) * float(bs);\n" +
            "    float h = clamp(dot(o, v) / (L * L), 0.0, 1.0);\n" +
            "    if (length(o - v * h) > reach) continue;\n" +
            "    float tl = 0.2 * L + 1.0; int sup = 0;\n" +
            "    for (int n = 0; n < 9; n++){\n" +
            "      if (n == 4) continue;\n" +
            "      ivec2 o2 = ivec2(n % 3 - 1, n / 3 - 1);\n" +
            "      if (length(mvDec(texelFetch(uMv, clamp(q + o2, ivec2(0), uGrid - 1), 0).rg) - v) < tl) sup++;\n" +
            "    }\n" +
            "    if (sup < 2) continue;\n" +
            "    bm = L; best = v; btr = t.b;\n" +
            "  } }\n" +
            "  oc = mvEnc(best, btr);\n" +
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
            "const float MVR = 128.0;\n" +
            "vec2 mvDec(vec2 e){ vec2 s = e * 2.0 - 1.0; return s * abs(s) * MVR; }\n" +
            "vec4 mvEnc(vec2 v, float conf){ vec2 s = clamp(v / MVR, -1.0, 1.0); return vec4(0.5 + 0.5 * sign(s) * sqrt(abs(s)), conf, 1.0); }\n" +
            "float lc(ivec2 p){ return texelFetch(uCur, clamp(p, ivec2(0), uSize - 1), 0).r; }\n" +
            "float lp(ivec2 p){ return texelFetch(uPrev, clamp(p, ivec2(0), uSize - 1), 0).r; }\n" +
            "vec2 priorAt(ivec2 p){\n" +
            "  ivec2 n = textureSize(uPrior, 0);\n" +
            "  ivec2 q = clamp((p * n) / uSize, ivec2(0), n - 1);\n" +
            "  return mvDec(texelFetch(uPrior, q, 0).rg) * uHasPrior;\n" +
            "}\n" +
            "float sadW(ivec2 c, ivec2 d, int st){\n" +
            "  float s = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c + ivec2(i, j) * st;\n" +
            "    s += abs(lc(p) - lp(p + d));\n" +
            "  } }\n" +
            "  return s * (1.0 / 64.0);\n" +
            "}\n" +
            "vec2 zeroAct(ivec2 c, int st){\n" +
            "  float s = 0.0, g = 0.0;\n" +
            "  for (int j = -4; j < 4; j++){ for (int i = -4; i < 4; i++){\n" +
            "    ivec2 p = c + ivec2(i, j) * st;\n" +
            "    float a = lc(p);\n" +
            "    s += abs(a - lp(p));\n" +
            "    g += abs(a - lc(p + ivec2(1, 0))) + abs(a - lc(p + ivec2(0, 1)));\n" +
            "  } }\n" +
            "  return vec2(s * (1.0 / 64.0), g * (1.0 / 128.0));\n" +
            "}\n" +
            "float zbias(vec2 za){ return min(0.35 * za.x, 0.004 + 0.15 * za.y); }\n" +
            "float trust(float sb, vec2 za, bool moving){\n" +
            "  float r = sb / (0.006 + 0.5 * za.y);\n" +
            "  float m = 1.0 - smoothstep(1.2, 2.8, r);\n" +
            "  float g = moving ? smoothstep(0.05, 0.4, (za.x - sb) / (za.x + 0.002)) * (1.0 - smoothstep(2.5, 5.0, r)) : 0.0;\n" +
            "  return max(m, g);\n" +
            "}\n" +
            "float lenPen(vec2 d){ return 0.0006 * min(length(d), 8.0); }\n" +
            "void tryV(ivec2 c, ivec2 d, float zb, float extra, inout ivec2 best, inout float bestCost, inout float bestSad){\n" +
            "  float s = sadW(c, d, 1);\n" +
            "  float cost = s + (d == ivec2(0) ? 0.0 : zb) + lenPen(vec2(d)) + extra;\n" +
            "  if (cost < bestCost){ bestCost = cost; best = d; bestSad = s; }\n" +
            "}\n" +
            "void main(){\n" +
            "  ivec2 f = ivec2(gl_FragCoord.xy);\n" +
            "  ivec2 c = f * 4 + 2;\n" +
            "  ivec2 par = f / 2;\n" +
            "  vec2 za = zeroAct(c, 1);\n" +
            "  float zb = zbias(za);\n" +
            "  ivec2 best = ivec2(0); float bestCost = za.x; float bestSad = za.x;\n" +
            "  for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n" +
            "    vec4 t = texelFetch(uRaw, clamp(par + ivec2(i, j), ivec2(0), uGrid - 1), 0);\n" +
            "    tryV(c, ivec2(round(mvDec(t.rg))), zb, (i != 0 || j != 0) ? 0.002 : 0.0, best, bestCost, bestSad);\n" +
            "  } }\n" +
            "  if (uHasPrior != 0.0){\n" +
            "    ivec2 v = ivec2(round(priorAt(c)));\n" +
            "    tryV(c, v, zb, 0.0, best, bestCost, bestSad);\n" +
            "    if (uHasPrior > 0.0) tryV(c, ivec2(round(priorAt(c + v))), zb, 0.0, best, bestCost, bestSad);\n" +
            "  }\n" +
            "  for (int l = 0; l < 2; l++){\n" +
            "    ivec2 ctr = best;\n" +
            "    for (int j = -1; j <= 1; j++){ for (int i = -1; i <= 1; i++){\n" +
            "      if (i == 0 && j == 0) continue;\n" +
            "      tryV(c, ctr + ivec2(i, j), zb, 0.0, best, bestCost, bestSad);\n" +
            "    } }\n" +
            "  }\n" +
            "  vec2 sub = vec2(0.0);\n" +
            "  bool moving = best != ivec2(0);\n" +
            "  if (moving){\n" +
            "    float xm = sadW(c, best + ivec2(-1, 0), 1); float xp = sadW(c, best + ivec2(1, 0), 1);\n" +
            "    float ym = sadW(c, best + ivec2(0, -1), 1); float yp = sadW(c, best + ivec2(0, 1), 1);\n" +
            "    float dx = xm - 2.0 * bestSad + xp; float dy = ym - 2.0 * bestSad + yp;\n" +
            "    if (dx > 1e-5) sub.x = clamp(0.5 * (xm - xp) / dx, -0.5, 0.5);\n" +
            "    if (dy > 1e-5) sub.y = clamp(0.5 * (ym - yp) / dy, -0.5, 0.5);\n" +
            "  }\n" +
            "  float cf = trust(bestSad, za, moving) * (0.25 + 0.75 * smoothstep(0.004, 0.03, za.y));\n" +
            "  oc = mvEnc(vec2(best) + sub, cf);\n" +
            "}\n"

        private const val FS_BLEND = SAMP + "uniform sampler2D uF0; uniform sampler2D uF1; uniform float uA;\n" +
            "void main(){ oc = vec4(mix(samp(uF0, vUv), samp(uF1, vUv), uA), 1.0); }\n"

        private const val FS_MC = SAMP + "const float MVR = 128.0;\n" +
            "vec2 mvDec(vec2 e){ vec2 s = e * 2.0 - 1.0; return s * abs(s) * MVR; }\n" +
            "vec4 mvEnc(vec2 v, float conf){ vec2 s = clamp(v / MVR, -1.0, 1.0); return vec4(0.5 + 0.5 * sign(s) * sqrt(abs(s)), conf, 1.0); }\n" +
            "vec2 dec(sampler2D t, vec2 uv){ return mvDec(texture(t, clamp(uv, 0.0, 1.0)).rg); }\n" +
            "float near(vec2 a, vec2 b, float tol){ float t = tol * (1.0 + 0.05 * length(a)); return 1.0 - smoothstep(t, 3.0 * t, length(a - b)); }\n" +
            "vec3 fallback(vec3 s0, vec3 s1, float a, float h0, float h1){\n" +
            "  float t = a * a * (3.0 - 2.0 * a);\n" +
            "  float w0 = (1.0 - t) * (1.0 - h0) + 1e-3, w1 = t * (1.0 - h1) + 1e-3;\n" +
            "  return (w0 * s0 + w1 * s1) / (w0 + w1);\n" +
            "}\n" +
            "vec2 track(sampler2D mv, sampler2D dil, vec2 uv, vec2 inv, float back, int iters){\n" +
            "  vec2 d = dec(mv, uv);\n" +
            "  for (int i = 0; i < iters; i++) d = dec(mv, uv - d * inv * back);\n" +
            "  vec2 c = dec(dil, uv); float L = length(c);\n" +
            "  if (L > length(d) + 2.0){\n" +
            "    vec2 c1 = dec(mv, uv - c * inv * back);\n" +
            "    d = mix(d, c1, 1.0 - smoothstep(0.2 * L + 1.0, 0.4 * L + 2.0, length(c1 - c)));\n" +
            "  }\n" +
            "  return d;\n" +
            "}\n" +
            "uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMv; uniform sampler2D uMvD;\n" +
            "uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n" +
            "void main(){\n" +
            "  vec2 inv = uInvAna; float a = uA, wa = 1.0 - uA;\n" +
            "  float k = clamp((uFall.x - 0.06) / 0.24, 0.0, 1.0);\n" +
            "  vec2 d = track(uMv, uMv, vUv, inv, wa, 2);\n" +
            "  vec2 c = dec(uMvD, vUv); float L = length(c);\n" +
            "  float wfg = 0.0, h0 = 0.0, h1 = 0.0; vec2 cf = c;\n" +
            "  if (L > length(d) + 2.0){\n" +
            "    cf = dec(uMv, vUv - c * inv * wa);\n" +
            "    wfg = near(c, cf, 0.2 * L / (1.0 + 0.05 * L) + 1.0);\n" +
            "    h0 = near(c, dec(uMv, vUv + d * inv * a - c * inv), 1.0);\n" +
            "    h1 = near(c, dec(uMv, vUv - d * inv * wa), 1.0);\n" +
            "  }\n" +
            "  vec2 p1 = clamp(vUv - d * inv * wa, 0.0, 1.0);\n" +
            "  float w0 = wa * (1.0 - h0) + 1e-3, w1 = a * (1.0 - h1) + 1e-3;\n" +
            "  vec3 bg = (w0 * samp(uF0, vUv + d * inv * a) + w1 * samp(uF1, p1)) / (w0 + w1);\n" +
            "  vec3 fg = mix(samp(uF0, vUv + cf * inv * a), samp(uF1, vUv - cf * inv * wa), a);\n" +
            "  vec3 moved = mix(bg, fg, wfg);\n" +
            "  float tr = mix(texture(uMv, p1).b, 1.0, wfg);\n" +
            "  vec3 fb = fallback(samp(uF0, vUv), samp(uF1, vUv), a, h0, h1);\n" +
            "  float ok = smoothstep(mix(0.12, 0.0, k), mix(0.45, 0.25, k), tr);\n" +
            "  oc = vec4(mix(fb, moved, ok), 1.0);\n" +
            "}\n"

        private const val FS_MC2 = SAMP + "const float MVR = 128.0;\n" +
            "vec2 mvDec(vec2 e){ vec2 s = e * 2.0 - 1.0; return s * abs(s) * MVR; }\n" +
            "vec4 mvEnc(vec2 v, float conf){ vec2 s = clamp(v / MVR, -1.0, 1.0); return vec4(0.5 + 0.5 * sign(s) * sqrt(abs(s)), conf, 1.0); }\n" +
            "vec2 dec(sampler2D t, vec2 uv){ return mvDec(texture(t, clamp(uv, 0.0, 1.0)).rg); }\n" +
            "float near(vec2 a, vec2 b, float tol){ float t = tol * (1.0 + 0.05 * length(a)); return 1.0 - smoothstep(t, 3.0 * t, length(a - b)); }\n" +
            "vec3 fallback(vec3 s0, vec3 s1, float a, float h0, float h1){\n" +
            "  float t = a * a * (3.0 - 2.0 * a);\n" +
            "  float w0 = (1.0 - t) * (1.0 - h0) + 1e-3, w1 = t * (1.0 - h1) + 1e-3;\n" +
            "  return (w0 * s0 + w1 * s1) / (w0 + w1);\n" +
            "}\n" +
            "vec2 track(sampler2D mv, sampler2D dil, vec2 uv, vec2 inv, float back, int iters){\n" +
            "  vec2 d = dec(mv, uv);\n" +
            "  for (int i = 0; i < iters; i++) d = dec(mv, uv - d * inv * back);\n" +
            "  vec2 c = dec(dil, uv); float L = length(c);\n" +
            "  if (L > length(d) + 2.0){\n" +
            "    vec2 c1 = dec(mv, uv - c * inv * back);\n" +
            "    d = mix(d, c1, 1.0 - smoothstep(0.2 * L + 1.0, 0.4 * L + 2.0, length(c1 - c)));\n" +
            "  }\n" +
            "  return d;\n" +
            "}\n" +
            "uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uMvF; uniform sampler2D uMvB;\n" +
            "uniform sampler2D uMvDF; uniform sampler2D uMvDB; uniform float uA; uniform vec2 uInvAna; uniform vec2 uFall;\n" +
            "float mx(vec3 v){ return max(v.r, max(v.g, v.b)); }\n" +
            "void main(){\n" +
            "  vec2 inv = uInvAna; float a = uA, wa = 1.0 - uA;\n" +
            "  float k = clamp((uFall.x - 0.06) / 0.24, 0.0, 1.0);\n" +
            "  float tol = mix(0.6, 1.4, k);\n" +
            "  vec2 d = track(uMvF, uMvDF, vUv, inv, wa, 3), e = track(uMvB, uMvDB, vUv, inv, a, 3);\n" +
            "  vec2 p1 = clamp(vUv - d * inv * wa, 0.0, 1.0);\n" +
            "  vec2 q0 = clamp(vUv - e * inv * a, 0.0, 1.0);\n" +
            "  vec4 tF = texture(uMvF, p1), tB = texture(uMvB, q0);\n" +
            "  float sF = near(d, mvDec(tF.rg), tol), sB = near(e, mvDec(tB.rg), tol);\n" +
            "  float cF = near(d, -dec(uMvB, p1 + d * inv), tol);\n" +
            "  float cB = near(e, -dec(uMvF, q0 + e * inv), tol);\n" +
            "  vec3 fa0 = samp(uF0, vUv + d * inv * a), fa1 = samp(uF1, p1);\n" +
            "  vec3 ba0 = samp(uF0, q0), ba1 = samp(uF1, vUv + e * inv * wa);\n" +
            "  float vF = wa * cF + a, vB = wa + a * cB;\n" +
            "  vec3 colF = (wa * cF * fa0 + a * fa1) / max(vF, 1e-4);\n" +
            "  vec3 colB = (wa * ba0 + a * cB * ba1) / max(vB, 1e-4);\n" +
            "  float ef = mx(abs(fa0 - fa1)) * cF, eb = mx(abs(ba0 - ba1)) * cB;\n" +
            "  float sig = mix(0.06, 0.14, k), em = min(ef, eb);\n" +
            "  float wF = sF * vF * (0.3 + 0.7 * tF.b) * exp(-(ef - em) / sig);\n" +
            "  float wB = sB * vB * (0.3 + 0.7 * tB.b) * exp(-(eb - em) / sig);\n" +
            "  vec2 c = dec(uMvDF, vUv); float h0 = 0.0, h1 = 0.0;\n" +
            "  if (length(c) > 2.0){ h0 = near(c, dec(uMvF, vUv - c * inv), 1.0); h1 = near(c, dec(uMvF, vUv), 1.0); }\n" +
            "  vec3 fb = fallback(samp(uF0, vUv), samp(uF1, vUv), a, h0, h1);\n" +
            "  vec3 moved = (wF * colF + wB * colB + 1e-6 * fb) / (wF + wB + 1e-6);\n" +
            "  oc = vec4(mix(fb, moved, max(sF, sB)), 1.0);\n" +
            "}\n"
    }
}
