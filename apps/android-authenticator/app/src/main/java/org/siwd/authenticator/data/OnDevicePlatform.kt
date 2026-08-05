package org.siwd.authenticator.data

import android.util.Log
import org.bitcoinj.params.TestNet3Params
import org.dashj.platform.dpp.identity.Identity
import org.dashj.platform.dpp.identity.IdentityPublicKey
import org.dashj.platform.sdk.Purpose
import org.dashj.platform.sdk.SecurityLevel
import org.dashj.platform.sdk.callbacks.ContextProvider
import org.dashj.platform.sdk.platform.Platform
import org.siwd.protocol.bytesToHex
import java.util.concurrent.atomic.AtomicReference

/**
 * On-device Dash Platform access for SIWD (testnet first).
 *
 * Talks to Platform DAPI from this app — **no** demo-web proxy and **no**
 * DashPay package integration.
 *
 * ## Quorum / proof verification
 * Platform responses are proof-backed. DashPay supplies quorum keys from a
 * full [org.bitcoinj.evolution.SimplifiedMasternodeListManager] after Core
 * sync. SIWD instead loads **public trusted quorum context** from
 * `https://quorums.testnet.networks.dash.org/` (same source as Evo
 * WasmTrustedContext.prefetchTestnet) via [TrustedQuorumContext], and
 * implements [ContextProvider.getQuorumPublicKey] from that cache.
 *
 * Mainnet is intentionally not enabled until SIWD's mainnet gate is met.
 */
object OnDevicePlatform {
    private const val TAG = "SiwdPlatform"

    private val platformRef = AtomicReference<Platform?>(null)
    private val initError = AtomicReference<String?>(null)

    /** Lazy Platform singleton for testnet. */
    fun testnet(): Platform {
        platformRef.get()?.let { return it }
        synchronized(this) {
            platformRef.get()?.let { return it }
            try {
                Log.i(TAG, "Initializing on-device Platform (testnet DAPI + trusted quorums)")
                // Prefetch quorums before first DAPI call.
                try {
                    TrustedQuorumContext.ensureFresh()
                } catch (e: Exception) {
                    Log.w(TAG, "Trusted quorum prefetch failed (will retry on lookup): ${e.message}")
                }

                val params = TestNet3Params.get()
                // Platform() loads libsdklib and creates one DapiClient.
                // Do NOT construct a second DapiClient — native create_dash_sdk aborts.
                Log.i(TAG, "Constructing Platform (native dash-sdk)…")
                val p = Platform(params)
                Log.i(TAG, "Platform constructed; installing trusted ContextProvider")
                installTrustedContextProvider(p)
                try {
                    p.useValidNodes()
                } catch (e: Exception) {
                    Log.w(TAG, "useValidNodes: ${e.message}")
                }
                try {
                    val hosts = TrustedQuorumContext.dapiHosts()
                    if (hosts.isNotEmpty()) {
                        // Host-only whitelist (no ports) for DAPI address list
                        p.appendWhiteList(hosts.take(20))
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "appendWhiteList: ${e.message}")
                }
                Log.i(TAG, "Platform ready; ${TrustedQuorumContext.status()}")
                platformRef.set(p)
                initError.set(null)
                return p
            } catch (e: Throwable) {
                initError.set("${e.javaClass.simpleName}: ${e.message}")
                Log.e(TAG, "Platform init failed", e)
                throw e
            }
        }
    }

    fun lastInitError(): String? = initError.get()

    /**
     * ContextProvider backed by [TrustedQuorumContext] public HTTPS cache.
     */
    private fun installTrustedContextProvider(platform: Platform) {
        platform.client.contextProvider =
            object : ContextProvider() {
                override fun getQuorumPublicKey(
                    quorumType: Int,
                    quorumHashBytes: ByteArray?,
                    coreChainLockedHeight: Int,
                ): ByteArray? {
                    val key = TrustedQuorumContext.getQuorumPublicKey(quorumHashBytes)
                    if (key == null) {
                        Log.w(
                            TAG,
                            "quorum key miss type=$quorumType height=$coreChainLockedHeight " +
                                "hash=${quorumHashBytes?.let { bytesToHex(it) }} " +
                                "(${TrustedQuorumContext.status()})",
                        )
                    } else {
                        Log.d(
                            TAG,
                            "quorum key hit type=$quorumType len=${key.size}",
                        )
                    }
                    return key
                }

                override fun getDataContract(
                    identifier: org.dashj.platform.sdk.Identifier?,
                ): ByteArray = byteArrayOf(0)
            }
    }

    /**
     * Connectivity probe. Prefers trusted-quorum fetch (always safe).
     * Platform construction can abort natively on some devices — call carefully.
     */
    fun probeConnectivity(includePlatform: Boolean = false): String {
        return try {
            TrustedQuorumContext.ensureFresh()
            val q = TrustedQuorumContext.status()
            if (!includePlatform) {
                return "ok: $q (platform not started)"
            }
            val p = testnet()
            val report = p.client.reportNetworkStatus()
            "ok: $q; $report"
        } catch (e: Exception) {
            "fail: ${e.javaClass.simpleName}: ${e.message}"
        }
    }

    fun getIdentityByPublicKeyHash(pubKeyHash: ByteArray): Identity? {
        val p = testnet()
        return try {
            p.client.getIdentityByFirstPublicKey(pubKeyHash, false)
        } catch (e: Exception) {
            Log.w(TAG, "getIdentityByFirstPublicKey failed: ${e.message}", e)
            try {
                p.identities.getByPublicKeyHash(pubKeyHash)
            } catch (e2: Exception) {
                Log.w(TAG, "getByPublicKeyHash failed: ${e2.message}", e2)
                throw e2
            }
        }
    }

    fun getIdentity(idBase58: String): Identity? {
        return try {
            testnet().identities.get(idBase58)
        } catch (e: Exception) {
            Log.w(TAG, "get identity failed: ${e.message}", e)
            throw e
        }
    }

    fun usernamesForIdentity(identityIdBase58: String): List<String> {
        return try {
            val docs = testnet().names.getByOwnerId(identityIdBase58)
            docs.mapNotNull { doc ->
                val label =
                    (doc.data["label"] as? String)
                        ?: (doc.data["normalizedLabel"] as? String)
                        ?: return@mapNotNull null
                val parent =
                    (doc.data["normalizedParentDomainName"] as? String)
                        ?: (doc.data["parentDomainName"] as? String)
                        ?: "dash"
                val full = if (label.contains('.')) label else "$label.$parent"
                if (full.endsWith(".dash")) full else "$full.dash"
            }.distinct()
        } catch (e: Exception) {
            Log.w(TAG, "usernamesForIdentity failed: ${e.message}", e)
            emptyList()
        }
    }

    fun resolveName(name: String): String? {
        return try {
            val label = name.replace(Regex("\\.dash$", RegexOption.IGNORE_CASE), "")
            val doc = testnet().names.resolve(label) ?: return null
            val records = doc.data["records"] as? Map<*, *> ?: return null
            val id = records["identity"] ?: records["dashUniqueIdentityId"]
            when (id) {
                is String -> id
                is ByteArray -> org.dashj.platform.dpp.identifier.Identifier.from(id).toString()
                else ->
                    id?.let {
                        org.dashj.platform.dpp.identifier.Identifier.from(it).toString()
                    }
            }
        } catch (e: Exception) {
            Log.w(TAG, "resolveName failed: ${e.message}", e)
            null
        }
    }

    fun isEligibleSiwdKey(key: IdentityPublicKey): Boolean {
        if (key.disabledAt != null) return false
        val purposeOk =
            key.purpose == Purpose.AUTHENTICATION ||
                key.purpose.name.contains("AUTH", ignoreCase = true)
        val levelOk =
            key.securityLevel == SecurityLevel.HIGH ||
                key.securityLevel.name.contains("HIGH", ignoreCase = true)
        return purposeOk && levelOk
    }

    fun publicKeyHex(key: IdentityPublicKey): String = bytesToHex(key.data)
}
