package org.lessoncue.tv

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class UpdateManager(
    context: Context,
    private val scope: CoroutineScope,
    private val store: UpdatePreferencesStore = UpdateStore(context.applicationContext),
    private val client: UpdateSource = UpdateClient(
        BuildConfig.UPDATE_MANIFEST_URL,
        BuildConfig.UPDATE_CHANNEL,
        UpdateManifestParser.parseAllowedHosts(BuildConfig.UPDATE_ALLOWED_HOSTS)
    ),
    private val verifier: UpdateApkVerifier = ApkVerifier(context.applicationContext),
    private val installer: UpdatePackageInstaller = UpdateInstaller(context.applicationContext),
    private val automaticStartDelayMillis: Long = AUTOMATIC_START_DELAY_MILLIS
) {
    private val appContext = context.applicationContext
    private val installedVersionCode = BuildConfig.VERSION_CODE.toLong()
    private val installedVersionName = BuildConfig.VERSION_NAME
    private val mutableState = MutableStateFlow<UpdateUiState>(UpdateUiState.Idle(installedVersionName))
    val state: StateFlow<UpdateUiState> = mutableState.asStateFlow()
    private var checkJob: Job? = null
    private var automaticCheckStarted = false
    private var downloadJob: Job? = null
    private var installEventJob: Job = scope.launch {
        UpdateInstallEvents.consumePersisted(appContext)?.let(::handleInstallEvent)
        UpdateInstallEvents.events.collect { event ->
            handleInstallEvent(event)
        }
    }
    private var activeManifest: UpdateManifest? = null
    private var downloadedApk: DownloadedApk? = null
    private val cacheCleanupJob = scope.launch {
        client.cleanInterruptedDownloads(appContext.cacheDir.resolve("updates"))
    }

    fun startAutomaticCheck() {
        if (automaticCheckStarted) return
        automaticCheckStarted = true
        checkJob = scope.launch {
            delay(automaticStartDelayMillis)
            performCheck(manual = false)
        }
    }

    fun checkManually() {
        checkJob?.cancel()
        checkJob = scope.launch { performCheck(manual = true) }
    }

    private suspend fun performCheck(manual: Boolean) {
        if (manual) mutableState.value = UpdateUiState.Checking(installedVersionName)
        runCatching { client.fetchManifest() }
            .onSuccess { manifest ->
                if (!manual) store.recordSuccessfulAutomaticCheck()
                activeManifest = manifest
                val preferences = store.load()
                when {
                    !UpdatePolicy.isUpdateAvailable(manifest, installedVersionCode) ->
                        mutableState.value = if (manual) UpdateUiState.Current(installedVersionName)
                        else UpdateUiState.Idle(installedVersionName)
                    UpdatePolicy.shouldPresent(
                        manifest,
                        installedVersionCode,
                        preferences.dismissedVersionCode,
                        manual
                    ) -> mutableState.value = UpdateUiState.Available(
                        installedVersionName,
                        manifest,
                        UpdatePolicy.isBlocking(manifest, installedVersionCode),
                        manualPresentation = manual
                    )
                    else -> mutableState.value = UpdateUiState.Idle(installedVersionName)
                }
            }
            .onFailure { error ->
                mutableState.value = if (manual) {
                    UpdateUiState.Error(
                        installedVersionName,
                        error.message ?: "LessonCue could not check for updates."
                    )
                } else {
                    UpdateUiState.Idle(installedVersionName)
                }
            }
    }

    fun downloadAndInstall() {
        val manifest = activeManifest ?: return
        if (downloadJob?.isActive == true) return
        downloadJob = scope.launch {
            cacheCleanupJob.join()
            mutableState.value = UpdateUiState.Downloading(installedVersionName, manifest, 0, manifest.fileSize)
            runCatching {
                val downloaded = client.download(
                    manifest,
                    appContext.cacheDir.resolve("updates")
                ) { downloadedBytes, totalBytes ->
                    mutableState.value = UpdateUiState.Downloading(
                        installedVersionName,
                        manifest,
                        downloadedBytes,
                        totalBytes
                    )
                }
                runCatching { verifier.verify(downloaded.file, manifest) }
                    .getOrElse { error ->
                        downloaded.file.delete()
                        throw error
                    }
                downloadedApk = downloaded
                beginInstallation()
            }.onFailure { error ->
                if (error is kotlinx.coroutines.CancellationException) {
                    mutableState.value = UpdateUiState.Available(
                        installedVersionName,
                        manifest,
                        UpdatePolicy.isBlocking(manifest, installedVersionCode),
                        manualPresentation = true
                    )
                } else {
                    mutableState.value = UpdateUiState.Error(
                        installedVersionName,
                        error.message ?: "LessonCue could not download and verify the update.",
                        manifest
                    )
                }
            }
        }
    }

    fun cancelDownload() {
        downloadJob?.cancel()
    }

    fun dismiss() {
        val manifest = activeManifest
        if (manifest != null && !UpdatePolicy.isBlocking(manifest, installedVersionCode)) {
            scope.launch { store.dismiss(manifest.versionCode) }
            mutableState.value = UpdateUiState.Idle(installedVersionName)
        }
    }

    fun reviewAvailableUpdate() {
        val current = state.value as? UpdateUiState.Available ?: return
        mutableState.value = current.copy(manualPresentation = true)
    }

    fun closeMessage() {
        if (state.value is UpdateUiState.Available &&
            (state.value as UpdateUiState.Available).blocking
        ) return
        if (state.value is UpdateUiState.Checking) checkJob?.cancel()
        mutableState.value = UpdateUiState.Idle(installedVersionName)
    }

    fun retry() {
        val errorManifest = (state.value as? UpdateUiState.Error)?.manifest
        when {
            state.value is UpdateUiState.PermissionRequired -> onPermissionSettingsReturned()
            state.value is UpdateUiState.Error && errorManifest == null -> checkManually()
            errorManifest != null && downloadedApk != null -> scope.launch {
                runCatching { beginInstallation() }.onFailure { error ->
                    mutableState.value = UpdateUiState.Error(
                        installedVersionName,
                        error.message ?: "LessonCue could not resume the installation.",
                        activeManifest
                    )
                }
            }
            errorManifest != null -> downloadAndInstall()
            else -> checkManually()
        }
    }

    fun onPermissionSettingsReturned() {
        val manifest = activeManifest ?: return
        if (installer.canRequestPackageInstalls()) {
            scope.launch { beginInstallation() }
        } else {
            mutableState.value = UpdateUiState.PermissionRequired(
                installedVersionName,
                manifest,
                denied = true
            )
        }
    }

    fun onPermissionSettingsUnavailable() {
        val manifest = activeManifest ?: return
        mutableState.value = UpdateUiState.PermissionRequired(
            installedVersionName,
            manifest,
            settingsUnavailable = true
        )
    }

    fun permissionIntent() = installer.permissionIntent()

    private suspend fun beginInstallation() {
        val manifest = activeManifest ?: return
        val downloaded = downloadedApk
            ?: throw UpdateValidationException("Download the update again before installing it.")
        verifier.verify(downloaded.file, manifest)
        if (!installer.canRequestPackageInstalls()) {
            mutableState.value = UpdateUiState.PermissionRequired(installedVersionName, manifest)
            return
        }
        mutableState.value = UpdateUiState.Installing(
            installedVersionName,
            manifest,
            "Preparing Android's installation confirmation…"
        )
        installer.install(downloaded.file)
    }

    private fun handleInstallEvent(event: InstallEvent) {
        UpdateInstallEvents.clearPersisted(appContext)
        val currentManifest = activeManifest
        when (event) {
            InstallEvent.AwaitingUserConfirmation -> mutableState.value = if (currentManifest != null) {
                UpdateUiState.Installing(
                    installedVersionName,
                    currentManifest,
                    "Confirm the update in Android's installation screen."
                )
            } else {
                UpdateUiState.Error(
                    installedVersionName,
                    "Return to Android's installation confirmation to finish the update."
                )
            }
            InstallEvent.Success -> {
                downloadedApk?.file?.delete()
                downloadedApk = null
                mutableState.value = UpdateUiState.Current(currentManifest?.versionName ?: installedVersionName)
            }
            is InstallEvent.Failure -> mutableState.value = UpdateUiState.Error(
                installedVersionName,
                event.message,
                currentManifest
            )
        }
    }

    fun close() {
        checkJob?.cancel()
        downloadJob?.cancel()
        installEventJob.cancel()
        cacheCleanupJob.cancel()
    }

    companion object {
        private const val AUTOMATIC_START_DELAY_MILLIS = 5_000L
    }
}
