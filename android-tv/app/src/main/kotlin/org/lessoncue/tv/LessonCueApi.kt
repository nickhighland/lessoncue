package org.lessoncue.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.io.File
import android.media.MediaCodecList

class LessonCueApi(serverUrl: String, private val manifestCache: File? = null) {
    val baseUrl = serverUrl.trim().trimEnd('/').let { if (it.startsWith("http")) it else "http://$it" }

    suspend fun discover(): String = withContext(Dispatchers.IO) {
        val json = request("/.well-known/lessoncue")
        JSONObject(json).getString("serverName")
    }

    suspend fun requestPairing(deviceName: String): String = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("deviceName", deviceName)
            .put("platform", "android-tv")
            .put("appVersion", "0.22.1")
        JSONObject(request("/api/v1/pairing/request", "POST", body.toString())).getString("requestId")
    }

    suspend fun confirmPairing(requestId: String, pin: String): DeviceIdentity = withContext(Dispatchers.IO) {
        val body = JSONObject().put("requestId", requestId).put("pin", pin)
        val json = JSONObject(request("/api/v1/pairing/confirm", "POST", body.toString()))
        DeviceIdentity(json.getString("screenId"), json.getString("deviceToken"), baseUrl)
    }

    suspend fun manifest(identity: DeviceIdentity): ScreenManifest = withContext(Dispatchers.IO) {
        val raw = request("/api/v1/screens/${identity.screenId}/manifest", token = identity.token)
        manifestCache?.writeText(raw)
        parseManifest(JSONObject(raw))
    }

    suspend fun reportStatus(identity: DeviceIdentity, manifestVersion: Int, freeBytes: Long, failedDownloads: Int = 0,
        acknowledgedControlVersion: Int = 0, playback: PlaybackTelemetry = PlaybackTelemetry(),
        cachedItems: Int = 0, totalItems: Int = 0) = withContext(Dispatchers.IO) {
        val manifest = cachedManifest()
        val allItems = manifest?.allItems().orEmpty()
        val mediaDirectory = manifestCache?.parentFile?.resolve("media")
        val inventory = JSONArray()
        val queue = JSONArray()
        allItems.filter { it.offlineEligible }.forEach { item ->
            val file = mediaDirectory?.resolve(item.cacheFileName())
            val partial = mediaDirectory?.resolve("${item.cacheFileName()}.part")
            val errorFile = mediaDirectory?.resolve("${item.cacheFileName()}.error")
            val state = when { file?.exists() == true -> "cached"; errorFile?.exists() == true -> "failed"; partial?.exists() == true -> "downloading"; else -> "queued" }
            val size = when { file?.exists() == true -> file.length(); partial?.exists() == true -> partial.length(); else -> 0L }
            val entry = JSONObject().put("itemId", item.id).put("title", item.title).put("state", state)
                .put("sizeBytes", size).put("expectedBytes", item.sizeBytes)
            errorFile?.takeIf(File::exists)?.readLines()?.drop(1)?.joinToString(" ")?.takeIf { it.isNotBlank() }?.let { entry.put("error", it) }
            inventory.put(entry)
            if (state != "cached") queue.put(JSONObject().put("itemId", item.id).put("title", item.title)
                .put("state", state).put("bytesDownloaded", size).put("expectedBytes", item.sizeBytes)
                .also { queued -> entry.optString("error").takeIf(String::isNotBlank)?.let { queued.put("error", it) } })
        }
        val codecs = codecCapabilities()
        val errors = JSONArray().apply {
            playback.error?.let { put(JSONObject().put("timestamp", Instant.now().toString())
                .put("area", "playback").put("message", it).put("itemId", playback.itemId)) }
            allItems.forEach { item -> mediaDirectory?.resolve("${item.cacheFileName()}.error")?.takeIf(File::exists)?.let { file ->
                val lines = file.readLines(); val timestamp = lines.firstOrNull()?.toLongOrNull()?.let(Instant::ofEpochMilli) ?: Instant.now()
                put(JSONObject().put("timestamp", timestamp.toString()).put("area", "download")
                    .put("message", lines.drop(1).joinToString(" ").ifBlank { "Media download failed." }).put("itemId", item.id))
            } }
        }
        val body = JSONObject()
            .put("screenId", identity.screenId)
            .put("appVersion", "0.22.1")
            .put("online", true)
            .put("freeBytes", freeBytes)
            .put("manifestVersion", manifestVersion)
            .put("failedDownloads", maxOf(failedDownloads, errors.length() - if (playback.error != null) 1 else 0))
            .put("acknowledgedControlVersion", acknowledgedControlVersion)
            .put("playbackState", playback.state)
            .put("lessonId", playback.lessonId)
            .put("itemId", playback.itemId)
            .put("positionMs", playback.positionMs)
            .put("durationMs", playback.durationMs)
            .put("volumePercent", playback.volumePercent)
            .put("playbackError", playback.error)
            .put("cachedItems", cachedItems)
            .put("totalItems", totalItems)
            .put("deviceModel", android.os.Build.MODEL)
            .put("osVersion", "Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT})")
            .put("clientTimeUnixMs", System.currentTimeMillis())
            .put("networkLatencyMs", lastLatencyMs.toInt())
            .put("cacheInventory", inventory)
            .put("downloadQueue", queue)
            .put("codecCapabilities", codecs)
            .put("recentErrors", errors)
        request("/api/v1/tv/status", "POST", body.toString(), identity.token)
        Unit
    }

    suspend fun control(identity: DeviceIdentity, after: Int? = null): ControlCommand = withContext(Dispatchers.IO) {
        val suffix = after?.let { "?after=$it" } ?: ""
        val json = JSONObject(request("/api/v1/screens/${identity.screenId}/control$suffix", token = identity.token))
        ControlCommand(
            changed = json.optBoolean("changed", false),
            version = json.optInt("version", 0),
            action = json.optString("action", "none"),
            lessonId = json.optString("lessonId").takeIf { it.isNotBlank() && it != "null" },
            itemId = json.optString("itemId").takeIf { it.isNotBlank() && it != "null" },
            positionMs = json.optLong("positionMs").takeIf { json.has("positionMs") && !json.isNull("positionMs") },
            screenshotRequestId = json.optString("screenshotRequestId").takeIf { it.isNotBlank() && it != "null" },
            screenshotExpiresAt = json.optString("screenshotExpiresAt").takeIf { it.isNotBlank() && it != "null" }?.let(Instant::parse)
        )
    }

    suspend fun uploadDiagnosticScreenshot(identity: DeviceIdentity, requestId: String, jpeg: ByteArray) = withContext(Dispatchers.IO) {
        val connection = URL("$baseUrl/api/v1/tv/screens/${identity.screenId}/diagnostics/screenshot/$requestId").openConnection() as HttpURLConnection
        connection.requestMethod = "PUT"
        connection.connectTimeout = 8_000
        connection.readTimeout = 20_000
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(jpeg.size)
        connection.setRequestProperty("Content-Type", "image/jpeg")
        connection.setRequestProperty("Authorization", "Bearer ${identity.token}")
        connection.outputStream.use { it.write(jpeg) }
        val status = connection.responseCode
        val response = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        if (status !in 200..299) error("LessonCue returned HTTP $status: $response")
    }

    fun cachedManifest(): ScreenManifest? = runCatching { manifestCache?.takeIf(File::exists)?.readText()?.let { parseManifest(JSONObject(it)) } }.getOrNull()

    private fun parseManifest(payload: JSONObject): ScreenManifest {
        val screen = payload.getJSONObject("screen")
        return ScreenManifest(
            version = payload.getInt("manifestVersion"),
            screenName = screen.getString("name"),
            signage = payload.optJSONArray("signage")?.mapObjects { item -> SignageCue(
                id = item.getString("id"), name = item.getString("name"), mode = item.getString("mode"),
                priority = item.optInt("priority"), message = item.optString("message"),
                backgroundColor = item.optString("backgroundColor", "#25302d"), textColor = item.optString("textColor", "#ffffff"),
                mediaUrl = item.optString("mediaUrl").takeIf { it.isNotBlank() && it != "null" }?.let { if (it.startsWith("http")) it else "$baseUrl$it" }
            ) } ?: emptyList(),
            playlists = payload.getJSONArray("playlists").mapObjects { lesson -> parsePlaylist(lesson) }
        )
    }

    private fun parsePlaylist(json: JSONObject): LessonPlaylist {
        val start = json.optString("designatedStartAt").takeIf { it.isNotBlank() && it != "null" }?.let(Instant::parse)
        val countdownJson = json.optJSONObject("countdown")
        val countdown = countdownJson?.let {
            CountdownCue(
                itemId = it.getString("itemId"),
                durationMs = it.getLong("durationMs"),
                startAt = it.optString("startAt").takeIf { value -> value.isNotBlank() && value != "null" }?.let(Instant::parse),
                item = parseItem(it.getJSONObject("item"))
            )
        }
        val preRoll = json.optJSONObject("preRoll")?.let { PreRollCue(it.getJSONArray("items").mapObjects(::parseItem)) }
        return LessonPlaylist(
            id = json.getString("playlistId"),
            title = json.getString("title"),
            designatedStartAt = start,
            preRollStartsAt = json.optString("preRollStartsAt").takeIf { it.isNotBlank() && it != "null" }?.let(Instant::parse),
            countdown = countdown,
            preRoll = preRoll,
            items = json.getJSONArray("items").mapObjects(::parseItem)
        )
    }

    private fun parseItem(json: JSONObject) = CueItem(
        id = json.getString("itemId"),
        title = json.getString("title"),
        type = json.getString("type"),
        url = json.optString("downloadUrl").takeIf { it.isNotBlank() && it != "null" }?.let { if (it.startsWith("http")) it else "$baseUrl$it" },
        playbackUrl = json.optString("playbackUrl").takeIf { it.isNotBlank() && it != "null" }?.let { if (it.startsWith("http")) it else "$baseUrl$it" },
        linkKind = json.optString("linkKind").takeIf { it.isNotBlank() && it != "null" },
        contentType = json.optString("contentType").takeIf { it.isNotBlank() && it != "null" },
        fileExtension = json.optString("fileExtension").takeIf { it.isNotBlank() && it != "null" },
        sha256 = json.optString("sha256").takeIf { it.isNotBlank() && it != "null" },
        sizeBytes = json.optLong("sizeBytes").takeIf { json.has("sizeBytes") && !json.isNull("sizeBytes") },
        durationMs = json.optLong("durationMs").takeIf { json.has("durationMs") && !json.isNull("durationMs") },
        startMs = json.optLong("startMs", 0),
        endMs = json.optLong("endMs").takeIf { json.has("endMs") && !json.isNull("endMs") },
        endBehavior = json.optString("endBehavior", "advance"),
        volumePercent = json.optInt("volumePercent", 100),
        notes = json.optString("notes", ""),
        imageDurationSeconds = json.optInt("imageDurationSeconds").takeIf { json.has("imageDurationSeconds") && !json.isNull("imageDurationSeconds") },
        fadeInMs = json.optInt("fadeInMs", 0),
        fadeOutMs = json.optInt("fadeOutMs", 0),
        offlineEligible = json.optBoolean("offlineEligible", false),
        cuePoints = json.optJSONArray("cuePoints")?.mapObjects { cue ->
            CuePoint(cue.getString("name"), cue.getLong("positionMs"))
        } ?: emptyList()
    )

    private fun request(path: String, method: String = "GET", body: String? = null, token: String? = null): String {
        val started = System.nanoTime()
        val connection = URL("$baseUrl$path").openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 8_000
        connection.readTimeout = 15_000
        connection.setRequestProperty("Accept", "application/json")
        token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.bufferedWriter().use { it.write(body) }
        }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        lastLatencyMs = ((System.nanoTime() - started) / 1_000_000).coerceIn(0, 120_000)
        if (status !in 200..299) error("LessonCue returned HTTP $status: $response")
        return response
    }

    private fun codecCapabilities(): JSONArray = JSONArray(codecCapabilitiesJson)

    companion object {
        @Volatile private var lastLatencyMs = 0L
        private val codecCapabilitiesJson by lazy {
            val available = runCatching { MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos.filter { !it.isEncoder }
                .flatMap { it.supportedTypes.asList() }.map { it.lowercase() }.toSet() }.getOrDefault(emptySet())
            JSONArray().apply {
                listOf("video/avc" to "H.264 / AVC", "video/hevc" to "H.265 / HEVC", "video/x-vnd.on2.vp9" to "VP9",
                    "video/av01" to "AV1", "audio/mp4a-latm" to "AAC", "audio/mpeg" to "MP3").forEach { (mime, label) ->
                    put(JSONObject().put("kind", if (mime.startsWith("video")) "video" else "audio")
                        .put("codec", label).put("supported", mime in available).put("detail", mime))
                }
            }.toString()
        }
    }
}

private fun ScreenManifest.allItems(): List<CueItem> = playlists.flatMap {
    it.items + it.preRoll?.items.orEmpty() + listOfNotNull(it.countdown?.item)
}.distinctBy { it.id }

private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
    (0 until length()).map { transform(getJSONObject(it)) }
