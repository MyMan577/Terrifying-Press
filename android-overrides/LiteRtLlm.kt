package com.pressplay.media

import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.MessageCallback
import com.google.ai.edge.litertlm.RepetitionPenaltyConfig
import com.google.ai.edge.litertlm.SamplerConfig
import java.io.File
import java.util.concurrent.CountDownLatch

/** Gets each streamed piece of text. Java calls it with a lambda. */
fun interface TextSink { fun on(delta: String) }

/**
 * Chat model through Google's LiteRT-LM (.litertlm files). JS sends plain text and gets text back, so no tokenizer is needed there.
 * Written in Kotlin on purpose: the plugin (Java) only sees File/String/List, never the LiteRT-LM classes themselves.
 * Engine start-up takes seconds, so load() must be called from a background thread.
 */
class LiteRtLlm {
    private var engine: Engine? = null
    @Volatile private var active: Conversation? = null
    @Volatile private var cancelled = false
    private var backendUsed = "CPU"

    @Synchronized
    fun load(model: File, cacheDir: File?, tryGpu: Boolean, cpuThreads: Int): String {
        close()
        val cache = cacheDir?.absolutePath
        var gpuErr: Throwable? = null
        if (tryGpu) {
            try {
                engine = start(model, Backend.GPU(), cache)
                backendUsed = "GPU"
                return backendUsed
            } catch (e: Throwable) { gpuErr = e; engine = null }      // GPU runtime missing or unsupported: use the CPU
        }
        try {
            engine = start(model, Backend.CPU(threadCount = if (cpuThreads > 0) cpuThreads else null), cache)
            backendUsed = "CPU"
            return backendUsed
        } catch (e: Throwable) {
            engine = null
            throw Exception(describe(e) + (if (gpuErr != null) " (GPU also failed: " + describe(gpuErr) + ")" else ""))
        }
    }

    private fun start(model: File, backend: Backend, cache: String?): Engine {
        // no maxNumTokens: use the model's own limit (some builds only allow 1280)
        val e = Engine(EngineConfig(modelPath = model.absolutePath, backend = backend, cacheDir = cache))
        try { e.initialize() } catch (x: Throwable) { try { e.close() } catch (_: Throwable) { }; throw x }
        return e
    }

    fun loaded(): Boolean = engine != null
    fun backend(): String = backendUsed

    fun cancel() {
        cancelled = true
        val c = active
        if (c != null) { try { c.cancelProcess() } catch (_: Throwable) { } }
    }

    @Synchronized
    fun close() {
        cancel()
        val c = active; active = null
        if (c != null) { try { c.close() } catch (_: Throwable) { } }
        val e = engine; engine = null
        if (e != null) { try { e.close() } catch (_: Throwable) { } }
    }

    /**
     * One reply. history = {role, text} pairs ("user" or "assistant") from before the new user message.
     * Streams text pieces to sink and returns the whole reply. A cancel returns what was written so far.
     */
    @Synchronized
    fun chat(system: String?, history: List<Array<String>>, user: String, maxNew: Int, temp: Double, topP: Double,
             topK: Int, rep: Double, sink: TextSink?): String {
        val e = engine ?: throw IllegalStateException("Chat model not loaded")
        cancelled = false
        val init = history.map { h -> if (h[0] == "assistant") Message.model(h[1]) else Message.user(h[1]) }
        val sys = if (system.isNullOrEmpty()) null else Contents.of(system)
        val sampler = SamplerConfig(topK = maxOf(1, topK), topP = topP.coerceIn(0.0, 1.0), temperature = maxOf(0.0, temp), seed = 0)
        val cc = ConversationConfig(systemInstruction = sys, initialMessages = init, samplerConfig = sampler)
        val out = StringBuilder()
        var err: Throwable? = null
        val done = CountDownLatch(1)
        val conv = e.createConversation(cc)
        active = conv
        try {
            conv.sendMessageAsync(
                Message.user(user),
                object : MessageCallback {
                    override fun onMessage(message: Message) {
                        val t = message.toString()
                        if (t.isNotEmpty()) { out.append(t); sink?.on(t) }
                    }
                    override fun onDone() { done.countDown() }
                    override fun onError(throwable: Throwable) { if (!cancelled) err = throwable; done.countDown() }
                },
                repetitionPenaltyConfig = RepetitionPenaltyConfig(repetitionPenalty = maxOf(1.0, rep).toFloat()),
                maxOutputToken = maxOf(1, maxNew),
            )
            done.await()
        } finally {
            active = null
            try { conv.close() } catch (_: Throwable) { }
        }
        val failure = err
        if (failure != null) throw Exception(describe(failure))
        return out.toString()
    }

    private fun describe(e: Throwable): String = e.message?.takeIf { it.isNotEmpty() } ?: e.toString()
}
