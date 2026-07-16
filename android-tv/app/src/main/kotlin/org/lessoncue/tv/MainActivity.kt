package org.lessoncue.tv

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
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
import java.time.Instant

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
    var screen by remember { mutableStateOf<AppScreen>(AppScreen.Loading) }
    var activeIdentity by remember { mutableStateOf<DeviceIdentity?>(null) }
    var activeManifestVersion by remember { mutableStateOf(0) }
    var playbackControl by remember { mutableStateOf<ControlCommand?>(null) }

    LaunchedEffect(Unit) {
        val identity = store.load()
        screen = if (identity == null) AppScreen.Connect() else {
            activeIdentity = identity
            val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
            runCatching {
                val manifest = api.manifest(identity)
                activeManifestVersion = manifest.version
                runCatching { api.reportStatus(identity, manifest.version, context.filesDir.usableSpace) }
                AppScreen.Library(identity, manifest)
            }
                .getOrElse { api.cachedManifest()?.let { activeManifestVersion = it.version; AppScreen.Library(identity, it) } ?: AppScreen.Connect("Saved server unavailable. Enter its address to reconnect.") }
        }
    }

    LaunchedEffect(activeIdentity?.screenId) {
        val identity = activeIdentity ?: return@LaunchedEffect
        val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
        var controlVersion = runCatching { api.control(identity).version }.getOrDefault(0)
        while (true) {
            runCatching { api.control(identity, controlVersion) }.getOrNull()?.let { command ->
                if (command.changed) {
                    controlVersion = command.version
                    playbackControl = command
                    when (command.action) {
                        "play" -> runCatching { api.manifest(identity) }.getOrNull()?.let { manifest ->
                            activeManifestVersion = manifest.version
                            val playlist = manifest.playlists.firstOrNull { it.id == command.lessonId }
                            if (playlist != null) {
                                val allItems = playlist.preRoll?.items.orEmpty() + listOfNotNull(playlist.countdown?.item) + playlist.items
                                val selected = command.itemId?.let { id -> allItems.indexOfFirst { it.id == id } }?.takeIf { it >= 0 }
                                screen = if (selected != null) AppScreen.Player(playlist, allItems, selected)
                                    else AppScreen.Player(playlist)
                            }
                        }
                        "stop" -> runCatching { api.manifest(identity) }.getOrNull()?.let { screen = AppScreen.Library(identity, it) }
                        "next" -> (screen as? AppScreen.Player)?.let { current ->
                            if (current.itemIndex + 1 < current.items.size) screen = current.copy(itemIndex = current.itemIndex + 1, seekMs = 0)
                        }
                        "previous" -> (screen as? AppScreen.Player)?.let { current ->
                            screen = current.copy(itemIndex = (current.itemIndex - 1).coerceAtLeast(0), seekMs = 0)
                        }
                        "seek" -> (screen as? AppScreen.Player)?.let { current -> screen = current.copy(seekMs = command.positionMs ?: 0) }
                        "pause", "resume" -> Unit
                    }
                } else controlVersion = maxOf(controlVersion, command.version)
            }
            kotlinx.coroutines.delay(750)
        }
    }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), colors = androidx.tv.material3.SurfaceDefaults.colors(containerColor = Navy)) {
            when (val current = screen) {
                AppScreen.Loading -> CenterMessage("Searching for LessonCue…")
                is AppScreen.Connect -> ConnectScreen(current.message) { address ->
                    scope.launch {
                        runCatching {
                            val api = LessonCueApi(address, context.filesDir.resolve("manifest.json"))
                            val name = api.discover()
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
                            runCatching { current.api.reportStatus(identity, manifest.version, context.filesDir.usableSpace) }
                            screen = AppScreen.Library(identity, manifest)
                        }.onFailure { screen = AppScreen.Connect(it.message) }
                    }
                }
                is AppScreen.Library -> {
                    LaunchedEffect(current.manifest.version) { scheduleMediaCaches(context, current.identity, current.manifest) }
                    LaunchedEffect(current.identity.screenId, current.manifest.version) {
                        val api = LessonCueApi(current.identity.serverUrl, context.filesDir.resolve("manifest.json"))
                        while (true) {
                            runCatching { api.reportStatus(current.identity, current.manifest.version, context.filesDir.usableSpace) }
                            kotlinx.coroutines.delay(60_000)
                        }
                    }
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
                    LibraryScreen(current.manifest) { playlist ->
                        val phase = ScheduleCoordinator.phase(playlist, Instant.now())
                        screen = when (phase) {
                        is PlaybackPhase.Countdown -> {
                            val countdownItem = playlist.countdown?.item
                            if (countdownItem != null) AppScreen.Player(playlist, listOf(countdownItem), seekMs = phase.seekMs)
                            else AppScreen.Player(playlist)
                        }
                        is PlaybackPhase.PreRoll -> {
                            val preRollItems = playlist.preRoll?.items.orEmpty()
                            AppScreen.Player(playlist, loopingPreRoll(preRollItems))
                        }
                        else -> AppScreen.Player(playlist)
                        }
                    }
                }
                is AppScreen.Player -> {
                    LaunchedEffect(activeIdentity?.screenId, activeManifestVersion) {
                        val identity = activeIdentity ?: return@LaunchedEffect
                        val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json"))
                        while (true) {
                            runCatching { api.reportStatus(identity, activeManifestVersion, context.filesDir.usableSpace) }
                            kotlinx.coroutines.delay(60_000)
                        }
                    }
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
                    onExit = { scope.launch { store.load()?.let { identity -> val api = LessonCueApi(identity.serverUrl, context.filesDir.resolve("manifest.json")); screen = runCatching { AppScreen.Library(identity, api.manifest(identity)) }.getOrElse { AppScreen.Library(identity, api.cachedManifest() ?: current.playlist.let { playlist -> ScreenManifest(1, "LessonCue", emptyList(), listOf(playlist)) }) } } } },
                    onNext = { next -> screen = current.copy(itemIndex = next, seekMs = 0) })
                }
            }
        }
    }
}

@Composable
private fun ConnectScreen(message: String?, onConnect: (String) -> Unit) {
    var address by remember { mutableStateOf("http://lessoncue.local:8080") }
    FormLayout("Connect this TV", "Enter the LessonCue server address shown during installation.") {
        InputBox(address) { address = it }
        message?.let { Text(it, color = Coral, modifier = Modifier.padding(top = 12.dp)) }
        Spacer(Modifier.height(20.dp))
        Button(onClick = { onConnect(address) }) { Text("Find server") }
    }
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
private fun LibraryScreen(manifest: ScreenManifest, onStart: (LessonPlaylist) -> Unit) {
    val signage = manifest.signage.firstOrNull { it.mode == "emergency" } ?: manifest.signage.firstOrNull()
    Row(Modifier.fillMaxSize().padding(56.dp), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
        Column(Modifier.width(340.dp)) {
            Text("LESSONCUE", color = Gold, letterSpacing = 3.sp)
            Spacer(Modifier.height(20.dp))
            Text(manifest.screenName, fontSize = 34.sp, color = Cream)
            Text("Offline manifest ${manifest.version}", color = Muted, modifier = Modifier.padding(top = 8.dp))
            signage?.let {
                Spacer(Modifier.height(24.dp))
                Text(if (it.mode == "emergency") "EMERGENCY" else it.name.uppercase(), color = if (it.mode == "emergency") Coral else Gold, letterSpacing = 2.sp)
                Text(it.message, fontSize = 24.sp, color = Cream, modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.height(42.dp))
            Text("Today’s Lesson", fontSize = 20.sp, color = Muted)
            Text("Select a lesson and press Start.", color = Cream, modifier = Modifier.padding(top = 8.dp))
        }
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            items(manifest.playlists) { playlist ->
                Surface(onClick = { onStart(playlist) }, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(26.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(playlist.title, fontSize = 28.sp)
                            val readiness = if (playlist.items.all { !it.offlineEligible || it.url != null }) "Ready" else "Internet required"
                            Text(readiness, color = if (readiness == "Ready") Mint else Coral)
                        }
                        Text("START  ›", color = Gold)
                    }
                }
            }
        }
    }
}

@Composable
private fun PlayerScreen(playlist: LessonPlaylist, items: List<CueItem>, index: Int, seekMs: Long, control: ControlCommand?, onExit: () -> Unit, onNext: (Int) -> Unit) {
    val item = items.getOrNull(index)
    if (item?.playbackUrl != null && item.linkKind in setOf("youtube", "embedded", "webpage", "external")) {
        OnlineMediaScreen(item, control, onExit)
        return
    }
    if (item?.url == null) {
        FormLayout(item?.title ?: "Nothing to play", "This item is not available on the server.") {
            Button(onClick = onExit) { Text("Back to lesson") }
        }
        return
    }
    val context = LocalContext.current
    val cached = context.filesDir.resolve("media").resolve("${item.id}.bin").takeIf { it.exists() }
    if (item.type == "image") {
        LaunchedEffect(item.id) {
            kotlinx.coroutines.delay((item.imageDurationSeconds ?: 10).coerceAtLeast(1) * 1_000L)
            if (item.endBehavior == "advance" && index + 1 < items.size) onNext(index + 1)
            else if (item.endBehavior == "playlistLoop") onNext(0)
        }
        Box(Modifier.fillMaxSize().background(Color.Black).focusable()) {
            AsyncImage(model = cached ?: item.url, contentDescription = item.title, contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize())
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
            setMediaItem(MediaItem.Builder().setUri(cached?.toURI()?.toString() ?: item.url).setClippingConfiguration(clipping).build())
            prepare()
            seekTo(seekMs.coerceAtLeast(0))
            volume = (item.volumePercent / 100f).coerceIn(0f, 1.5f)
            playWhenReady = true
        }
    }
    LaunchedEffect(player, item.id) {
        val targetVolume = (item.volumePercent / 100f).coerceIn(0f, 1.5f)
        while (true) {
            val position = player.currentPosition.coerceAtLeast(0)
            val duration = player.duration
            val fadeIn = if (item.fadeInMs > 0) (position.toFloat() / item.fadeInMs).coerceIn(0f, 1f) else 1f
            val fadeOut = if (item.fadeOutMs > 0 && duration != C.TIME_UNSET)
                ((duration - position).toFloat() / item.fadeOutMs).coerceIn(0f, 1f) else 1f
            player.volume = targetVolume * minOf(fadeIn, fadeOut)
            kotlinx.coroutines.delay(100)
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
                    when (item.endBehavior) {
                        "loop" -> { player.seekTo(item.startMs); player.play() }
                        "advance" -> if (index + 1 < items.size) onNext(index + 1)
                        "playlistLoop" -> onNext(0)
                        else -> player.pause()
                    }
                }
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener); player.release() }
    }
    Box(Modifier.fillMaxSize().background(Color.Black).focusable()) {
        AndroidView(factory = { PlayerView(it).apply { this.player = player; useController = true } }, modifier = Modifier.fillMaxSize())
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
private fun OnlineMediaScreen(item: CueItem, control: ControlCommand?, onExit: () -> Unit) {
    val context = LocalContext.current
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
    LaunchedEffect(control?.version) {
        when (control?.action) {
            "pause" -> webView.onPause()
            "resume" -> webView.onResume()
        }
    }
    DisposableEffect(webView) { onDispose { webView.stopLoading(); webView.destroy() } }
    Box(Modifier.fillMaxSize().background(Color.Black).focusable()) {
        AndroidView(factory = { webView }, modifier = Modifier.fillMaxSize())
        Row(Modifier.align(Alignment.TopStart).padding(28.dp).background(Navy.copy(alpha = .82f)).padding(16.dp)) {
            Text(item.title, color = Cream)
            Spacer(Modifier.width(18.dp))
            Text(if (item.linkKind == "youtube") "YouTube · online" else "Webpage · online", color = Muted)
        }
        Button(onClick = onExit, modifier = Modifier.align(Alignment.TopEnd).padding(28.dp)) { Text("Exit") }
    }
}

private fun loopingPreRoll(items: List<CueItem>) = items.mapIndexed { index, item ->
    item.copy(endBehavior = if (index == items.lastIndex) "playlistLoop" else "advance")
}

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
    val items = manifest.playlists.flatMap { playlist -> playlist.items + playlist.preRoll?.items.orEmpty() + listOfNotNull(playlist.countdown?.item) }
        .distinctBy { it.id }.filter { it.offlineEligible && it.url != null }
    items.forEach { item ->
        val request = OneTimeWorkRequestBuilder<MediaCacheWorker>().setInputData(workDataOf(
            "url" to item.url, "fileName" to "${item.id}.bin", "token" to identity.token,
            "serverHost" to java.net.URL(identity.serverUrl).host, "sha256" to item.sha256
        )).build()
        manager.enqueueUniqueWork("lessoncue-media-${item.id}", ExistingWorkPolicy.KEEP, request)
    }
}

private val Navy = Color(0xFF08111F)
private val Slate = Color(0xFF182438)
private val Cream = Color(0xFFF7F2E8)
private val Muted = Color(0xFFA9B3C2)
private val Gold = Color(0xFFFFB664)
private val Coral = Color(0xFFFF7A6E)
private val Mint = Color(0xFF58D6A9)
