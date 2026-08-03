package org.siwd.authenticator.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.siwd.protocol.Bip39
import org.siwd.protocol.IdentityDerivation
import org.siwd.protocol.Network
import org.siwd.protocol.SiwdSigner
import org.siwd.protocol.bytesToHex
import java.util.concurrent.TimeUnit

/**
 * Discovers Platform identities from a mnemonic by deriving HIGH auth keys
 * and querying a Platform discovery HTTP proxy (demo-web or future gateway).
 *
 * Private keys never leave the device; only public key hashes are sent.
 */
class PlatformDiscovery(
    private val proxyBaseUrl: String,
    private val http: OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .build(),
) {
    data class Discovered(
        val identityIndex: Int,
        val keyId: Int,
        val identityId: String,
        val fullDpnsNames: List<String>,
        val privateKey: ByteArray,
        val publicKey: ByteArray,
    )

    fun discoverFromMnemonic(
        phrase: String,
        maxIdentityIndex: Int = 5,
        network: Network = Network.TESTNET,
    ): List<Discovered> {
        require(Bip39.validateMnemonic(phrase)) { "Invalid recovery phrase" }
        val seed = Bip39.mnemonicToSeed(phrase)
        val candidates = mutableListOf<Pair<Int, ByteArray>>() // identityIndex to priv
        val hashes = mutableListOf<String>()
        val hashToMeta = mutableMapOf<String, Pair<Int, ByteArray>>()

        for (idx in 0..maxIdentityIndex) {
            // Prefer HIGH key id 2; also probe 3+ for extra HIGH keys
            for (keyId in listOf(2, 3, 4, 5)) {
                val priv =
                    IdentityDerivation.derivePrivateKey(seed, network, idx, keyId)
                val pub = SiwdSigner.publicKeyCompressed(priv)
                val h = bytesToHex(IdentityDerivation.publicKeyHash160(pub))
                hashes.add(h)
                hashToMeta[h] = idx to priv
                // only need one key per identity index for discovery probe set
                if (keyId == 2) candidates.add(idx to priv)
            }
        }

        val body =
            JSONObject()
                .put("publicKeyHashes", JSONArray(hashes.distinct()))
                .toString()
        val req =
            Request.Builder()
                .url(proxyBaseUrl.trimEnd('/') + "/dash-auth/v1/platform/discover")
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

        val responseJson =
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) error("Platform discover failed ${resp.code}: $text")
                JSONObject(text)
            }

        val identities = responseJson.optJSONArray("identities") ?: JSONArray()
        val out = mutableListOf<Discovered>()

        for (i in 0 until identities.length()) {
            val idObj = identities.getJSONObject(i)
            val identityId = idObj.getString("identityId")
            val namesArr = idObj.optJSONArray("usernames") ?: JSONArray()
            val names =
                (0 until namesArr.length()).map { namesArr.getString(it) }.map {
                    if (it.endsWith(".dash")) it else "$it.dash"
                }
            val keys = idObj.optJSONArray("keys") ?: JSONArray()
            // Find a HIGH auth key we can derive
            var matched: Discovered? = null
            for (ki in 0 until keys.length()) {
                val k = keys.getJSONObject(ki)
                val keyId = k.optInt("id", k.optInt("keyId", -1))
                val level = k.optString("securityLevel", k.optString("level", "")).uppercase()
                val purpose = k.optString("purpose", k.optString("keyPurpose", "")).uppercase()
                val disabled = k.optBoolean("disabled", false)
                if (disabled) continue
                if (!purpose.contains("AUTH")) continue
                if (!level.contains("HIGH")) continue
                // Try identity indices we derived
                for (idx in 0..maxIdentityIndex) {
                    val priv =
                        IdentityDerivation.derivePrivateKey(seed, network, idx, keyId)
                    val pub = SiwdSigner.publicKeyCompressed(priv)
                    val pubHex = bytesToHex(pub)
                    val reported = k.optString("publicKeyHex", "").lowercase()
                    if (reported.isNotEmpty() && reported != pubHex) continue
                    // If no reported key, accept first HIGH we can derive for this id via hash match
                    matched =
                        Discovered(
                            identityIndex = idx,
                            keyId = keyId,
                            identityId = identityId,
                            fullDpnsNames = names,
                            privateKey = priv,
                            publicKey = pub,
                        )
                    break
                }
                if (matched != null) break
            }
            // Fallback: identity index from hash map
            if (matched == null) {
                val found = responseJson.optJSONArray("found") ?: JSONArray()
                for (fi in 0 until found.length()) {
                    val f = found.getJSONObject(fi)
                    val ids = f.optJSONArray("identityIds") ?: continue
                    var owns = false
                    for (j in 0 until ids.length()) {
                        if (ids.getString(j) == identityId) owns = true
                    }
                    if (!owns) continue
                    val h = f.getString("publicKeyHash")
                    val meta = hashToMeta[h] ?: continue
                    val priv = meta.second
                    val pub = SiwdSigner.publicKeyCompressed(priv)
                    matched =
                        Discovered(
                            identityIndex = meta.first,
                            keyId = 2,
                            identityId = identityId,
                            fullDpnsNames = names,
                            privateKey = priv,
                            publicKey = pub,
                        )
                    break
                }
            }
            if (matched != null) out.add(matched)
        }
        return out.distinctBy { it.identityId }
    }

    fun resolveName(name: String): String? {
        val label = name.replace(Regex("\\.dash$", RegexOption.IGNORE_CASE), "")
        val req =
            Request.Builder()
                .url(
                    proxyBaseUrl.trimEnd('/') +
                        "/dash-auth/v1/platform/resolve?name=" +
                        java.net.URLEncoder.encode(label, "UTF-8"),
                )
                .get()
                .build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) return null
            val o = JSONObject(text)
            return if (o.isNull("identityId")) null else o.getString("identityId")
        }
    }
}
