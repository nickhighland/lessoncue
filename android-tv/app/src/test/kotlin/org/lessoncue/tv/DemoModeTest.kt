package org.lessoncue.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoModeTest {
    @Test
    fun recognizesOnlyTheLocalDemoMarker() {
        assertTrue(isDemoServerUrl(DEMO_SERVER_URL))
        assertTrue(isDemoServerUrl("HTTP://LSNQ.DEMO/"))
        assertFalse(isDemoServerUrl("https://lsnq.demo"))
        assertFalse(isDemoServerUrl("http://lsnq.demo/anything"))
    }

    @Test
    fun requiresTheExactReviewPassword() {
        assertTrue(isDemoPassword(DEMO_PASSWORD))
        assertFalse(isDemoPassword("12345"))
        assertFalse(isDemoPassword("1234567"))
        assertFalse(isDemoPassword(" 123456"))
    }
}
