package org.lessoncue.tv

/** A received Stop always has a local destination, even without an offline cache. */
internal fun resolveRemoteStop(cachedManifest: ScreenManifest?): ScreenManifest =
    cachedManifest ?: ScreenManifest(0, "LessonCue", emptyList(), emptyList())
