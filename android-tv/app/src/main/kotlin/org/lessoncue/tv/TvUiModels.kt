package org.lessoncue.tv

import java.time.Duration
import java.time.Instant

internal enum class CueRole(val label: String) {
    PreRoll("PRE-ROLL"),
    Countdown("COUNTDOWN"),
    Lesson("LESSON"),
    PostLesson("POST-LESSON")
}

internal data class TimelineCue(val item: CueItem, val role: CueRole)

internal enum class LibraryInteractionMode { SignageOnly, Emergency, Lessons }

internal fun ScreenManifest.libraryInteractionMode(): LibraryInteractionMode = when {
    signageOnly || playlists.isEmpty() -> LibraryInteractionMode.SignageOnly
    signage.any { it.mode == "emergency" } -> LibraryInteractionMode.Emergency
    else -> LibraryInteractionMode.Lessons
}

internal fun LessonPlaylist.timeline(): List<TimelineCue> = buildList {
    preRoll?.items.orEmpty().forEach { add(TimelineCue(it, CueRole.PreRoll)) }
    countdown?.item?.let { add(TimelineCue(it, CueRole.Countdown)) }
    items.forEach { add(TimelineCue(it, CueRole.Lesson)) }
    postLesson?.items.orEmpty().forEach { add(TimelineCue(it, CueRole.PostLesson)) }
}

internal fun LessonPlaylist.initialCueIndex(): Int {
    val timeline = timeline()
    return timeline.indexOfFirst { it.role == CueRole.Lesson }.takeIf { it >= 0 }
        ?: timeline.indexOfFirst { it.role == CueRole.Countdown }.takeIf { it >= 0 }
        ?: timeline.indexOfFirst { it.role == CueRole.PreRoll }.takeIf { it >= 0 }
        ?: timeline.indices.firstOrNull()
        ?: -1
}

internal fun preferredLessonIndex(playlists: List<LessonPlaylist>, now: Instant): Int {
    if (playlists.isEmpty()) return -1
    val next = playlists.withIndex()
        .filter { it.value.designatedStartAt?.isAfter(now) == true }
        .minByOrNull { it.value.designatedStartAt!! }
    if (next != null) return next.index

    val active = playlists.withIndex()
        .filter { indexed ->
            val start = indexed.value.designatedStartAt ?: return@filter false
            val duration = indexed.value.estimatedDurationMs().coerceAtLeast(30 * 60 * 1_000L)
            !start.isAfter(now) && start.plusMillis(duration).isAfter(now)
        }
        .maxByOrNull { it.value.designatedStartAt!! }
    return active?.index ?: 0
}

internal fun retainedLessonIndex(
    playlists: List<LessonPlaylist>,
    previouslyFocusedId: String?,
    now: Instant
): Int = playlists.indexOfFirst { it.id == previouslyFocusedId }.takeIf { it >= 0 }
    ?: preferredLessonIndex(playlists, now)

internal fun CueItem.effectiveDurationMs(): Long? {
    val trimmed = durationMs?.let { duration ->
        ((endMs ?: duration) - startMs).coerceAtLeast(0)
    }
    return when {
        type == "image" && imageDurationSeconds != null -> imageDurationSeconds.coerceAtLeast(0) * 1_000L
        type == "image" && estimatedDurationSeconds != null -> estimatedDurationSeconds.coerceAtLeast(0) * 1_000L
        trimmed != null -> trimmed
        estimatedDurationSeconds != null -> estimatedDurationSeconds.coerceAtLeast(0) * 1_000L
        else -> null
    }
}

internal fun LessonPlaylist.estimatedDurationMs(): Long = timeline().sumOf {
    it.item.effectiveDurationMs() ?: 0L
}

internal fun formatDuration(durationMs: Long?): String {
    durationMs ?: return "Duration unknown"
    val totalSeconds = (durationMs / 1_000).coerceAtLeast(0)
    val hours = totalSeconds / 3_600
    val minutes = (totalSeconds % 3_600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds)
    else "%d:%02d".format(minutes, seconds)
}

internal fun beginsInLabel(playlist: LessonPlaylist, now: Instant): String =
    playlist.designatedStartAt?.let { start ->
        val minutes = Duration.between(now, start).toMinutes()
        when {
            minutes > 0 -> "BEGINS IN $minutes MIN"
            minutes >= -1 -> "IN PROGRESS"
            else -> "AVAILABLE"
        }
    } ?: "AVAILABLE"

internal fun shouldShowPlaybackOverlay(
    lastInteractionMs: Long,
    nowMs: Long,
    playing: Boolean,
    hasError: Boolean = false
): Boolean = hasError || !playing || nowMs - lastInteractionMs < PLAYBACK_OVERLAY_TIMEOUT_MS

internal const val PLAYBACK_OVERLAY_TIMEOUT_MS = 4_000L
