package org.lessoncue.tv

import org.junit.Assert.*
import org.junit.Test

class RemoteNavigationTest {
    @Test fun nextAtEndIsAcknowledgedAndDoesNotBlockFollowingPrevious() {
        var index = 1
        val moves = mutableListOf<Int>()
        for (action in listOf("next", "previous")) {
            assertTrue(applyRemoteNavigation(action, index, 2, null) { next, _ -> index = next; moves.add(next) })
        }
        assertEquals(listOf(0), moves)
    }

    @Test fun navigationOutsidePlayerIsAcknowledgedWithoutPlayback() {
        for (action in listOf("next", "previous", "seek")) {
            assertTrue(applyRemoteNavigation(action, null, 0, 1000) { _, _ -> fail("Must not start playback") })
        }
    }

    @Test fun validNavigationResetsPositionAndNegativeSeekIsClamped() {
        val moves = mutableListOf<Pair<Int, Long>>()
        assertTrue(applyRemoteNavigation("next", 0, 2, null) { index, seek -> moves.add(index to seek) })
        assertTrue(applyRemoteNavigation("seek", 1, 2, -1000) { index, seek -> moves.add(index to seek) })
        assertEquals(listOf(1 to 0L, 1 to 0L), moves)
        assertFalse(applyRemoteNavigation("play", 0, 2, null) { _, _ -> fail("Not a navigation command") })
    }
}
