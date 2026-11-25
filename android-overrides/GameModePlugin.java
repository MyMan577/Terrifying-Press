package com.pressplay.media;

import android.os.Build;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
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
                PageAwake.set("game", true);
                on = true;
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "game mode failed" : e.getMessage());
            }
        });
    }

    // ---------- Focus mode: hold the screen at 60 Hz ----------
    // While on, the window asks for the display's ~60 Hz mode at the current resolution, which roughly halves the
    // work of drawing the page. While a game holds the fastest mode, the cap is stored as what the game puts back.
    private boolean capped = false;
    private int capSavedModeId = 0;
    private float capSavedRate = 0f;

    @PluginMethod
    public void cap(final PluginCall call) {
        final boolean want = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                WindowManager.LayoutParams lp = w.getAttributes();
                if (want && !capped) {
                    Display d = Build.VERSION.SDK_INT >= 30 ? getActivity().getDisplay() : w.getWindowManager().getDefaultDisplay();
                    Display.Mode pick = null;
                    if (d != null) {
                        Display.Mode cur = d.getMode();
                        for (Display.Mode m : d.getSupportedModes()) {
                            if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                            if (m.getRefreshRate() < 59f) continue;
                            if (pick == null || m.getRefreshRate() < pick.getRefreshRate()) pick = m;
                        }
                    }
                    if (pick != null) {
                        if (on) { capSavedModeId = savedModeId; capSavedRate = savedRate; savedModeId = pick.getModeId(); savedRate = pick.getRefreshRate(); }
                        else {
                            capSavedModeId = lp.preferredDisplayModeId; capSavedRate = lp.preferredRefreshRate;
                            lp.preferredDisplayModeId = pick.getModeId(); lp.preferredRefreshRate = pick.getRefreshRate();
                            w.setAttributes(lp);
                        }
                        capped = true;
                    }
                } else if (!want && capped) {
                    if (on) { savedModeId = capSavedModeId; savedRate = capSavedRate; }
                    else {
                        lp.preferredDisplayModeId = capSavedModeId; lp.preferredRefreshRate = capSavedRate;
                        w.setAttributes(lp);
                    }
                    capped = false;
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "refresh cap failed" : e.getMessage());
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
                    // Back to Android's default (lowered in the background), unless the player still needs the page.
                    PageAwake.set("game", false);
                    on = false;
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "game mode exit failed" : e.getMessage());
            }
        });
    }

    // ---------- Clipboard for the games ----------
    // Games were written for browsers and copy/paste level codes with navigator.clipboard. Inside the app's game frame
    // reading is not allowed at all (WebView has no clipboard-read permission) and writing can fail, so the frame's
    // shim (pp-games.js) comes here. Reading is fine while the app is on screen, which it is whenever a game asks.
    @PluginMethod
    public void clipRead(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                android.content.ClipboardManager cm = (android.content.ClipboardManager) getContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                String text = "";
                if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip() != null && cm.getPrimaryClip().getItemCount() > 0) {
                    CharSequence t = cm.getPrimaryClip().getItemAt(0).coerceToText(getContext());
                    if (t != null) text = t.toString();
                }
                JSObject r = new JSObject(); r.put("text", text); call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "clipboard read failed" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void clipWrite(final PluginCall call) {
        final String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> {
            try {
                android.content.ClipboardManager cm = (android.content.ClipboardManager) getContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE);
                if (cm == null) throw new IllegalStateException("no clipboard");
                cm.setPrimaryClip(android.content.ClipData.newPlainText("Press Play", text));
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "clipboard write failed" : e.getMessage());
            }
        });
    }
}
