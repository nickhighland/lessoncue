package org.lessoncue.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.io.File

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
            .put("appVersion", "0.3.0")
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

    suspend fun reportStatus(identity: DeviceIdentity, manifestVersion: Int, freeBytes: Long, failedDownloads: Int = 0) = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("screenId", identity.screenId)
            .put("appVersion", "0.3.0")
            .put("online", true)
            .put("freeBytes", freeBytes)
            .put("manifestVersion", manifestVersion)
            .put("failedDownloads", failedDownloads)
        request("/api/v1/tv/status", "POST", body.toString(), identity.token)
        Unit
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
        offlineEligible = json.optBoolean("offlineEligible", false)
    )

    private fun request(path: String, method: String = "GET", body: String? = null, token: String? = null): String {
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
        if (status !in 200..299) error("LessonCue returned HTTP $status: $response")
        return response
    }
}

private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
    (0 until length()).map { transform(getJSONObject(it)) }
