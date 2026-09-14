package org.lessoncue.tv

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import kotlin.coroutines.coroutineContext

/** A cancelled screen/request must not turn into an error or update stale UI. */
internal suspend inline fun <T> cancellableResult(block: suspend () -> T): Result<T> {
    coroutineContext.ensureActive()
    return try {
        val value = block()
        coroutineContext.ensureActive()
        Result.success(value)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        coroutineContext.ensureActive()
        Result.failure(error)
    }
}
