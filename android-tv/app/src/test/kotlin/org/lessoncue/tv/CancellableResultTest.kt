package org.lessoncue.tv

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CancellableResultTest {
    @Test fun ordinaryFailuresRemainRecoverable() = runBlocking {
        assertEquals(42, cancellableResult { 42 }.getOrThrow())
        assertTrue(cancellableResult { throw IOException("offline") }.exceptionOrNull() is IOException)
    }

    @Test fun cancelledRequestCannotRunSuccessOrFailureUiHandlers() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val response = CompletableDeferred<Unit>()
        var uiChanged = false
        val job = launch {
            cancellableResult { started.complete(Unit); response.await() }
                .onSuccess { uiChanged = true }.onFailure { uiChanged = true }
        }
        started.await()
        job.cancelAndJoin()
        response.complete(Unit)
        assertFalse(uiChanged)
    }

    @Test fun nonCooperativeCompletionAfterCancellationCannotUpdateUi() = runBlocking {
        var uiChanged = false
        val job = launch {
            val context = currentCoroutineContext()
            cancellableResult { context.cancel(); "late response" }
                .onSuccess { uiChanged = true }.onFailure { uiChanged = true }
        }
        job.join()
        assertFalse(uiChanged)
    }
}
