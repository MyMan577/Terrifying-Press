package com.pressplay.media;

import android.os.Build;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Game mode for the games page. While a game is open: the screen stays on the display's fastest
 * mode (120 Hz on a Galaxy S24 Ultra, so adaptive refresh can't drop it), the screen stays awake,
 * and the page's renderer keeps top priority even if it is briefly covered. exit() puts it all back.
 */
@CapacitorPlugin(name = "PPGameMode")
public class GameModePlugin extends Plugin {

    private boolean on = false;
    private int savedModeId = 0;
    private float savedRate = 0f;

    @PluginMethod
    public void enter(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                WindowManager.LayoutParams lp = w.getAttributes();
                if (!on) { savedModeId = lp.preferredDisplayModeId; savedRate = lp.preferredRefreshRate; }
                Display d = Build.VERSION.SDK_INT >= 30 ? getActivity().getDisplay() : w.getWindowManager().getDefaultDisplay();
                if (d != null) {
                    Display.Mode cur = d.getMode();
                    Display.Mode best = cur;
                    for (Display.Mode m : d.getSupportedModes()) {
                        if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()
                                && m.getRefreshRate() > best.getRefreshRate()) best = m;
                    }
                    lp.preferredDisplayModeId = best.getModeId();
                    lp.preferredRefreshRate = best.getRefreshRate();
                }
                w.setAttributes(lp);
                w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                WebView wv = getBridge().getWebView();
                if (wv != null && Build.VERSION.SDK_INT >= 26) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
                on = true;
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "game mode failed" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void exit(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (on) {
                    Window w = getActivity().getWindow();
                    WindowManager.LayoutParams lp = w.getAttributes();
                    lp.preferredDisplayModeId = savedModeId;
                    lp.preferredRefreshRate = savedRate;
                    w.setAttributes(lp);
                    w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    WebView wv = getBridge().getWebView();
                    // Android's default: important while visible, lowered when the app is in the background.
                    if (wv != null && Build.VERSION.SDK_INT >= 26) wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
                    on = false;
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "game mode exit failed" : e.getMessage());
            }
        });
    }
}
