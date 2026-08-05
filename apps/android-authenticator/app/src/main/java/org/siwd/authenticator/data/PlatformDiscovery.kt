package org.siwd.authenticator.data

import android.util.Log
import org.siwd.protocol.Bip39
import org.siwd.protocol.IdentityDerivation
import org.siwd.protocol.Network
import org.siwd.protocol.SiwdSigner
import org.siwd.protocol.bytesToHex

/**
 * Discovers Platform identities from a mnemonic by deriving HIGH auth keys.
 *
 * ## Strategy (phone ↔ Platform only)
 * 1. Optional **DPNS name assist** — resolve name, fetch identity, match keys locally.
 * 2. **On-device DAPI** public-key-hash lookup via [OnDevicePlatform] (trusted quorum
 *    context from Dash’s public `quorums.testnet.networks.dash.org` service).
 *
 * There is **no website proxy**. Private keys never leave the device; only public
 * key hashes or a name leave for network lookup.
 */
class PlatformDiscovery {
    companion object {
        private const val TAG = "SiwdDiscovery"
    }

    data class Discovered(
        val identityIndex: Int,
        val keyId: Int,
        val identityId: String,
        val fullDpnsNames: List<String>,
        val privateKey: ByteArray,
        val publicKey: ByteArray,
    )

    private data class Cand(
        val identityIndex: Int,
        val keyId: Int,
        val priv: ByteArray,
        val pub: ByteArray,
        val hash: ByteArray,
    )

    fun discoverFromMnemonic(
        phrase: String,
        maxIdentityIndex: Int = 5,
        network: Network = Network.TESTNET,
        hintName: String? = null,
        /** Optional BIP-39 passphrase (sometimes called the 13th/25th word). Empty = none. */
        passphrase: String = "",
    ): List<Discovered> {
        require(network == Network.TESTNET) {
            "This authenticator build is testnet-only"
        }
        val normalized =
            phrase
                .trim()
                .lowercase()
                .replace(Regex("\\s+"), " ")
        require(Bip39.validateMnemonic(normalized)) {
            "Invalid recovery phrase — enter BIP-39 words in order, separated by a single space"
        }
        val seed = Bip39.mnemonicToSeed(normalized, passphrase)

        val candidates = mutableListOf<Cand>()
        for (idx in 0..maxIdentityIndex) {
            for (keyId in 0..5) {
                val priv = IdentityDerivation.derivePrivateKey(seed, network, idx, keyId)
                val pub = SiwdSigner.publicKeyCompressed(priv)
                val h = IdentityDerivation.publicKeyHash160(pub)
                candidates.add(Cand(idx, keyId, priv, pub, h))
            }
        }

        val errors = mutableListOf<String>()
        val hint = hintName?.trim()?.takeIf { it.isNotEmpty() }

        // Prefetch trusted quorums early so proof verification can succeed.
        try {
            TrustedQuorumContext.ensureFresh()
            Log.i(TAG, "Trusted quorums: ${TrustedQuorumContext.status()}")
        } catch (e: Exception) {
            Log.w(TAG, "Trusted quorum prefetch: ${e.message}")
            errors.add("trusted-quorums: ${e.message}")
        }

        if (hint != null) {
            try {
                val byName = discoverByNameHint(hint, seed, network, maxIdentityIndex)
                if (byName.isNotEmpty()) {
                    Log.i(TAG, "Name-assisted discovery found ${byName.size}")
                    return byName
                }
                errors.add("name-assist: no key match for \"$hint\"")
            } catch (e: Exception) {
                Log.w(TAG, "Name-assisted discovery failed: ${e.message}", e)
                errors.add("name-assist: ${e.javaClass.simpleName}: ${e.message}")
            }
        }

        try {
            val found = discoverOnDevice(candidates, seed, network, maxIdentityIndex)
            if (found.isNotEmpty()) {
                Log.i(TAG, "On-device discovery found ${found.size}")
                return found
            }
            errors.add("on-device: no matching identity for derived keys")
        } catch (e: Throwable) {
            Log.w(TAG, "On-device discovery failed: ${e.message}", e)
            errors.add("on-device: ${e.javaClass.simpleName}: ${e.message}")
        }

        error(
            "No Platform identities found for this phrase.\n\n" +
                "Checked identity indexes 0–$maxIdentityIndex and key ids 0–5 " +
                "(path m/9'/1'/5'/0'/0'/i'/k') via on-device testnet DAPI.\n" +
                "• Use the recovery phrase that created the testnet identity in DashPay.\n" +
                "• Create/finish identity + username on testnet first if needed.\n" +
                "• Optional: enter your DPNS name to assist discovery.\n" +
                "• Device needs network access to testnet Platform and " +
                "quorums.testnet.networks.dash.org\n\n" +
                "Details:\n" + errors.joinToString("\n"),
        )
    }

    private fun discoverByNameHint(
        hintName: String,
        seed: ByteArray,
        network: Network,
        maxIdentityIndex: Int,
    ): List<Discovered> {
        val label = hintName.replace(Regex("\\.dash$", RegexOption.IGNORE_CASE), "")
        val identityId = OnDevicePlatform.resolveName(label) ?: return emptyList()
        val identity = OnDevicePlatform.getIdentity(identityId) ?: return emptyList()
        val match = matchIdentityKeys(identity, seed, network, maxIdentityIndex) ?: return emptyList()
        val names =
            OnDevicePlatform.usernamesForIdentity(identityId).ifEmpty {
                listOf(if (label.endsWith(".dash")) label else "$label.dash")
            }
        return listOf(
            Discovered(
                identityIndex = match.identityIndex,
                keyId = match.keyId,
                identityId = identityId,
                fullDpnsNames = names,
                privateKey = match.priv,
                publicKey = match.pub,
            ),
        )
    }

    private fun discoverOnDevice(
        candidates: List<Cand>,
        seed: ByteArray,
        network: Network,
        maxIdentityIndex: Int,
    ): List<Discovered> {
        val out = mutableListOf<Discovered>()
        val seenIds = mutableSetOf<String>()
        var lastError: Exception? = null
        var lookups = 0
        var hits = 0

        val uniqueByHash = linkedMapOf<String, Cand>()
        for (c in candidates) {
            uniqueByHash.putIfAbsent(bytesToHex(c.hash), c)
        }

        for ((_, c) in uniqueByHash) {
            lookups++
            val identity =
                try {
                    OnDevicePlatform.getIdentityByPublicKeyHash(c.hash)
                } catch (e: Exception) {
                    lastError = e
                    null
                } ?: continue
            hits++
            val identityId = identity.id.toString()
            if (!seenIds.add(identityId)) continue

            val match = matchIdentityKeys(identity, seed, network, maxIdentityIndex) ?: continue
            val names = OnDevicePlatform.usernamesForIdentity(identityId)
            out.add(
                Discovered(
                    identityIndex = match.identityIndex,
                    keyId = match.keyId,
                    identityId = identityId,
                    fullDpnsNames = names.ifEmpty { listOf("unnamed.dash") },
                    privateKey = match.priv,
                    publicKey = match.pub,
                ),
            )
        }
        if (out.isEmpty() && lastError != null && hits == 0) {
            throw lastError
        }
        Log.i(
            TAG,
            "On-device discovery: lookups=$lookups hits=$hits identities=${out.size}",
        )
        return out
    }

    private data class MatchedKey(
        val identityIndex: Int,
        val keyId: Int,
        val priv: ByteArray,
        val pub: ByteArray,
    )

    private fun matchIdentityKeys(
        identity: org.dashj.platform.dpp.identity.Identity,
        seed: ByteArray,
        network: Network,
        maxIdentityIndex: Int,
    ): MatchedKey? {
        val ordered =
            identity.publicKeys.sortedBy { key ->
                when {
                    OnDevicePlatform.isEligibleSiwdKey(key) -> 0
                    key.securityLevel.name.contains("HIGH", ignoreCase = true) -> 1
                    key.securityLevel.name.contains("CRITICAL", ignoreCase = true) -> 2
                    else -> 3
                }
            }
        for (key in ordered) {
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
                    return MatchedKey(idx, key.id, priv, pub)
                }
                val h = IdentityDerivation.publicKeyHash160(pub)
                if (IdentityDerivation.publicKeyHash160(key.data).contentEquals(h)) {
                    return MatchedKey(idx, key.id, priv, pub)
                }
            }
        }
        return null
    }

    /** Resolve DPNS name via on-device DAPI only. */
    fun resolveName(name: String): String? =
        try {
            OnDevicePlatform.resolveName(name)
        } catch (_: Exception) {
            null
        }
}
