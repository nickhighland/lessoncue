package org.lessoncue.tv

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.security.MessageDigest

/** Publish a cache file only after the response, byte count and checksum agree. */
internal fun downloadMedia(
    connection: HttpURLConnection,
    destination: File,
    expectedSha: String?,
    checkActive: () -> Unit = {},
) {
    val partial = destination.resolveSibling("${destination.name}.part")
    try {
        checkActive()
        connection.connectTimeout = 8_000
        connection.readTimeout = 15_000
        connection.setRequestProperty("Accept-Encoding", "identity")
        val existing = if (partial.exists()) partial.length() else 0L
        if (existing > 0) connection.setRequestProperty("Range", "bytes=$existing-")
        val status = connection.responseCode
        if (status == 416) {
            // The remote object changed, or an interrupted transfer already reached EOF.
            partial.delete()
            throw IOException("Cached media range is unavailable; retrying a full download")
        }
        if (status != 200 && status != 206) throw IOException("Media download returned HTTP $status")
        val range = if (status == 206) {
            val parts = Regex("bytes (\\d+)-(\\d+)/(\\d+)")
                .matchEntire(connection.getHeaderField("Content-Range").orEmpty())
                ?: throw IOException("Media download returned an invalid Content-Range")
            val start = parts.groupValues[1].toLongOrNull()
            val end = parts.groupValues[2].toLongOrNull()
            val total = parts.groupValues[3].toLongOrNull()
            if (start != existing || end == null || total == null || end < existing || end >= total)
                throw IOException("Media download returned an unexpected Content-Range")
            (end - existing + 1) to total
        } else null
        val declaredLength = connection.contentLengthLong
        val expectedLength = range?.first ?: declaredLength
        if (range != null && declaredLength >= 0 && declaredLength != range.first)
            throw IOException("Media download returned inconsistent response lengths")
        var received = 0L
        // Obtain the response stream before truncating a previous partial file.
        connection.inputStream.use { input ->
            FileOutputStream(partial, status == 206 && existing > 0).buffered().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    checkActive()
                    val count = input.read(buffer)
                    if (count < 0) break
                    output.write(buffer, 0, count)
                    received += count
                }
            }
        }
        if (expectedLength >= 0 && received != expectedLength) {
            if (received > expectedLength) partial.delete()
            throw IOException("Media download was incomplete or exceeded its declared length")
        }
        if (range != null && partial.length() != range.second)
            throw IOException("Media download requires another range to complete")
        if (expectedSha != null) {
            val digest = MessageDigest.getInstance("SHA-256")
            partial.inputStream().use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    checkActive()
                    val count = input.read(buffer)
                    if (count < 0) break
                    digest.update(buffer, 0, count)
                }
            }
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actual.equals(expectedSha, ignoreCase = true)) {
                partial.delete()
                throw IOException("Cached media checksum did not match")
            }
        }
        checkActive()
        if (!partial.renameTo(destination)) throw IOException("Unable to finalize cached media")
    } finally {
        connection.disconnect()
    }
}
