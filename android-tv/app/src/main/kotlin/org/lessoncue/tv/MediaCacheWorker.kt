package org.lessoncue.tv

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

class MediaCacheWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val url = inputData.getString("url") ?: return@withContext Result.failure()
        val fileName = inputData.getString("fileName") ?: return@withContext Result.failure()
        if (fileName.isBlank() || fileName == "." || fileName == ".." || '/' in fileName || '\\' in fileName)
            return@withContext Result.failure()
        val token = inputData.getString("token")
        val serverHost = inputData.getString("serverHost")
        val expectedSha = inputData.getString("sha256")
        val destination = applicationContext.filesDir.resolve("media").also { it.mkdirs() }.resolve(fileName)
        val diagnosticError = destination.resolveSibling("$fileName.error")
        val context = currentCoroutineContext()
        try {
            context.ensureActive()
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            if (URL(url).host.equals(serverHost, ignoreCase = true))
                token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            downloadMedia(connection, destination, expectedSha) { context.ensureActive() }
            diagnosticError.delete()
            Result.success()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            diagnosticError.writeText("${System.currentTimeMillis()}\n${error.message ?: error.javaClass.simpleName}")
            if (error is PermanentMediaDownloadException || runAttemptCount >= 2) Result.failure() else Result.retry()
        }
    }
}
