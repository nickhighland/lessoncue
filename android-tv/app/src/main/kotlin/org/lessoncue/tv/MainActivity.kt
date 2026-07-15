package org.lessoncue.tv

import android.os.Build
import android.os.Bundle
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
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
    data class Player(val playlist: LessonPlaylist, val itemIndex: Int, val seekMs: Long = 0) : AppScreen
}

@Composable
fun LessonCueApp() {
    val context = LocalContext.current
    val store = remember { IdentityStore(context) }
    val scope = rememberCoroutineScope()
    var screen by remember { mutableStateOf<AppScreen>(AppScreen.Loading) }

    LaunchedEffect(Unit) {
        val identity = store.load()
        screen = if (identity == null) AppScreen.Connect() else runCatching {
            AppScreen.Library(identity, LessonCueApi(identity.serverUrl).manifest(identity))
        }.getOrElse { AppScreen.Connect("Saved server unavailable. Enter its address to reconnect.") }
    }

    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), colors = androidx.tv.material3.SurfaceDefaults.colors(containerColor = Navy)) {
            when (val current = screen) {
                AppScreen.Loading -> CenterMessage("Searching for LessonCue…")
                is AppScreen.Connect -> ConnectScreen(current.message) { address ->
                    scope.launch {
                        runCatching {
                            val api = LessonCueApi(address)
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
                            screen = AppScreen.Library(identity, current.api.manifest(identity))
                        }.onFailure { screen = AppScreen.Connect(it.message) }
                    }
                }
                is AppScreen.Library -> LibraryScreen(current.manifest) { playlist ->
                    val phase = ScheduleCoordinator.phase(playlist, Instant.now())
                    screen = when (phase) {
                        is PlaybackPhase.Countdown -> {
                            val countdownItem = playlist.countdown?.item
                            if (countdownItem != null) AppScreen.Player(playlist.copy(items = listOf(countdownItem)), 0, phase.seekMs)
                            else AppScreen.Player(playlist, 0)
                        }
                        is PlaybackPhase.PreRoll -> {
                            val preRollItems = playlist.preRoll?.items.orEmpty()
                            val items = preRollItems.mapIndexed { index, item ->
                                item.copy(endBehavior = if (index == preRollItems.lastIndex) "playlistLoop" else "advance")
                            }
                            AppScreen.Player(playlist.copy(items = items), 0)
                        }
                        else -> AppScreen.Player(playlist, 0)
                    }
                }
                is AppScreen.Player -> PlayerScreen(current.playlist, current.itemIndex, current.seekMs,
                    onExit = { scope.launch { store.load()?.let { screen = AppScreen.Library(it, LessonCueApi(it.serverUrl).manifest(it)) } } },
                    onNext = { next -> screen = current.copy(itemIndex = next, seekMs = 0) })
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
    Row(Modifier.fillMaxSize().padding(56.dp), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
        Column(Modifier.width(340.dp)) {
            Text("LESSONCUE", color = Gold, letterSpacing = 3.sp)
            Spacer(Modifier.height(20.dp))
            Text(manifest.screenName, fontSize = 34.sp, color = Cream)
            Text("Offline manifest ${manifest.version}", color = Muted, modifier = Modifier.padding(top = 8.dp))
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
private fun PlayerScreen(playlist: LessonPlaylist, index: Int, seekMs: Long, onExit: () -> Unit, onNext: (Int) -> Unit) {
    val item = playlist.items.getOrNull(index)
    if (item?.url == null) {
        FormLayout(item?.title ?: "Nothing to play", "This item is not available on the server.") {
            Button(onClick = onExit) { Text("Back to lesson") }
        }
        return
    }
    val context = LocalContext.current
    val player = remember(item.id) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(item.url))
            prepare()
            seekTo(maxOf(item.startMs, seekMs))
            playWhenReady = true
        }
    }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    when (item.endBehavior) {
                        "loop" -> { player.seekTo(item.startMs); player.play() }
                        "advance" -> if (index + 1 < playlist.items.size) onNext(index + 1)
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
            Text("${index + 1} / ${playlist.items.size}", color = Muted)
        }
        Button(onClick = onExit, modifier = Modifier.align(Alignment.TopEnd).padding(28.dp)) { Text("Exit") }
    }
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

private val Navy = Color(0xFF08111F)
private val Slate = Color(0xFF182438)
private val Cream = Color(0xFFF7F2E8)
private val Muted = Color(0xFFA9B3C2)
private val Gold = Color(0xFFFFB664)
private val Coral = Color(0xFFFF7A6E)
private val Mint = Color(0xFF58D6A9)
