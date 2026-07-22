package org.lessoncue.tv

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Bitmap
import android.view.PixelCopy
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { LessonCueApp() }
    }
}

private sealed interface AppScreen {
    data object Loading : AppScreen
    data class Connect(val message: String? = null) : AppScreen
    data class EnterPin(val api: LessonCueApi, val requestId: String, val serverName: String) : AppScreen
    data class Library(val identity: DeviceIdentity, val manifest: ScreenManifest) : AppScreen
    data class LessonDetail(val identity: DeviceIdentity, val manifest: ScreenManifest, val playlist: LessonPlaylist) : AppScreen
    data class Player(
        val playlist: LessonPlaylist,
        val items: List<CueItem> = playlist.items,
        val itemIndex: Int = 0,
        val seekMs: Long = 0
    ) : AppScreen
}

@Composable
fun LessonCueApp() {
    val context = LocalContext.current
    val store = remember { IdentityStore(context) }
    val scope = rememberCoroutineScope()
    val updateManager = remember(context, scope) { UpdateManager(context, scope) }
    val updateState by updateManager.state.collectAsState()
    val updatePermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        updateManager.onPermissionSettingsReturned()
    }
    var screen by remember { mutableStateOf<AppScreen>(AppScreen.Loading) }
    var activeIdentity by remember { mutableStateOf<DeviceIdentity?>(null) }
    var activeManifestVersion by remember { mutableStateOf(0) }
    var playbackControl by remember { mutableStateOf<ControlCommand?>(null) }
    var acknowledgedControlVersion by remember { mutableStateOf(0) }
    var playbackTelemetry by remember { mutableStateOf(PlaybackTelemetry()) }
    var totalManifestItems by remember { mutableStateOf(0) }
    var diagnosticCaptureVisible by remember { mutableStateOf(false) }
    var handledScreenshotRequest by remember { mutableStateOf<String?>(null) }
    var interruptedPlayer by remember { mutableStateOf<AppScreen.Player?>(null) }

    DisposableEffect(updateManager) {
        onDispose { updateManager.close() }
    }

    LaunchedEffect(Unit) {
        if (BuildConfig.UPDATE_ENABLED) updateManager.startAutomaticCheck()
    }

    LaunchedEffect(Unit) {
        val identity = store.load()
        screen = if (identity == null) AppScreen.Connect() else {
            runCatching {
                val (resolvedIdentity, manifest) = reconnectSavedServer(
                    context, identity, context.filesDir.resolve("manifest.json")
                )
                if (resolvedIdentity.serverUrl != identity.serverUrl) store.save(resolvedIdentity)
                activeIdentity = resolvedIdentity
                activeManifestVersion = manifest.version
                totalManifestItems = manifest.itemCount()
                AppScreen.Library(resolvedIdentity, manifest)
            }
                .getOrElse {
                    LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json")).cachedManifest()?.let { cached ->
                        activeIdentity = identity
                        activeManifestVersion = cached.version
                        AppScreen.Library(identity, cached)
                    } ?: AppScreen.Connect("Saved server unavailable. Automatic discovery could not reconnect. Enter the server's numeric IP address.")
                }
        }
    }

    LaunchedEffect(activeIdentity?.screenId) {
        val identity = activeIdentity ?: return@LaunchedEffect
        val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
        while (true) {
            val cachedItems = context.filesDir.resolve("media").listFiles()?.size ?: 0
            runCatching { api.reportStatus(identity, activeManifestVersion, context.filesDir.usableSpace,
                acknowledgedControlVersion = acknowledgedControlVersion, playback = playbackTelemetry,
                cachedItems = cachedItems, totalItems = totalManifestItems) }
            kotlinx.coroutines.delay(if (playbackTelemetry.state in setOf("playing", "loading", "buffering")) 2_000 else 30_000)
        }
    }

    LaunchedEffect(activeIdentity?.screenId) {
        val identity = activeIdentity ?: return@LaunchedEffect
        val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
        var controlVersion = runCatching { api.control(identity).version }.getOrDefault(0)
        while (true) {
            runCatching { api.control(identity, controlVersion) }.getOrNull()?.let { command ->
                if (command.screenshotRequestId != null && command.screenshotRequestId != handledScreenshotRequest &&
                    (command.screenshotExpiresAt == null || command.screenshotExpiresAt.isAfter(Instant.now()))) {
                    handledScreenshotRequest = command.screenshotRequestId
                    diagnosticCaptureVisible = true
                    kotlinx.coroutines.delay(2_500)
                    val activity = context as? ComponentActivity
                    val jpeg = activity?.let { captureDiagnosticScreenshot(it) }
                    if (jpeg != null) runCatching { api.uploadDiagnosticScreenshot(identity, command.screenshotRequestId, jpeg) }
                    diagnosticCaptureVisible = false
                }
                if (command.changed) {
                    controlVersion = command.version
                    playbackControl = command
                    when (command.action) {
                        "play" -> runCatching { api.manifest(identity) }.getOrNull()?.let { manifest ->
                            activeManifestVersion = manifest.version
                            totalManifestItems = manifest.itemCount()
                            val playlist = manifest.playlists.firstOrNull { it.id == command.lessonId }
                            if (playlist != null) {
                                val allItems = playlist.preRoll?.items.orEmpty() + listOfNotNull(playlist.countdown?.item) + playlist.items
                                val selected = command.itemId?.let { id -> allItems.indexOfFirst { it.id == id } }?.takeIf { it >= 0 }
                                val requested = if (selected != null) AppScreen.Player(playlist, allItems, selected)
                                    else AppScreen.Player(playlist)
                                if (manifest.signage.any { it.mode == "emergency" }) {
                                    interruptedPlayer = requested
                                    screen = AppScreen.Library(identity, manifest)
                                } else screen = requested
                            }
                        }
                        "stop" -> {
                            interruptedPlayer = null
                            runCatching { api.manifest(identity) }.getOrNull()?.let { screen = AppScreen.Library(identity, it) }
                        }
                        "next" -> (screen as? AppScreen.Player)?.let { current ->
                            if (current.itemIndex + 1 < current.items.size) screen = current.copy(itemIndex = current.itemIndex + 1, seekMs = 0)
                        }
                        "previous" -> (screen as? AppScreen.Player)?.let { current ->
                            screen = current.copy(itemIndex = (current.itemIndex - 1).coerceAtLeast(0), seekMs = 0)
                        }
                        "seek" -> (screen as? AppScreen.Player)?.let { current -> screen = current.copy(seekMs = command.positionMs ?: 0) }
                        "pause", "resume" -> Unit
                    }
                    acknowledgedControlVersion = command.version
                } else controlVersion = maxOf(controlVersion, command.version)
            }
            kotlinx.coroutines.delay(750)
        }
    }

    LaunchedEffect(activeIdentity?.screenId) {
        val identity = activeIdentity ?: return@LaunchedEffect
        val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
        while (true) {
            runCatching { api.manifest(identity) }.getOrNull()?.let { latest ->
                activeManifestVersion = latest.version
                totalManifestItems = latest.itemCount()
                scheduleMediaCaches(context, identity, latest)
                val emergency = latest.signage.any { it.mode == "emergency" }
                val current = screen
                when {
                    emergency && current is AppScreen.Player -> {
                        interruptedPlayer = current.copy(seekMs = maxOf(current.seekMs, playbackTelemetry.positionMs))
                        screen = AppScreen.Library(identity, latest)
                    }
                    emergency && current is AppScreen.Library -> screen = AppScreen.Library(identity, latest)
                    !emergency && interruptedPlayer != null -> {
                        screen = interruptedPlayer!!
                        interruptedPlayer = null
                    }
                    current is AppScreen.Library -> screen = AppScreen.Library(identity, latest)
                    current is AppScreen.LessonDetail -> {
                        val playlist = latest.playlists.firstOrNull { it.id == current.playlist.id }
                        screen = if (playlist == null) AppScreen.Library(identity, latest)
                            else AppScreen.LessonDetail(identity, latest, playlist)
                    }
                }
            }
            kotlinx.coroutines.delay(10_000)
        }
    }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), colors = androidx.tv.material3.SurfaceDefaults.colors(containerColor = Navy)) {
          Box(Modifier.fillMaxSize()) {
            when (val current = screen) {
                AppScreen.Loading -> CenterMessage("Searching for LessonCue…")
                is AppScreen.Connect -> ConnectScreen(current.message) { address ->
                    scope.launch {
                        runCatching {
                            val (api, name) = findLessonCueServer(
                                context, address, context.filesDir.resolve("manifest.json")
                            )
                            val request = api.requestPairing(Build.MODEL)
                            screen = AppScreen.EnterPin(api, request, name)
                        }.onFailure { screen = AppScreen.Connect(it.message) }
                    }
                }
                is AppScreen.EnterPin -> PinScreen(current.serverName) { pin ->
                    scope.launch {
                        runCatching {
                            val identity = current.api.confirmPairing(current.requestId, pin)
                            store.save(identity)
                            val manifest = current.api.manifest(identity)
                            activeIdentity = identity
                            activeManifestVersion = manifest.version
                            totalManifestItems = manifest.itemCount()
                            screen = AppScreen.Library(identity, manifest)
                        }.onFailure { screen = AppScreen.Connect(it.message) }
                    }
                }
                is AppScreen.Library -> {
                    LaunchedEffect(current.manifest.version) { playbackTelemetry = PlaybackTelemetry() }
                    LaunchedEffect(current.manifest.version) { scheduleMediaCaches(context, current.identity, current.manifest) }
                    LaunchedEffect(current.manifest.version, current.manifest.playlists.size) {
                        while (true) {
                            val scheduled = current.manifest.playlists.map { it to ScheduleCoordinator.phase(it, Instant.now()) }
                                .firstOrNull { (_, phase) -> phase is PlaybackPhase.Countdown || phase is PlaybackPhase.PreRoll }
                            if (scheduled != null) {
                                val (playlist, phase) = scheduled
                                screen = when (phase) {
                                    is PlaybackPhase.Countdown -> playlist.countdown?.item?.let { AppScreen.Player(playlist, listOf(it), seekMs = phase.seekMs) } ?: AppScreen.Player(playlist)
                                    is PlaybackPhase.PreRoll -> {
                                        val preRollItems = playlist.preRoll?.items.orEmpty()
                                        AppScreen.Player(playlist, loopingPreRoll(preRollItems))
                                    }
                                    else -> AppScreen.Player(playlist)
                                }
                                break
                            }
                            kotlinx.coroutines.delay(1_000)
                        }
                    }
                    LibraryScreen(
                        current.manifest,
                        onStart = { playlist -> screen = AppScreen.LessonDetail(current.identity, current.manifest, playlist) },
                        onCheckForUpdates = (updateManager::checkManually).takeIf { BuildConfig.UPDATE_ENABLED }
                    )
                }
                is AppScreen.LessonDetail -> {
                    LaunchedEffect(current.playlist.id) {
                        while (true) {
                            when (val phase = ScheduleCoordinator.phase(current.playlist, Instant.now())) {
                                is PlaybackPhase.Countdown -> current.playlist.countdown?.item?.let {
                                    screen = AppScreen.Player(current.playlist, listOf(it), seekMs = phase.seekMs)
                                    return@LaunchedEffect
                                }
                                is PlaybackPhase.PreRoll -> {
                                    screen = AppScreen.Player(current.playlist, loopingPreRoll(current.playlist.preRoll?.items.orEmpty()))
                                    return@LaunchedEffect
                                }
                                else -> Unit
                            }
                            kotlinx.coroutines.delay(1_000)
                        }
                    }
                    LessonDetailScreen(current.playlist,
                        onBack = { screen = AppScreen.Library(current.identity, current.manifest) },
                        onPlay = { items, index -> screen = AppScreen.Player(current.playlist, items, index) })
                }
                is AppScreen.Player -> {
                    LaunchedEffect(current.playlist.id, current.items.map { it.id }) {
                        val preRollIds = current.playlist.preRoll?.items.orEmpty().map { it.id }
                        val countdownId = current.playlist.countdown?.item?.id
                        while (true) {
                            val phase = ScheduleCoordinator.phase(current.playlist, Instant.now())
                            val playingIds = current.items.map { it.id }
                            when {
                                playingIds == preRollIds && phase is PlaybackPhase.Countdown -> {
                                    current.playlist.countdown?.item?.let {
                                        screen = AppScreen.Player(current.playlist, listOf(it), seekMs = phase.seekMs)
                                    }
                                    break
                                }
                                (playingIds == preRollIds || (playingIds.size == 1 && playingIds.firstOrNull() == countdownId)) && phase is PlaybackPhase.Ready -> {
                                    screen = AppScreen.Player(current.playlist)
                                    break
                                }
                            }
                            kotlinx.coroutines.delay(250)
                        }
                    }
                    PlayerScreen(current.playlist, current.items, current.itemIndex, current.seekMs, playbackControl,
                    onTelemetry = { playbackTelemetry = it },
                    onExit = { scope.launch { store.load()?.let { identity ->
                        val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
                        val manifest = runCatching { api.manifest(identity) }.getOrElse {
                            api.cachedManifest() ?: ScreenManifest(1, "LessonCue", emptyList(), listOf(current.playlist))
                        }
                        screen = AppScreen.LessonDetail(identity, manifest,
                            manifest.playlists.firstOrNull { it.id == current.playlist.id } ?: current.playlist)
                    } } },
                    onFinished = { scope.launch {
                        val identity = activeIdentity ?: return@launch
                        val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
                        val manifest = runCatching { api.manifest(identity) }.getOrElse {
                            api.cachedManifest() ?: ScreenManifest(1, "LessonCue", emptyList(), listOf(current.playlist))
                        }
                        playbackTelemetry = PlaybackTelemetry()
                        screen = AppScreen.Library(identity, manifest)
                    } },
                    onNext = { next -> screen = current.copy(itemIndex = next, seekMs = 0) })
                }
            }
            if (diagnosticCaptureVisible) Text("DIAGNOSTIC SCREENSHOT · ADMIN REQUEST",
                color = Cream, fontSize = 18.sp, modifier = Modifier.align(Alignment.TopEnd).background(Coral).padding(14.dp))
            val passiveUpdate = (updateState as? UpdateUiState.Available)
                ?.takeIf { !it.blocking && !it.manualPresentation }
            if (passiveUpdate != null) {
                Box(Modifier.align(Alignment.TopCenter)) {
                    UpdateAvailableBanner(
                        passiveUpdate,
                        onReview = updateManager::reviewAvailableUpdate,
                        onLater = updateManager::dismiss
                    )
                }
            } else if (updateState !is UpdateUiState.Idle) {
                UpdateScreen(
                    state = updateState,
                    onDownload = updateManager::downloadAndInstall,
                    onLater = updateManager::dismiss,
                    onCancelDownload = updateManager::cancelDownload,
                    onRetry = updateManager::retry,
                    onClose = updateManager::closeMessage,
                    onOpenPermissionSettings = {
                        try {
                            updatePermissionLauncher.launch(updateManager.permissionIntent())
                        } catch (_: ActivityNotFoundException) {
                            updateManager.onPermissionSettingsUnavailable()
                        } catch (_: SecurityException) {
                            updateManager.onPermissionSettingsUnavailable()
                        }
                    }
                )
            }
          }
        }
    }
}

private suspend fun captureDiagnosticScreenshot(activity: ComponentActivity): ByteArray? = suspendCancellableCoroutine { continuation ->
    val width = activity.window.decorView.width.coerceAtLeast(1)
    val height = activity.window.decorView.height.coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    PixelCopy.request(activity.window, bitmap, { result ->
        if (!continuation.isActive) return@request
        if (result == PixelCopy.SUCCESS) {
            val output = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output)
            continuation.resume(output.toByteArray())
        } else continuation.resume(null)
        bitmap.recycle()
    }, Handler(Looper.getMainLooper()))
}

@Composable
private fun ConnectScreen(message: String?, onConnect: (String) -> Unit) {
    var address by remember { mutableStateOf("http://lessoncue.local") }
    FormLayout("Connect this TV", "LessonCue will try this address, then search the local network automatically.") {
        InputBox(address) { address = it }
        message?.let { Text(it, color = Coral, modifier = Modifier.padding(top = 12.dp)) }
        Spacer(Modifier.height(20.dp))
        Button(onClick = { onConnect(address) }) { Text("Find server") }
    }
}

private suspend fun findLessonCueServer(context: android.content.Context, address: String, manifestCache: java.io.File):
    Pair<LessonCueApi, String> {
    val preferred = LessonCueApi(address, manifestCache)
    runCatching { preferred.discover() }.getOrNull()?.let { return preferred to it }

    val discoveredAddress = LessonCueDiscovery(context).findServer()
        ?: error("Could not reach $address or find LessonCue automatically. Enter the numeric server address, such as http://192.168.1.25.")
    val discovered = LessonCueApi(discoveredAddress, manifestCache)
    return discovered to discovered.discover()
}

private suspend fun reconnectSavedServer(context: android.content.Context, identity: DeviceIdentity, manifestCache: java.io.File):
    Pair<DeviceIdentity, ScreenManifest> {
    val preferred = LessonCueApi(identity.serverUrl, manifestCache)
    runCatching { preferred.manifest(identity) }.getOrNull()?.let { return identity to it }

    val discoveredAddress = LessonCueDiscovery(context).findServer()
        ?: error("Automatic LessonCue discovery did not find a server.")
    val discoveredIdentity = identity.copy(serverUrl = discoveredAddress)
    val manifest = LessonCueApi(discoveredAddress, manifestCache).manifest(discoveredIdentity)
    return discoveredIdentity to manifest
}

@Composable
private fun PinScreen(serverName: String, onConfirm: (String) -> Unit) {
    var pin by remember { mutableStateOf("") }
    FormLayout(serverName, "Enter the six-digit PIN shown in LessonCue Settings → Pair a screen.") {
        InputBox(pin, singleLine = true) { pin = it.filter(Char::isDigit).take(6) }
        Spacer(Modifier.height(20.dp))
        Button(onClick = { if (pin.length == 6) onConfirm(pin) }, enabled = pin.length == 6) { Text("Pair TV") }
    }
}

@Composable
private fun LibraryScreen(
    manifest: ScreenManifest,
    onStart: (LessonPlaylist) -> Unit,
    onCheckForUpdates: (() -> Unit)?
) {
    val signage = manifest.signage.firstOrNull { it.mode == "emergency" } ?: manifest.signage.firstOrNull()
    val firstFocus = remember { FocusRequester() }
    LaunchedEffect(manifest.version, manifest.playlists.size) {
        if (manifest.playlists.isNotEmpty()) runCatching { firstFocus.requestFocus() }
    }
    Box(Modifier.fillMaxSize().background(signage?.backgroundColor?.let(::parseDisplayColor) ?: Navy)) {
      if (signage?.zones?.isNotEmpty() == true) SignageZoneLayout(signage) else signage?.media?.let { SignageBackdrop(it) }
      Row(Modifier.fillMaxSize().background(if (signage?.zones?.isNotEmpty() == true) Color(0x52000000) else Color.Transparent).padding(56.dp), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
        Column(Modifier.width(340.dp)) {
            Text("LESSONCUE", color = Gold, letterSpacing = 3.sp)
            Spacer(Modifier.height(20.dp))
            Text(manifest.screenName, fontSize = 34.sp, color = Cream)
            Text("Offline manifest ${manifest.version}", color = Muted, modifier = Modifier.padding(top = 8.dp))
            Text("LessonCue ${BuildConfig.VERSION_NAME}", color = Muted, modifier = Modifier.padding(top = 4.dp))
            signage?.let {
                Spacer(Modifier.height(24.dp))
                Text(if (it.mode == "emergency") "EMERGENCY" else it.name.uppercase(), color = if (it.mode == "emergency") Coral else Gold, letterSpacing = 2.sp)
                Text(it.message, fontSize = 24.sp, color = Cream, modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.height(42.dp))
            Text("Today’s Lesson", fontSize = 20.sp, color = Muted)
            Text("Select a lesson and press Start.", color = Cream, modifier = Modifier.padding(top = 8.dp))
            onCheckForUpdates?.let {
                Spacer(Modifier.height(24.dp))
                Button(onClick = it) { Text("Check for updates") }
            }
        }
        if (signage?.mode == "emergency") {
            Box(Modifier.weight(1f).fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Emergency override active\nLesson playback resumes automatically when it ends.",
                    color = Cream, fontSize = 28.sp)
            }
        } else {
            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                itemsIndexed(manifest.playlists, key = { _, playlist -> playlist.id }) { index, playlist ->
                    Surface(onClick = { onStart(playlist) }, modifier = remoteListItemModifier()
                        .then(if (index == 0) Modifier.focusRequester(firstFocus) else Modifier)) {
                        Row(Modifier.padding(26.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(playlist.title, fontSize = 28.sp)
                                val readiness = if (playlist.items.all { !it.offlineEligible || it.url != null }) "Ready" else "Internet required"
                                Text(readiness, color = if (readiness == "Ready") Mint else Coral)
                            }
                            Text("VIEW MEDIA  ›", color = Gold)
                        }
                    }
                }
            }
        }
      }
    }
}

@Composable
private fun SignageZoneLayout(signage: SignageCue) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        signage.zones.forEach { zone ->
            val modifier = Modifier.offset(maxWidth * (zone.x / 100f), maxHeight * (zone.y / 100f))
                .size(maxWidth * (zone.width / 100f), maxHeight * (zone.height / 100f))
                .background(parseDisplayColor(zone.backgroundColor)).clipToBounds()
            Box(modifier) {
                zone.media?.let { SignageZoneMedia(it) }
                Column(Modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.Center) {
                    zone.title?.let { Text(it.uppercase(), color = parseDisplayColor(zone.accentColor), fontSize = 14.sp, letterSpacing = 2.sp) }
                    if (zone.type == "clock") {
                        var now by remember { mutableStateOf(ZonedDateTime.now()) }
                        LaunchedEffect(zone.id) { while (true) { kotlinx.coroutines.delay(1_000); now = ZonedDateTime.now() } }
                        Text(now.format(DateTimeFormatter.ofPattern("h:mm a")), color = parseDisplayColor(zone.textColor), fontSize = 54.sp)
                        Text(now.format(DateTimeFormatter.ofPattern("EEEE, MMMM d")), color = parseDisplayColor(zone.textColor), fontSize = 20.sp)
                    } else {
                        val body = zone.cached?.text?.ifBlank { null } ?: zone.content
                        body?.let { Text(it, color = parseDisplayColor(zone.textColor), fontSize = 26.sp) }
                        zone.cached?.items?.take(8)?.forEach { Text("• $it", color = parseDisplayColor(zone.textColor), fontSize = 18.sp, modifier = Modifier.padding(top = 7.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SignageZoneMedia(item: CueItem) {
    val context = LocalContext.current
    val cached = context.filesDir.resolve("media").resolve(item.cacheFileName()).takeIf { it.exists() }
    val source = cached?.toURI()?.toString() ?: item.url ?: return
    if (item.type == "image" || item.contentType?.startsWith("image/") == true) {
        AsyncImage(model = source, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        return
    }
    if (item.type != "video" && item.contentType?.startsWith("video/") != true) return
    val player = remember(item.id, source) { ExoPlayer.Builder(context).build().apply {
        setMediaItem(MediaItem.fromUri(source)); repeatMode = Player.REPEAT_MODE_ONE; volume = 0f; prepare(); playWhenReady = true
    } }
    DisposableEffect(player) { onDispose { player.release() } }
    AndroidView(factory = { PlayerView(it).apply { this.player = player; useController = false } }, modifier = Modifier.fillMaxSize())
}

@Composable
private fun SignageBackdrop(item: CueItem) {
    val context = LocalContext.current
    val cached = context.filesDir.resolve("media").resolve(item.cacheFileName()).takeIf { it.exists() }
    val source = cached?.toURI()?.toString() ?: item.url ?: return
    if (item.type == "image" || item.contentType?.startsWith("image/") == true) {
        AsyncImage(model = source, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().graphicsLayer(alpha = .38f))
        return
    }
    if (item.type != "video" && item.contentType?.startsWith("video/") != true) return
    val player = remember(item.id, source) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(source))
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    AndroidView(factory = { PlayerView(it).apply { this.player = player; useController = false } },
        modifier = Modifier.fillMaxSize().graphicsLayer(alpha = .38f))
}

private fun parseDisplayColor(value: String): Color = runCatching {
    Color(android.graphics.Color.parseColor(value))
}.getOrDefault(Navy)

@Composable
private fun LessonDetailScreen(playlist: LessonPlaylist, onBack: () -> Unit,
    onPlay: (List<CueItem>, Int) -> Unit) {
    val allItems = playlist.preRoll?.items.orEmpty() + listOfNotNull(playlist.countdown?.item) + playlist.items
    val preRollIds = playlist.preRoll?.items.orEmpty().map { it.id }.toSet()
    val countdownId = playlist.countdown?.item?.id
    val firstFocus = remember { FocusRequester() }
    BackHandler(onBack = onBack)
    LaunchedEffect(playlist.id, allItems.size) {
        if (allItems.isNotEmpty()) runCatching { firstFocus.requestFocus() }
    }
    Row(Modifier.fillMaxSize().padding(56.dp), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
        Column(Modifier.width(340.dp)) {
            Text("LESSON MEDIA", color = Gold, letterSpacing = 3.sp)
            Spacer(Modifier.height(20.dp))
            Text(playlist.title, fontSize = 34.sp, color = Cream)
            Text("Use Up/Down to scroll every cue. Press Select to start at that item.", color = Muted,
                modifier = Modifier.padding(top = 12.dp))
            Spacer(Modifier.height(28.dp))
            Button(onClick = onBack) { Text("‹ Back to lessons") }
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            itemsIndexed(allItems, key = { _, item -> item.id }) { index, item ->
                val role = when (item.id) { countdownId -> "COUNTDOWN"; in preRollIds -> "PRE-ROLL"; else -> "LESSON" }
                Surface(onClick = { onPlay(allItems, index) }, modifier = remoteListItemModifier()
                    .then(if (index == 0) Modifier.focusRequester(firstFocus) else Modifier)) {
                    Row(Modifier.padding(horizontal = 24.dp, vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${index + 1}", color = Gold, fontSize = 20.sp, modifier = Modifier.width(46.dp))
                        Column(Modifier.weight(1f)) {
                            Text(item.title, fontSize = 25.sp)
                            Text("$role · ${item.type.uppercase()}", color = Muted, fontSize = 16.sp)
                        }
                        Text("PLAY  ›", color = Gold)
                    }
                }
            }
            if (allItems.isEmpty()) item { Text("No media has been added to this lesson.", color = Muted, fontSize = 24.sp) }
        }
    }
}

@Composable
private fun remoteListItemModifier(): Modifier {
    val requester = remember { BringIntoViewRequester() }
    val scope = rememberCoroutineScope()
    return Modifier.fillMaxWidth().bringIntoViewRequester(requester).onFocusChanged { state ->
        if (state.isFocused) scope.launch { requester.bringIntoView() }
    }
}

@Composable
private fun playbackRemoteModifier(
    itemId: String,
    onAction: (PlaybackRemoteAction) -> Unit
): Modifier {
    val focusRequester = remember(itemId) { FocusRequester() }
    val remoteKeys = remember(itemId) { PlaybackRemoteKeyState() }
    LaunchedEffect(itemId) {
        runCatching { focusRequester.requestFocus() }
    }
    return Modifier
        .focusRequester(focusRequester)
        .onPreviewKeyEvent { event ->
            val native = event.nativeKeyEvent
            val decision = remoteKeys.handle(native.keyCode, native.action, native.repeatCount)
            decision.action?.let(onAction)
            decision.consumed
        }
        .focusable()
}

@Composable
@SuppressLint("UnsafeOptInUsageError")
private fun PlayerScreen(playlist: LessonPlaylist, items: List<CueItem>, index: Int, seekMs: Long,
    control: ControlCommand?, onTelemetry: (PlaybackTelemetry) -> Unit, onExit: () -> Unit,
    onFinished: () -> Unit, onNext: (Int) -> Unit) {
    val item = items.getOrNull(index)
    BackHandler(onBack = onExit)
    if (item?.playbackUrl != null && item.linkKind in setOf("youtube", "embedded", "webpage", "external")) {
        OnlineMediaScreen(playlist.id, items, index, item, control, onTelemetry, onExit, onNext)
        return
    }
    if (item?.url == null) {
        LaunchedEffect(item?.id) { onTelemetry(PlaybackTelemetry("error", playlist.id, item?.id,
            error = "This item is not available on the server.")) }
        FormLayout(item?.title ?: "Nothing to play", "This item is not available on the server.") {
            Button(onClick = onExit) { Text("Back to lesson") }
        }
        return
    }
    val context = LocalContext.current
    val cached = context.filesDir.resolve("media").resolve(item.cacheFileName()).takeIf { it.exists() }
        ?: context.filesDir.resolve("media").resolve("${item.id}.bin").takeIf { it.exists() }
    var visualOpacity by remember(item.id) { mutableStateOf(if (item.fadeInMs > 0) 0f else 1f) }
    var visualSize by remember(item.id) { mutableStateOf(IntSize.Zero) }
    var repeatCompleted by remember(item.id) { mutableIntStateOf(0) }
    if (item.type == "image") {
        val duration = (item.imageDurationSeconds ?: 10).coerceAtLeast(1) * 1_000L
        var position by remember(item.id, seekMs) { mutableLongStateOf(seekMs.coerceIn(0, duration)) }
        var playing by remember(item.id) { mutableStateOf(true) }
        val remoteModifier = playbackRemoteModifier(item.id) { action ->
            when (action) {
                PlaybackRemoteAction.Previous -> onNext((index - 1).coerceAtLeast(0))
                PlaybackRemoteAction.Next -> if (index + 1 < items.size) onNext(index + 1)
                PlaybackRemoteAction.Rewind ->
                    position = (position - REMOTE_SEEK_STEP_MS).coerceAtLeast(0)
                PlaybackRemoteAction.FastForward ->
                    position = (position + REMOTE_SEEK_STEP_MS).coerceAtMost(duration)
                PlaybackRemoteAction.TogglePlayPause -> playing = !playing
                PlaybackRemoteAction.Play -> playing = true
                PlaybackRemoteAction.Pause -> playing = false
            }
        }
        LaunchedEffect(item.id) {
            var telemetryElapsed = 0L
            while (true) {
                while (position < duration) {
                    visualOpacity = cueOpacity(item, position, duration)
                    if (telemetryElapsed == 0L) {
                        onTelemetry(PlaybackTelemetry(if (playing) "playing" else "paused",
                            playlist.id, item.id, position, duration, item.volumePercent))
                    }
                    kotlinx.coroutines.delay(50)
                    if (playing) position = (position + (50 * (item.playbackRatePercent.coerceIn(25, 400) / 100f)).toLong()).coerceAtMost(duration)
                    telemetryElapsed = (telemetryElapsed + 50) % 1_000
                }
                repeatCompleted += 1
                if (item.endBehavior == "loop" || repeatCompleted < item.repeatCount.coerceIn(1, 99)) {
                    position = 0
                    continue
                }
                break
            }
            if (item.endBehavior == "advance" && index + 1 < items.size) onNext(index + 1)
            else if (item.endBehavior == "playlistLoop") onNext(0)
            else if (item.endBehavior != "pause") onFinished()
        }
        Box(Modifier.fillMaxSize().background(cueBackground(item)).then(remoteModifier)) {
            AsyncImage(model = cached ?: item.url, contentDescription = item.title,
                contentScale = if (item.fitMode == "fill") ContentScale.Crop else ContentScale.Fit,
                modifier = Modifier.fillMaxSize().onSizeChanged { visualSize = it }.cueVisual(item, visualOpacity, visualSize))
            if (item.notes.isNotBlank()) Text(item.notes, color = Cream, fontSize = 20.sp,
                modifier = Modifier.align(Alignment.BottomStart).padding(28.dp).background(Navy.copy(alpha = .9f)).padding(16.dp))
            Button(onClick = onExit, modifier = Modifier.align(Alignment.TopEnd).padding(28.dp)) { Text("Exit") }
        }
        return
    }
    val player = remember(item.id, seekMs) {
        ExoPlayer.Builder(context).build().apply {
            val clipping = MediaItem.ClippingConfiguration.Builder().setStartPositionMs(item.startMs).apply {
                item.endMs?.let { setEndPositionMs(it) }
            }.build()
            setMediaItem(MediaItem.Builder().setUri(cached?.toURI()?.toString() ?: item.url)
                .setMimeType(item.contentType).setClippingConfiguration(clipping).build())
            prepare()
            seekTo(seekMs.coerceAtLeast(0))
            volume = if (item.muted) 0f else (item.volumePercent / 100f).coerceIn(0f, 1.5f)
            setPlaybackSpeed(item.playbackRatePercent.coerceIn(25, 400) / 100f)
            playWhenReady = true
        }
    }
    val remoteModifier = playbackRemoteModifier(item.id) { action ->
        when (action) {
            PlaybackRemoteAction.Previous -> onNext((index - 1).coerceAtLeast(0))
            PlaybackRemoteAction.Next -> if (index + 1 < items.size) onNext(index + 1)
            PlaybackRemoteAction.Rewind ->
                player.seekTo((player.currentPosition - REMOTE_SEEK_STEP_MS).coerceAtLeast(0))
            PlaybackRemoteAction.FastForward -> {
                val maximum = player.duration.takeIf { it != C.TIME_UNSET && it >= 0 } ?: Long.MAX_VALUE
                player.seekTo((player.currentPosition + REMOTE_SEEK_STEP_MS).coerceAtMost(maximum))
            }
            PlaybackRemoteAction.TogglePlayPause ->
                if (player.playWhenReady) player.pause() else player.play()
            PlaybackRemoteAction.Play -> player.play()
            PlaybackRemoteAction.Pause -> player.pause()
        }
    }
    LaunchedEffect(player, item.id) {
        val targetVolume = if (item.muted) 0f else (item.volumePercent / 100f).coerceIn(0f, 1.5f)
        while (true) {
            val position = player.currentPosition.coerceAtLeast(0)
            val duration = player.duration
            val fadeIn = if (item.fadeInMs > 0) (position.toFloat() / item.fadeInMs).coerceIn(0f, 1f) else 1f
            val fadeOut = if (item.fadeOutMs > 0 && duration != C.TIME_UNSET)
                ((duration - position).toFloat() / item.fadeOutMs).coerceIn(0f, 1f) else 1f
            val fade = minOf(fadeIn, fadeOut)
            player.volume = targetVolume * fade
            visualOpacity = minOf(fade, cueTransitionOpacity(item, position, duration.takeUnless { it == C.TIME_UNSET } ?: item.durationMs ?: 0))
            val state = when {
                player.playerError != null -> "error"
                player.playbackState == Player.STATE_BUFFERING -> "buffering"
                player.playbackState == Player.STATE_ENDED -> "completed"
                player.isPlaying -> "playing"
                player.playbackState == Player.STATE_READY -> "paused"
                else -> "loading"
            }
            onTelemetry(PlaybackTelemetry(state, playlist.id, item.id, position,
                duration.takeUnless { it == C.TIME_UNSET }, item.volumePercent, player.playerError?.message))
            kotlinx.coroutines.delay(500)
        }
    }
    LaunchedEffect(control?.version) {
        when (control?.action) {
            "pause" -> player.pause()
            "resume" -> player.play()
        }
    }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    repeatCompleted += 1
                    when (item.endBehavior) {
                        "loop" -> { player.seekTo(0); player.play() }
                        else -> if (repeatCompleted < item.repeatCount.coerceIn(1, 99)) { player.seekTo(0); player.play() }
                        else when (item.endBehavior) {
                        "advance" -> if (index + 1 < items.size) onNext(index + 1) else onFinished()
                        "playlistLoop" -> onNext(0)
                        "pause" -> player.pause()
                        else -> onFinished()
                        }
                    }
                }
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener); player.release() }
    }
    Box(Modifier.fillMaxSize().background(cueBackground(item)).then(remoteModifier)) {
        AndroidView(factory = { PlayerView(it).apply {
                this.player = player
                useController = false
                isFocusable = false
                isFocusableInTouchMode = false
                resizeMode = if (item.fitMode == "fill") AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
            } },
            modifier = Modifier.fillMaxSize().onSizeChanged { visualSize = it }.cueVisual(item, visualOpacity, visualSize))
        Row(Modifier.align(Alignment.TopStart).padding(28.dp).background(Navy.copy(alpha = .82f)).padding(16.dp)) {
            Text(item.title, color = Cream)
            Spacer(Modifier.width(28.dp))
            Text("${index + 1} / ${items.size}", color = Muted)
        }
        if (item.notes.isNotBlank()) Text(item.notes, color = Cream, fontSize = 20.sp,
            modifier = Modifier.align(Alignment.BottomStart).padding(28.dp).background(Navy.copy(alpha = .9f)).padding(16.dp))
        Button(onClick = onExit, modifier = Modifier.align(Alignment.TopEnd).padding(28.dp)) { Text("Exit") }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun OnlineMediaScreen(lessonId: String, items: List<CueItem>, index: Int, item: CueItem,
    control: ControlCommand?, onTelemetry: (PlaybackTelemetry) -> Unit, onExit: () -> Unit,
    onNext: (Int) -> Unit) {
    val context = LocalContext.current
    var locallyPaused by remember(item.id) { mutableStateOf(false) }
    var visualSize by remember(item.id) { mutableStateOf(IntSize.Zero) }
    val webView = remember(item.id) {
        WebView(context).apply {
            settings.javaScriptEnabled = item.linkKind != "webpage"
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportZoom(false)
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            setBackgroundColor(android.graphics.Color.BLACK)
            loadUrl(item.playbackUrl!!)
        }
    }
    val remoteModifier = playbackRemoteModifier(item.id) { action ->
        when (action) {
            PlaybackRemoteAction.Previous -> onNext((index - 1).coerceAtLeast(0))
            PlaybackRemoteAction.Next -> if (index + 1 < items.size) onNext(index + 1)
            PlaybackRemoteAction.Rewind -> webView.evaluateMediaScript(
                "if(v){v.currentTime=Math.max(0,v.currentTime-${REMOTE_SEEK_STEP_MS / 1_000.0});}"
            )
            PlaybackRemoteAction.FastForward -> webView.evaluateMediaScript(
                "if(v){v.currentTime=Math.min(v.duration||Infinity,v.currentTime+${REMOTE_SEEK_STEP_MS / 1_000.0});}"
            )
            PlaybackRemoteAction.TogglePlayPause -> {
                locallyPaused = !locallyPaused
                webView.evaluateMediaScript("if(v){if(v.paused){v.play();}else{v.pause();}}")
            }
            PlaybackRemoteAction.Play -> {
                locallyPaused = false
                webView.onResume()
                webView.evaluateMediaScript("if(v){v.play();}")
            }
            PlaybackRemoteAction.Pause -> {
                locallyPaused = true
                webView.evaluateMediaScript("if(v){v.pause();}")
            }
        }
    }
    LaunchedEffect(control?.version) {
        when (control?.action) {
            "pause" -> {
                locallyPaused = true
                webView.evaluateMediaScript("if(v){v.pause();}")
            }
            "resume" -> {
                locallyPaused = false
                webView.onResume()
                webView.evaluateMediaScript("if(v){v.play();}")
            }
        }
    }
    LaunchedEffect(item.id, control?.version, locallyPaused) {
        webView.evaluateMediaScript("if(v){v.playbackRate=${item.playbackRatePercent.coerceIn(25, 400) / 100.0};v.muted=${item.muted};v.volume=${(item.volumePercent / 100.0).coerceIn(0.0, 1.0)};}")
        onTelemetry(PlaybackTelemetry(if (locallyPaused) "paused" else "playing",
            lessonId, item.id, volumePercent = item.volumePercent))
    }
    DisposableEffect(webView) { onDispose { webView.stopLoading(); webView.destroy() } }
    Box(Modifier.fillMaxSize().background(cueBackground(item)).then(remoteModifier)) {
        AndroidView(factory = {
            webView.apply {
                isFocusable = false
                isFocusableInTouchMode = false
            }
        }, modifier = Modifier.fillMaxSize().onSizeChanged { visualSize = it }.cueVisual(item, 1f, visualSize))
        Row(Modifier.align(Alignment.TopStart).padding(28.dp).background(Navy.copy(alpha = .82f)).padding(16.dp)) {
            Text(item.title, color = Cream)
            Spacer(Modifier.width(18.dp))
            Text(if (item.linkKind == "youtube") "YouTube · online" else "Webpage · online", color = Muted)
        }
        Button(onClick = onExit, modifier = Modifier.align(Alignment.TopEnd).padding(28.dp)) { Text("Exit") }
    }
}

private fun WebView.evaluateMediaScript(body: String) {
    evaluateJavascript(
        "(function(){var v=document.querySelector('video');$body})()",
        null
    )
}

private fun loopingPreRoll(items: List<CueItem>) = items.mapIndexed { index, item ->
    item.copy(endBehavior = if (index == items.lastIndex) "playlistLoop" else "advance")
}

private const val REMOTE_SEEK_STEP_MS = 5_000L

private fun ScreenManifest.itemCount() = (playlists.flatMap { playlist ->
    playlist.items + playlist.preRoll?.items.orEmpty() + listOfNotNull(playlist.countdown?.item)
} + signageSchedule.flatMap { sign -> listOfNotNull(sign.media) + sign.zones.mapNotNull { it.media } }).distinctBy { it.id }.size

@Composable
private fun FormLayout(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 96.dp, vertical = 72.dp)) {
        Text("LESSONCUE", color = Gold, letterSpacing = 3.sp)
        Spacer(Modifier.height(36.dp))
        Text(title, fontSize = 44.sp, color = Cream)
        Text(subtitle, fontSize = 20.sp, color = Muted, modifier = Modifier.padding(top = 12.dp, bottom = 28.dp))
        content()
    }
}

@Composable
private fun InputBox(value: String, singleLine: Boolean = true, onChange: (String) -> Unit) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = singleLine,
        textStyle = androidx.compose.ui.text.TextStyle(color = Cream, fontSize = 24.sp),
        modifier = Modifier.fillMaxWidth(.66f).background(Slate).padding(18.dp)
    )
}

@Composable
private fun CenterMessage(message: String) = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
    Text(message, fontSize = 30.sp, color = Cream)
}

private fun scheduleMediaCaches(context: android.content.Context, identity: DeviceIdentity, manifest: ScreenManifest) {
    val manager = WorkManager.getInstance(context)
    val items = (manifest.playlists.flatMap { playlist -> playlist.items + playlist.preRoll?.items.orEmpty() + listOfNotNull(playlist.countdown?.item) }
        + manifest.signageSchedule.flatMap { sign -> listOfNotNull(sign.media) + sign.zones.mapNotNull { it.media } })
        .distinctBy { it.id }.filter { it.offlineEligible && it.url != null }
    items.forEach { item ->
        val request = OneTimeWorkRequestBuilder<MediaCacheWorker>().setInputData(workDataOf(
            "url" to item.url, "fileName" to item.cacheFileName(), "token" to identity.token,
            "serverHost" to java.net.URL(identity.serverUrl).host, "sha256" to item.sha256
        )).build()
        manager.enqueueUniqueWork("lessoncue-media-${item.id}-${item.sha256?.take(12) ?: "current"}",
            ExistingWorkPolicy.KEEP, request)
    }
}

private fun cueOpacity(item: CueItem, positionMs: Long, durationMs: Long): Float {
    val fadeIn = if (item.fadeInMs > 0) (positionMs.toFloat() / item.fadeInMs).coerceIn(0f, 1f) else 1f
    val fadeOut = if (item.fadeOutMs > 0) ((durationMs - positionMs).toFloat() / item.fadeOutMs).coerceIn(0f, 1f) else 1f
    return minOf(fadeIn, fadeOut, cueTransitionOpacity(item, positionMs, durationMs))
}

private fun cueTransitionOpacity(item: CueItem, positionMs: Long, durationMs: Long): Float {
    if (item.transitionStyle != "fade-black" || item.transitionDurationMs <= 0 || durationMs <= 0) return 1f
    val fadeIn = positionMs.toFloat() / item.transitionDurationMs
    val fadeOut = (durationMs - positionMs).toFloat() / item.transitionDurationMs
    return minOf(fadeIn, fadeOut, 1f).coerceIn(0f, 1f)
}

private fun cueBackground(item: CueItem): Color {
    if (item.fitMode == "letterbox") return Color.Black
    return runCatching { Color(android.graphics.Color.parseColor(item.backgroundColor)) }.getOrDefault(Color.Black)
}

private fun Modifier.cueVisual(item: CueItem, opacity: Float, size: IntSize): Modifier {
    val horizontal = (item.cropLeftPercent + item.cropRightPercent).coerceIn(0, 89)
    val vertical = (item.cropTopPercent + item.cropBottomPercent).coerceIn(0, 89)
    val scaleX = 100f / (100 - horizontal)
    val scaleY = 100f / (100 - vertical)
    return clipToBounds().graphicsLayer(
        alpha = opacity,
        rotationZ = item.rotationDegrees.toFloat(),
        scaleX = scaleX,
        scaleY = scaleY,
        translationX = (item.cropRightPercent - item.cropLeftPercent) / 200f * size.width * scaleX,
        translationY = (item.cropBottomPercent - item.cropTopPercent) / 200f * size.height * scaleY
    )
}

private val Navy = Color(0xFF08111F)
private val Slate = Color(0xFF182438)
private val Cream = Color(0xFFF7F2E8)
private val Muted = Color(0xFFA9B3C2)
private val Gold = Color(0xFFFFB664)
private val Coral = Color(0xFFFF7A6E)
private val Mint = Color(0xFF58D6A9)
