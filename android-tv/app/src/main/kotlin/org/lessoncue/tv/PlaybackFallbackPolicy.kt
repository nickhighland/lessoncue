package org.lessoncue.tv

internal object PlaybackFallbackPolicy {
    const val StalledBufferingTimeoutMs = 15_000L

    fun nextSourceIndex(currentIndex: Int, sourceCount: Int): Int? =
        (currentIndex + 1).takeIf { it in 0 until sourceCount }

    fun bufferingTimedOut(startedAtMs: Long, nowMs: Long): Boolean =
        nowMs - startedAtMs >= StalledBufferingTimeoutMs
}

internal fun PlaybackSource.displayQuality(): String = when {
    height != null -> "${height}P"
    profile == "original" -> "ORIGINAL"
    else -> profile.uppercase()
}
