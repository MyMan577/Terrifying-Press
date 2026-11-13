package com.pressplay.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The library as the rest of Android sees it: a browsable tree (songs / videos / playlists / artists)
 * that Android Auto, Bluetooth car kits, Wear and Google Assistant can list, search and play from,
 * even when the web UI isn't running. The web app pushes its track list here; it is also saved to
 * disk so a cold start (headset button, car connecting) still knows what to play.
 */
@UnstableApi
object Catalog {
    class Item(
        val id: String, val uri: String, val kind: String, val title: String, val artist: String,
        val album: String, val durMs: Long, val art: String, val playlistIds: List<String>, val track: Int = 0
    )
    class Playlist(val id: String, val name: String)

    const val ROOT = "pp:root"; const val SONGS = "pp:songs"; const val VIDEOS = "pp:videos"
    const val PLAYLISTS = "pp:playlists"; const val ARTISTS = "pp:artists"
    const val ALBUMS = "pp:albums"
    private const val PL = "pp:pl:"; private const val AR = "pp:artist:"; private const val AL = "pp:album:"

    @Volatile private var items: List<Item> = emptyList()
    @Volatile private var playlists: List<Playlist> = emptyList()
    @Volatile private var loaded = false

    private fun file(ctx: Context) = File(ctx.filesDir, "catalog.json")

    @Synchronized fun ensureLoaded(ctx: Context) {
        if (loaded) return
        loaded = true
        try { val f = file(ctx); if (f.exists()) parse(JSONObject(f.readText())) } catch (_: Exception) {}
    }

    fun set(ctx: Context, itemsJson: JSONArray?, playlistsJson: JSONArray?) {
        val o = JSONObject().put("items", itemsJson ?: JSONArray()).put("playlists", playlistsJson ?: JSONArray())
        parse(o); loaded = true
        try { file(ctx).writeText(o.toString()) } catch (_: Exception) {}
    }

    private fun parse(o: JSONObject) {
        val ia = o.optJSONArray("items") ?: JSONArray()
        val list = ArrayList<Item>(ia.length())
        for (k in 0 until ia.length()) {
            val j = ia.optJSONObject(k) ?: continue
            val pl = ArrayList<String>(); j.optJSONArray("pl")?.let { a -> for (x in 0 until a.length()) pl.add(a.optString(x)) }
            val uri = j.optString("uri", ""); if (uri.isEmpty()) continue
            list.add(Item(j.optString("id"), uri, j.optString("kind", "audio"), j.optString("title"), j.optString("artist"),
                j.optString("album"), j.optLong("durMs", 0), j.optString("art"), pl, j.optInt("track", 0)))
        }
        val pa = o.optJSONArray("playlists") ?: JSONArray()
        val pls = ArrayList<Playlist>()
        for (k in 0 until pa.length()) { val j = pa.optJSONObject(k) ?: continue; pls.add(Playlist(j.optString("id"), j.optString("name"))) }
        items = list; playlists = pls
    }

    // ---------- MediaItem builders ----------
    private fun playable(i: Item): MediaItem {
        val md = MediaMetadata.Builder().setTitle(i.title).setArtist(i.artist).setAlbumTitle(i.album)
            .setIsBrowsable(false).setIsPlayable(true)
            .setMediaType(if (i.kind == "video") MediaMetadata.MEDIA_TYPE_VIDEO else MediaMetadata.MEDIA_TYPE_MUSIC)
        if (i.durMs > 0) md.setDurationMs(i.durMs)
        if (i.art.isNotEmpty()) md.setArtworkUri(Uri.fromFile(File(i.art.removePrefix("file://"))))
        return MediaItem.Builder().setMediaId(i.id).setUri(i.uri).setMediaMetadata(md.build()).build()
    }

    private fun folder(id: String, title: String, type: Int = MediaMetadata.MEDIA_TYPE_FOLDER_MIXED) = MediaItem.Builder()
        .setMediaId(id)
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false).setMediaType(type).build())
        .build()

    fun root(): MediaItem = folder(ROOT, "Press Play")

    fun children(parent: String): List<MediaItem> = when {
        parent == ROOT -> listOf(
            folder(SONGS, "Songs"), folder(PLAYLISTS, "Playlists", MediaMetadata.MEDIA_TYPE_FOLDER_PLAYLISTS),
            folder(ALBUMS, "Albums", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS),
            folder(ARTISTS, "Artists", MediaMetadata.MEDIA_TYPE_FOLDER_ARTISTS), folder(VIDEOS, "Videos")
        )
        parent == SONGS -> items.filter { it.kind == "audio" }.sortedBy { it.title.lowercase() }.map(::playable)
        parent == VIDEOS -> items.filter { it.kind == "video" }.sortedBy { it.title.lowercase() }.map(::playable)
        parent == PLAYLISTS -> playlists.map { folder(PL + it.id, it.name, MediaMetadata.MEDIA_TYPE_PLAYLIST) }
        parent == ARTISTS -> items.filter { it.kind == "audio" && it.artist.isNotBlank() }.map { it.artist }.distinct().sorted()
            .map { folder(AR + it, it, MediaMetadata.MEDIA_TYPE_ARTIST) }
        parent == ALBUMS -> items.filter { it.kind == "audio" && it.album.isNotBlank() }.map { it.album }.distinct().sortedBy { it.lowercase() }
            .map { folder(AL + it, it, MediaMetadata.MEDIA_TYPE_ALBUM) }
        parent.startsWith(AL) -> items.filter { it.kind == "audio" && it.album == parent.removePrefix(AL) }
            .sortedBy { if (it.track > 0) it.track else 9999 }.map(::playable)
        parent.startsWith(PL) -> items.filter { it.playlistIds.contains(parent.removePrefix(PL)) }.map(::playable)
        parent.startsWith(AR) -> items.filter { it.artist == parent.removePrefix(AR) }.map(::playable)
        else -> emptyList()
    }

    /** The URI is what actually plays, so it is the reliable key when ids disagree. */
    fun findByUri(uri: String): MediaItem? = items.firstOrNull { it.uri == uri }?.let(::playable)

    fun find(id: String): MediaItem? {
        if (id == ROOT) return root()
        children(ROOT).firstOrNull { it.mediaId == id }?.let { return it }
        return items.firstOrNull { it.id == id }?.let(::playable)
    }

    /** Words in the query must all appear in title, artist or album. Empty query = everything audio. */
    fun search(query: String, limit: Int = 100): List<MediaItem> {
        val toks = query.lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }
        val pool = items.filter { it.kind == "audio" }
        val hits = if (toks.isEmpty()) pool else pool.filter { i ->
            val hay = (i.title + " " + i.artist + " " + i.album).lowercase()
            toks.all { hay.contains(it) }
        }
        val hits2 = if (hits.isEmpty() && toks.isNotEmpty()) items.filter { i ->     // fall back to videos
            val hay = (i.title + " " + i.artist).lowercase(); toks.all { hay.contains(it) } } else hits
        return hits2.take(limit).map(::playable)
    }
}
