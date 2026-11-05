package com.pressplay.media;

import com.google.ai.edge.litertlm.Backend;
import com.google.ai.edge.litertlm.Conversation;
import com.google.ai.edge.litertlm.ConversationConfig;
import com.google.ai.edge.litertlm.Contents;
import com.google.ai.edge.litertlm.Engine;
import com.google.ai.edge.litertlm.EngineConfig;
import com.google.ai.edge.litertlm.Message;
import com.google.ai.edge.litertlm.MessageCallback;
import com.google.ai.edge.litertlm.RepetitionPenaltyConfig;
import com.google.ai.edge.litertlm.SamplerConfig;
import com.google.ai.edge.litertlm.ToolProvider;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;

/**
 * Chat model through Google's LiteRT-LM (.litertlm files). Unlike LlmNative this needs no tokenizer on the JS side:
 * the runtime applies the model's own chat template, keeps the KV cache and samples. JS sends plain text, gets text back.
 * Engine start-up is slow (seconds), so load() must run on a background thread.
 */
final class LiteRtLlm {
    interface TextSink { void on(String delta); }

    private Engine engine;
    private volatile Conversation active;
    private volatile boolean cancelled;
    private String backendUsed = "CPU";

    synchronized String load(File model, File cacheDir, boolean tryGpu, int cpuThreads) throws Exception {
        close();
        String cache = cacheDir == null ? null : cacheDir.getAbsolutePath();
        Throwable gpuErr = null;
        if (tryGpu) {
            try { engine = start(model, new Backend.GPU(), cache); backendUsed = "GPU"; return backendUsed; }
            catch (Throwable e) { gpuErr = e; engine = null; }      // GPU runtime missing or unsupported: fall through to the CPU
        }
        try {
            engine = start(model, new Backend.CPU(cpuThreads > 0 ? Integer.valueOf(cpuThreads) : null, null), cache);
            backendUsed = "CPU";
            return backendUsed;
        } catch (Throwable e) {
            engine = null;
            throw new Exception(describe(e) + (gpuErr != null ? " (GPU also failed: " + describe(gpuErr) + ")" : ""));
        }
    }

    private static Engine start(File model, Backend b, String cache) {
        // modelPath, backend, vision, audio, maxNumTokens, maxNumImages, cacheDir, activationDataType, speculativeDecodingConfig
        EngineConfig cfg = new EngineConfig(model.getAbsolutePath(), b, null, null, null, null, cache, null, null);   // maxNumTokens null = the model's own limit (some builds only allow 1280)
        Engine e = new Engine(cfg);
        try { e.initialize(); } catch (RuntimeException x) { try { e.close(); } catch (Throwable ignored) { } throw x; }
        return e;
    }

    boolean loaded() { return engine != null; }
    String backend() { return backendUsed; }

    void cancel() {
        cancelled = true;
        Conversation c = active;
        if (c != null) { try { c.cancelProcess(); } catch (Throwable ignored) { } }
    }

    synchronized void close() {
        cancel();
        Conversation c = active; active = null;
        if (c != null) { try { c.close(); } catch (Throwable ignored) { } }
        if (engine != null) { try { engine.close(); } catch (Throwable ignored) { } engine = null; }
    }

    /**
     * One reply. history = {role, text} pairs ("user" or "assistant") that came before the new user message.
     * Streams text pieces to sink and returns the whole reply. A cancel returns what was written so far.
     */
    synchronized String chat(String system, List<String[]> history, String user, int maxNew, double temp, double topP,
                             int topK, double rep, TextSink sink) throws Exception {
        if (engine == null) throw new IllegalStateException("Chat model not loaded");
        cancelled = false;
        List<Message> init = new ArrayList<>();
        for (String[] h : history) init.add("assistant".equals(h[0]) ? Message.Companion.model(h[1]) : Message.Companion.user(h[1]));
        Contents sys = system == null || system.isEmpty() ? null : Contents.Companion.of(system);
        SamplerConfig sampler = new SamplerConfig(Math.max(1, topK), Math.max(0, Math.min(1, topP)), Math.max(0, temp), 0);
        // systemInstruction, initialMessages, tools, samplerConfig
        ConversationConfig cc = new ConversationConfig(sys, init, Collections.<ToolProvider>emptyList(), sampler);
        final StringBuilder out = new StringBuilder();
        final Throwable[] err = new Throwable[1];
        final CountDownLatch done = new CountDownLatch(1);
        Conversation conv = engine.createConversation(cc);
        active = conv;
        try {
            conv.sendMessageAsync(Message.Companion.user(user), new MessageCallback() {
                @Override public void onMessage(Message m) {
                    String t = m.toString();
                    if (t == null || t.isEmpty()) return;
                    out.append(t);
                    if (sink != null) sink.on(t);
                }
                @Override public void onDone() { done.countDown(); }
                @Override public void onError(Throwable t) { if (!cancelled) err[0] = t; done.countDown(); }
            }, Collections.<String, Object>emptyMap(), new RepetitionPenaltyConfig(Float.valueOf((float) Math.max(1.0, rep)), null, null, null),
               null, null, Integer.valueOf(Math.max(1, maxNew)));
            done.await();
        } finally {
            active = null;
            try { conv.close(); } catch (Throwable ignored) { }
        }
        if (err[0] != null) throw new Exception(describe(err[0]));
        return out.toString();
    }

    private static String describe(Throwable e) {
        String m = e.getMessage();
        return m != null && !m.isEmpty() ? m : e.toString();
    }
}
