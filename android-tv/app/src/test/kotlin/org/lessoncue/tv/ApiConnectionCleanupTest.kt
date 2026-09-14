package org.lessoncue.tv

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

class ApiConnectionCleanupTest {
    private class Connection(private val failureAt: String? = null, private val status: Int = 200) :
        HttpURLConnection(URL("http://lessoncue.local")) {
        val failure = IOException("simulated network failure")
        var disconnects = 0
        override fun disconnect() { disconnects++ }
        override fun usingProxy() = false
        override fun connect() = Unit
        override fun getOutputStream(): OutputStream {
            if (failureAt == "upload") throw failure
            return ByteArrayOutputStream()
        }
        override fun getResponseCode(): Int {
            if (failureAt == "connect") throw failure
            return status
        }
        override fun getInputStream(): InputStream {
            if (failureAt == "read") return object : InputStream() {
                override fun read(): Int = throw failure
            }
            return ByteArrayInputStream("{\"serverName\":\"Test server\"}".toByteArray())
        }
        override fun getErrorStream(): InputStream = inputStream
    }

    @Test fun jsonRequestsDisconnectOnConnectUploadAndReadFailure() {
        for (stage in listOf("connect", "upload", "read")) {
            val connection = Connection(stage)
            val api = LessonCueApi("http://lessoncue.local", openConnection = { connection })
            val thrown = assertThrows(IOException::class.java) {
                runBlocking { api.requestPairing("Test TV") }
            }
            assertEquals(connection.failure.message, thrown.message)
            assertEquals("Disconnect after $stage failure", 1, connection.disconnects)
        }
    }

    @Test fun screenshotRequestsDisconnectOnConnectUploadAndReadFailure() {
        for (stage in listOf("connect", "upload", "read")) {
            val connection = Connection(stage)
            val api = LessonCueApi("http://lessoncue.local", openConnection = { connection })
            val thrown = assertThrows(IOException::class.java) {
                runBlocking {
                    api.uploadDiagnosticScreenshot(DeviceIdentity("screen", "test-token", api.baseUrl), "request", byteArrayOf(1))
                }
            }
            assertEquals(connection.failure.message, thrown.message)
            assertEquals("Disconnect after $stage failure", 1, connection.disconnects)
        }
    }

    @Test fun successfulAndRejectedRequestsStillDisconnect() {
        val success = Connection()
        val api = LessonCueApi("http://lessoncue.local", openConnection = { success })
        assertEquals("Test server", runBlocking { api.discover() })
        assertEquals(1, success.disconnects)

        val rejected = Connection(status = 503)
        val failingApi = LessonCueApi("http://lessoncue.local", openConnection = { rejected })
        assertThrows(IllegalStateException::class.java) { runBlocking { failingApi.discover() } }
        assertEquals(1, rejected.disconnects)
    }
}
