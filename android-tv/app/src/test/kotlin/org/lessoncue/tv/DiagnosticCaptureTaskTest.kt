package org.lessoncue.tv

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class DiagnosticCaptureTaskTest {
    @Test fun slowCaptureDoesNotBlockCommandsOrStartParallelCaptures() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val entered = CompletableDeferred<Unit>()
        var visible = false
        val task = DiagnosticCaptureTask(this) { visible = it }
        assertTrue(task.submit("one") { entered.complete(Unit); gate.await() })
        entered.await()
        assertTrue(visible)
        // This represents the next control iteration while upload remains suspended.
        assertFalse(task.submit("two") { fail("Concurrent capture") })
        gate.complete(Unit)
        yield()
        assertFalse(visible)
        assertFalse(task.submit("one") { fail("Repeated capture") })
        assertTrue("Busy requests must remain eligible on the next poll", task.submit("two") {})
    }

    @Test fun captureFailureHidesNoticeAndLeavesPollingScopeAlive() = runBlocking {
        var visible = false
        val task = DiagnosticCaptureTask(this) { visible = it }
        task.submit("failed") { throw IllegalStateException("Upload unavailable") }
        yield()
        assertFalse(visible)
        assertTrue(isActive)
        assertTrue(task.submit("next") {})
    }

    @Test fun IdentityCancellationHidesNoticeAndCancelsCapture() = runBlocking {
        val owner = Job()
        val scope = CoroutineScope(coroutineContext + owner)
        var visible = false
        val entered = CompletableDeferred<Unit>()
        val task = DiagnosticCaptureTask(scope) { visible = it }
        task.submit("cancel") { entered.complete(Unit); awaitCancellation() }
        entered.await()
        assertTrue(visible)
        owner.cancelAndJoin()
        assertFalse(visible)
    }
}
