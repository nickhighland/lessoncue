package org.lessoncue.tv

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlin.coroutines.coroutineContext

interface UpdateSource {
    suspend fun cleanInterruptedDownloads(directory: File)
    suspend fun fetchManifest(): UpdateManifest
    suspend fun download(
        manifest: UpdateManifest,
        directory: File,
        onProgress: (downloadedBytes: Long, totalBytes: Long?) -> Unit
    ): DownloadedApk
}

class UpdateClient(
    private val manifestUrl: String,
    private val expectedChannel: String,
    private val allowedHosts: Set<String>,
    private val connectTimeoutMillis: Int = 10_000,
    private val readTimeoutMillis: Int = 30_000
) : UpdateSource {
    override suspend fun cleanInterruptedDownloads(directory: File) {
        withContext(Dispatchers.IO) {
            directory.listFiles()?.filter { file ->
                file.name.startsWith("lessoncue-update-") &&
                    (file.name.endsWith(".part") || file.name.endsWith(".apk"))
            }?.forEach(File::delete)
        }
    }

    override suspend fun fetchManifest(): UpdateManifest = withContext(Dispatchers.IO) {
        val response = openFollowingRedirects(manifestUrl, "application/json")
        try {
            val declaredLength = response.connection.contentLengthLong
            if (declaredLength > UpdateManifestParser.MAX_MANIFEST_BYTES)
                throw UpdateValidationException("The update manifest is too large.")
            val output = ByteArrayOutputStream()
            response.connection.inputStream.use { input ->
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    coroutineContext.ensureActive()
                    val read = input.read(buffer)
                    if (read < 0) break
                    output.write(buffer, 0, read)
                    if (output.size() > UpdateManifestParser.MAX_MANIFEST_BYTES)
                        throw UpdateValidationException("The update manifest is too large.")
                }
            }
            UpdateManifestParser.parse(output.toString(Charsets.UTF_8.name()), expectedChannel, allowedHosts)
        } finally {
            response.connection.disconnect()
        }
    }

    override suspend fun download(
        manifest: UpdateManifest,
        directory: File,
        onProgress: (downloadedBytes: Long, totalBytes: Long?) -> Unit
    ): DownloadedApk = withContext(Dispatchers.IO) {
        directory.mkdirs()
        if (!directory.isDirectory) throw UpdateValidationException("The update cache directory is unavailable.")
        val partial = directory.resolve("lessoncue-update-${manifest.versionCode}.apk.part")
        val destination = directory.resolve("lessoncue-update-${manifest.versionCode}.apk")
        directory.listFiles()?.filter {
            it.name.startsWith("lessoncue-update-") && it != partial && it != destination
        }?.forEach(File::delete)
        partial.delete()
        destination.delete()

        val response = openFollowingRedirects(manifest.apkUrl, "application/vnd.android.package-archive")
        var completed = false
        try {
            val declaredLength = response.connection.contentLengthLong.takeIf { it >= 0 }
            if (declaredLength != null && declaredLength > UpdateManifestParser.MAX_APK_BYTES)
                throw UpdateValidationException("The update exceeds the maximum supported size.")
            manifest.fileSize?.let { expected ->
                if (declaredLength != null && declaredLength != expected)
                    throw UpdateValidationException("The update server returned an unexpected file size.")
            }
            val total = manifest.fileSize ?: declaredLength
            var downloaded = 0L
            partial.outputStream().buffered().use { output ->
                response.connection.inputStream.use { input ->
                    val buffer = ByteArray(1024 * 1024)
                    while (true) {
                        coroutineContext.ensureActive()
                        val read = input.read(buffer)
                        if (read < 0) break
                        downloaded += read
                        if (downloaded > UpdateManifestParser.MAX_APK_BYTES)
                            throw UpdateValidationException("The update exceeds the maximum supported size.")
                        output.write(buffer, 0, read)
                        onProgress(downloaded, total)
                    }
                }
            }
            UpdateFileValidation.validate(partial, manifest)
            runCatching {
                Files.move(
                    partial.toPath(),
                    destination.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
                )
            }.getOrElse {
                if (!partial.renameTo(destination))
                    throw UpdateValidationException("The verified update could not be finalized.")
            }
            completed = true
            DownloadedApk(destination, response.finalUrl.toString())
        } finally {
            response.connection.disconnect()
            if (!completed) partial.delete()
        }
    }

    private fun openFollowingRedirects(initialUrl: String, accept: String): OpenResponse {
        var current = UpdateManifestParser.validateHttpsUrl(initialUrl, allowedHosts)
        repeat(MAX_REDIRECTS + 1) { redirectCount ->
            val connection = (current.toURL().openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = connectTimeoutMillis
                readTimeout = readTimeoutMillis
                requestMethod = "GET"
                setRequestProperty("Accept", accept)
                setRequestProperty("Accept-Encoding", "identity")
                setRequestProperty("User-Agent", "LessonCue-AndroidTV/${BuildConfig.VERSION_NAME}")
            }
            val status = connection.responseCode
            if (status in REDIRECT_CODES) {
                if (redirectCount >= MAX_REDIRECTS) {
                    connection.disconnect()
                    throw UpdateValidationException("The update request exceeded the redirect limit.")
                }
                val location = connection.getHeaderField("Location")
                    ?: run {
                        connection.disconnect()
                        throw UpdateValidationException("The update server returned a redirect without a destination.")
                    }
                val redirected = current.resolve(location)
                connection.disconnect()
                UpdateManifestParser.validateHttpsUrl(redirected.toString(), allowedHosts)
                current = redirected
            } else {
                if (status !in 200..299) {
                    val detail = connection.errorStream?.bufferedReader()?.use { it.readText().take(300) }.orEmpty()
                    connection.disconnect()
                    throw UpdateValidationException(
                        "The update server returned HTTP $status${detail.takeIf(String::isNotBlank)?.let { ": $it" } ?: "."}"
                    )
                }
                return OpenResponse(connection, current)
            }
        }
        throw UpdateValidationException("The update request could not be completed.")
    }

    private data class OpenResponse(val connection: HttpURLConnection, val finalUrl: URI)

    companion object {
        private const val MAX_REDIRECTS = 5
        private val REDIRECT_CODES = setOf(
            HttpURLConnection.HTTP_MOVED_PERM,
            HttpURLConnection.HTTP_MOVED_TEMP,
            HttpURLConnection.HTTP_SEE_OTHER,
            307,
            308
        )
    }
}
