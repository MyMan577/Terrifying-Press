package com.pressplay.media;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register our native plugins before Capacitor starts the bridge.
        registerPlugin(OnnxSeparatorPlugin.class);
        registerPlugin(SpleeterSeparatorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
