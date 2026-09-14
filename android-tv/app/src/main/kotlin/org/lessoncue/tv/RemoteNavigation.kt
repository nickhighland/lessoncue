package org.lessoncue.tv

/** Recognized navigation is consumed even when the current screen cannot move. */
internal fun applyRemoteNavigation(
    action: String,
    currentIndex: Int?,
    itemCount: Int,
    positionMs: Long?,
    move: (Int, Long) -> Unit,
): Boolean {
    if (action !in setOf("next", "previous", "seek")) return false
    if (currentIndex == null || currentIndex !in 0 until itemCount) return true
    when (action) {
        "next" -> if (currentIndex < itemCount - 1) move(currentIndex + 1, 0)
        "previous" -> move((currentIndex - 1).coerceAtLeast(0), 0)
        "seek" -> move(currentIndex, (positionMs ?: 0).coerceAtLeast(0))
    }
    return true
}
