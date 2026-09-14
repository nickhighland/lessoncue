package org.lessoncue.tv

internal data class RemotePlayResolution(val consume: Boolean, val playlist: LessonPlaylist? = null, val error: String? = null)

/** A failed fetch retries; a fresh manifest rejecting the request is terminal. */
internal fun resolveRemotePlay(manifest: ScreenManifest?, lessonId: String?): RemotePlayResolution {
    if (manifest == null) return RemotePlayResolution(false)
    val playlist = manifest.playlists.firstOrNull { it.id == lessonId }
    return if (playlist != null) RemotePlayResolution(true, playlist)
    else RemotePlayResolution(true, error = "The requested lesson is not available to this screen.")
}
