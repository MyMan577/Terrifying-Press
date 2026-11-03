package com.pressplay.media;

import android.os.StatFs;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/** Real device storage numbers (the WebView's navigator.storage.estimate() only reports its own small quota). */
@CapacitorPlugin(name = "PPStorage")
public class StoragePlugin extends Plugin {

    private static long dirSize(File f) {
        if (f == null || !f.exists()) return 0;
        if (f.isFile()) return f.length();
        long n = 0;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) n += dirSize(k);
        return n;
    }

    @PluginMethod
    public void info(final PluginCall call) {
        new Thread(() -> {
            try {
                File data = getContext().getFilesDir();
                StatFs fs = new StatFs(data.getAbsolutePath());
                long total = fs.getTotalBytes();
                long free = fs.getAvailableBytes();
                long used = dirSize(data) + dirSize(getContext().getCacheDir()) + dirSize(getContext().getExternalFilesDir(null));
                JSObject o = new JSObject();
                o.put("total", total);
                o.put("free", free);
                o.put("used", used);
                call.resolve(o);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "storage info failed" : e.getMessage());
            }
        }).start();
    }
}
