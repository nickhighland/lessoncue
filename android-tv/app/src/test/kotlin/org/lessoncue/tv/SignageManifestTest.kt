package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.io.File

class SignageManifestTest {
    @Test
    fun parsesAdvancedSignageFieldsNeededByTheNativeRenderer() {
        val cache = File.createTempFile("lessoncue-signage-manifest", ".json")
        try {
            cache.writeText(
                """
                {
                  "manifestVersion": 7,
                  "screen": { "name": "Lobby" },
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
                      "shape": "circle",
                      "qrValue": "WIFI:T:WPA;S:Guest;P:example;;",
                      "tickerSpeed": 95,
                      "counterTargetAt": "2026-08-01T12:00:00Z"
                    }]
                  }]
                }
                """.trimIndent()
            )

            val zone = LessonCueApi("http://127.0.0.1:80", cache)
                .cachedManifest()!!.signage.single().zones.single()

            assertEquals("wifi", zone.type)
            assertEquals("https://content.example.edu/welcome", zone.sourceUrl)
            assertEquals("Georgia", zone.fontFamily)
            assertEquals(135, zone.lineHeightPercent)
            assertEquals("circle", zone.shape)
            assertEquals("WIFI:T:WPA;S:Guest;P:example;;", zone.qrValue)
            assertEquals(95, zone.tickerSpeed)
            assertNotNull(zone.richTextJson)
            assertNotNull(zone.counterTargetAt)
        } finally {
            cache.delete()
        }
    }
}
