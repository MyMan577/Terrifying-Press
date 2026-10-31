package com.pressplay.media

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import kotlin.math.*

/** Immutable snapshot of every effect knob. Swapped atomically from the plugin thread. */
class FxParams(
    val eqOn: Boolean = false,
    val eq: FloatArray = FloatArray(10),   // dB per band, same 10 bands as the web EQ
    val gain: Float = 1f,                  // master / per-track boost, linear (1 = off)
    val bass: Float = 0f,                  // 0..1
    val reverb: Float = 0f,                // 0..1
    val filter: Float = 0f,                // -1 (lowpass sweep) .. 1 (highpass sweep)
    val distortion: Float = 0f,            // 0..1
    val bitcrush: Float = 0f,              // 0..1
    val echo: Float = 0f,                  // 0..1
    val tremolo: Float = 0f                // 0..1
) {
    val neutral: Boolean
        get() = (!eqOn || eq.all { abs(it) < 0.05f }) && abs(gain - 1f) < 0.001f &&
                bass < 0.01f && reverb < 0.01f && abs(filter) < 0.01f && distortion < 0.01f &&
                bitcrush < 0.01f && echo < 0.01f && tremolo < 0.01f
}

private class Biquad {
    var b0 = 1.0; var b1 = 0.0; var b2 = 0.0; var a1 = 0.0; var a2 = 0.0
    private var z1 = 0.0; private var z2 = 0.0
    fun process(x: Double): Double {
        val y = b0 * x + z1
        z1 = b1 * x - a1 * y + z2
        z2 = b2 * x - a2 * y
        return y
    }
    fun reset() { z1 = 0.0; z2 = 0.0 }
    private fun set(nb0: Double, nb1: Double, nb2: Double, na0: Double, na1: Double, na2: Double) {
        b0 = nb0 / na0; b1 = nb1 / na0; b2 = nb2 / na0; a1 = na1 / na0; a2 = na2 / na0
    }
    fun identity() { b0 = 1.0; b1 = 0.0; b2 = 0.0; a1 = 0.0; a2 = 0.0 }
    fun peaking(sr: Double, f: Double, q: Double, db: Double) {
        val a = 10.0.pow(db / 40.0); val w = 2 * PI * f / sr
        val al = sin(w) / (2 * q); val c = cos(w)
        set(1 + al * a, -2 * c, 1 - al * a, 1 + al / a, -2 * c, 1 - al / a)
    }
    fun lowShelf(sr: Double, f: Double, db: Double) {
        val a = 10.0.pow(db / 40.0); val w = 2 * PI * f / sr
        val c = cos(w); val al = sin(w) / 2 * sqrt(2.0); val sa = 2 * sqrt(a) * al
        set(a * ((a + 1) - (a - 1) * c + sa), 2 * a * ((a - 1) - (a + 1) * c), a * ((a + 1) - (a - 1) * c - sa),
            (a + 1) + (a - 1) * c + sa, -2 * ((a - 1) + (a + 1) * c), (a + 1) + (a - 1) * c - sa)
    }
    fun lowpass(sr: Double, f: Double, q: Double) {
        val w = 2 * PI * f / sr; val c = cos(w); val al = sin(w) / (2 * q)
        set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al)
    }
    fun highpass(sr: Double, f: Double, q: Double) {
        val w = 2 * PI * f / sr; val c = cos(w); val al = sin(w) / (2 * q)
        set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al)
    }
}

private class Comb(size: Int) {
    private val buf = FloatArray(max(1, size)); private var i = 0; private var store = 0f
    fun process(x: Float, feedback: Float, damp: Float): Float {
        val out = buf[i]
        store = out * (1 - damp) + store * damp
        buf[i] = x + store * feedback
        if (++i >= buf.size) i = 0
        return out
    }
    fun clear() { buf.fill(0f); store = 0f; i = 0 }
}

private class Allpass(size: Int) {
    private val buf = FloatArray(max(1, size)); private var i = 0
    fun process(x: Float): Float {
        val b = buf[i]
        val out = -x + b
        buf[i] = x + b * 0.5f
        if (++i >= buf.size) i = 0
        return out
    }
    fun clear() { buf.fill(0f); i = 0 }
}

/**
 * Native replacement for the Web Audio effect chain: 10-band EQ, boost, bass, DJ filter,
 * distortion, bitcrush, tremolo, echo, reverb. Also keeps a short ring of the output so the
 * UI visualizer can pull a spectrum without RECORD_AUDIO.
 */
@UnstableApi
class FxAudioProcessor : BaseAudioProcessor() {
    companion object {
        private val EQ_FREQS = doubleArrayOf(31.0, 60.0, 170.0, 350.0, 500.0, 1000.0, 3500.0, 6000.0, 10000.0, 16000.0)
        private const val FFT_N = 1024
    }

    @Volatile var params: FxParams = FxParams()
    private var applied: FxParams? = null

    private var sr = 44100.0
    private var ch = 2

    private var eq = Array(2) { Array(10) { Biquad() } }
    private var shelf = Array(2) { Biquad() }
    private var lp = Array(2) { Biquad() }
    private var hp = Array(2) { Biquad() }
    private var combs = Array(2) { Array(4) { Comb(1) } }
    private var aps = Array(2) { Array(2) { Allpass(1) } }
    private var echoBuf = Array(2) { FloatArray(1) }
    private var echoIdx = 0
    private var tremPhase = 0.0
    private var crushHold = FloatArray(2); private var crushCount = 0

    // Visualizer ring (mono, post-FX)
    private val ring = FloatArray(FFT_N); @Volatile private var ringPos = 0
    @Volatile var vizOn = false

    // cached per-refresh
    private var eqActive = BooleanArray(10)
    private var bassOn = false; private var lpOn = false; private var hpOn = false
    private var drive = 0.0; private var distMix = 0.0
    private var bits = 16; private var hold = 1
    private var trem = 0.0
    private var echoWet = 0f; private var echoFb = 0f
    private var revWet = 0f
    private var gain = 1f

    override fun onConfigure(inputAudioFormat: AudioFormat): AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT || inputAudioFormat.channelCount !in 1..2) {
            return AudioFormat.NOT_SET // inactive: audio passes through untouched
        }
        sr = inputAudioFormat.sampleRate.toDouble(); ch = inputAudioFormat.channelCount
        val k = sr / 44100.0
        combs = Array(2) { c -> Array(4) { i -> Comb(((intArrayOf(1116, 1188, 1277, 1356)[i] + c * 23) * k).toInt()) } }
        aps = Array(2) { c -> Array(2) { i -> Allpass(((intArrayOf(556, 441)[i] + c * 11) * k).toInt()) } }
        echoBuf = Array(2) { FloatArray(max(1, (sr * 0.45).toInt())) }
        echoIdx = 0
        applied = null
        return inputAudioFormat
    }

    override fun onFlush() { clearState() }
    override fun onReset() { clearState(); applied = null }

    private fun clearState() {
        eq.forEach { a -> a.forEach { it.reset() } }
        shelf.forEach { it.reset() }; lp.forEach { it.reset() }; hp.forEach { it.reset() }
        combs.forEach { a -> a.forEach { it.clear() } }; aps.forEach { a -> a.forEach { it.clear() } }
        echoBuf.forEach { it.fill(0f) }; echoIdx = 0; tremPhase = 0.0; crushCount = 0
    }

    private fun refresh(p: FxParams) {
        for (c in 0 until 2) {
            for (b in 0 until 10) {
                val g = if (p.eqOn) p.eq.getOrElse(b) { 0f }.toDouble() else 0.0
                eqActive[b] = abs(g) >= 0.05
                if (eqActive[b]) eq[c][b].peaking(sr, EQ_FREQS[b], 1.1, g) else eq[c][b].identity()
            }
            val bg = 12.0 * (1.0 - (1.0 - p.bass.toDouble()).pow(2.0))
            shelf[c].lowShelf(sr, 120.0, bg)
            if (p.filter < -0.01) { lp[c].lowpass(sr, 20000.0 * (200.0 / 20000.0).pow(-p.filter.toDouble()), 0.9) }
            if (p.filter > 0.01) { hp[c].highpass(sr, 20.0 * (4000.0 / 20.0).pow(p.filter.toDouble()), 0.9) }
        }
        bassOn = p.bass > 0.01; lpOn = p.filter < -0.01; hpOn = p.filter > 0.01
        drive = 1.0 + 30.0 * p.distortion * p.distortion; distMix = min(1.0, p.distortion * 2.0)
        bits = (16 - 12 * p.bitcrush * p.bitcrush).roundToInt().coerceIn(3, 16)
        hold = 1 + (14 * p.bitcrush * p.bitcrush).roundToInt()
        trem = p.tremolo.toDouble()
        echoWet = p.echo * 0.6f; echoFb = 0.15f + 0.5f * p.echo
        revWet = p.reverb * 0.5f
        gain = p.gain
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val n = inputBuffer.remaining()
        if (n == 0) return
        val p = params
        if (p !== applied) { refresh(p); applied = p }
        val out = replaceOutputBuffer(n)
        val bypass = p.neutral
        val frames = n / (2 * ch)
        val echoLen = echoBuf[0].size
        val tremInc = 2 * PI * 5.0 / sr
        var rp = ringPos
        val viz = vizOn

        for (f in 0 until frames) {
            if (!bypass) crushCount = (crushCount + 1) % hold
            var mono = 0f
            for (c in 0 until ch) {
                val raw = inputBuffer.getShort() / 32768.0f
                var x = raw.toDouble()
                if (!bypass) {
                    for (b in 0 until 10) if (eqActive[b]) x = eq[c][b].process(x)
                    if (bassOn) x = shelf[c].process(x)
                    if (lpOn) x = lp[c].process(x)
                    if (hpOn) x = hp[c].process(x)
                    if (distMix > 0) {
                        val shaped = tanh(x * drive) / tanh(drive)
                        x = x * (1 - distMix) + shaped * distMix
                    }
                    if (bits < 16 || hold > 1) {
                        if (crushCount == 0) {
                            val lv = (1 shl (bits - 1)).toDouble()
                            crushHold[c] = (Math.round(x * lv) / lv).toFloat()
                        }
                        x = crushHold[c].toDouble()
                    }
                    if (trem > 0.001) x *= 1.0 - trem * 0.5 * (1.0 + sin(tremPhase))
                    var y = x.toFloat()
                    if (echoWet > 0.001f) {
                        val d = echoBuf[c][echoIdx]
                        echoBuf[c][echoIdx] = y + d * echoFb
                        y += d * echoWet
                    }
                    if (revWet > 0.001f) {
                        var r = 0f
                        for (cb in combs[c]) r += cb.process(y * 0.015f, 0.84f, 0.2f)
                        for (ap in aps[c]) r = ap.process(r)
                        y += r * revWet * 6f
                    }
                    x = y * gain.toDouble()
                    if (abs(x) > 0.95) x = tanh(x) // soft limiter keeps boosts from hard-clipping
                }
                val s = (x * 32767.0).roundToInt().coerceIn(-32768, 32767)
                out.putShort(s.toShort())
                mono += s / 32768.0f
            }
            if (!bypass) { if (++echoIdx >= echoLen) echoIdx = 0; tremPhase += tremInc; if (tremPhase > 2 * PI) tremPhase -= 2 * PI }
            if (viz) { ring[rp] = mono / ch; rp = (rp + 1) and (FFT_N - 1) }
        }
        if (viz) ringPos = rp
        // Any trailing partial frame is dropped (never happens with whole-frame PCM).
        inputBuffer.position(inputBuffer.limit())
        out.flip()
    }

    // ---------- Visualizer taps (called from the plugin's thread) ----------
    private val re = DoubleArray(FFT_N); private val im = DoubleArray(FFT_N)
    private val win = DoubleArray(FFT_N) { 0.5 - 0.5 * cos(2 * PI * it / (FFT_N - 1)) }

    /** Fills [out] (size 512) like AnalyserNode.getByteFrequencyData (-100..-30 dB mapped to 0..255). */
    @Synchronized fun spectrum(out: ByteArray) {
        val start = ringPos
        for (i in 0 until FFT_N) { re[i] = ring[(start + i) and (FFT_N - 1)] * win[i]; im[i] = 0.0 }
        fft()
        for (i in 0 until min(out.size, FFT_N / 2)) {
            val mag = sqrt(re[i] * re[i] + im[i] * im[i]) / FFT_N * 2
            val db = 20 * log10(max(mag, 1e-9))
            out[i] = (((db + 100.0) / 70.0) * 255.0).coerceIn(0.0, 255.0).toInt().toByte()
        }
    }

    /** Fills [out] with 0..255 time-domain samples (128 = silence), decimated from the ring. */
    fun waveform(out: ByteArray) {
        val start = ringPos; val step = max(1, FFT_N / out.size)
        for (i in out.indices) {
            val v = ring[(start + i * step) and (FFT_N - 1)]
            out[i] = (128 + v * 127).toInt().coerceIn(0, 255).toByte()
        }
    }

    private fun fft() {
        var j = 0
        for (i in 1 until FFT_N) {
            var bit = FFT_N shr 1
            while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
            j = j xor bit
            if (i < j) { val tr = re[i]; re[i] = re[j]; re[j] = tr; val ti = im[i]; im[i] = im[j]; im[j] = ti }
        }
        var len = 2
        while (len <= FFT_N) {
            val ang = -2 * PI / len; val wr = cos(ang); val wi = sin(ang)
            var i = 0
            while (i < FFT_N) {
                var cr = 1.0; var ci = 0.0
                for (k in 0 until len / 2) {
                    val ur = re[i + k]; val ui = im[i + k]
                    val vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
                    val vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
                    re[i + k] = ur + vr; im[i + k] = ui + vi
                    re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
                    val nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
                }
                i += len
            }
            len = len shl 1
        }
    }
}
