package org.siwd.authenticator.data

import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.os.Process
import android.util.Log
import org.siwd.protocol.Bip39
import org.siwd.protocol.IdentityDerivation
import org.siwd.protocol.Network
import org.siwd.protocol.SiwdSigner
import org.siwd.protocol.bytesToHex
import org.siwd.protocol.hexToBytes

/**
 * Runs native dash-sdk / DAPI work in a **separate process** (`:platform`).
 *
 * libsdklib can SIGABRT (uncatchable). Isolating it means the main authenticator
 * UI process survives and can show an error instead of disappearing.
 *
 * Still **phone ↔ Platform only** — no website proxy.
 */
class PlatformRemoteService : Service() {
    companion object {
        private const val TAG = "SiwdPlatformSvc"

        const val MSG_DISCOVER = 1
        const val MSG_RESULT = 2
        const val MSG_ERROR = 3

        const val KEY_PHRASE = "phrase"
        const val KEY_PASSPHRASE = "passphrase"
        const val KEY_HINT = "hint"
        const val KEY_MAX_IDX = "maxIdx"
        const val KEY_ERROR = "error"
        const val KEY_COUNT = "count"
        const val KEY_PREFIX = "item_"
    }

    private val handler =
        object : Handler(Looper.getMainLooper()) {
            override fun handleMessage(msg: Message) {
                when (msg.what) {
                    MSG_DISCOVER -> {
                        val replyTo = msg.replyTo
                        val data = msg.data
                        Thread {
                            try {
                                val result =
                                    discover(
                                        phrase = data.getString(KEY_PHRASE).orEmpty(),
                                        passphrase = data.getString(KEY_PASSPHRASE).orEmpty(),
                                        hintName = data.getString(KEY_HINT),
                                        maxIdentityIndex = data.getInt(KEY_MAX_IDX, 5),
                                    )
                                val out = Message.obtain(null, MSG_RESULT)
                                out.data = packResult(result)
                                replyTo?.send(out)
                            } catch (t: Throwable) {
                                Log.e(TAG, "discover failed", t)
                                val out = Message.obtain(null, MSG_ERROR)
                                out.data =
                                    Bundle().apply {
                                        putString(
                                            KEY_ERROR,
                                            t.message ?: t.javaClass.simpleName,
                                        )
                                    }
                                try {
                                    replyTo?.send(out)
                                } catch (_: Exception) {
                                    // client gone
                                }
                            }
                        }.start()
                    }
                    else -> super.handleMessage(msg)
                }
            }
        }

    private val messenger = Messenger(handler)

    override fun onBind(intent: Intent?): IBinder = messenger.binder

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Platform process started pid=${Process.myPid()}")
    }

    private data class Found(
        val identityIndex: Int,
        val keyId: Int,
        val identityId: String,
        val names: List<String>,
        val privateKeyHex: String,
        val publicKeyHex: String,
    )

    private fun packResult(items: List<Found>): Bundle {
        val b = Bundle()
        b.putInt(KEY_COUNT, items.size)
        items.forEachIndexed { i, it ->
            val p = "$KEY_PREFIX$i"
            b.putInt("${p}_idx", it.identityIndex)
            b.putInt("${p}_keyId", it.keyId)
            b.putString("${p}_id", it.identityId)
            b.putStringArrayList("${p}_names", ArrayList(it.names))
            b.putString("${p}_priv", it.privateKeyHex)
            b.putString("${p}_pub", it.publicKeyHex)
        }
        return b
    }

    private fun discover(
        phrase: String,
        passphrase: String,
        hintName: String?,
        maxIdentityIndex: Int,
    ): List<Found> {
        val network = Network.TESTNET
        val normalized =
            phrase.trim().lowercase().replace(Regex("\\s+"), " ")
        require(Bip39.validateMnemonic(normalized)) {
            "Invalid recovery phrase"
        }
        val seed = Bip39.mnemonicToSeed(normalized, passphrase)

        data class Cand(
            val identityIndex: Int,
            val keyId: Int,
            val priv: ByteArray,
            val pub: ByteArray,
            val hash: ByteArray,
        )

        val candidates = mutableListOf<Cand>()
        for (idx in 0..maxIdentityIndex) {
            for (keyId in 0..5) {
                val priv = IdentityDerivation.derivePrivateKey(seed, network, idx, keyId)
                val pub = SiwdSigner.publicKeyCompressed(priv)
                val h = IdentityDerivation.publicKeyHash160(pub)
                candidates.add(Cand(idx, keyId, priv, pub, h))
            }
        }

        try {
            TrustedQuorumContext.ensureFresh()
        } catch (e: Exception) {
            Log.w(TAG, "quorum prefetch: ${e.message}")
        }

        val hint = hintName?.trim()?.takeIf { it.isNotEmpty() }
        if (hint != null) {
            val byName = discoverByName(hint, seed, network, maxIdentityIndex)
            if (byName.isNotEmpty()) return byName
        }

        val out = mutableListOf<Found>()
        val seen = mutableSetOf<String>()
        val uniqueByHash = linkedMapOf<String, Cand>()
        for (c in candidates) uniqueByHash.putIfAbsent(bytesToHex(c.hash), c)

        var lastErr: Exception? = null
        for ((_, c) in uniqueByHash) {
            val identity =
                try {
                    OnDevicePlatform.getIdentityByPublicKeyHash(c.hash)
                } catch (e: Exception) {
                    lastErr = e
                    null
                } ?: continue
            val identityId = identity.id.toString()
            if (!seen.add(identityId)) continue
            val match = matchKeys(identity, seed, network, maxIdentityIndex) ?: continue
            val names = OnDevicePlatform.usernamesForIdentity(identityId)
            out.add(
                Found(
                    identityIndex = match.first,
                    keyId = match.second,
                    identityId = identityId,
                    names = names.ifEmpty { listOf("unnamed.dash") },
                    privateKeyHex = bytesToHex(match.third),
                    publicKeyHex = bytesToHex(match.fourth),
                ),
            )
        }
        if (out.isEmpty() && lastErr != null) throw lastErr
        if (out.isEmpty()) {
            error(
                "No Platform identities found for derived keys " +
                    "(indexes 0–$maxIdentityIndex). Use a testnet phrase with an " +
                    "existing identity, and try DPNS name assist.",
            )
        }
        return out
    }

    private fun discoverByName(
        hint: String,
        seed: ByteArray,
        network: Network,
        maxIdentityIndex: Int,
    ): List<Found> {
        val label = hint.replace(Regex("\\.dash$", RegexOption.IGNORE_CASE), "")
        val identityId = OnDevicePlatform.resolveName(label) ?: return emptyList()
        val identity = OnDevicePlatform.getIdentity(identityId) ?: return emptyList()
        val match = matchKeys(identity, seed, network, maxIdentityIndex) ?: return emptyList()
        val names =
            OnDevicePlatform.usernamesForIdentity(identityId).ifEmpty {
                listOf(if (label.endsWith(".dash")) label else "$label.dash")
            }
        return listOf(
            Found(
                identityIndex = match.first,
                keyId = match.second,
                identityId = identityId,
                names = names,
                privateKeyHex = bytesToHex(match.third),
                publicKeyHex = bytesToHex(match.fourth),
            ),
        )
    }

    private fun matchKeys(
        identity: org.dashj.platform.dpp.identity.Identity,
        seed: ByteArray,
        network: Network,
        maxIdentityIndex: Int,
    ): Quadruple? {
        for (key in identity.publicKeys) {
            if (key.disabledAt != null) continue
            val purposeOk =
                key.purpose.name.contains("AUTH", ignoreCase = true) ||
                    key.purpose == org.dashj.platform.sdk.Purpose.AUTHENTICATION
            if (!purposeOk) continue
            if (key.securityLevel.name.contains("MASTER", ignoreCase = true)) continue
            for (idx in 0..maxIdentityIndex) {
                val priv = IdentityDerivation.derivePrivateKey(seed, network, idx, key.id)
                val pub = SiwdSigner.publicKeyCompressed(priv)
                if (pub.contentEquals(key.data)) {
                    return Quadruple(idx, key.id, priv, pub)
                }
                val h = IdentityDerivation.publicKeyHash160(pub)
                if (IdentityDerivation.publicKeyHash160(key.data).contentEquals(h)) {
                    return Quadruple(idx, key.id, priv, pub)
                }
            }
        }
        return null
    }

    private data class Quadruple(
        val first: Int,
        val second: Int,
        val third: ByteArray,
        val fourth: ByteArray,
    )
}
