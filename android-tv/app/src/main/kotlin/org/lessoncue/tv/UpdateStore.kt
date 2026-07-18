package org.lessoncue.tv

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.updateDataStore by preferencesDataStore("lessoncue_updates")

interface UpdatePreferencesStore {
    suspend fun load(): UpdatePreferences
    suspend fun recordSuccessfulAutomaticCheck(atMillis: Long = System.currentTimeMillis())
    suspend fun dismiss(versionCode: Long)
    suspend fun clearDismissal()
}

class UpdateStore(private val context: Context) : UpdatePreferencesStore {
    private val lastSuccessfulAutomaticCheck = longPreferencesKey("last_successful_automatic_check")
    private val dismissedVersionCode = longPreferencesKey("dismissed_version_code")

    override suspend fun load(): UpdatePreferences {
        val values = context.updateDataStore.data.first()
        return UpdatePreferences(
            lastSuccessfulAutomaticCheckMillis = values[lastSuccessfulAutomaticCheck],
            dismissedVersionCode = values[dismissedVersionCode]
        )
    }

    override suspend fun recordSuccessfulAutomaticCheck(atMillis: Long) {
        context.updateDataStore.edit { it[lastSuccessfulAutomaticCheck] = atMillis }
    }

    override suspend fun dismiss(versionCode: Long) {
        context.updateDataStore.edit { it[dismissedVersionCode] = versionCode }
    }

    override suspend fun clearDismissal() {
        context.updateDataStore.edit { it.remove(dismissedVersionCode) }
    }
}
