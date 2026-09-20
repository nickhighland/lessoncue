package org.lessoncue.tv

import org.junit.Assert.assertEquals
import org.junit.Test

class ServiceResolutionQueueTest {
    private class Harness {
        val started = mutableListOf<String>()
        val callbacks = mutableMapOf<String, (String?) -> Unit>()
        val found = mutableListOf<String>()
        val queue = ServiceResolutionQueue<String>({ it }, { service, callback ->
            started.add(service)
            callbacks[service] = callback
        }, { found.add(it) })
    }

    @Test fun retainedAnnouncementResolvesAfterFirstServiceFails() {
        val h = Harness()
        h.queue.offer("A")
        h.queue.offer("B")
        assertEquals(listOf("A"), h.started)
        h.callbacks.getValue("A")(null)
        assertEquals(listOf("A", "B"), h.started)
        h.callbacks.getValue("B")("http://192.168.1.2")
        assertEquals(listOf("http://192.168.1.2"), h.found)
    }

    @Test fun duplicateAndLateCallbacksCannotFinishTheNextRequest() {
        val h = Harness()
        h.queue.offer("A")
        h.queue.offer("A")
        h.queue.offer("B")
        h.callbacks.getValue("A")(null)
        h.callbacks.getValue("A")("stale")
        h.callbacks.getValue("B")("current")
        h.callbacks.getValue("B")("duplicate")
        h.queue.offer("C")
        assertEquals(listOf("A", "B", "C"), h.started)
        assertEquals(listOf("current"), h.found)
    }

    @Test fun cancellationDropsQueuedWorkAndLateSuccess() {
        val h = Harness()
        h.queue.offer("A")
        h.queue.offer("B")
        h.queue.close()
        h.callbacks.getValue("A")("late")
        h.queue.offer("C")
        assertEquals(listOf("A"), h.started)
        assertEquals(emptyList<String>(), h.found)
    }

    @Test fun synchronousResolverExceptionDoesNotBlockLaterService() {
        val found = mutableListOf<String>()
        val queue = ServiceResolutionQueue<String>({ it }, { service, callback ->
            if (service == "bad") throw IllegalStateException("cannot resolve")
            callback("http://192.168.1.2")
        }, { found.add(it) })
        queue.offer("bad")
        queue.offer("good")
        assertEquals(listOf("http://192.168.1.2"), found)
    }
}
