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
import java.util.concurrent.atomic.AtomicBoolean

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
        const val MSG_PROGRESS = 4
        const val KEY_PROGRESS = "progress"

        const val KEY_PHRASE = "phrase"
        const val KEY_PASSPHRASE = "passphrase"
        const val KEY_HINT = "hint"
        const val KEY_MAX_IDX = "maxIdx"
        const val KEY_ERROR = "error"
        const val KEY_COUNT = "count"
        const val KEY_PREFIX = "item_"
    }

    private val busy = AtomicBoolean(false)

    private val handler =
        object : Handler(Looper.getMainLooper()) {
            override fun handleMessage(msg: Message) {
                when (msg.what) {
                    MSG_DISCOVER -> {
                        val replyTo = msg.replyTo
                        val data = msg.data
                        if (!busy.compareAndSet(false, true)) {
                            replyTo?.send(Message.obtain(null, MSG_ERROR).apply { this.data = Bundle().apply { putString(KEY_ERROR, "Another discovery is still running.") } })
                            return
                        }
                        Thread {
                            try {
                                val result =
                                    discover(
                                        phrase = data.getString(KEY_PHRASE).orEmpty(),
                                        passphrase = data.getString(KEY_PASSPHRASE).orEmpty(),
                                        hintName = data.getString(KEY_HINT),
                                        maxIdentityIndex = data.getInt(KEY_MAX_IDX, 19),
                                        progress = { status, found ->
                                            val update = Message.obtain(null, MSG_PROGRESS)
                                            update.data = (found?.let(::packResult) ?: Bundle()).apply { putString(KEY_PROGRESS, status) }
                                            replyTo?.send(update)
                                        },
                                    )
                                try {
                                    val out = Message.obtain(null, MSG_RESULT)
                                    out.data = packResult(result)
                                    replyTo?.send(out)
                                } finally { result.forEach { it.privateKey.fill(0) } }
                            } catch (t: Throwable) {
                                Log.e(TAG, "Discovery failed: ${t.javaClass.simpleName}")
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
                            } finally { data.clear(); busy.set(false) }
                        }.start()
                    }
                    else -> super.handleMessage(msg)
                }
            }
        }

    private val messenger = Messenger(handler)

    override fun onBind(intent: Intent?): IBinder = messenger.binder

    // This service has no other clients or work. Ending the final binding also
    // terminates any uninterruptible native lookup and releases its secret memory.
    override fun onUnbind(intent: Intent?): Boolean {
        Process.killProcess(Process.myPid())
        return false
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Platform process started pid=${Process.myPid()}")
    }

    private data class Found(
        val identityIndex: Int,
        val keyId: Int,
        val identityId: String,
        val names: List<String>,
        val privateKey: ByteArray,
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
            b.putByteArray("${p}_priv", it.privateKey)
            b.putString("${p}_pub", it.publicKeyHex)
        }
        return b
    }

    private fun discover(
        phrase: String,
        passphrase: String,
        hintName: String?,
        maxIdentityIndex: Int,
        progress: (String, List<Found>?) -> Unit,
    ): List<Found> {
        val network = NetworkConfig.network
        val normalized =
            phrase.trim().lowercase().replace(Regex("\\s+"), " ")
        require(Bip39.validateMnemonic(normalized)) {
            "Invalid recovery phrase"
        }
        val seed = Bip39.mnemonicToSeed(normalized, passphrase)

        try {
            progress("Connecting to Dash Platform…", null)
            TrustedQuorumContext.ensureFresh()
            val hint = hintName?.trim()?.takeIf { it.isNotEmpty() }
            if (hint != null) return discoverByName(hint, seed, network, 19)

            // Search the usual master/authentication slots first across all
            // supported identities. A found identity is matched locally against
            // all 32 slots, regardless of the on-chain key IDs.
            val positions = org.siwd.protocol.IdentityDiscoveryPlan.positions(maxIdentityIndex)
            val out = mutableListOf<Found>()
            val seen = mutableSetOf<String>()
            val recoveredPositions = mutableSetOf<Int>()
            var lastErr: Exception? = null
            for ((number, position) in positions.withIndex()) {
                val (idx, slot) = position
                if (idx in recoveredPositions) continue
                progress("Checking wallet position ${number + 1} of ${positions.size}. " +
                    "${out.size} identities found. This may take several minutes.", null)
                val priv = IdentityDerivation.derivePrivateKey(seed, network, idx, slot)
                val hash = try {
                    IdentityDerivation.publicKeyHash160(SiwdSigner.publicKeyCompressed(priv))
                } finally { priv.fill(0) }
                val identity = try { OnDevicePlatform.getIdentityByPublicKeyHash(hash) }
                    catch (e: Exception) { lastErr = e; null } ?: continue
                val identityId = identity.id.toString()
                if (!seen.add(identityId)) continue
                val match = matchKeys(identity, seed, network, 19) ?: continue
                try {
                    progress("Loading the names for a matching identity…", null)
                    val names = OnDevicePlatform.usernamesForIdentity(identityId)
                    out.add(Found(match.first, match.second, identityId,
                        names.ifEmpty { listOf("unnamed.dash") }, match.third.copyOf(), bytesToHex(match.fourth)))
                    recoveredPositions.add(match.first)
                    progress("${out.size} identities found with ${out.sumOf { it.names.size }} names. " +
                        "You can save these now, or wait while we check for more identities.", out)
                } finally { match.third.fill(0) }
            }
            if (lastErr != null) {
                out.forEach { it.privateKey.fill(0) }
                error("Some wallet positions could not be checked. Please retry discovery.")
            }
            if (out.isEmpty()) {
                error(
                    "No identity matched the first 20 identity positions and 6 discovery key positions. " +
                        "Use the original wallet's recovery " +
                        "phrase and optional BIP-39 passphrase (leave that field blank if none was set).",
                )
            }
            return out
        } finally { seed.fill(0) }
    }

    private fun discoverByName(
        hint: String,
        seed: ByteArray,
        network: Network,
        maxIdentityIndex: Int,
    ): List<Found> {
        val label = hint.replace(Regex("\\.dash$", RegexOption.IGNORE_CASE), "")
        val identityId = OnDevicePlatform.resolveName(label)
            ?: error("The Dash name could not be resolved on ${NetworkConfig.networkLabel}. Check its spelling and try again.")
        val identity = OnDevicePlatform.getIdentity(identityId)
            ?: error("The name resolved, but its identity could not be loaded. Try again.")
        check(identity.publicKeys.any(OnDevicePlatform::isEligibleSiwdKey)) {
            "This identity has no active, unbounded authentication key suitable for Sign in with Dash."
        }
        val match = matchKeys(identity, seed, network, maxIdentityIndex)
            ?: error("Your Dash name and identity were found, but no login key matched these recovery details " +
                "(checked 20 identity positions and 32 key positions). Check the original wallet phrase " +
                "and optional BIP-39 passphrase. A wallet PIN is not a BIP-39 passphrase. " +
                "The original wallet may use a different key format or separately saved identity keys.")
        try {
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
                    privateKey = match.third.copyOf(),
                    publicKeyHex = bytesToHex(match.fourth),
                ),
            )
        } finally { match.third.fill(0) }
    }

    private fun matchKeys(
        identity: org.dashj.platform.dpp.identity.Identity,
        seed: ByteArray,
        network: Network,
        maxIdentityIndex: Int,
    ): Quadruple? {
        val targets = identity.publicKeys.filter(OnDevicePlatform::isEligibleSiwdKey)
            .associate { it.id to it.data }
        val match = org.siwd.protocol.IdentityKeySearch.find(seed, network, targets,
            maxIdentityIndex.coerceIn(0, 19), 31) ?: return null
        return Quadruple(match.identityIndex, match.keyId, match.privateKey, match.publicKey)
    }

    private data class Quadruple(
        val first: Int,
        val second: Int,
        val third: ByteArray,
        val fourth: ByteArray,
    )
}
