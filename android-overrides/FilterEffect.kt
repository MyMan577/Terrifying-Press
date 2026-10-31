package com.pressplay.media

import android.content.Context
import android.opengl.GLES20
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Live parameters for the video filter shader. One instance is shared with the effect, so moving a
 * slider only swaps these arrays; the GL pipeline is not rebuilt (no hitch while you drag).
 *
 * Each op is 8 floats: [type, a, b, c, d, e, f, g]. The list runs in order, exactly like a CSS
 * `filter:` chain. Types:
 *  0 brightness(a)  1 contrast(a)  2 saturate(a)  3 sepia(a)  4 grayscale(a)  5 hue-rotate(cos a, sin b)
 *  6 invert(a)      7 posterize(levels a)          8 duotone(dark a,b,c -> light d,e,f)
 *  9 sharpen(center a, edge b)     10 clarity(amount a, sigma-in-texels b)
 */
@UnstableApi
class FilterParams {
    companion object { const val MAX = 24 }
    @Volatile var n = 0
    @Volatile var ops = FloatArray(MAX * 8)
    fun set(flat: FloatArray, count: Int) {
        val c = count.coerceIn(0, MAX)
        val a = FloatArray(MAX * 8); System.arraycopy(flat, 0, a, 0, minOf(flat.size, c * 8))
        ops = a; n = c
    }
}

@UnstableApi
class FilterEffect(private val params: FilterParams) : GlEffect {
    override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram = FilterProgram(params, useHdr)
}

@UnstableApi
private class FilterProgram(private val p: FilterParams, useHdr: Boolean) : BaseGlShaderProgram(useHdr, 1) {

    private val program: Int
    private val locTex: Int; private val locTexel: Int; private val locCount: Int
    private val locA: Int; private val locB: Int; private val locPos: Int
    private val quad: FloatBuffer = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        .apply { put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0) }
    private var w = 1; private var h = 1
    private val a = FloatArray(FilterParams.MAX * 4); private val b = FloatArray(FilterParams.MAX * 4)

    init {
        try {
            val vs = compile(GLES20.GL_VERTEX_SHADER, VERTEX)
            val fs = compile(GLES20.GL_FRAGMENT_SHADER, FRAGMENT)
            program = GLES20.glCreateProgram()
            GLES20.glAttachShader(program, vs); GLES20.glAttachShader(program, fs)
            GLES20.glLinkProgram(program)
            val ok = IntArray(1); GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, ok, 0)
            if (ok[0] == 0) throw IllegalStateException("filter shader link failed: " + GLES20.glGetProgramInfoLog(program))
            GLES20.glDeleteShader(vs); GLES20.glDeleteShader(fs)
            locTex = GLES20.glGetUniformLocation(program, "uTexSampler")
            locTexel = GLES20.glGetUniformLocation(program, "uTexel")
            locCount = GLES20.glGetUniformLocation(program, "uCount")
            locA = GLES20.glGetUniformLocation(program, "uOpA[0]")
            locB = GLES20.glGetUniformLocation(program, "uOpB[0]")
            locPos = GLES20.glGetAttribLocation(program, "aFramePosition")
        } catch (e: Exception) { throw VideoFrameProcessingException(e) }
    }

    private fun compile(type: Int, src: String): Int {
        val s = GLES20.glCreateShader(type)
        GLES20.glShaderSource(s, src); GLES20.glCompileShader(s)
        val ok = IntArray(1); GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0)
        if (ok[0] == 0) throw IllegalStateException("filter shader compile failed: " + GLES20.glGetShaderInfoLog(s))
        return s
    }

    override fun configure(inputWidth: Int, inputHeight: Int): Size { w = inputWidth; h = inputHeight; return Size(inputWidth, inputHeight) }

    override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
        try {
            val n = p.n; val ops = p.ops
            for (i in 0 until FilterParams.MAX) for (k in 0 until 4) { a[i * 4 + k] = ops[i * 8 + k]; b[i * 4 + k] = ops[i * 8 + 4 + k] }
            GLES20.glUseProgram(program)
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, inputTexId)
            GLES20.glUniform1i(locTex, 0)
            GLES20.glUniform2f(locTexel, 1f / w, 1f / h)
            GLES20.glUniform1i(locCount, n)
            GLES20.glUniform4fv(locA, FilterParams.MAX, a, 0)
            GLES20.glUniform4fv(locB, FilterParams.MAX, b, 0)
            GLES20.glEnableVertexAttribArray(locPos)
            GLES20.glVertexAttribPointer(locPos, 2, GLES20.GL_FLOAT, false, 0, quad)
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            GLES20.glDisableVertexAttribArray(locPos)
        } catch (e: Exception) { throw VideoFrameProcessingException(e, presentationTimeUs) }
    }

    override fun release() {
        super.release()
        try { GLES20.glDeleteProgram(program) } catch (_: Exception) {}
    }

    companion object {
        private const val VERTEX = """
            attribute vec2 aFramePosition;
            varying vec2 vTexSamplingCoord;
            void main() {
              gl_Position = vec4(aFramePosition, 0.0, 1.0);
              vTexSamplingCoord = aFramePosition * 0.5 + 0.5;
            }
        """

        // GLSL ES 1.00. Mirrors the CSS filter functions and the page's SVG filters, applied in list order.
        private const val FRAGMENT = """
            precision highp float;
            uniform sampler2D uTexSampler;
            uniform vec2 uTexel;
            uniform int uCount;
            uniform vec4 uOpA[24];
            uniform vec4 uOpB[24];
            varying vec2 vTexSamplingCoord;
            const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);

            // Per-pixel ops (types 0..8)
            vec3 apply1(vec3 c, vec4 a, vec4 b) {
              float t = a.x;
              if (t < 0.5) { c = c * a.y; }
              else if (t < 1.5) { c = (c - 0.5) * a.y + 0.5; }
              else if (t < 2.5) { c = mix(vec3(dot(c, LUM)), c, a.y); }
              else if (t < 3.5) {
                vec3 s = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
                c = mix(c, s, a.y);
              }
              else if (t < 4.5) { c = mix(c, vec3(dot(c, LUM)), a.y); }
              else if (t < 5.5) {
                float cs = a.y; float sn = a.z;
                vec3 r0 = vec3(0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928);
                vec3 r1 = vec3(0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283);
                vec3 r2 = vec3(0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072);
                c = vec3(dot(r0, c), dot(r1, c), dot(r2, c));
              }
              else if (t < 6.5) { c = mix(c, 1.0 - c, a.y); }
              else if (t < 7.5) { float n = a.y; c = floor(min(c * n, vec3(n - 0.001))) / (n - 1.0); }
              else if (t < 8.5) { c = mix(a.yzw, b.xyz, dot(c, LUM)); }
              return clamp(c, 0.0, 1.0);
            }

            // Everything before op `end`, so neighbours are sampled in the same colour space as the centre pixel
            vec3 pre(vec3 c, int end) {
              for (int i = 0; i < 24; i++) {
                if (i >= end) break;
                if (uOpA[i].x < 8.5) { c = apply1(c, uOpA[i], uOpB[i]); }
              }
              return c;
            }

            vec3 tapAt(vec2 o, int end) {
              return pre(texture2D(uTexSampler, vTexSamplingCoord + o * uTexel).rgb, end);
            }

            void main() {
              vec3 c = texture2D(uTexSampler, vTexSamplingCoord).rgb;
              for (int i = 0; i < 24; i++) {
                if (i >= uCount) break;
                vec4 a = uOpA[i]; vec4 b = uOpB[i];
                if (a.x < 8.5) {
                  c = apply1(c, a, b);
                } else if (a.x < 9.5) {
                  vec3 n = tapAt(vec2(0.0, -1.0), i) + tapAt(vec2(0.0, 1.0), i) + tapAt(vec2(-1.0, 0.0), i) + tapAt(vec2(1.0, 0.0), i);
                  c = clamp(c * a.y + n * a.z, 0.0, 1.0);
                } else {
                  // Clarity: c + amount * (c - gaussianBlur(c)); blur = centre + two rings of taps
                  float s = max(a.z, 1.0);
                  vec3 acc = c; float ws = 1.0;
                  for (int k = 0; k < 8; k++) {
                    float ang = float(k) * 0.7853982;
                    vec2 d = vec2(cos(ang), sin(ang));
                    acc += 0.6065 * tapAt(d * s, i);
                    acc += 0.1353 * tapAt(d * s * 2.0, i);
                    ws += 0.7418;
                  }
                  c = clamp(c + a.y * (c - acc / ws), 0.0, 1.0);
                }
              }
              gl_FragColor = vec4(c, 1.0);
            }
        """
    }
}
