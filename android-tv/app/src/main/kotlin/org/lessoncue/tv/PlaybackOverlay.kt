package org.lessoncue.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
    hasError: Boolean = false,
    modifier: Modifier = Modifier
) {
    if (!visible) return
    Box(modifier) {
        Column(
            Modifier.align(Alignment.TopStart).padding(horizontal = 28.dp, vertical = 22.dp)
                .background(LessonCueTvColors.Background.copy(alpha = .72f), RoundedCornerShape(13.dp))
                .border(1.dp, LessonCueTvColors.Cream.copy(alpha = .28f), RoundedCornerShape(13.dp))
                .padding(horizontal = 16.dp, vertical = 9.dp)
        ) {
            Text(
                item.title,
                color = LessonCueTvColors.Cream,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                "$lessonTitle  •  Cue ${itemIndex + 1} of $itemCount",
                color = LessonCueTvColors.Muted,
                fontSize = 13.sp
            )
        }
        StatusBadge(
            availabilityLabel,
            color = if (hasError) LessonCueTvColors.Coral else LessonCueTvColors.Success,
            modifier = Modifier.align(Alignment.TopEnd).padding(horizontal = 28.dp, vertical = 22.dp)
        )
        val shape = RoundedCornerShape(14.dp)
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 28.dp, vertical = 14.dp)
                .background(LessonCueTvColors.Background.copy(alpha = .74f), shape)
                .border(1.dp, LessonCueTvColors.Cream.copy(alpha = .34f), shape)
                .padding(horizontal = 10.dp, vertical = 7.dp)
        ) {
            PlaybackProgress(positionMs, durationMs)
            Spacer(Modifier.height(5.dp))
            Row(Modifier.fillMaxWidth().height(36.dp), verticalAlignment = Alignment.CenterVertically) {
                PlaybackControl("‹", "Back", actions.exit, Modifier.width(86.dp))
                Spacer(Modifier.width(5.dp))
                PlaybackControl("↶", "Previous", actions.previous, Modifier.weight(1f))
                Spacer(Modifier.width(5.dp))
                if (item.type == "activity") {
                    Text(
                        "USE THE WEB CONTROLLER TO PLAY",
                        color = LessonCueTvColors.Muted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.weight(2.5f)
                    )
                } else {
                    PlaybackControl("−5", "Rewind", actions.rewind, Modifier.weight(1f))
                    Spacer(Modifier.width(5.dp))
                    PlaybackControl(if (playing) "Ⅱ" else "▶", if (playing) "Pause" else "Play",
                        actions.togglePlayPause, Modifier.weight(1f))
                    Spacer(Modifier.width(5.dp))
                    PlaybackControl("+5", "Forward", actions.fastForward, Modifier.weight(1f))
                }
                Spacer(Modifier.width(5.dp))
                PlaybackControl("↷", "Next", actions.next, Modifier.weight(1f))
                Spacer(Modifier.width(10.dp))
                Text(
                    "${formatDuration(positionMs)} / ${formatDuration(durationMs)}",
                    color = LessonCueTvColors.Muted,
                    fontSize = 11.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.End,
                    maxLines = 1,
                    modifier = Modifier.width(135.dp)
                )
            }
        }
    }
}

@Composable
private fun PlaybackProgress(positionMs: Long, durationMs: Long?) {
    val fraction = durationMs?.takeIf { it > 0 }?.let {
        (positionMs.toFloat() / it.toFloat()).coerceIn(0f, 1f)
    } ?: 0f
    Box(Modifier.fillMaxWidth().height(3.dp).background(LessonCueTvColors.Muted.copy(alpha = .38f), RoundedCornerShape(50))) {
        Box(
            Modifier.fillMaxWidth(fraction).height(3.dp)
                .background(LessonCueTvColors.FocusOrange, RoundedCornerShape(50))
        )
    }
}

@Composable
private fun PlaybackControl(glyph: String, label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    LessonCueButton(onClick = onClick, modifier = modifier.height(36.dp)) {
        Text("$glyph  $label", fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}
