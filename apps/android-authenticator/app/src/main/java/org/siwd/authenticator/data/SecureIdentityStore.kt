package org.siwd.authenticator.data

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import org.siwd.protocol.bytesToHex
import org.siwd.protocol.hexToBytes
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.MGF1ParameterSpec
import javax.crypto.Cipher
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource

/** Public metadata plus RSA-wrapped signing keys. Private decryption requires a
 * fresh OS authentication for each operation; listing never decrypts secrets. */
class SecureIdentityStore(private val context: Context) {
    data class StoredIdentity(
        val identityId: String, val identityIndex: Int, val keyId: Int,
        val fullDpnsNames: List<String>, val wrappedKey: String, val publicKeyHex: String,
    )
    private val prefs = context.getSharedPreferences("siwd_identities_v2", Context.MODE_PRIVATE)
    private val keystore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private val oaep = OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT)

    private fun ensureKey() {
        if (keystore.containsAlias(ALIAS)) return
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(2048).setDigests(KeyProperties.DIGEST_SHA256)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
            .setUserAuthenticationRequired(true)
        if (Build.VERSION.SDK_INT >= 30) {
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL)
        } else {
            @Suppress("DEPRECATION")
            spec.setUserAuthenticationValidityDurationSeconds(-1)
        }
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore").apply {
            initialize(spec.build()); generateKeyPair()
        }
    }

    fun wrap(identityId: String, identityIndex: Int, keyId: Int, names: List<String>, privateKey: ByteArray, publicKey: ByteArray): StoredIdentity {
        try {
            require(privateKey.size == 32)
            ensureKey()
            val cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding")
            val wrappingPublicKey = java.security.KeyFactory.getInstance("RSA").generatePublic(java.security.spec.X509EncodedKeySpec(keystore.getCertificate(ALIAS).publicKey.encoded))
            cipher.init(Cipher.ENCRYPT_MODE, wrappingPublicKey, oaep)
            return StoredIdentity(identityId, identityIndex, keyId, names,
                Base64.encodeToString(cipher.doFinal(privateKey), Base64.NO_WRAP), bytesToHex(publicKey))
        } finally { privateKey.fill(0) }
    }

    fun decryptionCipher(): Cipher {
        check(keystore.containsAlias(ALIAS)) { "Signing key unavailable. Reimport your identity." }
        return Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding").apply {
            init(Cipher.DECRYPT_MODE, keystore.getKey(ALIAS, null), oaep)
        }
    }

    fun decrypt(identity: StoredIdentity, authenticatedCipher: Cipher): ByteArray =
        authenticatedCipher.doFinal(Base64.decode(identity.wrappedKey, Base64.NO_WRAP)).also {
            require(it.size == 32) { "Invalid stored signing key" }
        }

    var storageError: String? = null
        private set

    fun list(): List<StoredIdentity> = try {
        storageError = null
        readIdentities()
    } catch (_: Exception) {
        storageError = "Stored signing keys are unavailable. Enable device security and retry, or clear the imported identities and import them again."
        emptyList()
    }

    private fun readIdentities(): List<StoredIdentity> {
        migrateLegacy()
        val arr = JSONArray(prefs.getString(KEY, "[]"))
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i); val names = o.getJSONArray("names")
            StoredIdentity(o.getString("identityId"), o.getInt("identityIndex"), o.getInt("keyId"),
                (0 until names.length()).map { names.getString(it) }, o.getString("wrappedKey"), o.getString("publicKeyHex"))
        }
    }

    fun saveAll(identities: List<StoredIdentity>) {
        check(storageError == null) { "Clear unavailable imported identities before importing again." }
        val arr = JSONArray()
        for (id in identities) arr.put(JSONObject().put("identityId", id.identityId)
            .put("identityIndex", id.identityIndex).put("keyId", id.keyId)
            .put("names", JSONArray(id.fullDpnsNames)).put("wrappedKey", id.wrappedKey).put("publicKeyHex", id.publicKeyHex))
        check(prefs.edit().putString(KEY, arr.toString()).commit()) { "Could not save identities" }
    }

    private fun migrateLegacy() {
        // Only this one-time migration reads the old plaintext representation.
        // Commit the complete wrapped replacement before deleting the old store.
        if (prefs.getBoolean("migrated", false)) return
        val oldFile = java.io.File(context.applicationInfo.dataDir, "shared_prefs/siwd_identities_enc.xml")
        if (oldFile.exists()) {
            val old = EncryptedSharedPreferences.create(context, "siwd_identities_enc",
                MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
            val arr = JSONArray(old.getString("identities_v1", "[]"))
            val migrated = (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i); val names = o.getJSONArray("names")
                wrap(o.getString("identityId"), o.getInt("identityIndex"), o.getInt("keyId"),
                    (0 until names.length()).map { names.getString(it) }, hexToBytes(o.getString("privateKeyHex")), hexToBytes(o.getString("publicKeyHex")))
            }
            if (migrated.isNotEmpty()) saveAll(migrated)
            check(old.edit().clear().commit()) { "Could not remove legacy key storage" }
        }
        check(prefs.edit().putBoolean("migrated", true).commit())
    }

    fun clear() {
        context.deleteSharedPreferences("siwd_identities_enc")
        check(prefs.edit().clear().putBoolean("migrated", true).commit())
        if (keystore.containsAlias(ALIAS)) keystore.deleteEntry(ALIAS)
    }
    companion object { private const val KEY = "identities"; private const val ALIAS = "siwd_signing_wrap_v2" }
}
