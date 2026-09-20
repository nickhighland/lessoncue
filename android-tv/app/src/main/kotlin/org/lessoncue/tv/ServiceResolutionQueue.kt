package org.lessoncue.tv

/** NSD permits one outstanding resolve. Retain announcements until it finishes. */
internal class ServiceResolutionQueue<T>(
    private val key: (T) -> String,
    private val resolve: (T, (String?) -> Unit) -> Unit,
    private val found: (String) -> Unit,
) {
    private val pending = ArrayDeque<T>()
    private val seen = mutableSetOf<String>()
    private var closed = false
    private var active: Int? = null
    private var sequence = 0

    @Synchronized fun offer(service: T) {
        if (closed || !seen.add(key(service))) return
        pending.addLast(service)
        advance()
    }

    @Synchronized fun close() {
        closed = true
        pending.clear()
        seen.clear()
        active = null
    }

    private fun advance() {
        if (closed || active != null || pending.isEmpty()) return
        val service = pending.removeFirst()
        val id = ++sequence
        active = id
        try {
            resolve(service) { url -> finish(id, url) }
        } catch (_: Exception) {
            finish(id, null)
        }
    }

    @Synchronized private fun finish(id: Int, url: String?) {
        if (closed || active != id) return
        active = null
        if (url != null) {
            found(url)
        }
        advance()
    }
}
