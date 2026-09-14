package org.lessoncue.tv

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull

/** One queued wake, including commands arriving during a heartbeat request. */
internal class HeartbeatWake {
    private val pending = Channel<Unit>(Channel.CONFLATED)

    fun request() { pending.trySend(Unit) }

    suspend fun awaitNext(intervalMillis: Long) {
        withTimeoutOrNull(intervalMillis) { pending.receive() }
    }
}
