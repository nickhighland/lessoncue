package org.lessoncue.personaltest

import org.junit.Assert.assertEquals
import org.junit.Test

class SlideNavigatorTest {
    @Test
    fun navigationStopsAtBothEnds() {
        val navigator = SlideNavigator(3)
        assertEquals(0, navigator.previous())
        assertEquals(1, navigator.next())
        assertEquals(2, navigator.next())
        assertEquals(2, navigator.next())
        assertEquals(1, navigator.previous())
    }
}
