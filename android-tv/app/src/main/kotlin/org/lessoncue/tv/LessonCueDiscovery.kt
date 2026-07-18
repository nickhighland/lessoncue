package org.lessoncue.tv

import android.annotation.SuppressLint
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

internal class LessonCueDiscovery(context: Context) {
    private val appContext = context.applicationContext
    private val nsdManager = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifiManager = appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    suspend fun findServer(timeoutMillis: Long = 6_000): String? =
        withTimeoutOrNull(timeoutMillis) { browse() }

    @SuppressLint("ServiceCast")
    @Suppress("DEPRECATION")
    private suspend fun browse(): String? = suspendCancellableCoroutine { continuation ->
        val completed = AtomicBoolean(false)
        val resolving = AtomicBoolean(false)
        val handler = Handler(Looper.getMainLooper())
        val multicastLock = runCatching {
            wifiManager?.createMulticastLock("lessoncue-discovery")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        }.getOrNull()
        lateinit var discoveryListener: NsdManager.DiscoveryListener
        lateinit var timeout: Runnable

        fun releaseResources() {
            handler.removeCallbacks(timeout)
            runCatching { nsdManager.stopServiceDiscovery(discoveryListener) }
            runCatching { multicastLock?.takeIf { it.isHeld }?.release() }
        }

        fun complete(serverUrl: String?) {
            if (!completed.compareAndSet(false, true)) return
            releaseResources()
            if (continuation.isActive) continuation.resume(serverUrl)
        }

        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                resolving.set(false)
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                val secure = serviceInfo.attributes["secure"]
                    ?.toString(StandardCharsets.UTF_8)
                    ?.equals("true", ignoreCase = true) == true
                lessonCueServiceUrl(serviceInfo.host.hostAddress, serviceInfo.port, secure)?.let(::complete)
            }
        }

        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) = complete(null)
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (serviceInfo.serviceType.trimEnd('.').equals(SERVICE_TYPE.trimEnd('.'), ignoreCase = true)
                    && resolving.compareAndSet(false, true)) {
                    runCatching { nsdManager.resolveService(serviceInfo, resolveListener) }
                        .onFailure { resolving.set(false) }
                }
            }
        }

        timeout = Runnable { complete(null) }
        continuation.invokeOnCancellation {
            if (completed.compareAndSet(false, true)) releaseResources()
        }
        handler.postDelayed(timeout, 5_500)
        runCatching {
            nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        }.onFailure { complete(null) }
    }

    private companion object {
        const val SERVICE_TYPE = "_lessoncue._tcp."
    }
}

internal fun lessonCueServiceUrl(hostAddress: String?, port: Int, secure: Boolean): String? {
    val address = hostAddress?.trim()?.takeIf(String::isNotEmpty) ?: return null
    if (port !in 1..65_535) return null
    val scheme = if (secure) "https" else "http"
    val host = if (':' in address) "[${address.replace("%", "%25")}]" else address
    val defaultPort = if (secure) 443 else 80
    return "$scheme://$host${if (port == defaultPort) "" else ":$port"}"
}
