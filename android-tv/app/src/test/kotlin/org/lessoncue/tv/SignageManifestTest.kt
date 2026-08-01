package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SignageManifestTest {
    @Test
    fun parsesCommittedPreviousCurrentAndFutureManifestFixtures() {
        val fixtures = listOf(
            "manifest-v1-minimum.json",
            "manifest-v1-current.json",
            "manifest-v1-future-additive.json"
        )

        fixtures.forEach { fixture ->
            val cache = File.createTempFile("lessoncue-$fixture", ".json")
            try {
                val content = checkNotNull(javaClass.classLoader?.getResourceAsStream(fixture)) {
                    "Protocol fixture $fixture was not packaged as a test resource."
                }.bufferedReader().use { it.readText() }
                cache.writeText(content)

                val manifest = LessonCueApi("http://127.0.0.1:80", cache).cachedManifest()
                assertNotNull("$fixture must remain readable by the Android display", manifest)
                assertTrue("$fixture must include a playable lesson", manifest!!.playlists.isNotEmpty())
                assertTrue("$fixture must preserve a cue", manifest.playlists.single().items.isNotEmpty())
            } finally {
                cache.delete()
            }
        }

        val currentCache = File.createTempFile("lessoncue-current-contract", ".json")
        try {
            val content = checkNotNull(javaClass.classLoader?.getResourceAsStream("manifest-v1-current.json"))
                .bufferedReader().use { it.readText() }
            currentCache.writeText(content)
            val current = LessonCueApi("http://127.0.0.1:80", currentCache).cachedManifest()!!
            assertEquals("mode=sign must remain supported by the native parser", "sign", current.signage.single().mode)
            assertEquals("Flexible-time cues must not silently lose their scheduling contract",
                true, current.playlists.single().items.single().flexibleTime)
        } finally {
            currentCache.delete()
        }
    }

    @Test
    fun parsesAdvancedSignageFieldsNeededByTheNativeRenderer() {
        val cache = File.createTempFile("lessoncue-signage-manifest", ".json")
        try {
            cache.writeText(
                """
                {
                  "manifestVersion": 7,
                  "screen": { "name": "Lobby" },
                  "displayCapabilities": {
                    "platform": "android-tv",
                    "displayName": "Android TV / Google TV / Fire TV",
                    "contractVersion": 1,
                    "minimumClientVersion": "0.40.6",
                    "capabilities": [{
                      "id": "signage.audience",
                      "label": "Signage audience",
                      "supported": false,
                      "fallback": "Show a title card."
                    }],
                    "limitations": ["Audience results require a browser display."]
                  },
                  "compatibilityWarnings": [{
                    "code": "unsupported-signage-element",
                    "title": "Poll",
                    "message": "Poll is browser-only.",
                    "fallback": "Show a title card."
                  }],
                  "playlists": [],
                  "signage": [{
                    "id": "sign-1",
                    "name": "Welcome",
                    "mode": "scheduled",
                    "priority": 10,
                    "message": "",
                    "backgroundColor": "#262f2c",
                    "textColor": "#ffffff",
                    "zones": [{
                      "id": "wifi-zone",
                      "type": "wifi",
                      "title": "Guest network",
                      "content": "Scan to connect",
                      "sourceUrl": "https://content.example.edu/welcome",
                      "x": 5,
                      "y": 10,
                      "width": 40,
                      "height": 50,
                      "backgroundColor": "#262f2c",
                      "textColor": "#ffffff",
                      "accentColor": "#d89028",
                      "richTextJson": "[{\u0022text\u0022:\u0022Welcome\u0022,\u0022bold\u0022:true}]",
                      "fontFamily": "Georgia",
                      "fontSize": 64,
                      "fontWeight": 700,
                      "lineHeightPercent": 135,
                      "qrValue": "WIFI:T:WPA;S:Guest;P:example;;",
                      "qrPlacement": "left",
                      "tickerSpeed": 95,
                      "counterTargetAt": "2026-08-01T12:00:00Z"
                    }]
                  }]
                }
                """.trimIndent()
            )

            val manifest = LessonCueApi("http://127.0.0.1:80", cache).cachedManifest()!!
            val zone = manifest.signage.single().zones.single()

            val capabilities = manifest.displayCapabilities!!
            assertEquals("android-tv", capabilities.platform)
            assertEquals(false, capabilities.capabilities.single().supported)
            assertEquals("unsupported-signage-element", manifest.compatibilityWarnings.single().code)
            assertEquals("wifi", zone.type)
            assertEquals("https://content.example.edu/welcome", zone.sourceUrl)
            assertEquals("Georgia", zone.fontFamily)
            assertEquals(135, zone.lineHeightPercent)
            assertEquals("WIFI:T:WPA;S:Guest;P:example;;", zone.qrValue)
            assertEquals("left", zone.qrPlacement)
            assertEquals(95, zone.tickerSpeed)
            assertNotNull(zone.richTextJson)
            assertNotNull(zone.counterTargetAt)
        } finally {
            cache.delete()
        }
    }
}
