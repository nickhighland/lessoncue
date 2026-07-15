package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ScheduleCoordinatorTest {
    private val start = Instant.parse("2026-07-19T13:00:00Z")
    private val lesson = LessonPlaylist(
        id = "lesson", title = "Lesson", designatedStartAt = start,
        preRollStartsAt = null,
        countdown = CountdownCue("countdown", 300_000, start.minusMillis(300_000), CueItem("countdown", "Countdown", "video", null, durationMs = 300_000)),
        preRoll = PreRollCue(listOf(CueItem("welcome", "Welcome", "video", null, durationMs = 30_000))),
        items = emptyList()
    )

    @Test fun preRollRunsBeforeCountdownWindow() {
        assertTrue(ScheduleCoordinator.phase(lesson, start.minusMillis(600_000)) is PlaybackPhase.PreRoll)
    }

    @Test fun countdownSeeksWhenAppWakesMidway() {
        assertEquals(PlaybackPhase.Countdown(120_000), ScheduleCoordinator.phase(lesson, start.minusMillis(180_000)))
    }

    @Test fun lessonIsReadyAtDesignatedTime() {
        assertEquals(PlaybackPhase.Ready, ScheduleCoordinator.phase(lesson, start))
    }
}
