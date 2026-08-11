package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class TvUiModelsTest {
    private fun item(id: String, durationMs: Long? = 30_000) =
        CueItem(id, id.replaceFirstChar { it.uppercase() }, "video", "http://server/$id", durationMs = durationMs)

    private fun lesson(
        id: String = "lesson",
        start: Instant? = null,
        regular: List<CueItem> = listOf(item("lesson-item"))
    ) = LessonPlaylist(
        id = id,
        title = id,
        designatedStartAt = start,
        preRollStartsAt = null,
        countdown = CountdownCue("countdown", 60_000, null, item("countdown", 60_000)),
        preRoll = PreRollCue(listOf(item("pre-roll"))),
        postLesson = PreRollCue(listOf(item("post-lesson"))),
        items = regular
    )

    @Test
    fun timelineUsesActualPlaybackOrder() {
        val timeline = lesson().timeline()

        assertEquals(
            listOf(CueRole.PreRoll, CueRole.Countdown, CueRole.Lesson, CueRole.PostLesson),
            timeline.map { it.role }
        )
        assertEquals(listOf("pre-roll", "countdown", "lesson-item", "post-lesson"), timeline.map { it.item.id })
    }

    @Test
    fun initialCueFocusPrefersFirstRegularLessonCue() {
        assertEquals(2, lesson().initialCueIndex())
        assertEquals(1, lesson(regular = emptyList()).initialCueIndex())
    }

    @Test
    fun libraryFocusPrefersNearestFutureLessonAndSurvivesRefresh() {
        val now = Instant.parse("2026-08-04T14:00:00Z")
        val later = lesson("later", now.plusSeconds(7_200))
        val next = lesson("next", now.plusSeconds(900))
        val playlists = listOf(later, next, lesson("unscheduled"))

        assertEquals(1, preferredLessonIndex(playlists, now))
        assertEquals(0, retainedLessonIndex(playlists, "later", now))
    }

    @Test
    fun emergencyAndSignageOnlyModesDisableLessonInteraction() {
        val emergency = SignageCue(
            id = "alert", name = "Alert", mode = "emergency", priority = 10, message = "Evacuate",
            backgroundColor = "#000000", textColor = "#ffffff", mediaUrl = null
        )
        val playlist = lesson()

        assertEquals(
            LibraryInteractionMode.Emergency,
            ScreenManifest(1, "TV", listOf(emergency), listOf(playlist)).libraryInteractionMode()
        )
        assertEquals(
            LibraryInteractionMode.SignageOnly,
            ScreenManifest(1, "TV", emptyList(), listOf(playlist), signageOnly = true).libraryInteractionMode()
        )
    }

    @Test
    fun playbackOverlayTimesOutOnlyWhilePlaying() {
        assertTrue(shouldShowPlaybackOverlay(1_000, 4_999, playing = true))
        assertFalse(shouldShowPlaybackOverlay(1_000, 5_000, playing = true))
        assertTrue(shouldShowPlaybackOverlay(1_000, 20_000, playing = false))
        assertTrue(shouldShowPlaybackOverlay(1_000, 20_000, playing = true, hasError = true))
    }
}
