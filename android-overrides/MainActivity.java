package com.pressplay.media;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register our native ONNX plugin before Capacitor starts the bridge.
        registerPlugin(OnnxSeparatorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
