package org.lessoncue.tv

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject

private val Context.dataStore by preferencesDataStore("lessoncue_device")

class IdentityStore(private val context: Context) {
    private val screenId = stringPreferencesKey("screen_id")
    private val token = stringPreferencesKey("device_token")
    private val serverUrl = stringPreferencesKey("server_url")
    private val connectionDiagnostics = stringPreferencesKey("connection_diagnostics")

    suspend fun load(): DeviceIdentity? {
        val values = context.dataStore.data.first()
        val diagnostics = values[connectionDiagnostics]?.let(::parseDiagnostics)
        return DeviceIdentity(
            screenId = values[screenId] ?: return null,
            token = values[token] ?: return null,
            serverUrl = values[serverUrl] ?: return null,
            connectionDiagnostics = diagnostics
        )
    }

    suspend fun save(identity: DeviceIdentity) = context.dataStore.edit {
        it[screenId] = identity.screenId
        it[token] = identity.token
        it[serverUrl] = identity.serverUrl
        identity.connectionDiagnostics?.let { diagnostics -> it[connectionDiagnostics] = serializeDiagnostics(diagnostics) }
            ?: it.remove(connectionDiagnostics)
    }

    suspend fun clear() = context.dataStore.edit { it.clear() }

    private fun serializeDiagnostics(value: ConnectionDiagnostics): String = JSONObject()
        .put("requestedServerUrl", value.requestedServerUrl)
        .put("selectedEndpoint", value.selectedEndpoint)
        .put("candidates", JSONArray().apply {
            value.candidates.take(32).forEach { candidate ->
                put(JSONObject().put("endpoint", candidate.endpoint)
                    .put("source", candidate.source)
                    .put("addressFamily", candidate.addressFamily)
                    .put("outcome", candidate.outcome)
                    .put("reason", candidate.reason))
            }
        }).toString()

    private fun parseDiagnostics(value: String): ConnectionDiagnostics? = runCatching {
        val json = JSONObject(value)
        val candidates = json.optJSONArray("candidates")?.let { array ->
            (0 until array.length()).mapNotNull { index ->
                array.optJSONObject(index)?.let { candidate ->
                    EndpointAttempt(candidate.optString("endpoint"), candidate.optString("source"),
                        candidate.optString("addressFamily"), candidate.optString("outcome"),
                        candidate.optString("reason").takeIf(String::isNotBlank))
                }
            }
        }.orEmpty()
        ConnectionDiagnostics(
            json.optString("requestedServerUrl"),
            json.optString("selectedEndpoint").takeIf(String::isNotBlank), candidates
        )
    }.getOrNull()?.takeIf { it.requestedServerUrl.isNotBlank() }
}
