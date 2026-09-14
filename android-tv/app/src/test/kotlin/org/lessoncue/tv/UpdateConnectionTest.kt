package org.lessoncue.tv

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class UpdateConnectionTest {
    private class Connection(
        private val status: Int = 200,
        private val location: String? = null,
        private val failure: String? = null,
    ) : HttpURLConnection(URL("https://github.com/manifest")) {
        var disconnects = 0
        var readBytes = 0
        override fun connect() = Unit
        override fun usingProxy() = false
        override fun disconnect() { disconnects++ }
        override fun getResponseCode(): Int {
            if (failure == "connect") throw IOException("connection failed")
            return status
        }
        override fun getHeaderField(name: String?): String? = if (name == "Location") location else null
        override fun getContentLengthLong() = -1L
        override fun getInputStream(): InputStream = ByteArrayInputStream("""{"schemaVersion":1,"channel":"stable","versionCode":144,"versionName":"test","apkUrl":"https://github.com/test.apk","sha256":"${"a".repeat(64)}","mandatory":false,"minimumSupportedVersionCode":1,"releaseNotes":""}""".toByteArray())
        override fun getErrorStream(): InputStream = object : InputStream() {
            override fun read(): Int {
                if (failure == "error-read") throw IOException("response interrupted")
                if (readBytes >= 100_000) return -1
                readBytes++
                return 'x'.code
            }
        }
    }

    private fun client(vararg connections: Connection): UpdateClient {
        val pending = ArrayDeque(connections.toList())
        return UpdateClient("https://github.com/manifest", "stable", setOf("github.com"),
            openConnection = { pending.removeFirst() })
    }

    @Test fun disconnectsOnConnectionAndErrorBodyFailure() {
        for (connection in listOf(Connection(failure = "connect"), Connection(status = 503, failure = "error-read"))) {
            assertThrows(IOException::class.java) { runBlocking { client(connection).fetchManifest() } }
            assertEquals(1, connection.disconnects)
        }
    }

    @Test fun malformedRedirectDisconnects() {
        val connection = Connection(302, "http://[malformed")
        assertThrows(IllegalArgumentException::class.java) { runBlocking { client(connection).fetchManifest() } }
        assertEquals(1, connection.disconnects)
    }

    @Test fun untrustedAndMissingRedirectDestinationsDisconnect() {
        for (target in listOf(null, "https://untrusted.example/file", "http://github.com/file")) {
            val connection = Connection(302, target)
            assertThrows(UpdateValidationException::class.java) { runBlocking { client(connection).fetchManifest() } }
            assertEquals(1, connection.disconnects)
        }
    }

    @Test fun validRedirectAndFinalResponseBothDisconnect() {
        val redirect = Connection(302, "/next")
        val success = Connection()
        val manifest = runBlocking { client(redirect, success).fetchManifest() }
        assertEquals(144, manifest.versionCode.toInt())
        assertEquals(1, redirect.disconnects)
        assertEquals(1, success.disconnects)
    }

    @Test fun errorTextReadIsBoundedBeforeTruncation() {
        val connection = Connection(503)
        assertThrows(UpdateValidationException::class.java) { runBlocking { client(connection).fetchManifest() } }
        assertTrue("Must not consume an arbitrarily large error body", connection.readBytes <= 16_384)
        assertEquals(1, connection.disconnects)
    }
}
