package org.lessoncue.tv

import android.graphics.Bitmap
import android.view.PixelCopy
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class DiagnosticScreenshotTest {
    private fun bitmap() = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)

    @Test fun canceledCaptureWaitsForCallbackThenRecycles() = runBlocking {
        val image = bitmap()
        lateinit var finish: (Int) -> Unit
        val task = async(start = CoroutineStart.UNDISPATCHED) {
            captureDiagnosticBitmap(image) { _, callback -> finish = callback }
        }
        task.cancelAndJoin()
        assertFalse("PixelCopy may still be writing", image.isRecycled)
        finish(PixelCopy.SUCCESS)
        assertTrue(image.isRecycled)
    }

    @Test fun successfulCaptureReturnsJpegAndRecycles() = runBlocking {
        val image = bitmap()
        val jpeg = captureDiagnosticBitmap(image) { _, finish -> finish(PixelCopy.SUCCESS) }
        assertNotNull(jpeg)
        assertTrue(jpeg!!.isNotEmpty())
        assertTrue(image.isRecycled)
    }

    @Test fun failedCopyAndSynchronousRequestFailureRecycle() = runBlocking {
        val failed = bitmap()
        assertNull(captureDiagnosticBitmap(failed) { _, finish -> finish(PixelCopy.ERROR_SOURCE_NO_DATA) })
        assertTrue(failed.isRecycled)
        val thrown = bitmap()
        assertNull(captureDiagnosticBitmap(thrown) { _, _ -> throw IllegalArgumentException("No surface") })
        assertTrue(thrown.isRecycled)
    }
}
