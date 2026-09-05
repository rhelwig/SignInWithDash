package org.siwd.authenticator.data

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.siwd.protocol.hexToBytes
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Fetches quorum public keys from Dash’s public trusted-context service
 * (same source Evo SDK prefetchTestnet / prefetchMainnet uses).
 *
 * Base URL is compile-time per product flavor:
 * - testnet: https://quorums.testnet.networks.dash.org
 * - mainnet: https://quorums.mainnet.networks.dash.org
 *
 * This lets the SIWD authenticator verify Platform proofs **without** a full
 * Core masternode-list sync and **without** a website proxy.
 */
object TrustedQuorumContext {
    private const val TAG = "SiwdQuorums"
    private val BASE: String get() = NetworkConfig.quorumBaseUrl
    private const val MAX_AGE_MS = 30 * 60 * 1000L

    private val http =
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .build()

    private data class Cache(
        val byHash: Map<String, ByteArray>,
        val dapiHosts: List<String>,
        val fetchedAtMs: Long,
    )

    private val cache = AtomicReference<Cache?>(null)

    @Synchronized
    fun ensureFresh(force: Boolean = false) {
        val cur = cache.get()
        if (!force && cur != null && System.currentTimeMillis() - cur.fetchedAtMs < MAX_AGE_MS) {
            return
        }
        refresh()
    }

    @Synchronized
    fun refresh() {
        Log.i(TAG, "Refreshing trusted quorum context from $BASE")
        val byHash = linkedMapOf<String, ByteArray>()
        parseQuorumList(getJson("$BASE/quorums"), byHash)
        parsePrevious(getJson("$BASE/previous"), byHash)
        val hosts = parseMasternodes(getJson("$BASE/masternodes"))
        val c =
            Cache(
                byHash = byHash.toMap(),
                dapiHosts = hosts,
                fetchedAtMs = System.currentTimeMillis(),
            )
        cache.set(c)
        Log.i(TAG, "Trusted context: ${byHash.size} quorums, ${hosts.size} masternode hosts")
    }

    fun getQuorumPublicKey(quorumHashBytes: ByteArray?): ByteArray? {
        if (quorumHashBytes == null || quorumHashBytes.isEmpty()) return null
        try {
            ensureFresh()
        } catch (e: Exception) {
            Log.w(TAG, "ensureFresh failed: ${e.message}")
        }
        val c = cache.get() ?: return null
        val hex = quorumHashBytes.joinToString("") { b -> "%02x".format(b) }.lowercase()
        val rev =
            quorumHashBytes
                .reversedArray()
                .joinToString("") { b -> "%02x".format(b) }
                .lowercase()
        return c.byHash[hex]
            ?: c.byHash[rev]
            ?: c.byHash[hex.removePrefix("0x")]
    }

    fun dapiHosts(): List<String> {
        try {
            ensureFresh()
        } catch (_: Exception) {
            /* use cache if any */
        }
        return cache.get()?.dapiHosts ?: emptyList()
    }

    fun status(): String {
        val c = cache.get()
        return if (c == null) {
            "not loaded"
        } else {
            "quorums=${c.byHash.size} hosts=${c.dapiHosts.size} ageMs=${System.currentTimeMillis() - c.fetchedAtMs}"
        }
    }

    private fun getJson(url: String): JSONObject {
        val req = Request.Builder().url(url).header("Accept", "application/json").get().build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) error("HTTP ${resp.code} for $url: ${text.take(200)}")
            return JSONObject(text)
        }
    }

    private fun parseQuorumList(root: JSONObject, into: MutableMap<String, ByteArray>) {
        if (!root.optBoolean("success", true) && root.has("success")) {
            Log.w(TAG, "quorums success=false: ${root.optString("message")}")
        }
        val data = root.optJSONArray("data") ?: return
        for (i in 0 until data.length()) {
            putQuorum(data.getJSONObject(i), into)
        }
    }

    private fun parsePrevious(root: JSONObject, into: MutableMap<String, ByteArray>) {
        val asArray = root.optJSONArray("data")
        if (asArray != null) {
            for (i in 0 until asArray.length()) {
                putQuorum(asArray.getJSONObject(i), into)
            }
            return
        }
        val data = root.optJSONObject("data") ?: return
        val arr = data.optJSONArray("quorums") ?: return
        for (i in 0 until arr.length()) {
            putQuorum(arr.getJSONObject(i), into)
        }
    }

    private fun putQuorum(o: JSONObject, into: MutableMap<String, ByteArray>) {
        val hash = o.optString("quorum_hash", "").lowercase().removePrefix("0x")
        val key = o.optString("key", "").lowercase().removePrefix("0x")
        if (hash.length != 64 || key.length < 64) return
        try {
            into[hash] = hexToBytes(key)
        } catch (e: Exception) {
            Log.w(TAG, "bad quorum entry: ${e.message}")
        }
    }

    private fun parseMasternodes(root: JSONObject): List<String> {
        val data = root.optJSONArray("data") ?: return emptyList()
        val out = mutableListOf<String>()
        for (i in 0 until data.length()) {
            val o = data.getJSONObject(i)
            if (o.optString("status", "").uppercase() != "ENABLED") continue
            val address = o.optString("address", "") // host:port core p2p
            if (address.isBlank()) continue
            // DAPI typically on same host; dashj expects host or host:port for HP list
            val host = address.substringBefore(":")
            if (host.isNotBlank()) out.add(host)
        }
        return out.distinct()
    }
}
