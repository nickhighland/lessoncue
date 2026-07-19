package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class ManifestInstantParserTest {
    @Test
    fun parsesUtcAndNumericOffsets() {
        assertEquals(Instant.parse("2026-07-25T09:00:00Z"),
            parseOptionalInstant("2026-07-25T09:00:00Z"))
        assertEquals(Instant.parse("2026-07-25T13:00:00Z"),
            parseOptionalInstant("2026-07-25T09:00:00-04:00"))
    }

    @Test
    fun repairsCorruptedZeroOffsetWithoutBlockingTheManifest() {
        assertEquals(Instant.parse("2026-07-25T09:00:00Z"),
            parseOptionalInstant("2026-07-25T09:00:00+)):))"))
        assertEquals(Instant.parse("2026-07-25T09:00:00Z"),
            parseOptionalInstant("2026-07-25T09:00:00+OO:OO"))
    }

    @Test
    fun ignoresMissingOrUnrecoverableOptionalValues() {
        assertNull(parseOptionalInstant(null))
        assertNull(parseOptionalInstant(""))
        assertNull(parseOptionalInstant("not-a-timestamp"))
    }
}
