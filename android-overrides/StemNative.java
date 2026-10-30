package com.pressplay.media;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Arrays;

/** Native Spleeter 4-stem and MDX-Net separation. Same maths as the JS versions, same STFT as SpleeterNative. */
final class StemNative {
    private static final int SR = SpleeterNative.SR, N = SpleeterNative.N, HOP = SpleeterNative.HOP,
            T = SpleeterNative.T, F = SpleeterNative.F, BINS = SpleeterNative.BINS, PAD = SpleeterNative.PAD;
    private static final float[] WIN = SpleeterNative.WIN;

    // ---------- Spleeter 4 stems: one U-Net per stem, ratio masks over all four ----------
    // idx[o] = which stems (0 vocals, 1 drums, 2 bass, 3 other) are summed into output o.
    static void sp4(OrtEnvironment env, Accel.Sess[] ss, SpleeterNative.Audio au, int[][] idx, File[] files,
                    SpleeterNative.Progress prog) throws Exception {
        final int len = au.len, ns = ss.length, no = files.length;
        final float[][] pcm = au.ch;
        int Lp = PAD + len + PAD;
        Lp += (HOP - ((Lp - N) % HOP)) % HOP;
        final int nFrames = (Lp - N) / HOP + 1, nSeg = (int) Math.ceil(nFrames / (double) T), SEG = T * HOP, RB = SEG + N;

        final float[][][] ov = new float[no][2][RB];
        final float[][] sRe = new float[2][T * BINS], sIm = new float[2][T * BINS];
        final float[] x = new float[2 * T * F], den = new float[2 * T * F];
        final float[] re = new float[N], im = new float[N], mk = new float[BINS];
        final FloatBuffer inBuf = Accel.directFloats(x.length);
        final long[] dims = {2, 1, T, F};
        final ByteBuffer[] bb = new ByteBuffer[no];
        final OutputStream[] os = new OutputStream[no];
        try {
            for (int o = 0; o < no; o++) {
                bb[o] = ByteBuffer.allocate(SEG * 4).order(ByteOrder.LITTLE_ENDIAN);
                os[o] = new BufferedOutputStream(new FileOutputStream(files[o]), 1 << 16);
                SpleeterNative.wavHeader(os[o], len);
            }
            for (int s = 0; s < nSeg; s++) {
                Arrays.fill(x, 0f);
                for (int c = 0; c < 2; c++) { Arrays.fill(sRe[c], 0f); Arrays.fill(sIm[c], 0f); }
                for (int c = 0; c < 2; c++) {
                    for (int t = 0; t < T; t++) {
                        int fr = s * T + t;
                        if (fr >= nFrames) break;
                        int o0 = fr * HOP - PAD;
                        for (int k = 0; k < N; k++) {
                            int j = o0 + k;
                            re[k] = (j >= 0 && j < len ? pcm[c][j] : 0f) * WIN[k];
                            im[k] = 0f;
                        }
                        SpleeterNative.fft(re, im, false);
                        int rb = t * BINS;
                        for (int k = 0; k < BINS; k++) { sRe[c][rb + k] = re[k]; sIm[c][rb + k] = im[k]; }
                        int xb = c * T * F + t * F;
                        for (int k = 0; k < F; k++) x[xb + k] = (float) Math.sqrt(re[k] * re[k] + im[k] * im[k]);
                    }
                }
                Accel.fill(inBuf, x);

                final OrtSession.Result[] rs = new OrtSession.Result[ns];
                try {
                    final FloatBuffer[] V = new FloatBuffer[ns];
                    Arrays.fill(den, 1e-10f);
                    for (int i = 0; i < ns; i++) {
                        rs[i] = Accel.run(env, ss[i], inBuf, dims);
                        V[i] = ((OnnxTensor) rs[i].get(0)).getFloatBuffer();
                        for (int j = 0; j < den.length; j++) { float v = V[i].get(j); den[j] += v * v; }
                    }
                    for (int c = 0; c < 2; c++) {
                        for (int t = 0; t < T; t++) {
                            if (s * T + t >= nFrames) break;
                            int base = c * T * F + t * F, rb = t * BINS, tb = t * HOP;
                            for (int o = 0; o < no; o++) {
                                for (int k = 0; k < F; k++) {
                                    float a = 0f;
                                    for (int si : idx[o]) { float v = V[si].get(base + k); a += v * v + 2.5e-11f; }
                                    mk[k] = a / den[base + k];
                                }
                                float avg = 0f;
                                for (int k = 0; k < F; k++) avg += mk[k];
                                avg /= F;
                                for (int k = F; k < BINS; k++) mk[k] = avg;
                                for (int k = 0; k < BINS; k++) {
                                    float r = sRe[c][rb + k] * mk[k], i2 = sIm[c][rb + k] * mk[k];
                                    re[k] = r; im[k] = i2;
                                    if (k > 0 && k < N / 2) { re[N - k] = r; im[N - k] = -i2; }
                                }
                                SpleeterNative.fft(re, im, true);
                                float[] ob = ov[o][c];
                                for (int k = 0; k < N; k++) ob[tb + k] += re[k] / N * WIN[k] / 1.5f;
                            }
                        }
                    }
                } finally {
                    for (OrtSession.Result r : rs) if (r != null) r.close();
                }

                for (int o = 0; o < no; o++) {
                    bb[o].clear();
                    for (int q = 0; q < SEG; q++) {
                        int j = s * SEG + q - PAD;
                        if (j < 0) continue;
                        if (j >= len) break;
                        SpleeterNative.putSample(bb[o], ov[o][0][q]);
                        SpleeterNative.putSample(bb[o], ov[o][1][q]);
                    }
                    os[o].write(bb[o].array(), 0, bb[o].position());
                    for (int c = 0; c < 2; c++) {
                        System.arraycopy(ov[o][c], SEG, ov[o][c], 0, RB - SEG);
                        Arrays.fill(ov[o][c], RB - SEG, RB, 0f);
                    }
                }
                if (prog != null) prog.onProgress((s + 1) / (double) nSeg);
            }
        } finally {
            for (OutputStream o : os) if (o != null) { try { o.close(); } catch (Exception ignored) { } }
        }
    }

    // ---------- mixed-radix FFT (radix 2/3/5, Stockham) for MDX's non power-of-two size ----------
    static final class MixedFft {
        final int n, st;
        final int[] R, M, S;
        final double[][] wr, wi, tr, ti;
        final double[] yr, yi, gr = new double[5], gi = new double[5];

        MixedFft(int n) {
            this.n = n;
            int[] fac = new int[32];
            int nf = 0, t = n;
            for (int r : new int[] {5, 3, 2}) while (t % r == 0) { fac[nf++] = r; t /= r; }
            if (t != 1) throw new IllegalArgumentException("FFT size " + n + " not supported");
            st = nf;
            R = new int[nf]; M = new int[nf]; S = new int[nf];
            wr = new double[nf][]; wi = new double[nf][]; tr = new double[nf][]; ti = new double[nf][];
            int len = n, s = 1;
            for (int q = 0; q < nf; q++) {
                int r = fac[q], m = len / r;
                R[q] = r; M[q] = m; S[q] = s;
                wr[q] = new double[r * r]; wi[q] = new double[r * r];
                tr[q] = new double[m * r]; ti[q] = new double[m * r];
                for (int u = 0; u < r; u++) for (int k = 0; k < r; k++) {
                    double a = -2 * Math.PI * ((u * k) % r) / r;
                    wr[q][u * r + k] = Math.cos(a); wi[q][u * r + k] = Math.sin(a);
                }
                for (int p = 0; p < m; p++) for (int u = 0; u < r; u++) {
                    double a = -2 * Math.PI * p * u / len;
                    tr[q][p * r + u] = Math.cos(a); ti[q][p * r + u] = Math.sin(a);
                }
                len = m; s *= r;
            }
            yr = new double[n]; yi = new double[n];
        }

        /** In place, forward. */
        void run(double[] xr, double[] xi) {
            double[] ar = xr, ai = xi, br = yr, bi = yi;
            for (int q = 0; q < st; q++) {
                final int r = R[q], m = M[q], s = S[q];
                final double[] Wr = wr[q], Wi = wi[q], Tr = tr[q], Ti = ti[q];
                for (int p = 0; p < m; p++) for (int qq = 0; qq < s; qq++) {
                    for (int k = 0; k < r; k++) { int idx = qq + s * (p + k * m); gr[k] = ar[idx]; gi[k] = ai[idx]; }
                    for (int u = 0; u < r; u++) {
                        double sr = 0, si = 0;
                        for (int k = 0; k < r; k++) {
                            double cr = Wr[u * r + k], ci = Wi[u * r + k];
                            sr += gr[k] * cr - gi[k] * ci;
                            si += gr[k] * ci + gi[k] * cr;
                        }
                        double c = Tr[p * r + u], d = Ti[p * r + u];
                        int o = qq + s * (r * p + u);
                        br[o] = sr * c - si * d;
                        bi[o] = sr * d + si * c;
                    }
                }
                double[] tmp = ar; ar = br; br = tmp;
                tmp = ai; ai = bi; bi = tmp;
            }
            if (ar != xr) { System.arraycopy(ar, 0, xr, 0, n); System.arraycopy(ai, 0, xi, 0, n); }
        }
    }

    // ---------- MDX-Net (UVR): vocal spectrogram model, instrumental = mix - vocals ----------
    static void mdx(OrtEnvironment env, Accel.Sess ss, SpleeterNative.Audio au, int NF, int DF, double comp,
                    File outV, File outI, SpleeterNative.Progress prog) throws Exception {
        final int H = 1024, DT = 256, half = NF >> 1, chunk = H * (DT - 1), gen = chunk - NF;
        final int len = au.len, nChunks = Math.max(1, (int) Math.ceil(len / (double) gen));
        final float[][] pcm = au.ch;
        final MixedFft fft = new MixedFft(NF);
        final double[] w = new double[NF];
        for (int i = 0; i < NF; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NF);
        final double[] env2 = new double[chunk];
        for (int t = 0; t < DT; t++) for (int i = 0; i < NF; i++) {
            int q = t * H - half + i;
            if (q >= 0 && q < chunk) env2[q] += w[i] * w[i];
        }
        final double[] re = new double[NF], im = new double[NF];
        final float[] X = new float[4 * DF * DT];
        final float[][] acc = new float[2][chunk];
        final FloatBuffer inBuf = Accel.directFloats(X.length);
        final long[] dims = {1, 4, DF, DT};
        final ByteBuffer bv = ByteBuffer.allocate(gen * 4).order(ByteOrder.LITTLE_ENDIAN);
        final ByteBuffer bi2 = ByteBuffer.allocate(gen * 4).order(ByteOrder.LITTLE_ENDIAN);
        OutputStream oV = null, oI = null;
        try {
            if (outV != null) { oV = new BufferedOutputStream(new FileOutputStream(outV), 1 << 16); SpleeterNative.wavHeader(oV, len); }
            if (outI != null) { oI = new BufferedOutputStream(new FileOutputStream(outI), 1 << 16); SpleeterNative.wavHeader(oI, len); }
            for (int j = 0; j < nChunks; j++) {
                final int base = j * gen - half;
                Arrays.fill(X, 0f);
                for (int t = 0; t < DT; t++) {
                    int st = t * H - half;
                    for (int i = 0; i < NF; i++) {
                        int q = st + i;
                        if (q < 0) q = -q; else if (q >= chunk) q = 2 * (chunk - 1) - q;   // reflect padding
                        int a = base + q;
                        boolean ok = a >= 0 && a < len;
                        re[i] = (ok ? pcm[0][a] : 0f) * w[i];
                        im[i] = (ok ? pcm[1][a] : 0f) * w[i];
                    }
                    fft.run(re, im);
                    for (int k = 3; k < DF; k++) {   // split the two real signals back apart
                        double a = re[k], b = im[k], c2 = re[NF - k], d = im[NF - k];
                        X[(0 * DF + k) * DT + t] = (float) ((a + c2) / 2);
                        X[(1 * DF + k) * DT + t] = (float) ((b - d) / 2);
                        X[(2 * DF + k) * DT + t] = (float) ((b + d) / 2);
                        X[(3 * DF + k) * DT + t] = (float) ((c2 - a) / 2);
                    }
                }
                Accel.fill(inBuf, X);
                Arrays.fill(acc[0], 0f);
                Arrays.fill(acc[1], 0f);
                try (OrtSession.Result res = Accel.run(env, ss, inBuf, dims)) {
                    final FloatBuffer Y = ((OnnxTensor) res.get(0)).getFloatBuffer();
                    for (int t = 0; t < DT; t++) {
                        Arrays.fill(re, 0.0);
                        Arrays.fill(im, 0.0);
                        for (int k = 0; k < DF; k++) {
                            double Ar = Y.get(k * DT + t), Ai = k > 0 ? Y.get((DF + k) * DT + t) : 0;
                            double Br = Y.get((2 * DF + k) * DT + t), Bi = k > 0 ? Y.get((3 * DF + k) * DT + t) : 0;
                            re[k] = Ar - Bi;
                            im[k] = -(Ai + Br);
                            if (k > 0) { re[NF - k] = Ar + Bi; im[NF - k] = Ai - Br; }
                        }
                        fft.run(re, im);
                        int st = t * H - half;
                        for (int i = 0; i < NF; i++) {
                            int q = st + i;
                            if (q >= 0 && q < chunk) {
                                double g = w[i] / NF;
                                acc[0][q] += (float) (re[i] * g);
                                acc[1][q] -= (float) (im[i] * g);
                            }
                        }
                    }
                }
                int start = j * gen, n = Math.min(gen, len - start);
                bv.clear();
                bi2.clear();
                for (int i = 0; i < n; i++) {
                    double e = Math.max(env2[half + i], 1e-8);
                    float v0 = (float) (acc[0][half + i] / e * comp), v1 = (float) (acc[1][half + i] / e * comp);
                    if (oV != null) { SpleeterNative.putSample(bv, v0); SpleeterNative.putSample(bv, v1); }
                    if (oI != null) { SpleeterNative.putSample(bi2, pcm[0][start + i] - v0); SpleeterNative.putSample(bi2, pcm[1][start + i] - v1); }
                }
                if (oV != null) oV.write(bv.array(), 0, bv.position());
                if (oI != null) oI.write(bi2.array(), 0, bi2.position());
                if (prog != null) prog.onProgress((j + 1) / (double) nChunks);
            }
        } finally {
            if (oV != null) { try { oV.close(); } catch (Exception ignored) { } }
            if (oI != null) { try { oI.close(); } catch (Exception ignored) { } }
        }
    }

    // ---------- Demucs (waveform in, stems out; the STFT is inside the ONNX graph) ----------
    // rows[o] = source indices summed into output o. 25% overlap with linear cross-fades, like the JS version.
    static final int DEMUCS_SEG = 343980;

    static void demucs(OrtEnvironment env, Accel.Sess ss, SpleeterNative.Audio au, int[][] rows, File[] files,
                       SpleeterNative.Progress prog) throws Exception {
        final int SEGN = DEMUCS_SEG, overlap = SEGN >> 2, stride = SEGN - overlap;
        final int len = au.len, no = files.length, nChunks = Math.max(1, (int) Math.ceil(len / (double) stride));
        final float[][] pcm = au.ch;
        final float[][][] acc = new float[no][2][SEGN];
        final float[] weight = new float[SEGN], w = new float[SEGN], x = new float[2 * SEGN];
        final FloatBuffer inBuf = Accel.directFloats(x.length);
        final long[] dims = {1, 2, SEGN};
        final ByteBuffer bb = ByteBuffer.allocate(stride * 4).order(ByteOrder.LITTLE_ENDIAN);
        final OutputStream[] os = new OutputStream[no];
        try {
            for (int o = 0; o < no; o++) {
                os[o] = new BufferedOutputStream(new FileOutputStream(files[o]), 1 << 16);
                SpleeterNative.wavHeader(os[o], len);
            }
            for (int i = 0; i < nChunks; i++) {
                final int start = i * stride, end = Math.min(start + SEGN, len), cl = end - start;
                final boolean last = i == nChunks - 1;
                Arrays.fill(x, 0f);
                System.arraycopy(pcm[0], start, x, 0, cl);
                System.arraycopy(pcm[1], start, x, SEGN, cl);
                Accel.fill(inBuf, x);
                try (OrtSession.Result res = Accel.run(env, ss, inBuf, dims)) {
                    final FloatBuffer y = ((OnnxTensor) res.get(0)).getFloatBuffer();   // [1, S, 2, SEG]
                    for (int j = 0; j < cl; j++) {
                        float g = 1f;
                        if (i > 0 && j < overlap) g = j / (float) (overlap - 1);
                        if (end < len && j >= SEGN - overlap) g = Math.min(g, (SEGN - 1 - j) / (float) (overlap - 1));
                        w[j] = g;
                        weight[j] += g;
                    }
                    for (int o = 0; o < no; o++) for (int c = 0; c < 2; c++) {
                        final float[] a = acc[o][c];
                        for (int r : rows[o]) {
                            final int base = (r * 2 + c) * SEGN;
                            for (int j = 0; j < cl; j++) a[j] += y.get(base + j) * w[j];
                        }
                    }
                }
                final int n = last ? cl : stride;
                for (int o = 0; o < no; o++) {
                    bb.clear();
                    for (int j = 0; j < n; j++) {
                        float wt = Math.max(weight[j], 1e-8f);
                        SpleeterNative.putSample(bb, acc[o][0][j] / wt);
                        SpleeterNative.putSample(bb, acc[o][1][j] / wt);
                    }
                    os[o].write(bb.array(), 0, bb.position());
                    if (!last) for (int c = 0; c < 2; c++) {
                        System.arraycopy(acc[o][c], stride, acc[o][c], 0, SEGN - stride);
                        Arrays.fill(acc[o][c], SEGN - stride, SEGN, 0f);
                    }
                }
                if (!last) {
                    System.arraycopy(weight, stride, weight, 0, SEGN - stride);
                    Arrays.fill(weight, SEGN - stride, SEGN, 0f);
                }
                if (prog != null) prog.onProgress((i + 1) / (double) nChunks);
            }
        } finally {
            for (OutputStream o : os) if (o != null) { try { o.close(); } catch (Exception ignored) { } }
        }
    }
}
