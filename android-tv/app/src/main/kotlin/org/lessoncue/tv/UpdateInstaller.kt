package org.lessoncue.tv

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.provider.Settings
import androidx.core.content.edit
import androidx.core.net.toUri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.withContext
import java.io.File

object UpdateInstallEvents {
    private val mutableEvents = MutableSharedFlow<InstallEvent>(
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val events = mutableEvents.asSharedFlow()
    fun publish(context: Context, event: InstallEvent) {
        // The PackageInstaller callback can outlive the activity process, so persist synchronously
        // before publishing the in-memory event.
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit(commit = true) {
            putString(TYPE, when (event) {
                InstallEvent.AwaitingUserConfirmation -> "confirmation"
                InstallEvent.Success -> "success"
                is InstallEvent.Failure -> "failure"
            })
            putString(MESSAGE, (event as? InstallEvent.Failure)?.message)
        }
        mutableEvents.tryEmit(event)
    }

    fun consumePersisted(context: Context): InstallEvent? {
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val event = when (preferences.getString(TYPE, null)) {
            "confirmation" -> InstallEvent.AwaitingUserConfirmation
            "success" -> InstallEvent.Success
            "failure" -> InstallEvent.Failure(
                preferences.getString(MESSAGE, null) ?: "Android could not install the LessonCue update."
            )
            else -> null
        }
        preferences.edit {
            remove(TYPE)
            remove(MESSAGE)
        }
        return event
    }

    fun clearPersisted(context: Context) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit {
            remove(TYPE)
            remove(MESSAGE)
        }
    }

    private const val PREFERENCES = "lessoncue_update_install"
    private const val TYPE = "event_type"
    private const val MESSAGE = "event_message"
}

class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != UpdateInstaller.CALLBACK_ACTION) return
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                UpdateInstallEvents.publish(context, InstallEvent.AwaitingUserConfirmation)
                val confirmation = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                if (confirmation == null) {
                    UpdateInstallEvents.publish(context, InstallEvent.Failure("Android did not provide an installation confirmation screen."))
                } else {
                    confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(confirmation) }
                        .onFailure {
                            UpdateInstallEvents.publish(
                                context,
                                InstallEvent.Failure("Android could not open the installation confirmation screen.")
                            )
                        }
                }
            }
            PackageInstaller.STATUS_SUCCESS -> UpdateInstallEvents.publish(context, InstallEvent.Success)
            PackageInstaller.STATUS_FAILURE_ABORTED ->
                UpdateInstallEvents.publish(context, InstallEvent.Failure("The installation was canceled."))
            PackageInstaller.STATUS_FAILURE_BLOCKED ->
                UpdateInstallEvents.publish(context, InstallEvent.Failure("Android or the device administrator blocked the installation."))
            PackageInstaller.STATUS_FAILURE_CONFLICT ->
                UpdateInstallEvents.publish(context, InstallEvent.Failure("The installed LessonCue app has a conflicting package or signature."))
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
                UpdateInstallEvents.publish(context, InstallEvent.Failure("This LessonCue update is not compatible with the device."))
            PackageInstaller.STATUS_FAILURE_INVALID ->
                UpdateInstallEvents.publish(context, InstallEvent.Failure("Android rejected the update APK as invalid."))
            PackageInstaller.STATUS_FAILURE_STORAGE ->
                UpdateInstallEvents.publish(context, InstallEvent.Failure("The device does not have enough storage to install the update."))
            else -> UpdateInstallEvents.publish(
                context,
                InstallEvent.Failure(message?.takeIf(String::isNotBlank) ?: "Android could not install the LessonCue update.")
            )
        }
    }
}

interface UpdatePackageInstaller {
    fun canRequestPackageInstalls(): Boolean
    fun permissionIntent(): Intent
    suspend fun install(file: File)
}

class UpdateInstaller(private val context: Context) : UpdatePackageInstaller {
    override fun canRequestPackageInstalls(): Boolean =
        context.packageManager.canRequestPackageInstalls()

    override fun permissionIntent(): Intent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        "package:${context.packageName}".toUri()
    )

    override suspend fun install(file: File) = withContext(Dispatchers.IO) {
        if (!file.isFile) throw UpdateValidationException("The verified update APK is no longer available.")
        val packageInstaller = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setSize(file.length())
            if (Build.VERSION.SDK_INT >= 31)
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
        }
        val sessionId = packageInstaller.createSession(params)
        var committed = false
        try {
            packageInstaller.openSession(sessionId).use { session ->
                session.openWrite("lessoncue-update.apk", 0, file.length()).use { output ->
                    file.inputStream().buffered().use { input -> input.copyTo(output) }
                    session.fsync(output)
                }
                val callback = Intent(context, UpdateInstallReceiver::class.java)
                    .setAction(CALLBACK_ACTION)
                    .setPackage(context.packageName)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
                val pendingIntent = PendingIntent.getBroadcast(context, sessionId, callback, flags)
                session.commit(pendingIntent.intentSender)
                committed = true
            }
        } finally {
            if (!committed) runCatching { packageInstaller.abandonSession(sessionId) }
        }
    }

    companion object {
        const val CALLBACK_ACTION = "org.lessoncue.tv.UPDATE_INSTALL_STATUS"
    }
}
