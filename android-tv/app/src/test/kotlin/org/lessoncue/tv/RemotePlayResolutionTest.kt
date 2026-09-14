package org.lessoncue.tv

import org.junit.Assert.*
import org.junit.Test

class RemotePlayResolutionTest {
    @Test fun unavailableLessonIsConsumedButNetworkFailureRetries() {
        assertFalse(resolveRemotePlay(null, "missing").consume)
        val playlist = LessonPlaylist("available", "Available", null, null, null, null, items = emptyList())
        val manifest = ScreenManifest(1, "Test TV", emptyList(), listOf(playlist))
        val rejected = resolveRemotePlay(manifest, "missing")
        assertTrue(rejected.consume)
        assertNull(rejected.playlist)
        assertTrue(rejected.error!!.contains("not available"))
        val next = resolveRemotePlay(manifest, "available")
        assertTrue(next.consume)
        assertSame(playlist, next.playlist)
        assertNull(next.error)
    }
}
