package org.lessoncue.tv

import java.net.URI
import java.net.Inet6Address
import java.net.InetAddress

/**
 * Android must retain platform cleartext support for self-hosted RFC1918 and
 * .local servers. Enforce the narrower product policy here: public or ordinary
 * DNS hostnames require HTTPS, while HTTP is accepted only for an explicitly
 * local address.
 */
internal fun normalizeLessonCueServerUrl(value: String): String {
    val entered = value.trim().trimEnd('/')
    require(entered.isNotEmpty()) { "Enter the LessonCue server address." }
    val candidate = if (entered.contains("://")) entered else "http://$entered"
    val uri = runCatching { URI(candidate) }.getOrNull()
        ?: throw IllegalArgumentException("Enter a valid LessonCue server address.")
    val scheme = uri.scheme?.lowercase()
    require(scheme == "http" || scheme == "https") { "LessonCue addresses must use HTTP or HTTPS." }
    require(uri.userInfo.isNullOrBlank() && uri.query == null && uri.fragment == null &&
        (uri.path.isNullOrBlank() || uri.path == "/")) {
        "Enter only the LessonCue server origin, without credentials, a path, query, or fragment."
    }
    val host = uri.host?.trim()?.trim('[', ']')?.lowercase()
        ?: throw IllegalArgumentException("The LessonCue address needs a hostname or IP address.")
    require(uri.port in -1..65_535 && uri.port != 0) { "The LessonCue port must be from 1 to 65535." }
    require(scheme == "https" || isTrustedLocalHttpHost(host)) {
        "Public or ordinary DNS addresses require HTTPS. Use HTTP only for a private IP address, localhost, or a .local name."
    }
    val authority = if (':' in host) "[$host]" else host
    val port = uri.port.takeIf { it > 0 && !((scheme == "http" && it == 80) || (scheme == "https" && it == 443)) }
    return "$scheme://$authority${port?.let { ":$it" }.orEmpty()}"
}

internal fun isTrustedLocalHttpHost(hostValue: String): Boolean {
    val host = hostValue.trim().trim('[', ']').substringBefore('%').lowercase()
    if (host == "localhost" || host.endsWith(".local")) return true
    val octets = host.split('.').mapNotNull(String::toIntOrNull)
    if (octets.size == 4 && octets.all { it in 0..255 }) {
        return octets[0] == 10 ||
            octets[0] == 127 ||
            octets[0] == 169 && octets[1] == 254 ||
            octets[0] == 172 && octets[1] in 16..31 ||
            octets[0] == 192 && octets[1] == 168
    }
    if (':' !in host) return false
    val address = runCatching { InetAddress.getByName(host) }.getOrNull() as? Inet6Address ?: return false
    val bytes = address.address
    val loopback = bytes.dropLast(1).all { it.toInt() == 0 } && bytes.last().toInt() == 1
    val uniqueLocal = (bytes[0].toInt() and 0xfe) == 0xfc
    val linkLocal = (bytes[0].toInt() and 0xff) == 0xfe &&
        (bytes[1].toInt() and 0xc0) == 0x80
    return loopback || uniqueLocal || linkLocal
}
