package org.lessoncue.tv

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Surface
import androidx.tv.material3.SurfaceDefaults
import androidx.tv.material3.Text

@Composable
fun UpdateScreen(
    state: UpdateUiState,
    onDownload: () -> Unit,
    onLater: () -> Unit,
    onCancelDownload: () -> Unit,
    onRetry: () -> Unit,
    onClose: () -> Unit,
    onOpenPermissionSettings: () -> Unit
) {
    val firstFocus = remember { FocusRequester() }
    val manifest = when (state) {
        is UpdateUiState.Available -> state.manifest
        is UpdateUiState.Downloading -> state.manifest
        is UpdateUiState.PermissionRequired -> state.manifest
        is UpdateUiState.Installing -> state.manifest
        is UpdateUiState.Error -> state.manifest
        else -> null
    }
    val blocking = manifest?.let { UpdatePolicy.isBlocking(it, BuildConfig.VERSION_CODE.toLong()) } == true
    val canClose = !blocking && state !is UpdateUiState.Downloading && state !is UpdateUiState.Installing
    BackHandler(enabled = canClose, onBack = onClose)
    LaunchedEffect(state::class, manifest?.versionCode) {
        runCatching { firstFocus.requestFocus() }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        colors = SurfaceDefaults.colors(containerColor = UpdateNavy)
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 72.dp, vertical = 58.dp),
            horizontalArrangement = Arrangement.spacedBy(64.dp)
        ) {
            Column(Modifier.width(350.dp)) {
                Text("LESSONCUE UPDATE", color = UpdateGold, letterSpacing = 3.sp)
                Spacer(Modifier.height(22.dp))
                Text(titleFor(state), fontSize = 38.sp, color = UpdateCream)
                Text(
                    "Installed: ${state.installedVersionName}",
                    color = UpdateMuted,
                    fontSize = 18.sp,
                    modifier = Modifier.padding(top = 12.dp)
                )
                manifest?.let {
                    Text(
                        "Available: ${it.versionName}",
                        color = UpdateMint,
                        fontSize = 22.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    Text(
                        formatBytes(it.fileSize),
                        color = UpdateMuted,
                        fontSize = 17.sp,
                        modifier = Modifier.padding(top = 5.dp)
                    )
                }
                if (blocking) {
                    Spacer(Modifier.height(22.dp))
                    Text(
                        "REQUIRED UPDATE",
                        color = UpdateCoral,
                        letterSpacing = 2.sp,
                        fontSize = 19.sp
                    )
                    Text(
                        "This version is below the minimum supported release. Playback remains unavailable until the update succeeds.",
                        color = UpdateCream,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }

            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                StatusBody(state)
                if (manifest != null && manifest.releaseNotes.isNotBlank()) {
                    Text("WHAT’S NEW", color = UpdateGold, letterSpacing = 2.sp, fontSize = 17.sp)
                    Text(
                        manifest.releaseNotes,
                        color = UpdateCream,
                        fontSize = 20.sp,
                        modifier = Modifier.fillMaxWidth().height(120.dp).verticalScroll(rememberScrollState())
                    )
                }
                Spacer(Modifier.weight(1f))
                ActionRow(
                    state,
                    blocking,
                    firstFocus,
                    onDownload,
                    onLater,
                    onCancelDownload,
                    onRetry,
                    onClose,
                    onOpenPermissionSettings
                )
            }
        }
    }
}

@Composable
fun UpdateAvailableBanner(
    state: UpdateUiState.Available,
    onReview: () -> Unit,
    onLater: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        colors = SurfaceDefaults.colors(containerColor = UpdateSlate)
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(Modifier.weight(1f)) {
                Text("LessonCue ${state.manifest.versionName} is available", color = UpdateMint, fontSize = 21.sp)
                Text("Playback can continue. Review and install when convenient.", color = UpdateCream, fontSize = 17.sp)
            }
            Button(onClick = onReview) { Text("Review update") }
            Button(onClick = onLater) { Text("Later") }
        }
    }
}

@Composable
private fun StatusBody(state: UpdateUiState) {
    when (state) {
        is UpdateUiState.Idle -> Unit
        is UpdateUiState.Checking -> Text("Contacting the LessonCue release service…", color = UpdateCream, fontSize = 24.sp)
        is UpdateUiState.Current -> Text("This television already has the newest LessonCue release.", color = UpdateMint, fontSize = 24.sp)
        is UpdateUiState.Available -> Text(
            if (state.blocking) "A required update is ready to download."
            else "A new LessonCue TV release is available.",
            color = UpdateCream,
            fontSize = 24.sp
        )
        is UpdateUiState.Downloading -> {
            val total = state.totalBytes
            val percent = total?.takeIf { it > 0 }?.let {
                ((state.bytesDownloaded * 100) / it).coerceIn(0, 100)
            }
            Text(
                "Downloading${percent?.let { " · $it%" } ?: "…"}",
                color = UpdateCream,
                fontSize = 26.sp
            )
            Text(
                "${formatBytes(state.bytesDownloaded)}${total?.let { " of ${formatBytes(it)}" } ?: ""}",
                color = UpdateMuted,
                fontSize = 18.sp,
                modifier = Modifier.padding(top = 6.dp)
            )
            val fraction = total?.takeIf { it > 0 }?.let {
                (state.bytesDownloaded.toFloat() / it.toFloat()).coerceIn(0f, 1f)
            } ?: 0f
            Box(
                Modifier.fillMaxWidth().height(12.dp).background(UpdateSlate)
            ) {
                Box(Modifier.fillMaxWidth(fraction).height(12.dp).background(UpdateMint))
            }
        }
        is UpdateUiState.PermissionRequired -> {
            Text(
                "Android must allow LessonCue to install updates from this source.",
                color = UpdateCream,
                fontSize = 24.sp
            )
            val detail = when {
                state.settingsUnavailable ->
                    "Open Android Settings → Apps → Special app access → Install unknown apps → LessonCue, then enable Allow from this source."
                state.denied ->
                    "Permission is still off. Choose Open Android settings when you are ready, or follow the manual path in Android’s app settings."
                else ->
                    "LessonCue will open the official Android settings page. Return here after enabling Allow from this source."
            }
            Text(detail, color = UpdateMuted, fontSize = 19.sp, modifier = Modifier.padding(top = 10.dp))
        }
        is UpdateUiState.Installing -> Text(state.message, color = UpdateCream, fontSize = 24.sp)
        is UpdateUiState.Error -> {
            Text("Unable to update", color = UpdateCoral, fontSize = 27.sp)
            Text(state.message, color = UpdateCream, fontSize = 20.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun ActionRow(
    state: UpdateUiState,
    blocking: Boolean,
    firstFocus: FocusRequester,
    onDownload: () -> Unit,
    onLater: () -> Unit,
    onCancelDownload: () -> Unit,
    onRetry: () -> Unit,
    onClose: () -> Unit,
    onOpenPermissionSettings: () -> Unit
) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        when (state) {
            is UpdateUiState.Idle -> Unit
            is UpdateUiState.Checking -> Button(onClick = onClose, modifier = Modifier.focusRequester(firstFocus)) {
                Text("Close")
            }
            is UpdateUiState.Current -> Button(onClick = onClose, modifier = Modifier.focusRequester(firstFocus)) {
                Text("Continue")
            }
            is UpdateUiState.Available -> {
                Button(onClick = onDownload, modifier = Modifier.focusRequester(firstFocus)) {
                    Text("Download and update")
                }
                if (!blocking) Button(onClick = onLater) { Text("Later") }
            }
            is UpdateUiState.Downloading -> Button(
                onClick = onCancelDownload,
                modifier = Modifier.focusRequester(firstFocus)
            ) {
                Text("Cancel download")
            }
            is UpdateUiState.PermissionRequired -> {
                Button(onClick = onOpenPermissionSettings, modifier = Modifier.focusRequester(firstFocus)) {
                    Text("Open Android settings")
                }
                Button(onClick = onRetry) { Text("Check permission again") }
                if (!blocking) Button(onClick = onLater) { Text("Later") }
            }
            is UpdateUiState.Installing -> Unit
            is UpdateUiState.Error -> {
                Button(onClick = onRetry, modifier = Modifier.focusRequester(firstFocus)) { Text("Retry") }
                if (state.manifest != null && !blocking) Button(onClick = onLater) { Text("Later") }
                else if (!blocking) Button(onClick = onClose) { Text("Close") }
            }
        }
    }
}

private fun titleFor(state: UpdateUiState): String = when (state) {
    is UpdateUiState.Idle -> "Updates"
    is UpdateUiState.Checking -> "Checking for updates"
    is UpdateUiState.Current -> "LessonCue is current"
    is UpdateUiState.Available -> "Update available"
    is UpdateUiState.Downloading -> "Downloading update"
    is UpdateUiState.PermissionRequired -> "Installation permission"
    is UpdateUiState.Installing -> "Installing update"
    is UpdateUiState.Error -> "Update interrupted"
}

private fun formatBytes(bytes: Long?): String {
    bytes ?: return "Size unavailable"
    val megabytes = bytes / (1024.0 * 1024.0)
    return if (megabytes >= 1) "%.1f MB".format(megabytes) else "${bytes / 1024} KB"
}

private val UpdateNavy = Color(0xFF08111F)
private val UpdateSlate = Color(0xFF182438)
private val UpdateCream = Color(0xFFF7F2E8)
private val UpdateMuted = Color(0xFFA9B3C2)
private val UpdateGold = Color(0xFFFFB664)
private val UpdateCoral = Color(0xFFFF7A6E)
private val UpdateMint = Color(0xFF58D6A9)
