package org.lessoncue.tv

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import java.time.Instant
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalTestApi::class)
class TvScreenTest {
    @get:Rule
    val compose = createComposeRule()

    private val identity = DeviceIdentity("screen", "token", "http://lessoncue.local")

    private fun cue(id: String, type: String = "video") = CueItem(
        id = id,
        title = id.replace('-', ' ').replaceFirstChar { it.uppercase() },
        type = type,
        url = "http://lessoncue.local/media/$id",
        durationMs = 90_000
    )

    private fun lesson(id: String, start: Instant? = null) = LessonPlaylist(
        id = id,
        title = id.replace('-', ' ').replaceFirstChar { it.uppercase() },
        designatedStartAt = start,
        preRollStartsAt = null,
        countdown = CountdownCue("countdown-$id", 60_000, null, cue("countdown-$id")),
        preRoll = PreRollCue(listOf(cue("pre-$id"))),
        postLesson = null,
        items = listOf(cue("main-$id"), cue("second-$id", "image"))
    )

    @Test
    fun preferredUpcomingLessonIsVisibleAndFocusable() {
        val now = Instant.now()
        val manifest = ScreenManifest(
            1,
            "Room 204",
            emptyList(),
            listOf(lesson("later", now.plusSeconds(7_200)), lesson("next", now.plusSeconds(900)))
        )

        compose.setContent {
            LibraryScreen(manifest, identity, ConnectionMode.Online, onStart = {}, onCheckForUpdates = null)
        }

        compose.onNodeWithTag("lesson-card-next").assertIsDisplayed()
            .performSemanticsAction(SemanticsActions.RequestFocus)
            .assertIsFocused()
    }

    @Test
    fun lessonDetailFocusesFirstRegularCueAndBackReturnsToLibrary() {
        var backed = false
        val playlist = lesson("lesson")
        compose.setContent {
            LessonDetailScreen(
                playlist,
                "Room 204",
                ConnectionMode.Cached,
                onBack = { backed = true },
                onPlay = { _, _ -> }
            )
        }

        compose.onNodeWithTag("cue-card-main-lesson")
            .performSemanticsAction(SemanticsActions.RequestFocus)
            .assertIsFocused()
            .assertIsDisplayed()
        compose.onNodeWithTag("back-to-lessons")
            .performSemanticsAction(SemanticsActions.RequestFocus)
            .assertIsFocused()
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.runOnIdle { assertTrue(backed) }
    }

    @Test
    fun emergencySignageDisablesLessonCards() {
        val emergency = SignageCue(
            id = "emergency",
            name = "Emergency",
            mode = "emergency",
            priority = 10,
            message = "Please leave the building",
            backgroundColor = "#101815",
            textColor = "#F7F2E8",
            mediaUrl = null
        )
        val manifest = ScreenManifest(1, "Room 204", listOf(emergency), listOf(lesson("lesson")))

        compose.setContent {
            LibraryScreen(manifest, identity, ConnectionMode.Online, onStart = {}, onCheckForUpdates = null)
        }

        compose.onNodeWithTag("lesson-card-lesson").assertDoesNotExist()
        compose.onNodeWithText("EMERGENCY OVERRIDE").assertIsDisplayed()
        compose.onNodeWithText("Lesson controls are temporarily unavailable. Interrupted playback will resume automatically.")
            .assertIsDisplayed()
    }
}
