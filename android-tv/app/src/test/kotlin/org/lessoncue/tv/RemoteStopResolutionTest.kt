package org.lessoncue.tv

import org.junit.Assert.*
import org.junit.Test

class RemoteStopResolutionTest {
    @Test fun stopPreservesCachedLibrary() {
        val manifest = ScreenManifest(12, "Classroom", emptyList(), emptyList())
        assertSame(manifest, resolveRemoteStop(manifest))
    }

    @Test fun stopWithoutCacheStillHasAnIdleDestination() {
        val manifest = resolveRemoteStop(null)
        assertTrue(manifest.playlists.isEmpty())
        assertTrue(manifest.signage.isEmpty())
        assertEquals(0, manifest.version)
    }
}
