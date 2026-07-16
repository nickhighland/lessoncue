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
    val imageDurationSeconds: Int? = null,
    val fadeInMs: Int = 0,
    val fadeOutMs: Int = 0,
    val offlineEligible: Boolean = false,
    val cuePoints: List<CuePoint> = emptyList()
)

fun CueItem.cacheFileName(): String = "$id.${fileExtension?.takeIf { it.matches(Regex("[a-zA-Z0-9]{1,8}")) } ?: "bin"}"

data class CountdownCue(val itemId: String, val durationMs: Long, val startAt: Instant?, val item: CueItem)
data class PreRollCue(val items: List<CueItem>)
data class SignageCue(val id: String, val name: String, val mode: String, val priority: Int, val message: String,
    val backgroundColor: String, val textColor: String, val mediaUrl: String?)

data class LessonPlaylist(
    val id: String,
    val title: String,
    val designatedStartAt: Instant?,
    val preRollStartsAt: Instant?,
    val countdown: CountdownCue?,
    val preRoll: PreRollCue?,
    val items: List<CueItem>
)

data class ScreenManifest(val version: Int, val screenName: String, val signage: List<SignageCue>, val playlists: List<LessonPlaylist>)

data class ControlCommand(
    val changed: Boolean,
    val version: Int,
    val action: String,
    val lessonId: String? = null,
    val itemId: String? = null,
    val positionMs: Long? = null
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
