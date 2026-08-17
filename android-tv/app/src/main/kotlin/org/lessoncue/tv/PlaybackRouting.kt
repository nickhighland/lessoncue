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
 * The shared web player needs the paired display identity to load an Activity
 * cue. The native TV manifest deliberately does not include that token in the
 * cue URL, so add it only when the TV opens the Activity inside its WebView.
 */
internal fun activityPlaybackUrl(item: CueItem?, identity: DeviceIdentity?, clientVersion: String? = null): String? {
    val playbackUrl = item?.playbackUrl ?: return null
    if (item.type != "activity" || identity == null) return playbackUrl
    val separator = if ('?' in playbackUrl) '&' else '?'
    val version = clientVersion?.takeIf(String::isNotBlank)
        ?.let { "&tvVersion=${queryEncode(it)}" }
        .orEmpty()
    return "$playbackUrl${separator}screenId=${queryEncode(identity.screenId)}&token=${queryEncode(identity.token)}$version"
}

private fun queryEncode(value: String): String =
    URLEncoder.encode(value, "UTF-8").replace("+", "%20")
