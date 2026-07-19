package org.lessoncue.tv

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.security.MessageDigest

data class ApkIdentity(
    val packageName: String,
    val versionCode: Long,
    val certificateSha256: Set<String>
)

object ApkIdentityPolicy {
    fun validate(
        manifest: UpdateManifest,
        installed: ApkIdentity,
        downloaded: ApkIdentity,
        expectedProductionCertificate: String?
    ) {
        if (downloaded.packageName != installed.packageName)
            throw UpdateValidationException("The downloaded APK belongs to '${downloaded.packageName}', not '${installed.packageName}'.")
        if (downloaded.versionCode <= installed.versionCode)
            throw UpdateValidationException("The downloaded APK is not newer than the installed app.")
        if (downloaded.versionCode != manifest.versionCode)
            throw UpdateValidationException("The downloaded APK version does not match the update manifest.")
        if (installed.certificateSha256.intersect(downloaded.certificateSha256).isEmpty())
            throw UpdateValidationException("The downloaded APK is not signed by a certificate compatible with the installed app.")
        expectedProductionCertificate?.takeIf(String::isNotBlank)?.normalizeFingerprint()?.let { expected ->
            if (expected !in downloaded.certificateSha256.map { it.normalizeFingerprint() })
                throw UpdateValidationException("The downloaded APK is not signed by the LessonCue production certificate.")
        }
    }

    private fun String.normalizeFingerprint(): String = uppercase().replace(":", "")
}

interface UpdateApkVerifier {
    fun verify(file: File, manifest: UpdateManifest): ApkIdentity
}

class ApkVerifier(private val context: Context) : UpdateApkVerifier {
    override fun verify(file: File, manifest: UpdateManifest): ApkIdentity {
        UpdateFileValidation.validate(file, manifest)
        val installed = packageInfo(context.packageName)
            ?: throw UpdateValidationException("The installed LessonCue package could not be inspected.")
        val downloaded = archivePackageInfo(file)
            ?: throw UpdateValidationException("Android could not parse the downloaded APK.")
        val installedIdentity = installed.toIdentity()
        val downloadedIdentity = downloaded.toIdentity()
        ApkIdentityPolicy.validate(
            manifest,
            installedIdentity,
            downloadedIdentity,
            BuildConfig.UPDATE_SIGNING_CERT_SHA256
        )
        return downloadedIdentity
    }

    private fun packageInfo(packageName: String): PackageInfo? = runCatching {
        if (Build.VERSION.SDK_INT >= 33) {
            context.packageManager.getPackageInfo(
                packageName,
                PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong())
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(
                packageName,
                signingCertificateFlags(Build.VERSION.SDK_INT)
            )
        }
    }.getOrNull()

    private fun archivePackageInfo(file: File): PackageInfo? = runCatching {
        if (Build.VERSION.SDK_INT >= 33) {
            context.packageManager.getPackageArchiveInfo(
                file.absolutePath,
                PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong())
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageArchiveInfo(
                file.absolutePath,
                signingCertificateFlags(Build.VERSION.SDK_INT)
            )
        }
    }.getOrNull()

    private fun PackageInfo.toIdentity(): ApkIdentity = ApkIdentity(
        packageName = packageName,
        versionCode = if (Build.VERSION.SDK_INT >= 28) longVersionCode else {
            @Suppress("DEPRECATION")
            versionCode.toLong()
        },
        certificateSha256 = certificateFingerprints()
    )

    private fun PackageInfo.certificateFingerprints(): Set<String> {
        @Suppress("DEPRECATION")
        val certificates = if (Build.VERSION.SDK_INT >= 28) {
            signingInfo?.let { details ->
                (details.apkContentsSigners.asList() + details.signingCertificateHistory.asList())
                    .distinctBy { it.toCharsString() }
            } ?: signatures?.asList().orEmpty()
        } else {
            signatures?.asList().orEmpty()
        }
        return certificates.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())
                .joinToString("") { "%02X".format(it) }
        }.toSet()
    }

    companion object {
        @Suppress("DEPRECATION")
        fun signingCertificateFlags(apiLevel: Int): Int =
            if (apiLevel >= 28) PackageManager.GET_SIGNING_CERTIFICATES
            else PackageManager.GET_SIGNATURES
    }
}
