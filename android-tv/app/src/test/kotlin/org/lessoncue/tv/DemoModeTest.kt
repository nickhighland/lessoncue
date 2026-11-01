package org.lessoncue.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoModeTest {
    @Test
    fun acceptsOnlyTheReviewMarkerWithoutNetworkLookup() {
        assertTrue(isDemoServerUrl("http://lsnq.demo"))
        assertTrue(isDemoServerUrl("HTTP://LSNQ.DEMO/"))
        assertFalse(isDemoServerUrl("https://lsnq.demo"))
        assertFalse(isDemoServerUrl("http://lsnq.demo.example"))
    }

    @Test
    fun acceptsOnlyTheExactReviewPassword() {
        assertTrue(isDemoPassword("123456"))
        assertFalse(isDemoPassword("12345"))
        assertFalse(isDemoPassword("123456 "))
    }

    @Test
    fun reviewManifestUsesTheProductionTvModelAndBundledMedia() {
        val manifest = demoManifest("org.lessoncue.tv")
        val playlist = manifest.playlists.single()
        val item = playlist.items.single()
        val timeline = playlist.timeline()

        assertEquals(DEMO_PLAYLIST_ID, playlist.id)
        assertEquals("Sample lesson", playlist.title)
        assertTrue(item.url?.startsWith("android.resource://org.lessoncue.tv/") == true)
        assertTrue(isBundledDemoMedia(item.url))
        assertEquals(4, timeline.size)
        assertEquals(CueRole.PreRoll, timeline.first().role)
        assertEquals(CueRole.Countdown, timeline[1].role)
        assertEquals(CueRole.Lesson, timeline[2].role)
        assertEquals(CueRole.PostLesson, timeline.last().role)
        assertEquals("loop", timeline.last().item.endBehavior)
    }
}
