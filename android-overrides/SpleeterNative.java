package com.pressplay.media;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;

/**
 * Spleeter 2-stem separation, entirely native: decode, STFT, ONNX inference,
 * soft masking, inverse STFT and WAV output. Same maths as the browser version.
 */
final class SpleeterNative {

    static final int SR = 44100, N = 4096, HOP = 1024, T = 512, F = 1024;
    static final int BINS = N / 2 + 1, PAD = N - HOP, SEG = T * HOP, RB = SEG + N;

    static final float[] WIN = new float[N];
    static final int[] REV = new int[N];
    static final float[] COS = new float[N / 2], SIN = new float[N / 2];
    static {
        for (int i = 0; i < N; i++) WIN[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        int b = Integer.numberOfTrailingZeros(N);
        for (int i = 0; i < N; i++) REV[i] = Integer.reverse(i) >>> (32 - b);
        for (int i = 0; i < N / 2; i++) {
            COS[i] = (float) Math.cos(2 * Math.PI * i / N);
            SIN[i] = (float) Math.sin(2 * Math.PI * i / N);
        }
    }

    interface Progress { void onProgress(double fraction); }

    static final class Audio {
        float[][] ch;   // [left, right] at SR
        int len;
    }

    // ---------- FFT (in place, radix-2) ----------
    static void fft(float[] re, float[] im, boolean inverse) {
        for (int i = 0; i < N; i++) {
            int j = REV[i];
            if (j > i) {
                float t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        float sign = inverse ? 1f : -1f;
        for (int size = 2; size <= N; size <<= 1) {
            int half = size >> 1, step = N / size;
            for (int s = 0; s < N; s += size) {
                for (int k = 0, w = 0; k < half; k++, w += step) {
                    float wr = COS[w], wi = sign * SIN[w];
                    int a = s + k, b = a + half;
                    float tr = re[b] * wr - im[b] * wi;
                    float ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr; im[b] = im[a] - ti;
                    re[a] += tr; im[a] += ti;
                }
            }
        }
    }

    // ---------- ONNX session ----------
    static String accelUsed = "CPU";   // which hardware the last session really runs on

    static OrtSession open(OrtEnvironment env, File f, boolean useNnapi) throws Exception {
        Accel.Sess x = Accel.open(env, f.getName(), f, useNnapi, new long[] {2, 1, T, F});
        accelUsed = x.accel();
        return x.s;
    }

    // ---------- decode any audio file to 44.1 kHz stereo float ----------
    static Audio decode(File file) throws IOException {
        MediaExtractor ex = new MediaExtractor();
        ex.setDataSource(file.getAbsolutePath());
        int track = -1;
        MediaFormat fmt = null;
        for (int i = 0; i < ex.getTrackCount(); i++) {
            MediaFormat f = ex.getTrackFormat(i);
            String mime = f.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) { track = i; fmt = f; break; }
        }
        if (track < 0) { ex.release(); throw new IOException("This file has no audio track"); }
        ex.selectTrack(track);

        String mime = fmt.getString(MediaFormat.KEY_MIME);
        int rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        int chans = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        long durUs = fmt.containsKey(MediaFormat.KEY_DURATION) ? fmt.getLong(MediaFormat.KEY_DURATION) : 0L;
        int cap = (int) Math.min(Integer.MAX_VALUE / 2, durUs * rate / 1000000L + rate);

        float[] L = new float[cap], R = new float[cap];
        int n = 0;
        MediaCodec codec = MediaCodec.createDecoderByType(mime);
        codec.configure(fmt, null, null, 0);
        codec.start();
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean inDone = false, outDone = false;
        try {
            while (!outDone) {
                if (!inDone) {
                    int ii = codec.dequeueInputBuffer(10000);
                    if (ii >= 0) {
                        ByteBuffer ib = codec.getInputBuffer(ii);
                        int size = ex.readSampleData(ib, 0);
                        if (size < 0) {
                            codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inDone = true;
                        } else {
                            codec.queueInputBuffer(ii, 0, size, ex.getSampleTime(), 0);
                            ex.advance();
                        }
                    }
                }
                int oi = codec.dequeueOutputBuffer(info, 10000);
                if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = codec.getOutputFormat();
                    rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    chans = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                } else if (oi >= 0) {
                    if (info.size > 0) {
                        ByteBuffer ob = codec.getOutputBuffer(oi);
                        ob.position(info.offset);
                        ob.limit(info.offset + info.size);
                        ob = ob.slice().order(ByteOrder.nativeOrder());
                        ShortBuffer sb = ob.asShortBuffer();
                        int frames = sb.remaining() / chans;
                        if (n + frames > L.length) {
                            int nc = Math.max(n + frames, L.length * 3 / 2);
                            L = Arrays.copyOf(L, nc);
                            R = Arrays.copyOf(R, nc);
                        }
                        for (int i = 0; i < frames; i++) {
                            int b = i * chans;
                            float l = sb.get(b) / 32768f;
                            float r = chans > 1 ? sb.get(b + 1) / 32768f : l;
                            L[n] = l;
                            R[n] = r;
                            n++;
                        }
                    }
                    codec.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                }
            }
        } finally {
            codec.stop();
            codec.release();
            ex.release();
        }

        if (rate != SR) {                       // simple linear resample to 44.1 kHz
            int nn = (int) ((long) n * SR / rate);
            float[] l2 = new float[nn], r2 = new float[nn];
            for (int i = 0; i < nn; i++) {
                double src = i * (double) rate / SR;
                int i0 = (int) src;
                int i1 = Math.min(i0 + 1, n - 1);
                double f = src - i0;
                l2[i] = (float) (L[i0] * (1 - f) + L[i1] * f);
                r2[i] = (float) (R[i0] * (1 - f) + R[i1] * f);
            }
            L = l2;
            R = r2;
            n = nn;
        }
        Audio a = new Audio();
        a.ch = new float[][] { L, R };
        a.len = n;
        return a;
    }

    // ---------- WAV output ----------
    static void wavHeader(OutputStream o, int frames) throws IOException {
        int dataBytes = frames * 4;
        ByteBuffer b = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes("US-ASCII")).putInt(36 + dataBytes)
         .put("WAVE".getBytes("US-ASCII"))
         .put("fmt ".getBytes("US-ASCII")).putInt(16)
         .putShort((short) 1).putShort((short) 2)
         .putInt(SR).putInt(SR * 4)
         .putShort((short) 4).putShort((short) 16)
         .put("data".getBytes("US-ASCII")).putInt(dataBytes);
        o.write(b.array());
    }

    static void putSample(ByteBuffer bb, float x) {
        float v = Math.max(-1f, Math.min(1f, x));
        bb.putShort((short) Math.round(v * 32767f));
    }

    // ---------- the separator ----------
    static void separate(OrtEnvironment env, OrtSession vS, OrtSession aS, Audio au, double sharp,
                         File outV, File outA, Progress prog) throws Exception {
        final int len = au.len;
        final float[][] pcm = au.ch;
        final Accel.Sess sv = Accel.wrap(vS), sa = Accel.wrap(aS);
        final FloatBuffer inBuf = Accel.directFloats(2 * T * F);
        final long[] dims = {2, 1, T, F};
        final int nSeg = (int) Math.ceil((len + PAD) / (double) SEG);

        final float[][] ovV = new float[2][RB], ovA = new float[2][RB];   // rolling overlap-add buffers
        final float[][] sRe = new float[2][T * BINS], sIm = new float[2][T * BINS];
        final float[] x = new float[2 * T * F];
        final float[] re = new float[N], im = new float[N], m = new float[BINS];
        final ByteBuffer bbV = ByteBuffer.allocate(SEG * 4).order(ByteOrder.LITTLE_ENDIAN);
        final ByteBuffer bbA = ByteBuffer.allocate(SEG * 4).order(ByteOrder.LITTLE_ENDIAN);

        try (OutputStream oV = new BufferedOutputStream(new FileOutputStream(outV), 1 << 16);
             OutputStream oA = new BufferedOutputStream(new FileOutputStream(outA), 1 << 16)) {
            wavHeader(oV, len);
            wavHeader(oA, len);

            for (int s = 0; s < nSeg; s++) {
                // 1) analysis: STFT of this segment's frames, magnitudes into the model input
                for (int c = 0; c < 2; c++) {
                    for (int t = 0; t < T; t++) {
                        int o0 = (s * T + t) * HOP - PAD;
                        for (int k = 0; k < N; k++) {
                            int j = o0 + k;
                            re[k] = (j >= 0 && j < len ? pcm[c][j] : 0f) * WIN[k];
                            im[k] = 0f;
                        }
                        fft(re, im, false);
                        int rb = t * BINS;
                        for (int k = 0; k < BINS; k++) { sRe[c][rb + k] = re[k]; sIm[c][rb + k] = im[k]; }
                        int xb = c * T * F + t * F;
                        for (int k = 0; k < F; k++) x[xb + k] = (float) Math.sqrt(re[k] * re[k] + im[k] * im[k]);
                    }
                }

                // 2) inference: vocals and accompaniment models (native ONNX Runtime, no tensor copies)
                Accel.fill(inBuf, x);
                try (OrtSession.Result rv = Accel.run(env, sv, inBuf, dims);
                     OrtSession.Result ra = Accel.run(env, sa, inBuf, dims)) {
                final FloatBuffer V = ((OnnxTensor) rv.get(0)).getFloatBuffer();
                final FloatBuffer A = ((OnnxTensor) ra.get(0)).getFloatBuffer();

                // 3) soft masks, applied to the spectrum, then inverse STFT with overlap-add
                for (int c = 0; c < 2; c++) {
                    for (int t = 0; t < T; t++) {
                        int xb = c * T * F + t * F;
                        for (int k = 0; k < F; k++) {
                            float vk = V.get(xb + k);
                            float v2 = vk * vk;
                            float ak = A.get(xb + k);
                            float a2 = ak * ak;
                            float mk = (v2 + 5e-11f) / (v2 + a2 + 1e-10f);
                            if (sharp != 1.0) {
                                double pa = Math.pow(mk, sharp), pb = Math.pow(1 - mk, sharp);
                                mk = (float) (pa / (pa + pb + 1e-12));
                            }
                            m[k] = mk;
                        }
                        float avg = 0f;
                        for (int k = F - 64; k < F; k++) avg += m[k];
                        avg /= 64f;
                        for (int k = F; k < BINS; k++) m[k] = avg;

                        int rb = t * BINS, tb = t * HOP;
                        for (int pass = 0; pass < 2; pass++) {
                            for (int k = 0; k < BINS; k++) {
                                float g = pass == 0 ? m[k] : 1f - m[k];
                                float r = sRe[c][rb + k] * g;
                                float i = sIm[c][rb + k] * g;
                                re[k] = r;
                                im[k] = i;
                                if (k > 0 && k < N / 2) { re[N - k] = r; im[N - k] = -i; }
                            }
                            fft(re, im, true);
                            float[][] ob = pass == 0 ? ovV : ovA;
                            for (int k = 0; k < N; k++) ob[c][tb + k] += re[k] / N * WIN[k] / 1.5f;
                        }
                    }
                }

                }   // results closed here

                // 4) samples before index SEG are final now: write them out
                bbV.clear();
                bbA.clear();
                for (int q = 0; q < SEG; q++) {
                    int j = s * SEG + q - PAD;
                    if (j < 0) continue;
                    if (j >= len) break;
                    putSample(bbV, ovV[0][q]);
                    putSample(bbV, ovV[1][q]);
                    putSample(bbA, ovA[0][q]);
                    putSample(bbA, ovA[1][q]);
                }
                oV.write(bbV.array(), 0, bbV.position());
                oA.write(bbA.array(), 0, bbA.position());

                // 5) slide the buffers forward
                for (int c = 0; c < 2; c++) {
                    System.arraycopy(ovV[c], SEG, ovV[c], 0, RB - SEG);
                    Arrays.fill(ovV[c], RB - SEG, RB, 0f);
                    System.arraycopy(ovA[c], SEG, ovA[c], 0, RB - SEG);
                    Arrays.fill(ovA[c], RB - SEG, RB, 0f);
                }
                if (prog != null) prog.onProgress((s + 1) / (double) nSeg);
            }
        } finally {
            accelUsed = sv.nn && sa.nn ? "NNAPI" : (sv.nn || sa.nn ? "NNAPI+CPU" : "CPU");
            if (sv.s != vS) { Accel.close(sv); }   // a CPU replacement made after an NNAPI failure
            if (sa.s != aS) { Accel.close(sa); }
        }
    }
}
