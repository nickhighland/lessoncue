package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LessonCueDiscoveryTest {
    @Test fun buildsDefaultHttpAddressFromIpv4Service() {
        assertEquals("http://192.168.4.75", lessonCueServiceUrl("192.168.4.75", 80, secure = false))
    }

    @Test fun preservesCustomPortAndSecureTxtRecord() {
        assertEquals("https://192.168.4.75:8443", lessonCueServiceUrl("192.168.4.75", 8443, secure = true))
    }

    @Test fun bracketsAndEncodesScopedIpv6Address() {
        assertEquals("http://[fe80::1%25wlan0]:8080", lessonCueServiceUrl("fe80::1%wlan0", 8080, secure = false))
    }

    @Test fun rejectsMissingHostOrInvalidPort() {
        assertNull(lessonCueServiceUrl(null, 80, secure = false))
        assertNull(lessonCueServiceUrl("", 80, secure = false))
        assertNull(lessonCueServiceUrl("192.168.4.75", 0, secure = false))
    }
}
