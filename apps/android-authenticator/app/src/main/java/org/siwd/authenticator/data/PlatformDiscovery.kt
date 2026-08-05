package org.siwd.authenticator.data

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.os.RemoteException
import android.util.Log
import org.siwd.protocol.Bip39
import org.siwd.protocol.hexToBytes
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Discovers Platform identities from a mnemonic (phone ↔ Platform only).
 *
 * Native dash-sdk work runs in [PlatformRemoteService] process `:platform` so a
 * native SIGABRT cannot take down the UI process. There is **no website proxy**.
 */
class PlatformDiscovery(
    private val appContext: Context,
) {
    companion object {
        private const val TAG = "SiwdDiscovery"
        private const val TIMEOUT_SEC = 120L
    }

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
        hintName: String? = null,
        passphrase: String = "",
    ): List<Discovered> {
        val normalized =
            phrase
                .trim()
                .lowercase()
                .replace(Regex("\\s+"), " ")
        require(Bip39.validateMnemonic(normalized)) {
            "Invalid recovery phrase — enter BIP-39 words in order, separated by a single space"
        }

        val resultBox = AtomicReference<List<Discovered>?>(null)
        val errorBox = AtomicReference<String?>(null)
        val latch = CountDownLatch(1)

        val replyMessenger =
            Messenger(
                object : Handler(Looper.getMainLooper()) {
                    override fun handleMessage(msg: Message) {
                        when (msg.what) {
                            PlatformRemoteService.MSG_RESULT -> {
                                resultBox.set(unpack(msg.data))
                                latch.countDown()
                            }
                            PlatformRemoteService.MSG_ERROR -> {
                                errorBox.set(
                                    msg.data.getString(PlatformRemoteService.KEY_ERROR)
                                        ?: "Unknown platform error",
                                )
                                latch.countDown()
                            }
                            else -> super.handleMessage(msg)
                        }
                    }
                },
            )

        val death =
            object : IBinder.DeathRecipient {
                override fun binderDied() {
                    errorBox.compareAndSet(
                        null,
                        "Native Platform process crashed (dash-sdk). " +
                            "This is a known SDK issue on some devices — " +
                            "try again, or use a different device until the SDK is fixed.",
                    )
                    latch.countDown()
                }
            }

        var binder: IBinder? = null
        val conn =
            object : ServiceConnection {
                override fun onServiceConnected(
                    name: ComponentName?,
                    service: IBinder?,
                ) {
                    binder = service
                    try {
                        service?.linkToDeath(death, 0)
                    } catch (_: RemoteException) {
                        errorBox.set("Failed to link platform process")
                        latch.countDown()
                        return
                    }
                    val msg = Message.obtain(null, PlatformRemoteService.MSG_DISCOVER)
                    msg.replyTo = replyMessenger
                    msg.data =
                        Bundle().apply {
                            putString(PlatformRemoteService.KEY_PHRASE, normalized)
                            putString(PlatformRemoteService.KEY_PASSPHRASE, passphrase)
                            putString(PlatformRemoteService.KEY_HINT, hintName)
                            putInt(PlatformRemoteService.KEY_MAX_IDX, maxIdentityIndex)
                        }
                    try {
                        Messenger(service).send(msg)
                    } catch (e: RemoteException) {
                        errorBox.set("Platform service send failed: ${e.message}")
                        latch.countDown()
                    }
                }

                override fun onServiceDisconnected(name: ComponentName?) {
                    errorBox.compareAndSet(
                        null,
                        "Platform process disconnected unexpectedly",
                    )
                    latch.countDown()
                }
            }

        val intent = Intent(appContext, PlatformRemoteService::class.java)
        val bound =
            appContext.bindService(
                intent,
                conn,
                Context.BIND_AUTO_CREATE,
            )
        if (!bound) {
            error("Could not start on-device Platform discovery service")
        }

        try {
            if (!latch.await(TIMEOUT_SEC, TimeUnit.SECONDS)) {
                error(
                    "On-device Platform discovery timed out after ${TIMEOUT_SEC}s. " +
                        "Check network access to testnet DAPI / quorums.testnet.networks.dash.org",
                )
            }
            errorBox.get()?.let { error(it) }
            val found = resultBox.get().orEmpty()
            if (found.isEmpty()) {
                error(
                    "No Platform identities found for this phrase.\n\n" +
                        "Checked identity indexes 0–$maxIdentityIndex and key ids 0–5 " +
                        "via on-device testnet DAPI (no website).\n" +
                        "• Use the recovery phrase that created the testnet identity.\n" +
                        "• Enter your DPNS name to assist discovery.\n" +
                        "• Device needs network access to testnet Platform.",
                )
            }
            return found
        } finally {
            try {
                binder?.unlinkToDeath(death, 0)
            } catch (_: Exception) {
            }
            try {
                appContext.unbindService(conn)
            } catch (_: Exception) {
            }
        }
    }

    private fun unpack(data: Bundle): List<Discovered> {
        val n = data.getInt(PlatformRemoteService.KEY_COUNT, 0)
        val out = mutableListOf<Discovered>()
        for (i in 0 until n) {
            val p = "${PlatformRemoteService.KEY_PREFIX}$i"
            val privHex = data.getString("${p}_priv") ?: continue
            val pubHex = data.getString("${p}_pub") ?: continue
            val names =
                data.getStringArrayList("${p}_names")?.toList()
                    ?: listOf("unnamed.dash")
            out.add(
                Discovered(
                    identityIndex = data.getInt("${p}_idx"),
                    keyId = data.getInt("${p}_keyId"),
                    identityId = data.getString("${p}_id") ?: continue,
                    fullDpnsNames = names,
                    privateKey = hexToBytes(privHex),
                    publicKey = hexToBytes(pubHex),
                ),
            )
        }
        Log.i(TAG, "Unpacked ${out.size} identities from platform process")
        return out
    }
}
