package org.siwd.authenticator.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import org.siwd.protocol.bytesToHex
import org.siwd.protocol.hexToBytes

/**
 * Encrypted storage for discovered SIWD signing keys.
 * Mnemonics are never persisted after import — only derived HIGH auth keys.
 */
class SecureIdentityStore(context: Context) {
    data class StoredIdentity(
        val identityId: String,
        val identityIndex: Int,
        val keyId: Int,
        val fullDpnsNames: List<String>,
        val privateKeyHex: String,
        val publicKeyHex: String,
    )

    private val prefs =
        EncryptedSharedPreferences.create(
            context,
            "siwd_identities_enc",
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    fun list(): List<StoredIdentity> {
        val raw = prefs.getString(KEY, "[]") ?: "[]"
        val arr = JSONArray(raw)
        val out = mutableListOf<StoredIdentity>()
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val namesArr = o.optJSONArray("names") ?: JSONArray()
            val names = (0 until namesArr.length()).map { namesArr.getString(it) }
            out.add(
                StoredIdentity(
                    identityId = o.getString("identityId"),
                    identityIndex = o.getInt("identityIndex"),
                    keyId = o.getInt("keyId"),
                    fullDpnsNames = names,
                    privateKeyHex = o.getString("privateKeyHex"),
                    publicKeyHex = o.getString("publicKeyHex"),
                ),
            )
        }
        return out
    }

    fun saveAll(identities: List<StoredIdentity>) {
        val arr = JSONArray()
        for (id in identities) {
            val names = JSONArray()
            id.fullDpnsNames.forEach { names.put(it) }
            arr.put(
                JSONObject()
                    .put("identityId", id.identityId)
                    .put("identityIndex", id.identityIndex)
                    .put("keyId", id.keyId)
                    .put("names", names)
                    .put("privateKeyHex", id.privateKeyHex)
                    .put("publicKeyHex", id.publicKeyHex),
            )
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    fun privateKeyBytes(id: StoredIdentity): ByteArray = hexToBytes(id.privateKeyHex)

    companion object {
        private const val KEY = "identities_v1"

        fun ofKeys(
            identityId: String,
            identityIndex: Int,
            keyId: Int,
            names: List<String>,
            privateKey: ByteArray,
            publicKey: ByteArray,
        ): StoredIdentity =
            StoredIdentity(
                identityId = identityId,
                identityIndex = identityIndex,
                keyId = keyId,
                fullDpnsNames = names,
                privateKeyHex = bytesToHex(privateKey),
                publicKeyHex = bytesToHex(publicKey),
            )
    }
}
