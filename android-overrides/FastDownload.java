package com.pressplay.media;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Downloads one file over several connections at once (HTTP Range requests, 4 MB pieces, a few retries per piece).
 * One connection to Hugging Face's CDN is often far below the phone's real speed; 4-6 usually fill the line.
 * Throws NoRanges when the server cannot do ranges or the file is small, so the caller can use its plain single download.
 */
final class FastDownload {
    interface Progress { void on(long got, long total); }
    static final class NoRanges extends IOException { NoRanges() { super("ranges not supported"); } }

    private static final int CONNS = 6, PIECE = 4 << 20, MIN_PARALLEL = 8 << 20, TRIES = 4;

    private static HttpURLConnection open(URL u, long from, long to) throws IOException {
        HttpURLConnection c = (HttpURLConnection) u.openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Accept-Encoding", "identity");
        c.setRequestProperty("Range", "bytes=" + from + "-" + to);
        return c;
    }

    static void fetch(String url, File out, Progress prog) throws IOException {
        URL u0 = new URL(url);
        HttpURLConnection probe = open(u0, 0, 0);
        long total = -1;
        URL resolved;
        try {
            probe.connect();
            if (probe.getResponseCode() != 206) throw new NoRanges();
            String cr = probe.getHeaderField("Content-Range");               // "bytes 0-0/123456"
            int i = cr == null ? -1 : cr.lastIndexOf('/');
            if (i > 0) { try { total = Long.parseLong(cr.substring(i + 1).trim()); } catch (NumberFormatException ignored) { } }
            resolved = probe.getURL();                                       // the CDN address after the redirect
        } finally { probe.disconnect(); }
        if (total < MIN_PARALLEL) throw new NoRanges();

        final long size = total;
        final URL url2 = resolved;
        final int pieces = (int) ((size + PIECE - 1) / PIECE);
        final AtomicInteger next = new AtomicInteger();
        final AtomicLong got = new AtomicLong();
        final Throwable[] fail = new Throwable[1];
        try (RandomAccessFile raf = new RandomAccessFile(out, "rw")) {
            raf.setLength(size);
            final FileChannel ch = raf.getChannel();
            Thread[] ts = new Thread[Math.min(CONNS, pieces)];
            for (int t = 0; t < ts.length; t++) {
                ts[t] = new Thread(() -> {
                    byte[] buf = new byte[1 << 16];
                    int n;
                    while (fail[0] == null && (n = next.getAndIncrement()) < pieces) {
                        long from = (long) n * PIECE, to = Math.min(size, from + PIECE) - 1, pos = from;
                        for (int attempt = 1; pos <= to; attempt++) {
                            try {
                                HttpURLConnection c = open(url2, pos, to);
                                try {
                                    c.connect();
                                    if (c.getResponseCode() != 206) throw new IOException("HTTP " + c.getResponseCode());
                                    try (InputStream in = c.getInputStream()) {
                                        int r;
                                        while (pos <= to && (r = in.read(buf, 0, (int) Math.min(buf.length, to - pos + 1))) > 0) {
                                            ByteBuffer bb = ByteBuffer.wrap(buf, 0, r);
                                            while (bb.hasRemaining()) pos += ch.write(bb, pos);
                                            prog.on(got.addAndGet(r), size);
                                            if (fail[0] != null) return;
                                        }
                                    }
                                } finally { c.disconnect(); }
                            } catch (IOException e) {
                                if (attempt >= TRIES) { synchronized (fail) { if (fail[0] == null) fail[0] = e; } return; }
                                try { Thread.sleep(500L * attempt); } catch (InterruptedException ie) { return; }
                            }
                        }
                    }
                });
                ts[t].start();
            }
            for (Thread t : ts) {
                try { t.join(); } catch (InterruptedException e) { synchronized (fail) { if (fail[0] == null) fail[0] = e; } }
            }
        }
        if (fail[0] != null) throw new IOException(fail[0].getMessage() != null ? fail[0].getMessage() : fail[0].toString());
        if (got.get() < size) throw new IOException("Download incomplete");
    }
}
