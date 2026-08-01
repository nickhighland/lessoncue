package org.lessoncue.tv

import java.time.Instant

data class DeviceIdentity(val screenId: String, val token: String, val serverUrl: String)

data class CuePoint(val name: String, val positionMs: Long)

data class CueItem(
    val id: String,
    val title: String,
    val type: String,
    val url: String?,
    val playbackUrl: String? = null,
    val linkKind: String? = null,
    val contentType: String? = null,
    val fileExtension: String? = null,
    val sha256: String? = null,
    val sizeBytes: Long? = null,
    val durationMs: Long? = null,
    val startMs: Long = 0,
    val endMs: Long? = null,
    val endBehavior: String = "advance",
    val volumePercent: Int = 100,
    val notes: String = "",
    val flexibleTime: Boolean = false,
    val imageDurationSeconds: Int? = null,
    val fadeInMs: Int = 0,
    val fadeOutMs: Int = 0,
    val fitMode: String = "fit",
    val rotationDegrees: Int = 0,
    val cropLeftPercent: Int = 0,
    val cropTopPercent: Int = 0,
    val cropRightPercent: Int = 0,
    val cropBottomPercent: Int = 0,
    val muted: Boolean = false,
    val playbackRatePercent: Int = 100,
    val repeatCount: Int = 1,
    val backgroundColor: String = "#000000",
    val transitionStyle: String = "cut",
    val transitionDurationMs: Int = 500,
    val offlineEligible: Boolean = false,
    val renderSupport: String = "supported",
    val fallbackMessage: String? = null,
    val cuePoints: List<CuePoint> = emptyList()
)

fun CueItem.cacheFileName(): String = "$id.${fileExtension?.takeIf { it.matches(Regex("[a-zA-Z0-9]{1,8}")) } ?: "bin"}"

data class CountdownCue(val itemId: String, val durationMs: Long, val startAt: Instant?, val item: CueItem)
data class PreRollCue(val items: List<CueItem>)
data class SignageCue(val id: String, val name: String, val mode: String, val priority: Int, val message: String,
    val backgroundColor: String, val textColor: String, val mediaUrl: String?, val media: CueItem? = null,
    val layoutPreset: String = "single", val zones: List<SignageZone> = emptyList(),
    val widgetCacheUpdatedAt: String? = null, val widgetCacheError: String? = null,
    val version: Int = 1, val publishedVersion: Int = 1,
    val contentPlaylist: SignageContentPlaylist? = null, val backgroundAudio: CueItem? = null,
    val volumePercent: Int = 100, val displayPower: String = "unchanged")

data class SignageContentPlaylist(val id: String, val name: String, val playbackMode: String,
    val synchronization: String, val version: Int, val items: List<SignagePlaylistEntry>)
data class SignagePlaylistEntry(val id: String, val kind: String, val title: String?, val durationSeconds: Int,
    val transition: String, val media: CueItem? = null, val layout: SignagePlaylistLayout? = null,
    val sourceUrl: String? = null)
data class SignagePlaylistLayout(val id: String, val name: String, val backgroundColor: String,
    val zones: List<SignageZone>, val backgroundAudio: CueItem? = null)

data class SignageCalendarEvent(val title: String, val description: String? = null,
    val location: String? = null, val startsAt: Instant? = null, val allDay: Boolean = false)
data class SignageWeatherSnapshot(val temperature: Double? = null, val feelsLike: Double? = null,
    val high: Double? = null, val low: Double? = null, val precipitation: Double? = null,
    val humidity: Double? = null, val wind: Double? = null, val temperatureUnit: String? = null,
    val windUnit: String? = null, val conditions: String? = null, val forecast: String? = null,
    val sunrise: String? = null, val sunset: String? = null)
data class SignageWidgetCache(val zoneId: String, val title: String, val text: String,
    val items: List<String>, val refreshedAt: String? = null, val icon: String? = null,
    val events: List<SignageCalendarEvent> = emptyList(), val weather: SignageWeatherSnapshot? = null)
data class SignageZone(val id: String, val type: String, val title: String?, val content: String?,
    val x: Int, val y: Int, val width: Int, val height: Int, val backgroundColor: String,
    val textColor: String, val accentColor: String, val sourceUrl: String? = null, val streamUrl: String? = null,
    val rotation: Int = 0, val zIndex: Int = 0, val opacity: Int = 100, val fit: String = "cover",
    val locked: Boolean = false, val hidden: Boolean = false, val flipX: Boolean = false, val flipY: Boolean = false,
    val richTextJson: String? = null, val fontFamily: String? = null,
    val fontSize: Int = 48, val fontWeight: Int = 600, val italic: Boolean = false,
    val underline: Boolean = false, val lineHeightPercent: Int = 120, val textAlign: String = "left",
    val strokeColor: String = "#ffffff", val strokeWidth: Int = 0, val cornerRadius: Int = 0,
    val qrValue: String? = null, val qrLabelTop: String? = null, val qrLabelBottom: String? = null,
    val qrLabelLeft: String? = null, val qrLabelRight: String? = null, val qrPlacement: String = "center", val tickerSpeed: Int = 60,
    val counterTargetAt: Instant? = null, val counterRepeatWeekly: Boolean = false,
    val clockDisplay: String = "both", val clockTimeFormat: String = "12h",
    val clockDateFormat: String = "long", val clockOrder: String = "time-date",
    val clockTimeFontSize: Int = 64, val clockDateFontSize: Int = 28,
    val clockShowPeriod: Boolean = true, val clockShowWeekday: Boolean = true, val clockShowYear: Boolean = true,
    val weatherProvider: String = "open-meteo", val weatherLocation: String? = null,
    val weatherPostalCode: String? = null, val weatherUnits: String = "fahrenheit",
    val weatherFields: String = "icon,conditions,temperature,high,low",
    val weatherIconStyle: String = "color", val weatherLayout: String = "icon-left",
    val weatherIconSize: Int = 72, val weatherTitleSize: Int = 24,
    val weatherTemperatureSize: Int = 64, val weatherDetailsSize: Int = 22,
    val calendarMaxItems: Int = 0, val calendarFields: String = "date,time,title",
    val contentPadding: Int = 6, val contentScale: Int = 100, val verticalAlign: String = "middle",
    val contentPlaylistId: String? = null,
    val streamOverrideWhenLive: Boolean = false, val contentPlaylist: SignageContentPlaylist? = null,
    val htmlUrl: String? = null,
    val renderSupport: String = "supported", val fallbackMessage: String? = null,
    val media: CueItem? = null,
    val cached: SignageWidgetCache? = null)

data class LessonPlaylist(
    val id: String,
    val title: String,
    val designatedStartAt: Instant?,
    val preRollStartsAt: Instant?,
    val countdown: CountdownCue?,
    val preRoll: PreRollCue?,
    val items: List<CueItem>
)

data class DisplayCapability(val id: String, val label: String, val supported: Boolean,
    val fallback: String, val notes: String? = null)
data class DisplayCapabilityContract(val platform: String, val displayName: String, val contractVersion: Int,
    val minimumClientVersion: String, val capabilities: List<DisplayCapability>, val limitations: List<String>)
data class DisplayCompatibilityWarning(val code: String, val title: String, val message: String, val fallback: String)
data class ScreenManifest(val version: Int, val screenName: String, val signage: List<SignageCue>,
    val playlists: List<LessonPlaylist>, val signageSchedule: List<SignageCue> = signage,
    val displayCapabilities: DisplayCapabilityContract? = null,
    val compatibilityWarnings: List<DisplayCompatibilityWarning> = emptyList(),
    val signageOnly: Boolean = false)

data class ControlCommand(
    val changed: Boolean,
    val version: Int,
    val action: String,
    val lessonId: String? = null,
    val itemId: String? = null,
    val positionMs: Long? = null,
    val screenshotRequestId: String? = null,
    val screenshotExpiresAt: Instant? = null
)

data class PlaybackTelemetry(
    val state: String = "idle",
    val lessonId: String? = null,
    val itemId: String? = null,
    val positionMs: Long = 0,
    val durationMs: Long? = null,
    val volumePercent: Int = 100,
    val error: String? = null
)

sealed interface PlaybackPhase {
    data object Idle : PlaybackPhase
    data class PreRoll(val itemIndex: Int) : PlaybackPhase
    data class Countdown(val seekMs: Long) : PlaybackPhase
    data object Ready : PlaybackPhase
}

object ScheduleCoordinator {
    fun phase(playlist: LessonPlaylist, now: Instant): PlaybackPhase {
        val designated = playlist.designatedStartAt ?: return PlaybackPhase.Ready
        if (!now.isBefore(designated)) return PlaybackPhase.Ready
        val countdown = playlist.countdown
        if (countdown != null) {
            val starts = countdown.startAt ?: designated.minusMillis(countdown.durationMs)
            if (!now.isBefore(starts)) return PlaybackPhase.Countdown(now.toEpochMilli() - starts.toEpochMilli())
        }
        val preRollStarted = !now.isBefore(playlist.preRollStartsAt ?: designated.minusSeconds(30 * 60))
        return if (preRollStarted && !playlist.preRoll?.items.isNullOrEmpty()) PlaybackPhase.PreRoll(0) else PlaybackPhase.Idle
    }
}
