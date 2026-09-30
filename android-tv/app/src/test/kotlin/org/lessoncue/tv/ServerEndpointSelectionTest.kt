package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.coroutines.runBlocking
import java.io.IOException

class ServerEndpointSelectionTest {
    @Test fun preservesCustomPortAndPrefersIpv4ForDualStackHost() {
        val result = ServerEndpointSelection.resolve(
            "http://lessoncue.local:8088",
            listOf("http://192.168.1.20:8088")
        )
        // The DNS result is environment-dependent in a unit test, but the
        // discovered numeric endpoint must retain its advertised port and be
        // viable even if DNS did not return anything.
        assertTrue(result.candidates.any { it.endpoint == "http://192.168.1.20:8088" })
        assertEquals("ipv4", result.candidates.first { it.endpoint == "http://192.168.1.20:8088" }.addressFamily)
    }

    @Test fun rejectsBareLinkLocalWithoutBlockingDiscoveredIpv4() {
        val result = ServerEndpointSelection.resolve(
            "http://lessoncue.local",
            listOf("http://[fe80::1]", "http://192.168.1.20")
        )
        assertTrue(result.rejected.any { it.endpoint.contains("fe80") })
        assertTrue(result.candidates.any { it.endpoint == "http://192.168.1.20" })
    }

    @Test fun numericLastKnownEndpointIsKeptAsFirstCandidate() {
        val result = ServerEndpointSelection.resolve("http://192.168.1.20:8090")
        assertEquals("http://192.168.1.20:8090", result.candidates.first().endpoint)
    }

    @Test fun brokenIpv6ProbeFallsBackToReachableIpv4() = runBlocking {
        val candidates = listOf(
            ServerEndpointCandidate("http://[2001:db8::20]:8088", "dns", "ipv6"),
            ServerEndpointCandidate("http://192.168.1.20:8088", "dns", "ipv4"),
        )
        val attempts = mutableListOf<EndpointAttempt>()
        val selected = firstVerifiedServerEndpoint(
            candidates,
            mutableSetOf(),
            attempts,
        ) { candidate ->
            if (candidate.addressFamily == "ipv6") throw IOException("connection timed out")
            "LessonCue server"
        }

        assertEquals("http://192.168.1.20:8088", selected?.first?.endpoint)
        assertEquals(listOf("failed", "verified"), attempts.map { it.outcome })
        assertEquals("ipv6", attempts.first().addressFamily)
    }
}
