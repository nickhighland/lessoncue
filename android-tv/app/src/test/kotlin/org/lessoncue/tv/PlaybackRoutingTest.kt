package org.lessoncue.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackRoutingTest {
    @Test
    fun activityCueUsesSharedWebPlayerWithoutMediaDownloadUrl() {
        val item = CueItem(
            id = "activity-1",
            title = "Wild Fact Frenzy",
            type = "activity",
            url = null,
            playbackUrl = "/player?screen=screen-1&cue=activity-1"
        )

        assertTrue(shouldUseOnlinePlayback(item))
    }

    @Test
    fun mediaCueWithoutPlaybackUrlRemainsUnavailable() {
        val item = CueItem(
            id = "missing-media",
            title = "Missing media",
            type = "video",
            url = null
        )

        assertFalse(shouldUseOnlinePlayback(item))
    }

    @Test
    fun activityPlaybackUrlCarriesPairedDisplayIdentity() {
        val item = CueItem(
            id = "activity-1",
            title = "Wild Fact Frenzy",
            type = "activity",
            url = null,
            playbackUrl = "http://192.168.4.3:8080/player?screen=screen-1&cue=activity-1"
        )

        val url = activityPlaybackUrl(item, DeviceIdentity("screen-1", "device-token", "http://192.168.4.3:8080"), "0.40.46")

        assertTrue(url!!.contains("screenId=screen-1"))
        assertTrue(url.contains("token=device-token"))
        assertTrue(url.contains("tvVersion=0.40.46"))
    }
}
