package org.lessoncue.tv

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Shared design tokens for the ten-foot LessonCue interface. */
internal object LessonCueTvColors {
    val Background = Color(0xFF101815)
    val BackgroundSoft = Color(0xFF18231F)
    val Panel = Color(0xFF1B2521)
    val ElevatedPanel = Color(0xFF26332E)
    val Border = Color(0xFF3A5047)
    val Orange = Color(0xFFD89028)
    val FocusOrange = Color(0xFFF0AD4E)
    val Cream = Color(0xFFF7F2E8)
    val Muted = Color(0xFFA9B3AE)
    val Success = Color(0xFF58D6A9)
    val Coral = Color(0xFFFF7A6E)
    val Disabled = Color(0xFF33413C)
    val DisabledText = Color(0xFF7F8C87)
    val BlackScrim = Color(0xB8101815)
}

internal object LessonCueTvDimens {
    val ScreenHorizontal = 56.dp
    val ScreenVertical = 42.dp
    val PanelRadius = 24.dp
    val CardRadius = 18.dp
    val FocusBorder = 3.dp
    val PanelBorder = 1.dp
    val SectionGap = 32.dp
    val CardGap = 14.dp
    val ControlHeight = 72.dp
}

// Backward-compatible aliases keep media/signage rendering code free of visual duplication.
internal val Navy = LessonCueTvColors.Background
internal val Slate = LessonCueTvColors.ElevatedPanel
internal val Cream = LessonCueTvColors.Cream
internal val Muted = LessonCueTvColors.Muted
internal val Gold = LessonCueTvColors.Orange
internal val Coral = LessonCueTvColors.Coral
internal val Mint = LessonCueTvColors.Success
internal val ButtonSurface = LessonCueTvColors.ElevatedPanel
internal val SelectedButton = LessonCueTvColors.FocusOrange
internal val DisabledButtonSurface = LessonCueTvColors.Disabled
internal val DisabledButtonText = LessonCueTvColors.DisabledText
