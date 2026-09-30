package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackFallbackPolicyTest {
    @Test
    fun advancesFromHighestQualityThroughAvailableSourcesAndStopsAtTheEnd() {
        assertEquals(0, PlaybackFallbackPolicy.nextSourceIndex(-1, 3))
        assertEquals(1, PlaybackFallbackPolicy.nextSourceIndex(0, 3))
        assertEquals(2, PlaybackFallbackPolicy.nextSourceIndex(1, 3))
        assertNull(PlaybackFallbackPolicy.nextSourceIndex(2, 3))
        assertNull(PlaybackFallbackPolicy.nextSourceIndex(-1, 0))
    }

    @Test
    fun onlyTreatsBufferingAsStalledAfterTheConfiguredGracePeriod() {
        assertFalse(PlaybackFallbackPolicy.bufferingTimedOut(1_000, 15_999))
        assertTrue(PlaybackFallbackPolicy.bufferingTimedOut(1_000, 16_000))
    }
}
