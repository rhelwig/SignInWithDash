package org.siwd.authenticator.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Sites this device has successfully signed into (SIWD).
 * Used to re-open relying-party sites from the authenticator on the same device.
 *
 * Stores origin + domain + last used identity/name — not session cookies.
 * Opening a site starts a normal browser session; the user may still need to
 * complete a fresh SIWD login if the browser has no cookie.
 */
class KnownSitesStore(context: Context) {
    data class Site(
        val origin: String,
        val domain: String,
        val identityId: String,
        val dpnsName: String,
        val lastUsedAtMs: Long,
        val loginCount: Int,
    ) {
        val openUrl: String
            get() {
                val base = origin.trimEnd('/')
                return base.ifBlank { "https://$domain" }
            }
    }

    private val prefs =
        context.getSharedPreferences("siwd_known_sites", Context.MODE_PRIVATE)

    fun list(): List<Site> {
        val raw = prefs.getString(KEY, "[]") ?: "[]"
        val arr = JSONArray(raw)
        val out = mutableListOf<Site>()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(
                Site(
                    origin = o.getString("origin"),
                    domain = o.optString("domain", originHost(o.getString("origin"))),
                    identityId = o.optString("identityId", ""),
                    dpnsName = o.optString("dpnsName", ""),
                    lastUsedAtMs = o.optLong("lastUsedAtMs", 0L),
                    loginCount = o.optInt("loginCount", 1),
                ),
            )
        }
        return out.sortedByDescending { it.lastUsedAtMs }
    }

    /**
     * Record a successful approve. Same origin + identity updates last-used
     * and increments login count.
     */
    fun recordLogin(
        origin: String,
        domain: String,
        identityId: String,
        dpnsName: String,
        nowMs: Long = System.currentTimeMillis(),
    ) {
        val normOrigin = origin.trim().trimEnd('/')
        if (normOrigin.isEmpty()) return
        val sites = list().toMutableList()
        val idx =
            sites.indexOfFirst {
                it.origin.equals(normOrigin, ignoreCase = true) &&
                    it.identityId == identityId
            }
        if (idx >= 0) {
            val prev = sites[idx]
            sites[idx] =
                prev.copy(
                    domain = domain.ifBlank { prev.domain },
                    dpnsName = dpnsName.ifBlank { prev.dpnsName },
                    lastUsedAtMs = nowMs,
                    loginCount = prev.loginCount + 1,
                )
        } else {
            sites.add(
                Site(
                    origin = normOrigin,
                    domain = domain.ifBlank { originHost(normOrigin) },
                    identityId = identityId,
                    dpnsName = dpnsName,
                    lastUsedAtMs = nowMs,
                    loginCount = 1,
                ),
            )
        }
        // Cap history so prefs stay small
        val trimmed = sites.sortedByDescending { it.lastUsedAtMs }.take(MAX_SITES)
        saveAll(trimmed)
    }

    fun remove(origin: String, identityId: String) {
        val normOrigin = origin.trim().trimEnd('/')
        saveAll(
            list().filterNot {
                it.origin.equals(normOrigin, ignoreCase = true) && it.identityId == identityId
            },
        )
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private fun saveAll(sites: List<Site>) {
        val arr = JSONArray()
        for (s in sites) {
            arr.put(
                JSONObject()
                    .put("origin", s.origin)
                    .put("domain", s.domain)
                    .put("identityId", s.identityId)
                    .put("dpnsName", s.dpnsName)
                    .put("lastUsedAtMs", s.lastUsedAtMs)
                    .put("loginCount", s.loginCount),
            )
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    companion object {
        private const val KEY = "sites_v1"
        private const val MAX_SITES = 40

        fun originHost(origin: String): String =
            try {
                java.net.URI(origin).host ?: origin
            } catch (_: Exception) {
                origin
            }
    }
}
