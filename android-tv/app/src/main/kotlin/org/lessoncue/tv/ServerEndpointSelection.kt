package org.lessoncue.tv

import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI

internal data class ServerEndpointCandidate(
    val endpoint: String,
    val source: String,
    val addressFamily: String,
)

internal data class ServerEndpointResolution(
    val candidates: List<ServerEndpointCandidate>,
    val rejected: List<EndpointAttempt>,
)

/**
 * Expands a requested hostname into concrete endpoints before probing it. A
 * URLConnection is allowed to choose one address internally, which is exactly
 * what made a dead AAAA record hide a working A record on some TVs.
 */
internal object ServerEndpointSelection {
    fun resolve(requested: String, discovered: List<String> = emptyList()): ServerEndpointResolution {
        val candidates = mutableListOf<ServerEndpointCandidate>()
        val rejected = mutableListOf<EndpointAttempt>()

        fun add(endpoint: String, source: String) {
            val safe = runCatching { normalizeLessonCueServerUrl(endpoint) }.getOrElse { error ->
                rejected += EndpointAttempt(endpoint, source, addressFamily(endpoint), "rejected", error.message)
                return
            }
            val family = addressFamily(safe)
            if (isBareLinkLocal(safe)) {
                rejected += EndpointAttempt(safe, source, "ipv6", "rejected", "link-local IPv6 address has no interface scope")
                return
            }
            if (candidates.none { it.endpoint == safe }) candidates += ServerEndpointCandidate(safe, source, family)
        }

        val normalized = runCatching { normalizeLessonCueServerUrl(requested) }.getOrNull()
        if (normalized == null) {
            rejected += EndpointAttempt(requested, "saved-or-entered", addressFamily(requested), "rejected",
                "server address is not a valid LessonCue origin")
            discovered.forEach { add(it, "dns-sd") }
            return ServerEndpointResolution(candidates, rejected)
        }
        val uri = URI(normalized)

        val host = uri.host?.trim('[', ']') ?: error("The LessonCue address needs a hostname or IP address.")
        val isLiteral = host.matches(Regex("[0-9.]+")) || ':' in host
        if (isLiteral) {
            add(normalized, "saved-or-entered")
        } else {
            val resolved = runCatching { InetAddress.getAllByName(host) }.getOrDefault(emptyArray())
            resolved.forEach { address ->
                val addressText = addressText(address, rejected, "dns") ?: return@forEach
                val endpoint = lessonCueServiceUrl(addressText, effectivePort(uri), uri.scheme.equals("https", true))
                if (endpoint == null) {
                    rejected += EndpointAttempt(addressText, "dns", addressFamily(addressText), "rejected", "address could not be converted to a usable URL")
                } else add(endpoint, "dns")
            }
            // If DNS/.local lookup is temporarily unavailable, retain the
            // hostname as a final candidate. NSD candidates are added below.
            if (resolved.isEmpty()) add(normalized, "saved-or-entered")
        }

        discovered.forEach { add(it, "dns-sd") }

        // Prefer IPv4 when both families are present, but retain every viable
        // IPv6 endpoint so a genuinely IPv6-only LAN still works.
        val ordered = candidates.sortedWith(compareBy<ServerEndpointCandidate> { it.addressFamily != "ipv4" })
        return ServerEndpointResolution(ordered, rejected)
    }

    private fun effectivePort(uri: URI): Int = uri.port.takeIf { it > 0 }
        ?: if (uri.scheme.equals("https", true)) 443 else 80

    private fun addressText(address: InetAddress, rejected: MutableList<EndpointAttempt>, source: String): String? {
        if (address !is Inet6Address) return address.hostAddress
        val hostAddress = address.hostAddress ?: return null
        var text = hostAddress.substringBefore('%')
        if (address.isLinkLocalAddress) {
            val scope = hostAddress.substringAfter('%', "").takeIf { it.isNotBlank() }
                ?: runCatching { address.scopedInterface?.name }.getOrNull()?.takeIf { it.isNotBlank() }
                ?: address.scopeId.takeIf { it > 0 }?.toString()
            if (scope.isNullOrBlank()) {
                rejected += EndpointAttempt("http://[$text]", source, "ipv6", "rejected", "link-local IPv6 address has no interface scope")
                return null
            }
            text += "%$scope"
        }
        return text
    }

    private fun addressFamily(endpoint: String): String =
        runCatching { URI(endpoint).host?.trim('[', ']') ?: "" }.getOrNull()?.let {
            if (':' in it) "ipv6" else "ipv4"
        } ?: if (':' in endpoint) "ipv6" else "unknown"

    private fun isBareLinkLocal(endpoint: String): Boolean {
        val host = runCatching { URI(endpoint).host?.trim('[', ']') }.getOrNull() ?: return false
        if ('%' in host) return false
        val address = runCatching { InetAddress.getByName(host) }.getOrNull() as? Inet6Address ?: return false
        return address.isLinkLocalAddress
    }
}

/**
 * Probe every viable address in order. A resolved AAAA record is only a
 * candidate; it is not a usable LessonCue endpoint until the identity/health
 * request succeeds. Keeping this loop separate makes the dual-stack fallback
 * behavior directly testable without needing a live LAN in unit tests.
 */
internal suspend fun <T> firstVerifiedServerEndpoint(
    candidates: List<ServerEndpointCandidate>,
    tried: MutableSet<String>,
    attempts: MutableList<EndpointAttempt>,
    verify: suspend (ServerEndpointCandidate) -> T,
): Pair<ServerEndpointCandidate, T>? {
    for (candidate in candidates) {
        if (!tried.add(candidate.endpoint)) continue
        try {
            val result = verify(candidate)
            attempts += EndpointAttempt(candidate.endpoint, candidate.source, candidate.addressFamily, "verified")
            return candidate to result
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: Exception) {
            attempts += EndpointAttempt(
                candidate.endpoint,
                candidate.source,
                candidate.addressFamily,
                "failed",
                error.message?.take(240) ?: error::class.java.simpleName,
            )
        }
    }
    return null
}
