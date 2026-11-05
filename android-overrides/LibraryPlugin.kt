package com.pressplay.media

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.Future

/**
 * Library access through the Storage Access Framework: the app keeps *references* to the user's
 * files (persisted content:// grants) instead of copying every byte into IndexedDB.
 */
@CapacitorPlugin(name = "PPLibrary")
class LibraryPlugin : Plugin() {

    companion object {
        @Volatile var instance: LibraryPlugin? = null
        private val pending = mutableListOf<Uri>()
        private val AUDIO = setOf("mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "wma", "mka", "amr", "aiff", "aif")
        private val VIDEO = setOf("mp4", "m4v", "mkv", "webm", "mov", "avi", "3gp", "ts", "mts", "flv", "wmv", "mpg", "mpeg")
        private val SIDECAR = setOf("vtt", "srt", "ass", "ssa", "lrc")

        @Volatile private var pendingQuery: String? = null
        fun queueOpen(uris: List<Uri>) { synchronized(pending) { pending.addAll(uris) } }
        fun queueSearch(q: String) { pendingQuery = q }
    }

    private val pool = Executors.newFixedThreadPool(3)

    override fun load() { instance = this }
    override fun handleOnDestroy() { pool.shutdownNow(); instance = null }

    // ---------- pickers ----------
    @PluginMethod
    fun pickFiles(call: PluginCall) {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "video/*", "application/x-subrip", "text/*", "application/octet-stream"))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        startActivityForResult(call, i, "pickedFiles")
    }

    @ActivityCallback
    private fun pickedFiles(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode != Activity.RESULT_OK || result.data == null) { call.resolve(JSObject().put("entries", JSArray()).put("cancelled", true)); return }
        val uris = mutableListOf<Uri>()
        val d = result.data!!
        d.data?.let { uris.add(it) }
        d.clipData?.let { cd -> for (k in 0 until cd.itemCount) uris.add(cd.getItemAt(k).uri) }
        pool.execute {
            try {
                val entries = describeAll(uris.map { persist(it) })
                call.resolve(JSObject().put("entries", entries))
            } catch (e: Exception) { call.reject(e.message ?: "pick failed") }
        }
    }

    @PluginMethod
    fun pickFolder(call: PluginCall) {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        startActivityForResult(call, i, "pickedFolder")
    }

    @ActivityCallback
    private fun pickedFolder(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val tree = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || tree == null) { call.resolve(JSObject().put("cancelled", true)); return }
        try { context.contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
        scan(tree, emptySet(), call)
    }

    /** Re-scan a previously granted folder; [known] = URIs already in the library (skipped). */
    @PluginMethod
    fun rescan(call: PluginCall) {
        val tree = call.getString("tree")?.let { Uri.parse(it) } ?: return call.reject("tree required")
        val known = HashSet<String>()
        call.data.optJSONArray("known")?.let { a -> for (k in 0 until a.length()) known.add(a.optString(k)) }
        scan(tree, known, call)
    }

    @PluginMethod
    fun listFolders(call: PluginCall) {
        val arr = JSArray()
        context.contentResolver.persistedUriPermissions.forEach { p ->
            if (p.isReadPermission && DocumentsContract.isTreeUri(p.uri)) arr.put(p.uri.toString())
        }
        call.resolve(JSObject().put("folders", arr))
    }

    // ---------- scanning ----------
    private class Found(val uri: Uri, val name: String, val mime: String?, val size: Long, val mod: Long, val sidecars: List<Pair<Uri, String>>)

    private fun scan(tree: Uri, known: Set<String>, call: PluginCall) {
        pool.execute {
            try {
                val found = ArrayList<Found>()
                walk(tree, DocumentsContract.getTreeDocumentId(tree), 0, found, known)
                stream(found, tree.toString(), call)
            } catch (e: Exception) { call.reject(e.message ?: "scan failed") }
        }
    }

    /** Reads tags and artwork for [found] on the pool and sends them to the page in batches (scanBatch / scanProgress). */
    private fun stream(found: List<Found>, tag: String, call: PluginCall) {
        val total = found.size
        var done = 0
        val batch = JSArray()
        val futures = ArrayList<Future<JSObject?>>()
        for (f in found) futures.add(pool.submit(Callable { describe(f.uri, f.name, f.mime, f.size, f.mod, f.sidecars) }))
        for (fu in futures) {
            val o = try { fu.get() } catch (_: Exception) { null }
            done++
            if (o != null) batch.put(o)
            if (batch.length() >= 25 || done == total) {
                if (batch.length() > 0) notifyListeners("scanBatch", JSObject().put("tree", tag).put("entries", copy(batch)))
                clear(batch)
                notifyListeners("scanProgress", JSObject().put("done", done).put("total", total))
            }
        }
        call.resolve(JSObject().put("tree", tag).put("total", total))
    }

    // ---------- whole-phone scan (needs the media permission) ----------
    private fun has(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
    private fun audioOk() = if (Build.VERSION.SDK_INT >= 33) has(Manifest.permission.READ_MEDIA_AUDIO) else has(Manifest.permission.READ_EXTERNAL_STORAGE)
    private fun videoOk() = if (Build.VERSION.SDK_INT >= 33) has(Manifest.permission.READ_MEDIA_VIDEO) else has(Manifest.permission.READ_EXTERNAL_STORAGE)
    private fun access() = JSObject().put("audio", audioOk()).put("video", videoOk())

    /** Resolves {audio, video}: which kinds of media this app is currently allowed to read. */
    @PluginMethod
    fun mediaAccess(call: PluginCall) { call.resolve(access()) }

    /** Shows the system permission prompt if needed, then resolves {audio, video}. */
    @PluginMethod
    fun requestMediaAccess(call: PluginCall) {
        val a = MainActivity.instance
        if (a == null) { call.resolve(access()); return }
        a.runOnUiThread { a.requestMediaAccess { call.resolve(access()) } }
    }

    /** Finds every song (and, unless video=false, every video) on the phone. [known] = URIs already in the library (skipped). */
    @PluginMethod
    fun scanDevice(call: PluginCall) {
        val wantVideo = call.getBoolean("video", true) ?: true
        val known = HashSet<String>()
        call.data.optJSONArray("known")?.let { a -> for (k in 0 until a.length()) known.add(a.optString(k)) }
        val doAudio = audioOk()
        val doVideo = wantVideo && videoOk()
        if (!doAudio && !doVideo) { call.reject("Media access was not allowed"); return }
        pool.execute {
            try {
                val found = ArrayList<Found>()
                if (doAudio) queryStore(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, true, known, found)
                if (doVideo) queryStore(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, false, known, found)
                stream(found, "device", call)
            } catch (e: Exception) { call.reject(e.message ?: "scan failed") }
        }
    }

    private fun queryStore(base: Uri, audio: Boolean, known: Set<String>, out: MutableList<Found>) {
        val cols = arrayOf(
            MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED
        )
        // Music only: leaves out ringtones, alarms, notification sounds and voice recordings.
        val sel = if (audio) "${MediaStore.Audio.AudioColumns.IS_MUSIC} != 0 AND ${MediaStore.Audio.AudioColumns.IS_RINGTONE} = 0 AND " +
            "${MediaStore.Audio.AudioColumns.IS_ALARM} = 0 AND ${MediaStore.Audio.AudioColumns.IS_NOTIFICATION} = 0 AND ${MediaStore.MediaColumns.SIZE} > 0"
            else "${MediaStore.MediaColumns.SIZE} > 0"
        context.contentResolver.query(base, cols, sel, null, "${MediaStore.MediaColumns.DISPLAY_NAME} COLLATE NOCASE ASC")?.use { c ->
            while (c.moveToNext()) {
                val uri = ContentUris.withAppendedId(base, c.getLong(0))
                if (known.contains(uri.toString())) continue
                out.add(Found(uri, c.getString(1) ?: "", c.getString(2), c.getLong(3), c.getLong(4) * 1000L, emptyList()))
            }
        }
    }

    private fun copy(a: JSArray) = JSArray().also { n -> for (k in 0 until a.length()) n.put(a.get(k)) }
    private fun clear(a: JSArray) { for (k in a.length() - 1 downTo 0) a.remove(k) }

    private fun walk(tree: Uri, docId: String, depth: Int, out: MutableList<Found>, known: Set<String>) {
        if (depth > 12) return
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId)
        val cols = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )
        data class Row(val id: String, val name: String, val mime: String?, val size: Long, val mod: Long)
        val rows = ArrayList<Row>()
        context.contentResolver.query(children, cols, null, null, null)?.use { c ->
            while (c.moveToNext()) rows.add(Row(c.getString(0), c.getString(1) ?: "", c.getString(2), c.getLong(3), c.getLong(4)))
        }
        val sidecars = rows.filter { ext(it.name) in SIDECAR }
        for (r in rows) {
            if (r.mime == DocumentsContract.Document.MIME_TYPE_DIR) { walk(tree, r.id, depth + 1, out, known); continue }
            if (kindOf(r.mime, r.name) == null) continue
            val uri = DocumentsContract.buildDocumentUriUsingTree(tree, r.id)
            if (known.contains(uri.toString())) continue
            val base = r.name.substringBeforeLast('.').lowercase()
            val mine = sidecars.filter { it.name.lowercase().startsWith(base) }
                .map { Pair(DocumentsContract.buildDocumentUriUsingTree(tree, it.id), it.name) }
            out.add(Found(uri, r.name, r.mime, r.size, r.mod, mine))
        }
    }

    // ---------- metadata ----------
    private fun ext(n: String) = n.substringAfterLast('.', "").lowercase()
    private fun kindOf(mime: String?, name: String): String? {
        if (mime != null) { if (mime.startsWith("audio/")) return "audio"; if (mime.startsWith("video/")) return "video" }
        val e = ext(name)
        return when { e in AUDIO -> "audio"; e in VIDEO -> "video"; else -> null }
    }

    private fun describeAll(uris: List<Uri>): JSArray {
        val arr = JSArray()
        val fs = uris.map { u -> pool.submit(Callable { describe(u, null, null, -1, 0, emptyList()) }) }
        fs.forEach { f -> try { f.get()?.let { arr.put(it) } } catch (_: Exception) {} }
        return arr
    }

    private fun queryName(uri: Uri): String? = try {
        context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
    } catch (_: Exception) { null }

    private fun describe(uri: Uri, name0: String?, mime0: String?, size0: Long, mod: Long, sidecars: List<Pair<Uri, String>>): JSObject? {
        val name = name0 ?: queryName(uri) ?: uri.lastPathSegment ?: "media"
        val mime = mime0 ?: context.contentResolver.getType(uri)
        val kind = kindOf(mime, name) ?: return null
        val o = JSObject()
        o.put("uri", uri.toString()); o.put("name", name); o.put("mime", mime ?: ""); o.put("kind", kind)
        o.put("ext", ext(name)); o.put("size", size0); o.put("modified", mod)
        val sc = JSArray(); sidecars.forEach { sc.put(JSObject().put("uri", it.first.toString()).put("name", it.second)) }
        o.put("sidecars", sc)
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(context, uri)
            fun md(k: Int) = r.extractMetadata(k)
            md(MediaMetadataRetriever.METADATA_KEY_TITLE)?.takeIf { it.isNotBlank() }?.let { o.put("title", it) }
            (md(MediaMetadataRetriever.METADATA_KEY_ARTIST) ?: md(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST))?.takeIf { it.isNotBlank() }?.let { o.put("artist", it) }
            md(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.takeIf { it.isNotBlank() }?.let { o.put("album", it) }
            val dur = md(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            if (dur > 0) o.put("durationSec", dur / 1000.0)
            var art: Bitmap? = null
            if (kind == "video") {
                var w = md(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
                var h = md(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
                val rot = md(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
                if (rot == 90 || rot == 270) { val t = w; w = h; h = t }
                if (w > 0) o.put("width", w); if (h > 0) o.put("height", h)
                art = r.getFrameAtTime(minOf(dur * 100, 10_000_000L), MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            } else {
                r.embeddedPicture?.let { b -> art = decodeScaled(b, 512) }
            }
            art?.let { saveArt(uri, it)?.let { p -> o.put("artPath", p) } }
        } catch (_: Exception) {
            // Unreadable tags are fine: the entry still plays, JS falls back to the file name.
        } finally { try { r.release() } catch (_: Exception) {} }
        return o
    }

    private fun decodeScaled(b: ByteArray, max: Int): Bitmap? {
        val bo = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(b, 0, b.size, bo)
        var s = 1; while (bo.outWidth / s > max * 2) s *= 2
        return BitmapFactory.decodeByteArray(b, 0, b.size, BitmapFactory.Options().apply { inSampleSize = s })
    }

    private fun saveArt(uri: Uri, bmp: Bitmap): String? = try {
        val dir = File(context.filesDir, "art").apply { mkdirs() }
        val h = MessageDigest.getInstance("SHA-1").digest(uri.toString().toByteArray()).joinToString("") { "%02x".format(it) }
        val f = File(dir, "$h.jpg")
        if (!f.exists()) {
            val sc = if (bmp.width > 512) Bitmap.createScaledBitmap(bmp, 512, (bmp.height * 512f / bmp.width).toInt().coerceAtLeast(1), true) else bmp
            f.outputStream().use { sc.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        }
        f.absolutePath
    } catch (_: Exception) { null }

    // ---------- opened-from-outside ("Open with", "Share to") ----------
    /** Keep access across restarts; if the sender didn't offer a persistable grant, copy into app storage. */
    private fun persist(u: Uri): Uri {
        try { context.contentResolver.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); return u } catch (_: Exception) {}
        if (u.scheme == "file") return u
        return try {
            val dir = File(context.filesDir, "media").apply { mkdirs() }
            val nm = queryName(u) ?: "shared"
            val f = File(dir, UUID.randomUUID().toString().take(8) + "_" + nm.replace(Regex("[^\\w.\\- ]+"), "_"))
            context.contentResolver.openInputStream(u)?.use { i -> f.outputStream().use { o -> i.copyTo(o) } }
            Uri.fromFile(f)
        } catch (_: Exception) { u }
    }

    @PluginMethod
    fun getPendingOpen(call: PluginCall) {
        val list = synchronized(pending) { pending.toList().also { pending.clear() } }
        val q = pendingQuery; pendingQuery = null
        pool.execute {
            call.resolve(JSObject().put("entries", describeAll(list.map { persist(it) })).put("query", q))
        }
    }

    /** Called by MainActivity when an intent arrives while the app is already running. */
    fun pushOpen() {
        val q = pendingQuery; pendingQuery = null
        if (q != null) notifyListeners("voiceSearch", JSObject().put("query", q))
        val list = synchronized(pending) { pending.toList().also { pending.clear() } }
        if (list.isEmpty()) return
        pool.execute { notifyListeners("openUris", JSObject().put("entries", describeAll(list.map { persist(it) }))) }
    }

    // ---------- file helpers ----------
    @PluginMethod
    fun readText(call: PluginCall) {
        val uri = call.getString("uri")?.let { Uri.parse(it) } ?: return call.reject("uri required")
        val max = call.getInt("maxBytes") ?: 4_000_000
        pool.execute {
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
                call.resolve(JSObject().put("text", String(bytes, 0, minOf(bytes.size, max), Charsets.UTF_8)))
            } catch (e: Exception) { call.reject(e.message ?: "read failed") }
        }
    }

    /** Export a file from app cache into Music/ or Movies/ (visible in the gallery/music apps). Android 10+. */
    @PluginMethod
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.Q)
    fun saveToDevice(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return call.reject("unsupported")
        val path = call.getString("path") ?: return call.reject("path required")
        val name = call.getString("name") ?: "export"
        val mime = call.getString("mime") ?: "application/octet-stream"
        val kind = call.getString("kind") ?: "other"
        pool.execute {
            try {
                val src = File(Uri.parse(path).path ?: path)
                val (col, rel) = when (kind) {
                    "audio" -> Pair(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "Music/Press Play")
                    "video" -> Pair(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "Movies/Press Play")
                    else -> Pair(MediaStore.Downloads.EXTERNAL_CONTENT_URI, "Download/Press Play")
                }
                val cv = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name); put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, rel); put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val r = context.contentResolver
                val u = r.insert(col, cv) ?: throw IllegalStateException("MediaStore insert failed")
                r.openOutputStream(u)!!.use { out -> src.inputStream().use { it.copyTo(out) } }
                cv.clear(); cv.put(MediaStore.MediaColumns.IS_PENDING, 0); r.update(u, cv, null, null)
                src.delete()
                call.resolve(JSObject().put("uri", u.toString()).put("location", rel))
            } catch (e: Exception) { call.reject(e.message ?: "save failed") }
        }
    }

    /** Append a base64 chunk to a file in app storage (used to move legacy IndexedDB blobs onto disk). */
    @PluginMethod
    fun writeChunk(call: PluginCall) {
        val name = (call.getString("name") ?: return call.reject("name required")).replace(Regex("[^\\w.\\-]"), "_")
        val first = call.getBoolean("first", false) ?: false
        val bytes = android.util.Base64.decode(call.getString("base64") ?: "", android.util.Base64.DEFAULT)
        pool.execute {
            try {
                val f = File(File(context.filesDir, "media").apply { mkdirs() }, name)
                java.io.FileOutputStream(f, !first).use { it.write(bytes) }
                call.resolve(JSObject().put("uri", Uri.fromFile(f).toString()).put("size", f.length()))
            } catch (e: Exception) { call.reject(e.message ?: "write failed") }
        }
    }

    /** Delete a file we copied into app storage (never touches user files outside filesDir/media). */
    @PluginMethod
    fun deleteLocal(call: PluginCall) {
        val u = call.getString("uri") ?: return call.resolve()
        try {
            val f = File(Uri.parse(u).path ?: "").canonicalFile
            val root = File(context.filesDir, "media").canonicalFile
            if (f.path.startsWith(root.path + File.separator)) f.delete()
        } catch (_: Exception) {}
        call.resolve()
    }
}
