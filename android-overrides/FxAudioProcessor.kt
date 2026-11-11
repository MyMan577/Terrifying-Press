package com.pressplay.media

import android.os.SystemClock
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.ForwardingAudioSink
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
        if (abs(z1) < 1e-25) z1 = 0.0
        if (abs(z2) < 1e-25) z2 = 0.0
        return y
    }
    fun reset() { z1 = 0.0; z2 = 0.0 }
    private fun set(nb0: Double, nb1: Double, nb2: Double, na0: Double, na1: Double, na2: Double) {
        b0 = nb0 / na0; b1 = nb1 / na0; b2 = nb2 / na0; a1 = na1 / na0; a2 = na2 / na0
    }
    fun identity() { b0 = 1.0; b1 = 0.0; b2 = 0.0; a1 = 0.0; a2 = 0.0 }
    // The same formulas the WebView's BiquadFilterNode uses, so a knob sounds the same in both engines.
    private fun w(sr: Double, f: Double) = 2 * PI * min(f, sr * 0.49) / sr
    fun peaking(sr: Double, f: Double, q: Double, db: Double) {
        val a = 10.0.pow(db / 40.0); val w = w(sr, f)
        val al = sin(w) / (2 * q); val c = cos(w)
        set(1 + al * a, -2 * c, 1 - al * a, 1 + al / a, -2 * c, 1 - al / a)
    }
    fun lowShelf(sr: Double, f: Double, db: Double) {
        val a = 10.0.pow(db / 40.0); val w = w(sr, f)
        val c = cos(w); val al = sin(w) / 2 * sqrt(2.0); val sa = 2 * sqrt(a) * al
        set(a * ((a + 1) - (a - 1) * c + sa), 2 * a * ((a - 1) - (a + 1) * c), a * ((a + 1) - (a - 1) * c - sa),
            (a + 1) + (a - 1) * c + sa, -2 * ((a - 1) + (a + 1) * c), (a + 1) + (a - 1) * c - sa)
    }
    /** [qDb] is the resonance in dB, as Web Audio defines Q for lowpass and highpass. */
    fun lowpass(sr: Double, f: Double, qDb: Double) {
        val w = w(sr, f); val c = cos(w); val al = sin(w) / (2 * 10.0.pow(qDb / 20.0))
        set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al)
    }
    fun highpass(sr: Double, f: Double, qDb: Double) {
        val w = w(sr, f); val c = cos(w); val al = sin(w) / (2 * 10.0.pow(qDb / 20.0))
        set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al)
    }
}

private class Comb(size: Int) {
    private val buf = FloatArray(max(1, size)); private var i = 0; private var store = 0f
    fun process(x: Float, feedback: Float, damp: Float): Float {
        val out = buf[i]
        store = out * (1 - damp) + store * damp
        if (abs(store) < 1e-20f) store = 0f
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

/** Everything one channel needs. Sizes depend on the sample rate. */
private class Chan(sr: Double, index: Int) {
    val eq = Array(10) { Biquad() }
    val sub = Biquad(); val shelf = Biquad(); val peak = Biquad()
    val exLp = Biquad(); val exHp = Biquad()
    val lp = Biquad(); val hp = Biquad()
    val wetHp = Biquad(); val wetLp = Biquad()
    var crushHold = 0.0; var crushCount = 0
    val echo = FloatArray(max(1, (sr * 0.24).roundToInt()))
    val pre = FloatArray(max(1, (sr * 0.018).roundToInt())); var preIdx = 0
    var dark = 0.0
    private val k = sr / 44100.0; private val spread = if (index % 2 == 1) 23 else 0
    val combs = Array(8) { Comb(((intArrayOf(1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617)[it] + spread) * k).toInt()) }
    val aps = Array(4) { Allpass(((intArrayOf(556, 441, 341, 225)[it] + spread) * k).toInt()) }
    fun clear() {
        eq.forEach { it.reset() }
        sub.reset(); shelf.reset(); peak.reset(); exLp.reset(); exHp.reset(); lp.reset(); hp.reset(); wetHp.reset(); wetLp.reset()
        crushHold = 0.0; crushCount = 0; echo.fill(0f); pre.fill(0f); preIdx = 0; dark = 0.0
        combs.forEach { it.clear() }; aps.forEach { it.clear() }
    }
}

/**
 * Native version of the page's Web Audio effect chain, stage for stage and with the same knob curves, so a song
 * sounds the same whether ExoPlayer or the WebView plays it:
 *
 *   EQ -> boost -> bass (rumble filter, shelf, punch peak, harmonics) -> DJ filter -> distortion -> bitcrush
 *      -> tremolo -> echo -> reverb -> limiter
 *
 * It also keeps the last few seconds of its output, stamped with the playback clock, so the visualizer can be
 * shown the sound that is leaving the speaker right now instead of sound that is still waiting in the buffer.
 */
@UnstableApi
class FxAudioProcessor : BaseAudioProcessor() {
    companion object {
        private val EQ_FREQS = doubleArrayOf(31.0, 60.0, 170.0, 350.0, 500.0, 1000.0, 3500.0, 6000.0, 10000.0, 16000.0)
        private const val FFT_N = 1024
        private const val RING = 1 shl 17               // about 2.7 s at 48 kHz
        const val UNSET = Long.MIN_VALUE
        private const val ROOM_GAIN = 44.0              // loudness of the room model itself (measured), divided back out
        private const val LIM_THRESH_DB = -2.0; private const val LIM_KNEE_DB = 3.0; private const val LIM_RATIO = 10.0
        private fun easeIn(v: Double, curve: Double) = sign(v) * abs(v).pow(curve)
        private fun easeOut(v: Double, curve: Double) = sign(v) * (1 - (1 - abs(v)).pow(curve))
        /** The page's waveshaper curve (makeDistortionCurve) as a function. */
        private fun shape(x: Double, k: Double): Double {
            val c = if (x > 1) 1.0 else if (x < -1) -1.0 else x
            return (3 + k) * c * (PI / 9) / (PI + k * abs(c))
        }
        private fun shapeK(amount: Double) = easeIn(amount, 2.2) * 320
    }

    @Volatile var params: FxParams = FxParams()
    private var applied: FxParams? = null

    private var sr = 44100.0
    private var ch = 2
    private var chans = Array(2) { Chan(44100.0, it) }
    private var tmp = DoubleArray(2)
    private var echoIdx = 0
    private var tremPhase = 0.0

    // cached per-refresh
    private var eqOn = false; private val eqActive = BooleanArray(10)
    private var bassOn = false; private var exK = 0.0; private var exGain = 0.0
    private var lpOn = false; private var hpOn = false
    private var distOn = false; private var distK = 0.0
    private var crushOn = false; private var crushStep = 1.0; private var crushEvery = 1
    private var tremOn = false; private var tremDepth = 0.0
    private var echoOn = false; private var echoWet = 0f; private var echoFb = 0f
    private var revOn = false; private var revWet = 0.0; private var revDry = 1.0; private var revDark = 0.1; private var revNorm = 1.0
    private var gainTarget = 1.0; private var gainNow = 1.0; private var gainK = 1.0
    private var limDb = 0.0; private var limAtk = 1.0; private var limRel = 1.0

    override fun onConfigure(inputAudioFormat: AudioFormat): AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT || inputAudioFormat.channelCount !in 1..8) {
            return AudioFormat.NOT_SET // inactive: audio passes through untouched
        }
        sr = inputAudioFormat.sampleRate.toDouble(); ch = inputAudioFormat.channelCount
        chans = Array(ch) { Chan(sr, it) }
        tmp = DoubleArray(ch)
        echoIdx = 0
        gainK = 1 - exp(-1 / (0.015 * sr))
        limAtk = 1 - exp(-1 / (0.002 * sr)); limRel = 1 - exp(-1 / (0.12 * sr))
        // The page's reverb is a convolution with a decaying burst of low-passed noise. Here a room model is voiced to
        // match it: the same dark tone (the noise's one-pole filter) and the same loudness for the same knob position.
        val fc = -ln(1 - 0.12) * 48000 / (2 * PI)
        revDark = 1 - exp(-2 * PI * fc / sr)
        revNorm = 0.00125 * (44100.0 / 48000.0) * sqrt(48000 * 2.8) * sqrt(24000 / (fc * atan(24000 / fc))) / ROOM_GAIN
        synchronized(clk) { rate = inputAudioFormat.sampleRate }
        applied = null
        return inputAudioFormat
    }

    override fun onFlush() { clearState() }
    override fun onReset() { clearState(); applied = null }

    private fun clearState() {
        chans.forEach { it.clear() }
        echoIdx = 0; tremPhase = 0.0; limDb = 0.0
    }

    private fun refresh(p: FxParams) {
        eqOn = p.eqOn
        val bassT = easeOut(p.bass.toDouble().coerceIn(0.0, 1.0), 2.0)
        val filterT = easeIn(p.filter.toDouble().coerceIn(-1.0, 1.0), 1.5)
        for (c in chans) {
            for (b in 0 until 10) {
                val g = if (p.eqOn) p.eq.getOrElse(b) { 0f }.toDouble() else 0.0
                eqActive[b] = abs(g) >= 0.05
                if (eqActive[b]) c.eq[b].peaking(sr, EQ_FREQS[b], 1.0, g) else c.eq[b].identity()
            }
            c.sub.highpass(sr, 28.0, 0.5)
            c.shelf.lowShelf(sr, 110.0, bassT * 9.0)
            c.peak.peaking(sr, 65.0, 0.9, bassT * 4.0)
            c.exLp.lowpass(sr, 65.0 * 4.2, 0.7)
            c.exHp.highpass(sr, 65.0 * 3, 0.7)
            if (filterT < 0) c.lp.lowpass(sr, 20000.0 * (150.0 / 20000.0).pow(-filterT), 0.7)
            if (filterT > 0) c.hp.highpass(sr, 20.0 * (6000.0 / 20.0).pow(filterT), 0.7)
            c.wetHp.highpass(sr, 120.0, 0.5)
            c.wetLp.lowpass(sr, 5200.0, 0.5)
        }
        bassOn = p.bass > 0f; exK = shapeK(min(1.0, bassT * 0.6)); exGain = bassT * 0.85
        lpOn = filterT < 0; hpOn = filterT > 0
        distOn = p.distortion > 0f; distK = shapeK(p.distortion.toDouble().coerceIn(0.0, 1.0))
        // Bit depth and sample-and-hold, as in the page's bitcrusher (which runs at 48 kHz).
        val crush = easeIn(p.bitcrush.toDouble().coerceIn(0.0, 1.0), 1.8)
        crushOn = crush > 0.001
        crushStep = 0.5.pow(16 - crush * 13)
        crushEvery = max(1, (1 + (crush * 38 * sr / 48000.0).roundToInt()))
        val tremT = easeOut(p.tremolo.toDouble().coerceIn(0.0, 1.0), 2.0)
        tremOn = p.tremolo > 0f; tremDepth = tremT / 2
        echoOn = p.echo > 0f; echoWet = p.echo * 0.55f; echoFb = p.echo * 0.42f
        revOn = p.reverb > 0f; revWet = p.reverb.toDouble(); revDry = 1 - p.reverb * 0.7
        gainTarget = p.gain.toDouble()
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val n = inputBuffer.remaining()
        if (n == 0) return
        val p = params
        if (p !== applied) { refresh(p); applied = p }
        val out = replaceOutputBuffer(n)
        val bypass = p.neutral && abs(gainNow - 1.0) < 0.001 && limDb > -0.01
        val frames = n / (2 * ch)
        val tremInc = 2 * PI * 5.2 / sr
        var rp = wPos
        val t = tmp

        for (f in 0 until frames) {
            var mono = 0f
            if (bypass) {
                for (c in 0 until ch) { val s = inputBuffer.getShort(); out.putShort(s); mono += s / 32768.0f }
            } else {
                gainNow += (gainTarget - gainNow) * gainK
                val trem = if (tremOn) (1 - tremDepth) + tremDepth * sin(tremPhase) else 1.0
                var peak = 0.0
                for (c in 0 until ch) {
                    val st = chans[c]
                    var x = inputBuffer.getShort() / 32768.0
                    if (eqOn) for (b in 0 until 10) if (eqActive[b]) x = st.eq[b].process(x)
                    x *= gainNow
                    var side = 0.0                                  // echo repeats and bass harmonics join after the reverb
                    if (bassOn) {
                        val s = st.sub.process(x)
                        x = st.peak.process(st.shelf.process(s))
                        side += st.exHp.process(shape(st.exLp.process(s), exK)) * exGain
                    }
                    if (lpOn) x = st.lp.process(x)
                    if (hpOn) x = st.hp.process(x)
                    if (distOn) x = shape(x, distK)
                    if (crushOn) {
                        if (++st.crushCount >= crushEvery) { st.crushCount = 0; st.crushHold = Math.rint(x / crushStep) * crushStep }
                        x = st.crushHold
                    }
                    x *= trem
                    if (echoOn) {
                        val e = st.echo; val i = if (echoIdx < e.size) echoIdx else 0
                        val d = e[i]
                        e[i] = (x + d * echoFb).toFloat()
                        side += d * echoWet
                    }
                    if (revOn) {
                        val d = st.pre[st.preIdx]; st.pre[st.preIdx] = x.toFloat()
                        if (++st.preIdx >= st.pre.size) st.preIdx = 0
                        st.dark += (st.wetLp.process(st.wetHp.process(d.toDouble())) - st.dark) * revDark
                        if (abs(st.dark) < 1e-25) st.dark = 0.0
                        val inp = st.dark.toFloat()
                        var r = 0f
                        for (cb in st.combs) r += cb.process(inp, 0.945f, 0.25f)
                        for (ap in st.aps) r = ap.process(r)
                        x = x * revDry + r * revNorm * revWet
                    }
                    x += side
                    t[c] = x
                    val a = abs(x); if (a > peak) peak = a
                }
                if (echoOn && ++echoIdx >= chans[0].echo.size) echoIdx = 0
                if (tremOn) { tremPhase += tremInc; if (tremPhase > 2 * PI) tremPhase -= 2 * PI }

                // Limiter: turns the whole signal down smoothly when it would clip (all channels together, so the
                // stereo picture stays put). Fast to react, slow to let go, like the page's compressor.
                var want = 0.0
                if (peak > 0.7943) {                                 // -2 dB
                    val over = 20 * log10(peak) - LIM_THRESH_DB
                    val y = if (over < LIM_KNEE_DB) over - (1 - 1 / LIM_RATIO) * over * over / (2 * LIM_KNEE_DB)
                            else LIM_KNEE_DB - (1 - 1 / LIM_RATIO) * LIM_KNEE_DB / 2 + (over - LIM_KNEE_DB) / LIM_RATIO
                    want = y - over
                }
                limDb += (want - limDb) * (if (want < limDb) limAtk else limRel)
                val lg = if (limDb < -0.001) 10.0.pow(limDb / 20) else 1.0
                for (c in 0 until ch) {
                    var x = t[c] * lg
                    // What gets past in the first two milliseconds is rounded off instead of cut off. The curve has no
                    // step in it (the old one jumped from 0.95 to 0.74, which is the crackle the booster made).
                    val a = abs(x)
                    if (a > 0.9) x = sign(x) * (0.9 + 0.1 * tanh((a - 0.9) / 0.1))
                    val s = (x * 32767.0).roundToInt().coerceIn(-32768, 32767)
                    out.putShort(s.toShort())
                    mono += s / 32768.0f
                }
            }
            ring[rp] = mono / ch; rp = (rp + 1) and (RING - 1)
        }
        synchronized(clk) { wPos = rp; clkFrames += frames }
        // Any trailing partial frame is dropped (never happens with whole-frame PCM).
        inputBuffer.position(inputBuffer.limit())
        out.flip()
    }

    // ---------- Visualizer: a ring of the output, and the clock that says which part of it is audible ----------
    private val ring = FloatArray(RING)
    private val clk = Any()
    private var wPos = 0                 // next write index
    private var clkFrames = 0L           // frames written since the clock was last set
    private var clkBaseUs = UNSET        // playback time of frame 0
    private var rate = 44100
    val sampleRate: Int get() = synchronized(clk) { rate }

    /** The audio output was emptied (seek, new song, new format): the next buffer starts the clock again. */
    fun clockReset() { synchronized(clk) { clkBaseUs = UNSET; clkFrames = 0 } }

    /**
     * Called with the timestamp of every buffer before it is processed. The clock runs by counting samples, as the
     * audio output's own position does; it is only moved when the output moves its own (a jump in the timestamps).
     */
    fun clockBuffer(ptsUs: Long, resync: Boolean) {
        synchronized(clk) {
            if (clkBaseUs == UNSET) { clkBaseUs = ptsUs; clkFrames = 0; return }
            val expected = clkBaseUs + clkFrames * 1_000_000L / rate
            if (resync || abs(expected - ptsUs) > 200_000L) clkBaseUs += ptsUs - expected
        }
    }

    private val re = DoubleArray(FFT_N); private val im = DoubleArray(FFT_N)
    private val win = DoubleArray(FFT_N) { 0.5 - 0.5 * cos(2 * PI * it / (FFT_N - 1)) }

    /**
     * The sound around playback time [atUs] (or the newest sound when the time is not known):
     * [freq] like AnalyserNode.getByteFrequencyData (-100..-30 dB mapped to 0..255), [wave] as 0..255 samples.
     */
    @Synchronized fun analyse(freq: ByteArray, wave: ByteArray, atUs: Long) {
        val end: Int; var back = 0L
        synchronized(clk) {
            end = wPos
            if (clkBaseUs != UNSET && atUs != UNSET) back = (clkBaseUs + clkFrames * 1_000_000L / rate - atUs) * rate / 1_000_000L
        }
        val start = end - back.coerceIn((FFT_N / 2).toLong(), (RING - FFT_N).toLong()).toInt() - FFT_N / 2
        val step = max(1, FFT_N / wave.size)
        for (i in wave.indices) {
            val v = ring[(start + i * step) and (RING - 1)]
            wave[i] = (128 + v * 127).toInt().coerceIn(0, 255).toByte()
        }
        for (i in 0 until FFT_N) { re[i] = ring[(start + i) and (RING - 1)] * win[i]; im[i] = 0.0 }
        fft()
        for (i in 0 until min(freq.size, FFT_N / 2)) {
            val mag = sqrt(re[i] * re[i] + im[i] * im[i]) / FFT_N * 2
            val db = 20 * log10(max(mag, 1e-9))
            freq[i] = (((db + 100.0) / 70.0) * 255.0).coerceIn(0.0, 255.0).toInt().toByte()
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

/**
 * Sits in front of the real audio output and keeps the visualizer's clock: it stamps each buffer on its way into
 * [FxAudioProcessor], and remembers the position the output last reported (the sound that is audible, with the
 * output buffer and the device's delay, Bluetooth included, already taken off).
 */
@UnstableApi
class VizClockSink(sink: AudioSink, private val fx: FxAudioProcessor) : ForwardingAudioSink(sink) {
    private var fresh = true           // the next handleBuffer call brings a buffer not seen before
    private var resync = false
    private var restart = true
    private var format = ""
    private val lock = Any()
    private var posUs = FxAudioProcessor.UNSET; private var posAtNs = 0L; private var speed = 1f

    override fun configure(inputFormat: Format, specifiedBufferSize: Int, outputChannels: IntArray?) {
        super.configure(inputFormat, specifiedBufferSize, outputChannels)
        val f = "${inputFormat.sampleMimeType}/${inputFormat.sampleRate}/${inputFormat.channelCount}/${inputFormat.pcmEncoding}"
        if (f != format) { format = f; restart = true }      // a different format gets a new output, counting from zero
    }

    override fun handleBuffer(buffer: ByteBuffer, presentationTimeUs: Long, encodedAccessUnitCount: Int): Boolean {
        if (fresh) {
            if (restart) fx.clockReset()
            fx.clockBuffer(presentationTimeUs, resync)
            restart = false; resync = false
        }
        fresh = super.handleBuffer(buffer, presentationTimeUs, encodedAccessUnitCount)
        return fresh
    }

    override fun getCurrentPositionUs(sourceEnded: Boolean): Long {
        val p = super.getCurrentPositionUs(sourceEnded)
        if (p != FxAudioProcessor.UNSET) {
            val s = playbackParameters.speed
            synchronized(lock) { posUs = p; posAtNs = SystemClock.elapsedRealtimeNanos(); speed = s }
        }
        return p
    }

    override fun handleDiscontinuity() { super.handleDiscontinuity(); resync = true }
    override fun setAudioAttributes(audioAttributes: AudioAttributes) { super.setAudioAttributes(audioAttributes); resync = true }
    override fun setAudioSessionId(audioSessionId: Int) { super.setAudioSessionId(audioSessionId); resync = true }
    override fun flush() { super.flush(); forget() }
    override fun reset() { super.reset(); forget() }
    private fun forget() {
        fresh = true; restart = true; resync = false
        synchronized(lock) { posUs = FxAudioProcessor.UNSET }
        fx.clockReset()
    }

    /** The playback time that is audible right now, or UNSET while nothing has played yet. */
    fun nowUs(): Long = synchronized(lock) {
        if (posUs == FxAudioProcessor.UNSET) return FxAudioProcessor.UNSET
        val dtUs = ((SystemClock.elapsedRealtimeNanos() - posAtNs) / 1000L).coerceIn(0L, 150_000L)
        posUs + (dtUs * speed).toLong()
    }
}
