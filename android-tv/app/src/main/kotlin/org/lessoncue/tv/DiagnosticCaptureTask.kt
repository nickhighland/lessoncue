package org.lessoncue.tv

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** One identity-scoped capture; slow diagnostics never suspend command polling. */
internal class DiagnosticCaptureTask(
    private val scope: CoroutineScope,
    private val showNotice: (Boolean) -> Unit,
) {
    private var job: Job? = null
    private var handledRequest: String? = null

    fun submit(requestId: String, capture: suspend () -> Unit): Boolean {
        if (job?.isActive == true || requestId == handledRequest) return false
        handledRequest = requestId
        job = scope.launch {
            try {
                showNotice(true)
                cancellableResult { capture() }
            } finally {
                showNotice(false)
            }
        }
        return true
    }
}
