package org.lessoncue.tv

import android.view.KeyEvent

enum class PlaybackRemoteAction {
    Previous,
    Next,
    Rewind,
    FastForward,
    TogglePlayPause,
    Play,
    Pause
}

data class PlaybackRemoteDecision(
    val consumed: Boolean,
    val action: PlaybackRemoteAction? = null
)

class PlaybackRemoteKeyState {
    private var directionalKey: Int? = null
    private var directionalRepeated = false

    fun handle(keyCode: Int, eventAction: Int, repeatCount: Int): PlaybackRemoteDecision {
        if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
            if (eventAction == KeyEvent.ACTION_DOWN) {
                if (repeatCount == 0) {
                    directionalKey = keyCode
                    directionalRepeated = false
                    return PlaybackRemoteDecision(true)
                }
                directionalKey = keyCode
                directionalRepeated = true
                return PlaybackRemoteDecision(
                    true,
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT)
                        PlaybackRemoteAction.Rewind
                    else
                        PlaybackRemoteAction.FastForward
                )
            }
            if (eventAction == KeyEvent.ACTION_UP) {
                val isTap = directionalKey == keyCode && !directionalRepeated
                directionalKey = null
                directionalRepeated = false
                return PlaybackRemoteDecision(
                    true,
                    if (!isTap) null
                    else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT)
                        PlaybackRemoteAction.Previous
                    else
                        PlaybackRemoteAction.Next
                )
            }
            return PlaybackRemoteDecision(true)
        }

        val action = when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> PlaybackRemoteAction.Previous
            KeyEvent.KEYCODE_MEDIA_NEXT -> PlaybackRemoteAction.Next
            KeyEvent.KEYCODE_MEDIA_REWIND -> PlaybackRemoteAction.Rewind
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> PlaybackRemoteAction.FastForward
            KeyEvent.KEYCODE_MEDIA_PLAY -> PlaybackRemoteAction.Play
            KeyEvent.KEYCODE_MEDIA_PAUSE -> PlaybackRemoteAction.Pause
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_HEADSETHOOK,
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER -> PlaybackRemoteAction.TogglePlayPause
            else -> null
        } ?: return PlaybackRemoteDecision(false)

        return PlaybackRemoteDecision(
            consumed = true,
            action = action.takeIf { eventAction == KeyEvent.ACTION_DOWN && repeatCount == 0 }
        )
    }
}
