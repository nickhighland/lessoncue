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

private val suspiciousZeroOffset = Regex("""([+-])([0O)])([0O)]):([0O)])([0O)])$""")

internal fun parseOptionalInstant(value: String?): Instant? {
    val text = value?.trim()?.takeIf { it.isNotEmpty() && it != "null" } ?: return null
    runCatching { Instant.parse(text) }.getOrNull()?.let { return it }

    val repaired = suspiciousZeroOffset.replace(text) { match ->
        val digits = match.groupValues.drop(2).joinToString("").replace('O', '0').replace(')', '0')
        "${match.groupValues[1]}${digits.take(2)}:${digits.drop(2)}"
    }
    return repaired.takeIf { it != text }?.let { runCatching { Instant.parse(it) }.getOrNull() }
}

class LessonCueApi(serverUrl: String, private val manifestCache: File? = null) {
    val baseUrl = normalizeLessonCueServerUrl(serverUrl)

    suspend fun discover(): String = withContext(Dispatchers.IO) {
        val json = request("/.well-known/lessoncue")
        JSONObject(json).getString("serverName")
    }

    suspend fun requestPairing(deviceName: String): String = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("deviceName", deviceName)
            .put("platform", "android-tv")
            .put("appVersion", BuildConfig.VERSION_NAME)
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
            .put("appVersion", BuildConfig.VERSION_NAME)
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
        manifest?.signage?.firstOrNull()?.let { signage ->
            body.put("signageId", signage.id)
                .put("signageVersion", signage.publishedVersion)
                .put("signageName", signage.name)
                .put("signageError", signage.widgetCacheError)
        }
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
            screenshotExpiresAt = parseOptionalInstant(json.optString("screenshotExpiresAt"))
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
        val activeSignage = payload.optJSONArray("signage")?.mapObjects(::parseSignage).orEmpty()
        return ScreenManifest(
            version = payload.getInt("manifestVersion"),
            screenName = screen.getString("name"),
            signage = activeSignage,
            playlists = payload.getJSONArray("playlists").mapObjects { lesson -> parsePlaylist(lesson) },
            signageSchedule = payload.optJSONArray("signageSchedule")?.mapObjects(::parseSignage) ?: activeSignage,
            signageOnly = screen.optBoolean("signageOnly"),
            displayCapabilities = payload.optJSONObject("displayCapabilities")?.let(::parseDisplayCapabilities),
            compatibilityWarnings = payload.optJSONArray("compatibilityWarnings")?.mapObjects { item ->
                DisplayCompatibilityWarning(
                    item.optString("code"), item.optString("title"), item.optString("message"),
                    item.optString("fallback")
                )
            }.orEmpty()
        )
    }

    private fun parseDisplayCapabilities(item: JSONObject) = DisplayCapabilityContract(
        platform = item.optString("platform"),
        displayName = item.optString("displayName"),
        contractVersion = item.optInt("contractVersion"),
        minimumClientVersion = item.optString("minimumClientVersion"),
        capabilities = item.optJSONArray("capabilities")?.mapObjects { capability ->
            DisplayCapability(
                capability.optString("id"), capability.optString("label"),
                capability.optBoolean("supported"), capability.optString("fallback"),
                capability.optString("notes").takeIf { it.isNotBlank() && it != "null" }
            )
        }.orEmpty(),
        limitations = item.optJSONArray("limitations")?.let { array ->
            (0 until array.length()).map(array::getString)
        }.orEmpty()
    )

    private fun parseSignage(item: JSONObject) = SignageCue(
        id = item.getString("id"), name = item.getString("name"), mode = item.getString("mode"),
        priority = item.optInt("priority"), message = item.optString("message"),
        backgroundColor = item.optString("backgroundColor", "#25302d"),
        textColor = item.optString("textColor", "#ffffff"),
        mediaUrl = item.optString("mediaUrl").takeIf { it.isNotBlank() && it != "null" }
            ?.let { if (it.startsWith("http")) it else "$baseUrl$it" },
        media = item.optJSONObject("media")?.let(::parseItem),
        layoutPreset = item.optString("layoutPreset", "single"),
        zones = item.optJSONArray("zones")?.mapObjects(::parseSignageZone).orEmpty(),
        widgetCacheUpdatedAt = item.optString("widgetCacheUpdatedAt").takeIf { it.isNotBlank() && it != "null" },
        widgetCacheError = item.optString("widgetCacheError").takeIf { it.isNotBlank() && it != "null" },
        version = item.optInt("version", 1), publishedVersion = item.optInt("publishedVersion", item.optInt("version", 1)),
        contentPlaylist = item.optJSONObject("contentPlaylist")?.let(::parseSignagePlaylist),
        backgroundAudio = item.optJSONObject("backgroundAudio")?.let(::parseItem),
        volumePercent = item.optInt("volumePercent", 100), displayPower = item.optString("displayPower", "unchanged")
    )

    private fun parseSignageZone(item: JSONObject): SignageZone = SignageZone(
        id = item.getString("id"), type = item.optString("type", "text"),
        title = item.optString("title").takeIf { it.isNotBlank() && it != "null" },
        content = item.optString("content").takeIf { it.isNotBlank() && it != "null" },
        x = item.optInt("x"), y = item.optInt("y"), width = item.optInt("width", 100), height = item.optInt("height", 100),
        backgroundColor = item.optString("backgroundColor", "#17201e"), textColor = item.optString("textColor", "#ffffff"),
        accentColor = item.optString("accentColor", "#d89127"),
        sourceUrl = item.optString("sourceUrl").takeIf { it.isNotBlank() && it != "null" }
            ?.let { if (it.startsWith("http")) it else "$baseUrl$it" },
        streamUrl = item.optString("streamUrl").takeIf { it.isNotBlank() && it != "null" }
            ?.let { if (it.startsWith("http")) it else "$baseUrl$it" },
        rotation = item.optInt("rotation"), zIndex = item.optInt("zIndex"), opacity = item.optInt("opacity", 100),
        fit = item.optString("fit", "cover"), locked = item.optBoolean("locked"), hidden = item.optBoolean("hidden"),
        flipX = item.optBoolean("flipX"), flipY = item.optBoolean("flipY"),
        richTextJson = item.optString("richTextJson").takeIf { it.isNotBlank() && it != "null" },
        fontFamily = item.optString("fontFamily").takeIf { it.isNotBlank() && it != "null" },
        fontSize = item.optInt("fontSize", 48), fontWeight = item.optInt("fontWeight", 600),
        italic = item.optBoolean("italic"), underline = item.optBoolean("underline"),
        lineHeightPercent = item.optInt("lineHeightPercent", 120),
        textAlign = item.optString("textAlign", "left"),
        strokeColor = item.optString("strokeColor", "#ffffff"), strokeWidth = item.optInt("strokeWidth"),
        cornerRadius = item.optInt("cornerRadius"),
        qrValue = item.optString("qrValue").takeIf { it.isNotBlank() && it != "null" },
        qrLabelTop = item.optString("qrLabelTop").takeIf { it.isNotBlank() && it != "null" },
        qrLabelBottom = item.optString("qrLabelBottom").takeIf { it.isNotBlank() && it != "null" },
        qrLabelLeft = item.optString("qrLabelLeft").takeIf { it.isNotBlank() && it != "null" },
        qrLabelRight = item.optString("qrLabelRight").takeIf { it.isNotBlank() && it != "null" },
        qrPlacement = item.optString("qrPlacement", "center"),
        tickerSpeed = item.optInt("tickerSpeed", 60),
        counterTargetAt = parseOptionalInstant(item.optString("counterTargetAt")),
        counterRepeatWeekly = item.optBoolean("counterRepeatWeekly"),
        clockDisplay = item.optString("clockDisplay", "both"),
        clockTimeFormat = item.optString("clockTimeFormat", "12h"),
        clockDateFormat = item.optString("clockDateFormat", "long"),
        clockOrder = item.optString("clockOrder", "time-date"),
        clockTimeFontSize = item.optInt("clockTimeFontSize", 64),
        clockDateFontSize = item.optInt("clockDateFontSize", 28),
        clockShowPeriod = item.optBoolean("clockShowPeriod", true),
        clockShowWeekday = item.optBoolean("clockShowWeekday", true),
        clockShowYear = item.optBoolean("clockShowYear", true),
        weatherProvider = item.optString("weatherProvider", "open-meteo"),
        weatherLocation = item.optString("weatherLocation").takeIf { it.isNotBlank() && it != "null" },
        weatherPostalCode = item.optString("weatherPostalCode").takeIf { it.isNotBlank() && it != "null" },
        weatherUnits = item.optString("weatherUnits", "fahrenheit"),
        weatherFields = item.optString("weatherFields", "icon,conditions,temperature,high,low"),
        weatherIconStyle = item.optString("weatherIconStyle", "color"),
        weatherLayout = item.optString("weatherLayout", "icon-left"),
        weatherIconSize = item.optInt("weatherIconSize", 72),
        weatherTitleSize = item.optInt("weatherTitleSize", 24),
        weatherTemperatureSize = item.optInt("weatherTemperatureSize", 64),
        weatherDetailsSize = item.optInt("weatherDetailsSize", 22),
        calendarMaxItems = item.optInt("calendarMaxItems"),
        calendarFields = item.optString("calendarFields", "date,time,title"),
        contentPadding = item.optInt("contentPadding", 6),
        contentScale = item.optInt("contentScale", 100),
        verticalAlign = item.optString("verticalAlign", "middle"),
        contentPlaylistId = item.optString("contentPlaylistId").takeIf { it.isNotBlank() && it != "null" },
        streamOverrideWhenLive = item.optBoolean("streamOverrideWhenLive"),
        contentPlaylist = item.optJSONObject("contentPlaylist")?.let(::parseSignagePlaylist),
        htmlUrl = item.optString("htmlUrl").takeIf { it.isNotBlank() && it != "null" }
            ?.let { if (it.startsWith("http")) it else "$baseUrl$it" },
        renderSupport = item.optString("renderSupport", "supported"),
        fallbackMessage = item.optString("fallbackMessage").takeIf { it.isNotBlank() && it != "null" },
        media = item.optJSONObject("media")?.let(::parseItem),
        cached = item.optJSONObject("cached")?.let { cached -> SignageWidgetCache(
            zoneId = cached.optString("zoneId", item.getString("id")), title = cached.optString("title"),
            text = cached.optString("text"), items = cached.optJSONArray("items")?.let { array -> (0 until array.length()).map(array::getString) }.orEmpty(),
            refreshedAt = cached.optString("refreshedAt").takeIf { value -> value.isNotBlank() && value != "null" },
            icon = cached.optString("icon").takeIf { value -> value.isNotBlank() && value != "null" },
            events = cached.optJSONArray("events")?.mapObjects { event -> SignageCalendarEvent(
                title = event.optString("title"),
                description = event.optString("description").takeIf { value -> value.isNotBlank() && value != "null" },
                location = event.optString("location").takeIf { value -> value.isNotBlank() && value != "null" },
                startsAt = parseOptionalInstant(event.optString("startsAt")),
                allDay = event.optBoolean("allDay")
            ) }.orEmpty(),
            weather = cached.optJSONObject("weather")?.let { weather -> SignageWeatherSnapshot(
                temperature = weather.optionalDouble("temperature"),
                feelsLike = weather.optionalDouble("feelsLike"),
                high = weather.optionalDouble("high"),
                low = weather.optionalDouble("low"),
                precipitation = weather.optionalDouble("precipitation"),
                humidity = weather.optionalDouble("humidity"),
                wind = weather.optionalDouble("wind"),
                temperatureUnit = weather.optString("temperatureUnit").takeIf { value -> value.isNotBlank() && value != "null" },
                windUnit = weather.optString("windUnit").takeIf { value -> value.isNotBlank() && value != "null" },
                conditions = weather.optString("conditions").takeIf { value -> value.isNotBlank() && value != "null" },
                forecast = weather.optString("forecast").takeIf { value -> value.isNotBlank() && value != "null" },
                sunrise = weather.optString("sunrise").takeIf { value -> value.isNotBlank() && value != "null" },
                sunset = weather.optString("sunset").takeIf { value -> value.isNotBlank() && value != "null" }
            ) }
        ) }
    )

    private fun parseSignagePlaylist(item: JSONObject): SignageContentPlaylist = SignageContentPlaylist(
        id = item.getString("id"), name = item.optString("name"), playbackMode = item.optString("playbackMode", "ordered"),
        synchronization = item.optString("synchronization", "screen"), version = item.optInt("version", 1),
        items = item.optJSONArray("items")?.mapObjects { entry -> SignagePlaylistEntry(
            id = entry.getString("id"), kind = entry.optString("kind"), title = entry.optString("title").takeIf { it.isNotBlank() && it != "null" },
            durationSeconds = entry.optInt("durationSeconds", 10), transition = entry.optString("transition", "cut"),
            media = entry.optJSONObject("media")?.let(::parseItem),
            layout = entry.optJSONObject("layout")?.let { layout -> SignagePlaylistLayout(
                id = layout.getString("id"), name = layout.optString("name"), backgroundColor = layout.optString("backgroundColor", "#25302d"),
                zones = layout.optJSONArray("zones")?.mapObjects(::parseSignageZone).orEmpty(),
                backgroundAudio = layout.optJSONObject("backgroundAudio")?.let(::parseItem)
            ) }, sourceUrl = entry.optString("sourceUrl").takeIf { it.isNotBlank() && it != "null" }
        ) }.orEmpty()
    )

    private fun parsePlaylist(json: JSONObject): LessonPlaylist {
        val start = parseOptionalInstant(json.optString("designatedStartAt"))
        val countdownJson = json.optJSONObject("countdown")
        val countdown = countdownJson?.let {
            CountdownCue(
                itemId = it.getString("itemId"),
                durationMs = it.getLong("durationMs"),
                startAt = parseOptionalInstant(it.optString("startAt")),
                item = parseItem(it.getJSONObject("item"))
            )
        }
        val preRoll = json.optJSONObject("preRoll")?.let { PreRollCue(it.getJSONArray("items").mapObjects(::parseItem)) }
        return LessonPlaylist(
            id = json.getString("playlistId"),
            title = json.getString("title"),
            designatedStartAt = start,
            preRollStartsAt = parseOptionalInstant(json.optString("preRollStartsAt")),
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
        flexibleTime = json.optBoolean("flexibleTime", false),
        imageDurationSeconds = json.optInt("imageDurationSeconds").takeIf { json.has("imageDurationSeconds") && !json.isNull("imageDurationSeconds") },
        fadeInMs = json.optInt("fadeInMs", 0),
        fadeOutMs = json.optInt("fadeOutMs", 0),
        fitMode = json.optString("fitMode", "fit"),
        rotationDegrees = json.optInt("rotationDegrees", 0),
        cropLeftPercent = json.optInt("cropLeftPercent", 0),
        cropTopPercent = json.optInt("cropTopPercent", 0),
        cropRightPercent = json.optInt("cropRightPercent", 0),
        cropBottomPercent = json.optInt("cropBottomPercent", 0),
        muted = json.optBoolean("muted", false),
        playbackRatePercent = json.optInt("playbackRatePercent", 100),
        repeatCount = json.optInt("repeatCount", 1),
        backgroundColor = json.optString("backgroundColor", "#000000"),
        transitionStyle = json.optString("transitionStyle", "cut"),
        transitionDurationMs = json.optInt("transitionDurationMs", 500),
        offlineEligible = json.optBoolean("offlineEligible", false),
        renderSupport = json.optString("renderSupport", "supported"),
        fallbackMessage = json.optString("fallbackMessage").takeIf { it.isNotBlank() && it != "null" },
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

private fun ScreenManifest.allItems(): List<CueItem> = (playlists.flatMap {
    it.items + it.preRoll?.items.orEmpty() + listOfNotNull(it.countdown?.item)
} + signageSchedule.flatMap { sign -> listOfNotNull(sign.media, sign.backgroundAudio) + sign.zones.mapNotNull { it.media } +
    sign.contentPlaylist?.items.orEmpty().flatMap { entry ->
        listOfNotNull(entry.media, entry.layout?.backgroundAudio) + entry.layout?.zones.orEmpty().mapNotNull { it.media }
    } }).distinctBy { it.id }

private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
    (0 until length()).map { transform(getJSONObject(it)) }

private fun JSONObject.optionalDouble(name: String): Double? =
    if (has(name) && !isNull(name)) optDouble(name).takeUnless(Double::isNaN) else null
