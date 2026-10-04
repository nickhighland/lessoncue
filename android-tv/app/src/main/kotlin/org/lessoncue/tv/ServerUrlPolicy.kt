package org.lessoncue.tv

import java.net.URI
import java.net.Inet6Address
import java.net.InetAddress

/**
 * Android must retain platform cleartext support for self-hosted RFC1918 and
 * .local servers. Public HTTP is accepted as a convenient input alias, but is
 * upgraded to HTTPS before any request is made. Only explicitly local hosts
 * may remain on cleartext HTTP.
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
    require(!isBareLinkLocalIpv6(host)) {
        "A link-local IPv6 address must include its interface scope, such as %25wlan0."
    }
    val literalHost = host.matches(Regex("[0-9.]+")) || ':' in host
    require(scheme == "https" || isTrustedLocalHttpHost(host) || !literalHost) {
        "Use HTTPS for a public IP address. HTTP is supported only for a private/local address or an ordinary hostname that can be upgraded to HTTPS."
    }
    val normalizedScheme = if (scheme == "http" && !isTrustedLocalHttpHost(host)) "https" else scheme
    val authority = if (':' in host) "[$host]" else host
    val port = uri.port.takeIf { it > 0 &&
        !((normalizedScheme == "http" && it == 80) ||
            (normalizedScheme == "https" && it == 443) ||
            (scheme == "http" && normalizedScheme == "https" && it == 80)) }
    return "$normalizedScheme://$authority${port?.let { ":$it" }.orEmpty()}"
}

private fun isBareLinkLocalIpv6(host: String): Boolean {
    if ('%' in host || ':' !in host) return false
    val address = runCatching { InetAddress.getByName(host) }.getOrNull() as? Inet6Address ?: return false
    return address.isLinkLocalAddress
}

internal fun isTrustedLocalHttpHost(hostValue: String): Boolean {
    val host = hostValue.trim().trim('[', ']').substringBefore('%').lowercase()
    if (host == "localhost" || host.endsWith(".local")) return true
    val labels = host.split('.')
    val octets = labels.mapNotNull(String::toIntOrNull)
    if (labels.size == 4 && octets.size == 4 && octets.all { it in 0..255 }) {
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
