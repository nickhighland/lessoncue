package org.lessoncue.tv

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackRemoteKeyStateTest {
    @Test
    fun tappingLeftAndRightMovesBetweenLessonItems() {
        val state = PlaybackRemoteKeyState()

        assertTrue(state.handle(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_DOWN, 0).consumed)
        assertEquals(
            PlaybackRemoteAction.Previous,
            state.handle(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_UP, 0).action
        )
        state.handle(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_DOWN, 0)
        assertEquals(
            PlaybackRemoteAction.Next,
            state.handle(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_UP, 0).action
        )
    }

    @Test
    fun holdingLeftAndRightSeeksWithoutChangingLessonItemsOnRelease() {
        val state = PlaybackRemoteKeyState()

        state.handle(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_DOWN, 0)
        assertEquals(
            PlaybackRemoteAction.Rewind,
            state.handle(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_DOWN, 1).action
        )
        assertNull(state.handle(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_UP, 0).action)

        state.handle(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_DOWN, 0)
        assertEquals(
            PlaybackRemoteAction.FastForward,
            state.handle(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_DOWN, 1).action
        )
        assertNull(state.handle(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_UP, 0).action)
    }

    @Test
    fun mediaAndCenterButtonsControlPlayback() {
        val state = PlaybackRemoteKeyState()

        assertEquals(
            PlaybackRemoteAction.TogglePlayPause,
            state.handle(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.ACTION_DOWN, 0).action
        )
        assertEquals(
            PlaybackRemoteAction.Play,
            state.handle(KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.ACTION_DOWN, 0).action
        )
        assertEquals(
            PlaybackRemoteAction.Pause,
            state.handle(KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.ACTION_DOWN, 0).action
        )
        assertEquals(
            PlaybackRemoteAction.TogglePlayPause,
            state.handle(KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.ACTION_DOWN, 0).action
        )
    }
}
