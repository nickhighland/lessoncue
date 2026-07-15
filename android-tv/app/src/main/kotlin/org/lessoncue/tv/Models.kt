package org.lessoncue.tv

import java.time.Instant

data class DeviceIdentity(val screenId: String, val token: String, val serverUrl: String)

data class CueItem(
    val id: String,
    val title: String,
    val type: String,
    val url: String?,
    val durationMs: Long?,
    val startMs: Long = 0,
    val endMs: Long? = null,
    val endBehavior: String = "advance",
    val offlineEligible: Boolean = false
)

data class CountdownCue(val itemId: String, val durationMs: Long, val startAt: Instant?, val item: CueItem)
data class PreRollCue(val items: List<CueItem>)

data class LessonPlaylist(
    val id: String,
    val title: String,
    val designatedStartAt: Instant?,
    val countdown: CountdownCue?,
    val preRoll: PreRollCue?,
    val items: List<CueItem>
)

data class ScreenManifest(val version: Int, val screenName: String, val playlists: List<LessonPlaylist>)

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
        return if (!playlist.preRoll?.items.isNullOrEmpty()) PlaybackPhase.PreRoll(0) else PlaybackPhase.Idle
    }
}
