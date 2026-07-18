package org.lessoncue.tv

import org.json.JSONObject
import java.io.File
import java.math.BigDecimal
import java.net.URI
import java.security.MessageDigest

data class UpdateManifest(
    val schemaVersion: Int,
    val channel: String,
    val versionCode: Long,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val fileSize: Long?,
    val mandatory: Boolean,
    val minimumSupportedVersionCode: Long,
    val releaseNotes: String
)

class UpdateValidationException(message: String) : IllegalArgumentException(message)

object UpdateManifestParser {
    const val SUPPORTED_SCHEMA_VERSION = 1
    const val MAX_MANIFEST_BYTES = 1_048_576L
    const val MAX_APK_BYTES = 500L * 1024L * 1024L
    private val sha256Pattern = Regex("^[0-9a-f]{64}$")

    fun parse(raw: String, expectedChannel: String, allowedHosts: Set<String>): UpdateManifest {
        val payload = runCatching { JSONObject(raw) }
            .getOrElse { throw UpdateValidationException("The update manifest is not valid JSON.") }
        val schemaVersion = payload.requiredInt("schemaVersion")
        if (schemaVersion != SUPPORTED_SCHEMA_VERSION)
            throw UpdateValidationException("Unsupported update manifest schema $schemaVersion.")
        val channel = payload.requiredString("channel")
        if (channel != expectedChannel)
            throw UpdateValidationException("The update is for the '$channel' channel, not '$expectedChannel'.")
        val versionCode = payload.requiredLong("versionCode")
        if (versionCode < 1) throw UpdateValidationException("The update version code must be positive.")
        val versionName = payload.requiredString("versionName")
        val apkUrl = payload.requiredString("apkUrl")
        validateHttpsUrl(apkUrl, allowedHosts)
        val sha256 = payload.requiredString("sha256")
        if (!sha256Pattern.matches(sha256))
            throw UpdateValidationException("The update SHA-256 must contain 64 lowercase hexadecimal characters.")
        val fileSize = if (payload.has("fileSize") && !payload.isNull("fileSize")) payload.requiredLong("fileSize") else null
        if (fileSize != null && fileSize !in 1..MAX_APK_BYTES)
            throw UpdateValidationException("The update file size is outside the supported range.")
        if (!payload.has("mandatory") || payload.isNull("mandatory"))
            throw UpdateValidationException("The update manifest is missing 'mandatory'.")
        val mandatory = payload.get("mandatory") as? Boolean
            ?: throw UpdateValidationException("The update manifest field 'mandatory' must be true or false.")
        val minimumSupportedVersionCode = payload.requiredLong("minimumSupportedVersionCode")
        if (minimumSupportedVersionCode < 1)
            throw UpdateValidationException("The minimum supported version code must be positive.")
        val releaseNotes = payload.requiredString("releaseNotes", allowEmpty = true)
        return UpdateManifest(
            schemaVersion,
            channel,
            versionCode,
            versionName,
            apkUrl,
            sha256,
            fileSize,
            mandatory,
            minimumSupportedVersionCode,
            releaseNotes
        )
    }

    fun validateHttpsUrl(value: String, allowedHosts: Set<String>): URI {
        val uri = runCatching { URI(value) }
            .getOrElse { throw UpdateValidationException("The update URL is invalid.") }
        if (!uri.scheme.equals("https", ignoreCase = true))
            throw UpdateValidationException("Update URLs must use HTTPS.")
        if (uri.userInfo != null || uri.host.isNullOrBlank())
            throw UpdateValidationException("The update URL contains an invalid authority.")
        if (!isAllowedHost(uri.host, allowedHosts))
            throw UpdateValidationException("The update host '${uri.host}' is not trusted.")
        return uri
    }

    fun parseAllowedHosts(csv: String): Set<String> = csv.split(',')
        .map(String::trim)
        .filter(String::isNotBlank)
        .map(String::lowercase)
        .toSet()

    fun isAllowedHost(host: String, allowedHosts: Set<String>): Boolean =
        host.lowercase() in allowedHosts.map(String::lowercase)

    private fun JSONObject.requiredString(name: String, allowEmpty: Boolean = false): String {
        if (!has(name) || isNull(name)) throw UpdateValidationException("The update manifest is missing '$name'.")
        val value = get(name) as? String
            ?: throw UpdateValidationException("The update manifest field '$name' must be text.")
        if (!allowEmpty && value.isBlank()) throw UpdateValidationException("The update manifest field '$name' cannot be empty.")
        return value
    }

    private fun JSONObject.requiredLong(name: String): Long {
        if (!has(name) || isNull(name)) throw UpdateValidationException("The update manifest is missing '$name'.")
        val value = get(name)
        if (value !is Number)
            throw UpdateValidationException("The update manifest field '$name' must be an integer.")
        return runCatching { BigDecimal(value.toString()).longValueExact() }
            .getOrElse { throw UpdateValidationException("The update manifest field '$name' must be an integer.") }
    }

    private fun JSONObject.requiredInt(name: String): Int {
        val value = requiredLong(name)
        if (value !in Int.MIN_VALUE..Int.MAX_VALUE)
            throw UpdateValidationException("The update manifest field '$name' is outside the supported range.")
        return value.toInt()
    }
}

object UpdatePolicy {
    const val AUTO_CHECK_INTERVAL_MILLIS = 12L * 60L * 60L * 1_000L

    fun isUpdateAvailable(manifest: UpdateManifest, installedVersionCode: Long): Boolean =
        manifest.versionCode > installedVersionCode

    fun shouldRunAutomaticCheck(lastSuccessfulCheckMillis: Long?, nowMillis: Long): Boolean =
        lastSuccessfulCheckMillis == null ||
            nowMillis - lastSuccessfulCheckMillis >= AUTO_CHECK_INTERVAL_MILLIS ||
            nowMillis < lastSuccessfulCheckMillis

    fun shouldPresent(
        manifest: UpdateManifest,
        installedVersionCode: Long,
        dismissedVersionCode: Long?,
        manual: Boolean
    ): Boolean = isUpdateAvailable(manifest, installedVersionCode) &&
        (manual || dismissedVersionCode != manifest.versionCode || isBlocking(manifest, installedVersionCode))

    fun isBlocking(manifest: UpdateManifest, installedVersionCode: Long): Boolean =
        manifest.mandatory && installedVersionCode < manifest.minimumSupportedVersionCode
}

object UpdateFileValidation {
    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    fun validate(file: File, manifest: UpdateManifest) {
        if (!file.isFile) throw UpdateValidationException("The downloaded update file is missing.")
        if (file.length() > UpdateManifestParser.MAX_APK_BYTES)
            throw UpdateValidationException("The downloaded update exceeds the maximum supported size.")
        manifest.fileSize?.let {
            if (file.length() != it) throw UpdateValidationException("The downloaded update size does not match the manifest.")
        }
        if (sha256(file) != manifest.sha256)
            throw UpdateValidationException("The downloaded update SHA-256 does not match the manifest.")
    }
}

sealed interface UpdateUiState {
    val installedVersionName: String

    data class Idle(override val installedVersionName: String) : UpdateUiState
    data class Checking(override val installedVersionName: String) : UpdateUiState
    data class Current(override val installedVersionName: String) : UpdateUiState
    data class Available(
        override val installedVersionName: String,
        val manifest: UpdateManifest,
        val blocking: Boolean,
        val manualPresentation: Boolean
    ) : UpdateUiState
    data class Downloading(
        override val installedVersionName: String,
        val manifest: UpdateManifest,
        val bytesDownloaded: Long,
        val totalBytes: Long?
    ) : UpdateUiState
    data class PermissionRequired(
        override val installedVersionName: String,
        val manifest: UpdateManifest,
        val denied: Boolean = false,
        val settingsUnavailable: Boolean = false
    ) : UpdateUiState
    data class Installing(
        override val installedVersionName: String,
        val manifest: UpdateManifest,
        val message: String
    ) : UpdateUiState
    data class Error(
        override val installedVersionName: String,
        val message: String,
        val manifest: UpdateManifest? = null
    ) : UpdateUiState
}

data class UpdatePreferences(
    val lastSuccessfulAutomaticCheckMillis: Long? = null,
    val dismissedVersionCode: Long? = null
)

data class DownloadedApk(val file: File, val finalUrl: String)

sealed interface InstallEvent {
    data object AwaitingUserConfirmation : InstallEvent
    data object Success : InstallEvent
    data class Failure(val message: String) : InstallEvent
}
