package org.lessoncue.tv

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files

class ManifestCacheSafetyTest {
    private val valid = """{"manifestVersion":7,"screen":{"name":"Test TV"},"playlists":[]}"""
    private val identity = DeviceIdentity("screen", "test-token", "http://lessoncue.local")

    private fun api(cache: File, body: String) = LessonCueApi(identity.serverUrl, cache, openConnection = {
        object : HttpURLConnection(URL(identity.serverUrl)) {
            override fun connect() = Unit
            override fun usingProxy() = false
            override fun disconnect() = Unit
            override fun getResponseCode() = 200
            override fun getInputStream() = ByteArrayInputStream(body.toByteArray())
        }
    })

    @Test fun malformedOrIncompleteResponsesCannotReplaceOfflineManifest() {
        val directory = Files.createTempDirectory("lessoncue-manifest-test").toFile()
        try {
            val cache = File(directory, "manifest.json")
            for (quick in listOf(true, false)) {
                for (bad in listOf("<html>Sign in</html>", "{\"manifestVersion\":8}")) {
                    cache.writeText(valid)
                    val client = api(cache, bad)
                    assertThrows(Exception::class.java) {
                        runBlocking { if (quick) client.manifestQuickly(identity) else client.manifest(identity) }
                    }
                    assertEquals("Last usable offline manifest must survive", valid, cache.readText())
                    assertEquals(7, client.cachedManifest()!!.version)
                }
            }
        } finally { directory.deleteRecursively() }
    }

    @Test fun completeResponseReplacesCacheAndLeavesNoTemporaryFiles() {
        val directory = Files.createTempDirectory("lessoncue-manifest-test").toFile()
        try {
            val cache = File(directory, "manifest.json")
            cache.writeText(valid)
            val client = api(cache, valid.replace(":7", ":8"))
            assertEquals(8, runBlocking { client.manifest(identity) }.version)
            assertEquals(8, client.cachedManifest()!!.version)
            assertEquals(listOf("manifest.json"), directory.listFiles()!!.map { it.name })
        } finally { directory.deleteRecursively() }
    }
}
