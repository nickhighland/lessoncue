package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerUrlPolicyTest {
    @Test
    fun acceptsLocalHttpAndNormalizesDefaultPorts() {
        assertEquals("http://lessoncue.local", normalizeLessonCueServerUrl("lessoncue.local"))
        assertEquals("http://192.168.4.75", normalizeLessonCueServerUrl("http://192.168.4.75:80/"))
        assertEquals("http://[fe80::1]", normalizeLessonCueServerUrl("http://[fe80::1]"))
        assertTrue(isTrustedLocalHttpHost("10.2.3.4"))
        assertTrue(isTrustedLocalHttpHost("172.31.4.8"))
        assertTrue(isTrustedLocalHttpHost("169.254.10.5"))
        assertTrue(isTrustedLocalHttpHost("fd12:3456::1"))
        assertFalse(isTrustedLocalHttpHost("8.8.8.8"))
        assertFalse(isTrustedLocalHttpHost("fe8::1"))
    }

    @Test
    fun requiresHttpsForPublicOrOrdinaryDnsNames() {
        assertEquals("https://lesson.example.org", normalizeLessonCueServerUrl("https://lesson.example.org:443"))
        assertThrows(IllegalArgumentException::class.java) {
            normalizeLessonCueServerUrl("http://lesson.example.org")
        }
        assertThrows(IllegalArgumentException::class.java) {
            normalizeLessonCueServerUrl("http://8.8.8.8")
        }
    }

    @Test
    fun rejectsCredentialsAndNonOriginInput() {
        assertThrows(IllegalArgumentException::class.java) {
            normalizeLessonCueServerUrl("https://user:secret@lesson.example.org")
        }
        assertThrows(IllegalArgumentException::class.java) {
            normalizeLessonCueServerUrl("https://lesson.example.org/admin")
        }
    }
}
