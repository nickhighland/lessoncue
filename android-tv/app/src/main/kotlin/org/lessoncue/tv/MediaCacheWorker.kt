package org.lessoncue.tv

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.io.FileOutputStream

class MediaCacheWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val url = inputData.getString("url") ?: return@withContext Result.failure()
        val fileName = inputData.getString("fileName") ?: return@withContext Result.failure()
        val token = inputData.getString("token")
        runCatching {
            val destination = applicationContext.filesDir.resolve("media").also { it.mkdirs() }.resolve(fileName)
            val partial = destination.resolveSibling("$fileName.part")
            val existing = if (partial.exists()) partial.length() else 0L
            val connection = URL(url).openConnection() as HttpURLConnection
            if (existing > 0) connection.setRequestProperty("Range", "bytes=$existing-")
            token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            FileOutputStream(partial, existing > 0).buffered().use { output -> connection.inputStream.use { it.copyTo(output) } }
            if (!partial.renameTo(destination)) error("Unable to finalize cached media")
            connection.disconnect()
        }.fold(onSuccess = { Result.success() }, onFailure = { Result.retry() })
    }
}
