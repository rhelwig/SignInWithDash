package org.siwd.authenticator.data

import android.content.Context

/**
 * Remember last Dash name used per relying-party origin + identity.
 * Canonical storage keeps full name (e.g. alice.dash).
 */
class SiteNamePrefs(context: Context) {
    private val prefs =
        context.getSharedPreferences("siwd_site_names", Context.MODE_PRIVATE)

    private fun key(origin: String, identityId: String): String =
        "name:${origin.trim().lowercase()}|$identityId"

    fun getLastName(origin: String, identityId: String): String? =
        prefs.getString(key(origin, identityId), null)

    fun setLastName(origin: String, identityId: String, fullDpnsName: String) {
        prefs.edit().putString(key(origin, identityId), fullDpnsName).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
