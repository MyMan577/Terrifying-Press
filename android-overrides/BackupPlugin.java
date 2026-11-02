package com.pressplay.media;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedOutputStream;
import java.io.OutputStream;

/**
 * Streams a big export (the library backup .zip) straight into Download/Press Play.
 * Before: the page wrote the whole file to the app cache, then saveToDevice copied it again, so a backup needed twice its size
 * in free space and every byte was handled twice. Now each chunk goes directly into the final file: one copy, no cache file.
 * One export at a time. Capacitor runs plugin calls one after another on a single thread, so begin/write/end keep their order.
 */
@CapacitorPlugin(name = "PPBackup")
public class BackupPlugin extends Plugin {
    private static final String REL = "Download/Press Play";
    private final Object lock = new Object();
    private OutputStream out;
    private Uri uri;
    private long written;

    @PluginMethod
    public void begin(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.reject("unsupported"); return; }   // the page falls back to the old way
        String name = call.getString("name", "export");
        String mime = call.getString("mime", "application/octet-stream");
        synchronized (lock) {
            abortLocked();
            try {
                ContentResolver r = getContext().getContentResolver();
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, REL);
                cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
                uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new IllegalStateException("MediaStore insert failed");
                OutputStream o = r.openOutputStream(uri);
                if (o == null) throw new IllegalStateException("Could not open the output file");
                out = new BufferedOutputStream(o, 1 << 20);
                written = 0;
                call.resolve();
            } catch (Throwable e) {
                abortLocked();
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }
    }

    /** data = base64 of the next piece of the file, in order. */
    @PluginMethod
    public void write(PluginCall call) {
        String data = call.getString("data");
        synchronized (lock) {
            if (out == null) { call.reject("No export in progress"); return; }
            try {
                byte[] b = Base64.decode(data == null ? "" : data, Base64.NO_WRAP);
                out.write(b);
                written += b.length;
                call.resolve();
            } catch (Throwable e) {
                abortLocked();
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }
    }

    @PluginMethod
    public void end(PluginCall call) {
        synchronized (lock) {
            if (out == null || uri == null) { call.reject("No export in progress"); return; }
            try {
                out.close();
                out = null;
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, cv, null, null);
                JSObject r = new JSObject();
                r.put("uri", uri.toString());
                r.put("location", REL);
                r.put("bytes", written);
                uri = null;
                call.resolve(r);
            } catch (Throwable e) {
                abortLocked();
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        }
    }

    /** Throws away a half-written export (error, or the page gave up). */
    @PluginMethod
    public void abort(PluginCall call) {
        synchronized (lock) { abortLocked(); }
        call.resolve();
    }

    private void abortLocked() {
        if (out != null) { try { out.close(); } catch (Throwable ignored) { } out = null; }
        if (uri != null) { try { getContext().getContentResolver().delete(uri, null, null); } catch (Throwable ignored) { } uri = null; }
        written = 0;
    }
}
