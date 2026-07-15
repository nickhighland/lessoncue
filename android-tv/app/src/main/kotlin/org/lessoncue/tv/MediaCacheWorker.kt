package org.lessoncue.tv

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.io.FileOutputStream
import java.security.MessageDigest

class MediaCacheWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val url = inputData.getString("url") ?: return@withContext Result.failure()
        val fileName = inputData.getString("fileName") ?: return@withContext Result.failure()
        val token = inputData.getString("token")
        val serverHost = inputData.getString("serverHost")
        val expectedSha = inputData.getString("sha256")
        runCatching {
            val destination = applicationContext.filesDir.resolve("media").also { it.mkdirs() }.resolve(fileName)
            val partial = destination.resolveSibling("$fileName.part")
            val existing = if (partial.exists()) partial.length() else 0L
            val connection = URL(url).openConnection() as HttpURLConnection
            if (existing > 0) connection.setRequestProperty("Range", "bytes=$existing-")
            if (URL(url).host.equals(serverHost, ignoreCase = true))
                token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            val append = existing > 0 && connection.responseCode == HttpURLConnection.HTTP_PARTIAL
            FileOutputStream(partial, append).buffered().use { output -> connection.inputStream.use { it.copyTo(output) } }
            if (expectedSha != null) {
                val actual = partial.inputStream().use { input ->
                    val digest = MessageDigest.getInstance("SHA-256")
                    val buffer = ByteArray(1024 * 1024)
                    while (true) { val read = input.read(buffer); if (read < 0) break; digest.update(buffer, 0, read) }
                    digest.digest().joinToString("") { "%02x".format(it) }
                }
                if (!actual.equals(expectedSha, ignoreCase = true)) { partial.delete(); error("Cached media checksum did not match") }
            }
            if (!partial.renameTo(destination)) error("Unable to finalize cached media")
            connection.disconnect()
        }.fold(onSuccess = { Result.success() }, onFailure = { Result.retry() })
    }
}
