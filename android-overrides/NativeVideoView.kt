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
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The native video picture. ExoPlayer decodes into a SurfaceTexture, and this view draws every frame itself with
 * OpenGL ES on its own thread: the page's filter chain, the fit mode, zoom, pan and forced aspect ratios all run
 * in one GPU pass, straight from the decoder's texture (no copies, no Media3 effects pipeline).
 *
 * It sits under the transparent WebView (see MainActivity), sized to the page's video box. The page's controls,
 * subtitles and gestures draw over it as usual.
 *
 * Threads: [player] and the public setters are called on the main thread. Everything GL runs on "pp-video-gl".
 */
@UnstableApi
class NativeVideoView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

    /**
     * Where the picture sits in the box. [fit] is the page's object-fit ("contain", "cover", "fill"). [sx]/[sy]
     * and [tx]/[ty] are the page's CSS transform on the video (zoom, forced-ratio scaling and pan), with the
     * translation already in device pixels. Scaling is about the centre of the box, like CSS.
     */
    data class ViewParams(val fit: String = "contain", val sx: Float = 1f, val sy: Float = 1f, val tx: Float = 0f, val ty: Float = 0f)

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
    private var hasFrame = false
    private var glOk = false
    private var prog = 0
    private var locPos = 0; private var locTex = 0; private var locTexM = 0; private var locSampler = 0
    private var locTexel = 0; private var locCount = 0; private var locA = 0; private var locB = 0
    private val opA = FloatArray(FilterParams.MAX * 4)
    private val opB = FloatArray(FilterParams.MAX * 4)
    private val pos: FloatBuffer = floatBuf(8)
    private val uv: FloatBuffer = floatBuf(8).apply { put(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 1f, 1f)); position(0) }
    private var lumaFbo = 0; private var lumaTex = 0

    // ---- shared (written on main, read on GL) ----
    @Volatile private var view = ViewParams()
    @Volatile private var aspect = 16f / 9f
    @Volatile private var frameW = 1
    @Volatile private var frameH = 1
    @Volatile private var released = false
    /** The page's filter chain. Null or empty = no filters. */
    @Volatile var filter: FilterParams? = null
        set(v) { field = v; requestRender() }

    /** The decoder writes here. Created on the GL thread; handed to the player on main once ready. */
    private var input: Surface? = null

    var player: Player? = null
        set(p) {
            if (field === p) return
            field?.let { old -> old.removeListener(playerListener); input?.let { old.clearVideoSurface(it) } }
            field = p
            p?.let { np -> np.addListener(playerListener); input?.let { np.setVideoSurface(it) }; readVideo(np) }
        }

    private val playerListener = object : Player.Listener {
        override fun onVideoSizeChanged(videoSize: VideoSize) { player?.let { readVideo(it) } }
        override fun onTracksChanged(tracks: Tracks) { player?.let { readVideo(it) } }
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
            try { teardownGl() } catch (_: Throwable) {}
            thread.quitSafely()
        }
    }

    // ---------------------------------------------------------------- video properties (main thread)

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
        // Let the screen switch to a refresh rate that fits the video (24 fps on a 120 Hz panel = 5 refreshes per frame,
        // no judder). Android only does this as a hint; it never forces a mode.
        val fps = p.videoFormat?.frameRate ?: -1f
        if (fps > 0f && Build.VERSION.SDK_INT >= 30) {
            try { holder.surface?.takeIf { it.isValid }?.setFrameRate(fps, Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE) } catch (_: Throwable) {}
        }
    }

    private fun requestRender() { if (!released) gl.post { draw() } }

    // ---------------------------------------------------------------- SurfaceHolder.Callback (main thread)

    override fun surfaceCreated(h: SurfaceHolder) {
        val s = h.surface
        gl.post { makeWindow(s); draw() }
        player?.let { readVideo(it) }
    }

    override fun surfaceChanged(h: SurfaceHolder, format: Int, width: Int, height: Int) {
        gl.post { outW = width; outH = height; draw() }
    }

    override fun surfaceDestroyed(h: SurfaceHolder) {
        // The window surface must be gone before this returns, or EGL keeps drawing into a dead surface.
        val done = CountDownLatch(1)
        gl.post { try { dropWindow() } finally { done.countDown() } }
        try { done.await(500, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) {}
    }

    // ---------------------------------------------------------------- GL thread

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

            prog = link(VERTEX, FRAGMENT)
            locPos = GLES20.glGetAttribLocation(prog, "aPos")
            locTex = GLES20.glGetAttribLocation(prog, "aTex")
            locTexM = GLES20.glGetUniformLocation(prog, "uTexM")
            locSampler = GLES20.glGetUniformLocation(prog, "uTexSampler")
            locTexel = GLES20.glGetUniformLocation(prog, "uTexel")
            locCount = GLES20.glGetUniformLocation(prog, "uCount")
            locA = GLES20.glGetUniformLocation(prog, "uOpA[0]")
            locB = GLES20.glGetUniformLocation(prog, "uOpB[0]")

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
    }

    private fun dropWindow() {
        if (win != EGL14.EGL_NO_SURFACE) {
            EGL14.eglMakeCurrent(dpy, dummy, dummy, ectx)
            EGL14.eglDestroySurface(dpy, win)
            win = EGL14.EGL_NO_SURFACE
        }
    }

    private fun onFrame() {
        if (released || !glOk) return
        val t = st ?: return
        current()
        try { t.updateTexImage(); t.getTransformMatrix(texM); hasFrame = true } catch (e: Throwable) { Log.w(TAG, "updateTexImage", e); return }
        draw()
    }

    /** Makes the context current on the window when there is one, else on the 1x1 placeholder. */
    private fun current() {
        val s = if (win != EGL14.EGL_NO_SURFACE) win else dummy
        EGL14.eglMakeCurrent(dpy, s, s, ectx)
    }

    private fun draw() {
        if (released || !glOk || win == EGL14.EGL_NO_SURFACE || outW <= 0 || outH <= 0) return
        current()
        GLES20.glViewport(0, 0, outW, outH)
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        if (hasFrame) {
            placeQuad(outW.toFloat(), outH.toFloat(), view)
            drawFrame(filter)
        }
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

    private fun drawFrame(f: FilterParams?) {
        GLES20.glUseProgram(prog)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes)
        GLES20.glUniform1i(locSampler, 0)
        GLES20.glUniformMatrix4fv(locTexM, 1, false, texM, 0)
        GLES20.glUniform2f(locTexel, 1f / frameW, 1f / frameH)
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
    }

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
        drawFrame(null)                                   // the plain frame: auto-levels measures before the filters
        val px = ByteBuffer.allocateDirect(lw * lh * 4).order(ByteOrder.nativeOrder())
        GLES20.glReadPixels(0, 0, lw, lh, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, px)
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
        val out = FloatArray(lw * lh)
        for (i in 0 until lw * lh) {
            val r = px.get(i * 4).toInt() and 0xff; val g = px.get(i * 4 + 1).toInt() and 0xff; val b = px.get(i * 4 + 2).toInt() and 0xff
            out[i] = r * 0.299f + g * 0.587f + b * 0.114f
        }
        main.post { requestRender() }                     // the window's viewport was changed: redraw it
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
            if (prog != 0) GLES20.glDeleteProgram(prog)
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

    private fun link(vsSrc: String, fsSrc: String): Int {
        fun compile(type: Int, src: String): Int {
            val s = GLES20.glCreateShader(type)
            GLES20.glShaderSource(s, src); GLES20.glCompileShader(s)
            val ok = IntArray(1); GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) throw RuntimeException("shader compile failed: " + GLES20.glGetShaderInfoLog(s))
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
        private val FRAGMENT: String = "#extension GL_OES_EGL_image_external : require\n" +
            FILTER_FRAGMENT.replace("uniform sampler2D uTexSampler;", "uniform samplerExternalOES uTexSampler;")
    }
}
