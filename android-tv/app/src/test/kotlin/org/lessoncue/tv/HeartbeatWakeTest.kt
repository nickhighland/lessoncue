package org.lessoncue.tv

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class HeartbeatWakeTest {
    @Test fun commandInterruptsIdleWait() = runBlocking {
        val wake = HeartbeatWake()
        val waiting = CompletableDeferred<Unit>()
        val job = launch {
            waiting.complete(Unit)
            wake.awaitNext(30_000)
        }
        waiting.await()
        wake.request()
        withTimeout(1_000) { job.join() }
        assertTrue(job.isCompleted)
    }

    @Test fun commandsDuringSlowRequestCoalesceIntoOneFollowUp() = runBlocking {
        val wake = HeartbeatWake()
        repeat(50) { wake.request() }
        withTimeout(1_000) { wake.awaitNext(30_000) }
        var anotherWake = false
        val waiting = launch(start = CoroutineStart.UNDISPATCHED) {
            wake.awaitNext(30_000)
            anotherWake = true
        }
        yield()
        assertFalse("A command burst must not leave fifty queued heartbeats", anotherWake)
        wake.request()
        withTimeout(1_000) { waiting.join() }
        assertTrue(anotherWake)
    }

    @Test fun normalIntervalStillFiresAndCleanupCancelsTheWait() = runBlocking {
        val wake = HeartbeatWake()
        withTimeout(1_000) { wake.awaitNext(1) }
        var continued = false
        val waiting = launch(start = CoroutineStart.UNDISPATCHED) {
            wake.awaitNext(30_000)
            continued = true
        }
        waiting.cancelAndJoin()
        wake.request()
        assertFalse(continued)
    }
}
