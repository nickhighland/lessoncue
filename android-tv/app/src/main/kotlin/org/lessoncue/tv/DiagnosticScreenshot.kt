package org.lessoncue.tv

import android.graphics.Bitmap
import android.view.PixelCopy
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume

/** Keep the bitmap alive until PixelCopy finishes, even if its caller cancels. */
internal suspend fun captureDiagnosticBitmap(
    bitmap: Bitmap,
    request: (Bitmap, (Int) -> Unit) -> Unit,
): ByteArray? = suspendCancellableCoroutine { continuation ->
    try {
        request(bitmap) { result ->
            try {
                if (continuation.isActive) {
                    val jpeg = runCatching {
                        if (result != PixelCopy.SUCCESS) null else {
                            val output = ByteArrayOutputStream()
                            if (bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output)) output.toByteArray() else null
                        }
                    }.getOrNull()
                    continuation.resume(jpeg)
                }
            } finally {
                bitmap.recycle()
            }
        }
    } catch (_: Exception) {
        bitmap.recycle()
        if (continuation.isActive) continuation.resume(null)
    }
}
