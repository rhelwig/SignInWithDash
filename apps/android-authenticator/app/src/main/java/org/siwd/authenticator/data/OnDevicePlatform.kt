package org.siwd.authenticator.data

import android.util.Log
import org.bitcoinj.params.MainNetParams
import org.bitcoinj.params.TestNet3Params
import org.dashj.platform.dapiclient.provider.DAPIAddress
import org.dashj.platform.dapiclient.provider.ListDAPIAddressProvider
import org.dashj.platform.dpp.identity.Identity
import org.dashj.platform.dpp.identity.IdentityPublicKey
import org.dashj.platform.sdk.Purpose
import org.dashj.platform.sdk.SecurityLevel
import org.dashj.platform.sdk.callbacks.ContextProvider
import org.dashj.platform.sdk.platform.Platform
import org.siwd.protocol.bytesToHex
import java.lang.reflect.Field
import java.util.concurrent.atomic.AtomicReference

/**
 * On-device Dash Platform access for SIWD (testnet or mainnet, per flavor).
 *
 * Phone ↔ Platform DAPI only — **no** website proxy.
 *
 * Quorum keys come from Dash’s public trusted-context service via
 * [TrustedQuorumContext]. The native rust SDK binds a [ContextProvider] at
 * **create** time. A second `create_dash_sdk_with_context` panics on Android
 * (`setup_logs` uses tracing `.init()` which aborts if already set). So we
 * never recreate the SDK — we rebind the existing native `JavaContextProvider`
 * GlobalRef to our trusted provider (virtual dispatch then hits our
 * `getQuorumPublicKey`).
 */
object OnDevicePlatform {
    private const val TAG = "SiwdPlatform"

    /**
     * Layout of dash-sdk-java `struct JavaContextProvider` on 64-bit:
     *   jclass contextProviderClass;      // +0
     *   jmethodID getQuorumPublicKeyMethod; // +8
     *   jobject contextProviderObject;    // +16  (JNI GlobalRef)
     */
    private const val NATIVE_CTX_OBJECT_OFFSET = 16L

    private val platformRef = AtomicReference<Platform?>(null)
    private val initError = AtomicReference<String?>(null)

    fun platform(): Platform {
        platformRef.get()?.let { return it }
        synchronized(this) {
            platformRef.get()?.let { return it }
            try {
                Log.i(
                    TAG,
                    "Initializing on-device Platform (${NetworkConfig.networkLabel} DAPI + trusted quorums)",
                )
                TrustedQuorumContext.ensureFresh()

                val params =
                    if (NetworkConfig.isMainnet) MainNetParams.get() else TestNet3Params.get()
                Log.i(TAG, "Constructing Platform (native dash-sdk)…")
                val p = Platform(params)
                Log.i(TAG, "Platform constructed; installing trusted ContextProvider (rebind, no recreate)")
                applyTrustedDapiHosts(p)
                bindTrustedContextProvider(p)
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
     * Prefer live testnet DAPI hosts from the trusted-context service over the
     * baked-in HP seed list (which can be stale or all banned after quorum misses).
     */
    private fun applyTrustedDapiHosts(platform: Platform) {
        val hosts = TrustedQuorumContext.dapiHosts()
        if (hosts.isEmpty()) {
            Log.w(TAG, "No trusted DAPI hosts; keeping Platform default seed list")
            return
        }
        // Cap list size — ListDAPIAddressProvider walks the whole set on ban/retry.
        val limited = hosts.take(40)
        val addresses = limited.map { DAPIAddress(it) }
        val provider =
            ListDAPIAddressProvider(
                addresses,
                org.dashj.platform.dapiclient.DapiClient.DEFAULT_BASE_BAN_TIME,
            )
        platform.client.dapiAddressListProvider = provider
        Log.i(TAG, "Installed ${limited.size} trusted DAPI hosts (of ${hosts.size})")
    }

    /**
     * Install trusted ContextProvider into the **already-created** native SDK.
     *
     * Do **not** call create_dash_sdk again — Android panics on second init
     * (tracing subscriber). Instead rebind the GlobalRef inside the existing
     * native context struct so proof callbacks hit [TrustedQuorumContext].
     */
    private fun bindTrustedContextProvider(platform: Platform) {
        val trusted =
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
                            "quorum key MISS type=$quorumType height=$coreChainLockedHeight " +
                                "hash=${quorumHashBytes?.let { bytesToHex(it) }} " +
                                "(${TrustedQuorumContext.status()})",
                        )
                    } else {
                        Log.i(
                            TAG,
                            "quorum key HIT type=$quorumType len=${key.size} " +
                                "hash=${quorumHashBytes?.let { bytesToHex(it) }}",
                        )
                    }
                    return key
                }

                override fun getDataContract(
                    identifier: org.dashj.platform.sdk.Identifier?,
                ): ByteArray = byteArrayOf(0)
            }

        val client = platform.client
        // Capture the default provider *before* swapping the Kotlin field.
        // Its nativeContext pointer is what libsdklib holds for callbacks.
        val boundProvider = client.contextProvider
        val boundNativeCtx = boundProvider.nativeContext
        require(boundNativeCtx != 0L) { "bound ContextProvider has no nativeContext" }

        // Create a native JavaContextProvider for the trusted instance so we
        // have a valid JNI GlobalRef to its jobject.
        val trustedNativeCtx = trusted.nativeContext
        require(trustedNativeCtx != 0L) { "trusted ContextProvider failed to allocate nativeContext" }

        Log.i(
            TAG,
            "Rebinding native ContextProvider GlobalRef " +
                "(boundCtx=$boundNativeCtx trustedCtx=$trustedNativeCtx)",
        )
        rebindNativeContextObject(boundNativeCtx, trustedNativeCtx)

        client.contextProvider = trusted
        Log.i(TAG, "Trusted ContextProvider rebound into existing rustSdk")
    }

    /**
     * Copy the `jobject contextProviderObject` GlobalRef from [fromNativeCtx]
     * into [intoNativeCtx] (the struct the rust SDK already holds).
     *
     * Both pointers are `JavaContextProvider*` from dash-sdk-java. We only
     * replace the object slot; class + methodID stay as the base
     * ContextProvider virtual method (JNI still virtual-dispatches).
     *
     * Uses `sun.misc.Unsafe` via reflection (not on the Android compile
     * classpath as a typed import, but present at runtime on ART).
     */
    private fun rebindNativeContextObject(intoNativeCtx: Long, fromNativeCtx: Long) {
        val unsafeClass = Class.forName("sun.misc.Unsafe")
        val theUnsafeField: Field = unsafeClass.getDeclaredField("theUnsafe")
        theUnsafeField.isAccessible = true
        val unsafe = theUnsafeField.get(null)
        val getLong =
            unsafeClass.getMethod("getLong", Long::class.javaPrimitiveType)
        val putLong =
            unsafeClass.getMethod(
                "putLong",
                Long::class.javaPrimitiveType,
                Long::class.javaPrimitiveType,
            )
        val globalRef =
            getLong.invoke(unsafe, fromNativeCtx + NATIVE_CTX_OBJECT_OFFSET) as Long
        require(globalRef != 0L) { "trusted nativeContext has null GlobalRef" }
        putLong.invoke(unsafe, intoNativeCtx + NATIVE_CTX_OBJECT_OFFSET, globalRef)
    }

    fun probeConnectivity(includePlatform: Boolean = false): String {
        return try {
            TrustedQuorumContext.ensureFresh()
            val q = TrustedQuorumContext.status()
            if (!includePlatform) {
                return "ok: $q (platform not started)"
            }
            val p = platform()
            val report = p.client.reportNetworkStatus()
            "ok: $q; $report"
        } catch (e: Exception) {
            "fail: ${e.javaClass.simpleName}: ${e.message}"
        }
    }

    fun getIdentityByPublicKeyHash(pubKeyHash: ByteArray): Identity? {
        val p = platform()
        return try {
            // prefer non-proof path when available, then fall back
            p.client.getIdentityByFirstPublicKey(pubKeyHash, false)
        } catch (e: Exception) {
            Log.w(TAG, "getIdentityByFirstPublicKey(false) failed: ${e.message}", e)
            try {
                p.client.getIdentityByFirstPublicKey(pubKeyHash, true)
            } catch (e2: Exception) {
                Log.w(TAG, "getIdentityByFirstPublicKey(true) failed: ${e2.message}", e2)
                try {
                    p.identities.getByPublicKeyHash(pubKeyHash)
                } catch (e3: Exception) {
                    Log.w(TAG, "getByPublicKeyHash failed: ${e3.message}", e3)
                    throw e3
                }
            }
        }
    }

    fun getIdentity(idBase58: String): Identity? {
        return try {
            platform().identities.get(idBase58)
        } catch (e: Exception) {
            Log.w(TAG, "get identity failed: ${e.message}", e)
            throw e
        }
    }

    fun usernamesForIdentity(identityIdBase58: String): List<String> {
        return try {
            val p = platform()
            val id = org.dashj.platform.dpp.identifier.Identifier.from(identityIdBase58)
            val docs = mutableListOf<org.dashj.platform.dpp.document.Document>()
            var cursor: org.dashj.platform.dpp.identifier.Identifier? = null
            // Match the SDK's records.identity query, with explicit pagination.
            // Never silently present a truncated name list as a complete import.
            while (true) {
                val query = org.dashj.platform.dapiclient.model.DocumentQuery.Builder()
                    .where("records.identity", "==", id).limit(100)
                cursor?.let { query.startAfter(it) }
                val page = p.documents.get("dpns.domain", query.build())
                docs.addAll(page)
                if (page.size < 100) break
                check(docs.size < 10000 && page.last().id != cursor) { "Name lookup exceeded its safe pagination limit" }
                cursor = page.last().id
            }
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
            Log.w(TAG, "Name lookup failed: ${e.javaClass.simpleName}")
            throw IllegalStateException("Could not load the identity's names. Check the connection and retry.", e)
        }
    }

    fun resolveName(name: String): String? {
        return try {
            val label = name.replace(Regex("\\.dash$", RegexOption.IGNORE_CASE), "")
            val doc = platform().names.resolve(label) ?: return null
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
        return key.disabledAt == null && key.contractBounds == null &&
            key.type == org.dashj.platform.sdk.KeyType.ECDSA_SECP256K1 &&
            key.purpose == Purpose.AUTHENTICATION && key.securityLevel == SecurityLevel.HIGH &&
            key.data.size == 33 && (key.data[0] == 2.toByte() || key.data[0] == 3.toByte())
    }

    fun publicKeyHex(key: IdentityPublicKey): String = bytesToHex(key.data)
}
