package org.lessoncue.tv

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.dataStore by preferencesDataStore("lessoncue_device")

class IdentityStore(private val context: Context) {
    private val screenId = stringPreferencesKey("screen_id")
    private val token = stringPreferencesKey("device_token")
    private val serverUrl = stringPreferencesKey("server_url")

    suspend fun load(): DeviceIdentity? {
        val values = context.dataStore.data.first()
        return DeviceIdentity(
            screenId = values[screenId] ?: return null,
            token = values[token] ?: return null,
            serverUrl = values[serverUrl] ?: return null
        )
    }

    suspend fun save(identity: DeviceIdentity) = context.dataStore.edit {
        it[screenId] = identity.screenId
        it[token] = identity.token
        it[serverUrl] = identity.serverUrl
    }

    suspend fun clear() = context.dataStore.edit { it.clear() }
}
