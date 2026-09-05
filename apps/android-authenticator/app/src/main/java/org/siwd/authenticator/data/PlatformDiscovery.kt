package org.siwd.authenticator.data

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.*
import android.util.Log
import kotlinx.coroutines.*
import org.siwd.protocol.Bip39
import org.siwd.protocol.hexToBytes

/** One cancellable, phone-to-Platform recovery session. No website proxy.
 * Progress contains counts only; result keys remain private app-to-app IPC.
 */
class PlatformDiscovery(private val appContext: Context,
                        private val serviceClass: Class<out android.app.Service> = PlatformRemoteService::class.java,
                        private val timeoutMs: Long = TIMEOUT_MS) {
    companion object {
        private const val TAG = "SiwdDiscovery"
        private const val TIMEOUT_MS = 30 * 60 * 1000L
    }
    data class Discovered(val identityIndex: Int, val keyId: Int, val identityId: String,
                          val fullDpnsNames: List<String>, val privateKey: ByteArray, val publicKey: ByteArray)
    data class Outcome(val identities: List<Discovered>, val complete: Boolean)
    data class Progress(val message: String, val found: Int)
    private var finishCurrent: (() -> Unit)? = null

    /** Called on the UI thread: keep the current results and stop further work. */
    fun finishWithFound() { finishCurrent?.invoke() }

    @OptIn(ExperimentalCoroutinesApi::class)
    suspend fun discoverFromMnemonic(phrase: String, maxIdentityIndex: Int = 19,
                                    hintName: String? = null, passphrase: String = "",
                                    onProgress: (Progress) -> Unit = {}): Outcome {
        val normalized = Bip39.normalizeMnemonic(phrase)
        require(Bip39.validateMnemonic(normalized)) { "Invalid recovery phrase. Check the words and their order." }
        require(timeoutMs in 1..TIMEOUT_MS)
        return withContext(Dispatchers.Main.immediate) {
        check(finishCurrent == null) { "Discovery is already running" }
        suspendCancellableCoroutine { continuation ->
            val main = Handler(Looper.getMainLooper())
            var latest = emptyList<Discovered>()
            var closed = false
            var bound = false
            lateinit var connection: ServiceConnection
            lateinit var timeout: Runnable
            fun stopService() {
                if (bound) { bound = false; appContext.unbindService(connection) }
            }
            fun wipe(items: List<Discovered>) { items.forEach { it.privateKey.fill(0) } }
            fun close() {
                if (closed) return
                closed = true
                finishCurrent = null
                main.removeCallbacks(timeout)
                stopService()
            }
            fun fail(message: String) {
                if (closed) return
                wipe(latest); latest = emptyList(); close()
                continuation.resumeWith(Result.failure(IllegalStateException(message)))
            }
            fun interrupted(message: String) {
                if (closed) return
                if (latest.isEmpty()) fail(message)
                else {
                    main.removeCallbacks(timeout)
                    stopService()
                    onProgress(Progress("The search could not finish. You can save the identities already found or cancel and retry.", latest.size))
                }
            }
            fun finish(complete: Boolean) {
                if (closed || latest.isEmpty()) return
                val result = Outcome(latest, complete)
                latest = emptyList(); close()
                continuation.resume(result, onCancellation = { wipe(result.identities) })
            }
            finishCurrent = { finish(false) }
            val reply = Messenger(object : Handler(Looper.getMainLooper()) {
                override fun handleMessage(msg: Message) {
                    if (closed) return
                    when (msg.what) {
                        PlatformRemoteService.MSG_PROGRESS -> {
                            if (msg.data.containsKey(PlatformRemoteService.KEY_COUNT)) {
                                val incoming = unpack(msg.data)
                                wipe(latest); latest = incoming
                            }
                            onProgress(Progress(msg.data.getString(PlatformRemoteService.KEY_PROGRESS).orEmpty(), latest.size))
                        }
                        PlatformRemoteService.MSG_RESULT -> {
                            val incoming = unpack(msg.data)
                            wipe(latest); latest = incoming
                            if (latest.isEmpty()) fail("No matching identities found in the supported wallet positions.") else finish(true)
                        }
                        PlatformRemoteService.MSG_ERROR -> {
                            val message = msg.data.getString(PlatformRemoteService.KEY_ERROR) ?: "Platform discovery failed."
                            interrupted(message)
                        }
                    }
                }
            })
            connection = object : ServiceConnection {
                override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
                    if (closed) return
                    try {
                        val message = Message.obtain(null, PlatformRemoteService.MSG_DISCOVER)
                        message.replyTo = reply
                        message.data = Bundle().apply {
                            putString(PlatformRemoteService.KEY_PHRASE, normalized)
                            putString(PlatformRemoteService.KEY_PASSPHRASE, passphrase)
                            putString(PlatformRemoteService.KEY_HINT, hintName)
                            putInt(PlatformRemoteService.KEY_MAX_IDX, maxIdentityIndex)
                        }
                        Messenger(binder).send(message)
                    } catch (_: RemoteException) { fail("Could not contact the Platform process. Try again.") }
                }
                override fun onServiceDisconnected(name: ComponentName?) { interrupted("The Platform process stopped unexpectedly. Please retry discovery.") }
                override fun onNullBinding(name: ComponentName?) { fail("The Platform service could not start.") }
                override fun onBindingDied(name: ComponentName?) { interrupted("The Platform service disconnected. Please retry.") }
            }
            timeout = Runnable { interrupted("Discovery reached its time limit. Check your connection and retry.") }
            main.postDelayed(timeout, timeoutMs)
            continuation.invokeOnCancellation {
                main.post { wipe(latest); latest = emptyList(); close() }
            }
            try {
                bound = appContext.bindService(Intent(appContext, serviceClass), connection, Context.BIND_AUTO_CREATE)
                if (!bound) fail("Could not start on-device Platform discovery.")
            } catch (_: Exception) { fail("Could not bind the Platform discovery service.") }
        }
        }
    }

    private fun unpack(data: Bundle): List<Discovered> {
        val n = data.getInt(PlatformRemoteService.KEY_COUNT, 0)
        val out = mutableListOf<Discovered>()
        for (i in 0 until n) {
            val p = "${PlatformRemoteService.KEY_PREFIX}$i"
            val privateKey = data.getByteArray("${p}_priv") ?: continue
            data.remove("${p}_priv")
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
                    privateKey = privateKey,
                    publicKey = hexToBytes(pubHex),
                ),
            )
        }
        Log.i(TAG, "Unpacked ${out.size} identities from platform process")
        return out
    }
}
