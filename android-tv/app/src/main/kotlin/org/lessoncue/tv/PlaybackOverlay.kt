package org.lessoncue.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text

internal data class PlaybackOverlayActions(
    val previous: () -> Unit,
    val rewind: () -> Unit,
    val togglePlayPause: () -> Unit,
    val fastForward: () -> Unit,
    val next: () -> Unit,
    val exit: () -> Unit
)

@Composable
internal fun PlaybackOverlay(
    visible: Boolean,
    lessonTitle: String,
    item: CueItem,
    itemIndex: Int,
    itemCount: Int,
    positionMs: Long,
    durationMs: Long?,
    playing: Boolean,
    availabilityLabel: String,
    actions: PlaybackOverlayActions,
    modifier: Modifier = Modifier
) {
    if (!visible) return
    Box(modifier) {
        Column(
            Modifier.align(Alignment.TopStart).padding(horizontal = 34.dp, vertical = 26.dp)
                .background(LessonCueTvColors.Background.copy(alpha = .82f), RoundedCornerShape(16.dp))
                .padding(horizontal = 20.dp, vertical = 14.dp)
        ) {
            Text(
                item.title,
                color = LessonCueTvColors.Cream,
                fontSize = 23.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                "$lessonTitle  •  Cue ${itemIndex + 1} of $itemCount",
                color = LessonCueTvColors.Muted,
                fontSize = 16.sp
            )
        }
        StatusBadge(
            availabilityLabel,
            color = LessonCueTvColors.Success,
            modifier = Modifier.align(Alignment.TopEnd).padding(horizontal = 34.dp, vertical = 28.dp)
        )
        val shape = RoundedCornerShape(24.dp)
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 34.dp, vertical = 24.dp)
                .background(LessonCueTvColors.Background.copy(alpha = .96f), shape)
                .border(1.dp, LessonCueTvColors.Cream.copy(alpha = .8f), shape)
                .padding(horizontal = 22.dp, vertical = 16.dp)
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    item.title,
                    color = LessonCueTvColors.Cream,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    "${formatDuration(positionMs)} / ${formatDuration(durationMs)}",
                    color = LessonCueTvColors.Muted,
                    fontSize = 16.sp
                )
            }
            Spacer(Modifier.height(10.dp))
            PlaybackProgress(positionMs, durationMs)
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.width(105.dp)) {
                    Text("BACK", color = LessonCueTvColors.Muted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text("Exit playback", color = LessonCueTvColors.Cream, fontSize = 16.sp)
                }
                Row(
                    Modifier.weight(1f),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    PlaybackControl("↶", "Previous", actions.previous, Modifier.weight(1f))
                    Spacer(Modifier.width(7.dp))
                    PlaybackControl("−5", "Rewind", actions.rewind, Modifier.weight(1f))
                    Spacer(Modifier.width(7.dp))
                    LessonCueButton(onClick = actions.togglePlayPause, modifier = Modifier.weight(1.18f).height(54.dp)) {
                        Text(if (playing) "Ⅱ  Pause" else "▶  Play", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(7.dp))
                    PlaybackControl("+5", "Forward", actions.fastForward, Modifier.weight(1f))
                    Spacer(Modifier.width(7.dp))
                    PlaybackControl("↷", "Next", actions.next, Modifier.weight(1f))
                }
                Text(
                    "Controls fade after 4 seconds",
                    color = LessonCueTvColors.Muted,
                    fontSize = 13.sp,
                    modifier = Modifier.width(115.dp)
                )
            }
            if (item.notes.isNotBlank()) {
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier.fillMaxWidth().background(LessonCueTvColors.ElevatedPanel, RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                ) {
                    Text("NOTES", color = LessonCueTvColors.FocusOrange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(14.dp))
                    Text(item.notes, color = LessonCueTvColors.Cream, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun PlaybackProgress(positionMs: Long, durationMs: Long?) {
    val fraction = durationMs?.takeIf { it > 0 }?.let {
        (positionMs.toFloat() / it.toFloat()).coerceIn(0f, 1f)
    } ?: 0f
    Box(Modifier.fillMaxWidth().height(8.dp).background(LessonCueTvColors.Muted.copy(alpha = .45f), RoundedCornerShape(50))) {
        Box(
            Modifier.fillMaxWidth(fraction).height(8.dp)
                .background(LessonCueTvColors.FocusOrange, RoundedCornerShape(50))
        )
    }
}

@Composable
private fun PlaybackControl(glyph: String, label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    LessonCueButton(onClick = onClick, modifier = modifier.height(54.dp)) {
        Text("$glyph  $label", fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}
