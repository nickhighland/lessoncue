package org.lessoncue.tv

import java.net.URLEncoder

/**
 * Activity cues are rendered by LessonCue's shared web player. They do not
 * have a media download URL, so they must be routed by their playback URL
 * before PlayerScreen applies the media-availability check.
 */
internal fun shouldUseOnlinePlayback(item: CueItem?): Boolean =
    item?.playbackUrl != null && (item.type == "activity" || item.linkKind in setOf(
        "youtube", "embedded", "webpage", "external"
    ))

/**
 * New Activity cues use a dedicated public display projection and do not need
 * the paired screen credential in the URL. Keep identity injection only for
 * legacy /player Activity links so older manifests remain playable during an
 * upgrade. The native app continues to authenticate manifest/control traffic.
 */
internal fun activityPlaybackUrl(item: CueItem?, identity: DeviceIdentity?, clientVersion: String? = null): String? {
    val playbackUrl = item?.playbackUrl ?: return null
    if (item.type != "activity") return playbackUrl
    if (playbackUrl.contains("/activity-display")) {
        return appendQuery(playbackUrl, "tvClient", "android-tv")
            .let { value -> clientVersion?.takeIf(String::isNotBlank)?.let { appendQuery(value, "tvVersion", it) } ?: value }
    }
    if (identity == null) return playbackUrl
    return appendQuery(playbackUrl, "screenId", identity.screenId)
        .let { appendQuery(it, "token", identity.token) }
        .let { value -> clientVersion?.takeIf(String::isNotBlank)?.let { appendQuery(value, "tvVersion", it) } ?: value }
}

private fun appendQuery(url: String, key: String, value: String): String =
    "$url${if ('?' in url) '&' else '?'}${queryEncode(key)}=${queryEncode(value)}"

private fun queryEncode(value: String): String =
    URLEncoder.encode(value, "UTF-8").replace("+", "%20")
