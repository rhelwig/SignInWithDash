package org.siwd.authenticator

import android.app.Service
import android.content.Intent
import android.os.*
import android.text.InputType
import android.text.method.HideReturnsTransformationMethod
import android.util.Log
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*
import org.siwd.authenticator.data.PlatformDiscovery
import org.siwd.authenticator.data.PlatformRemoteService as Wire
import org.siwd.authenticator.ui.PrivateEditText

/** Public synthetic fixtures only; compiled out of releases. */
class RecoveryRegressionActivity : FragmentActivity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        check(packageName.endsWith(".testnet.securityaudit"))
        val output = TextView(this)
        setContentView(output)
        fun pass(message: String) { Log.i("SiwdRecoveryTest", "PASS $message"); output.append("PASS $message\n") }
        lifecycleScope.launch {
            try {
                val field = PrivateEditText(this@RecoveryRegressionActivity)
                field.transformationMethod = HideReturnsTransformationMethod.getInstance()
                val info = EditorInfo()
                field.onCreateInputConnection(info)
                check(info.inputType and InputType.TYPE_MASK_VARIATION == InputType.TYPE_TEXT_VARIATION_PASSWORD)
                check(info.inputType and InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS != 0)
                check(info.imeOptions and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING != 0)
                check(info.imeOptions and EditorInfo.IME_FLAG_NO_EXTRACT_UI != 0)
                check(!field.isSaveEnabled && field.importantForAutofill == View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS)
                pass("optional passphrase stays private input even when revealed")
                val recovery = PlatformDiscovery(applicationContext, RecoveryFixtureService::class.java)
                // Published BIP-39 test vector, with no real identity or funds.
                val phrase = List(11) { "abandon" }.plus("about").joinToString(" ")
                val progress = mutableListOf<Int>()
                val full = recovery.discoverFromMnemonic(phrase, onProgress = { progress.add(it.found) })
                check(full.complete && full.identities.size == 2)
                check(full.identities[0].fullDpnsNames.size == 2)
                check(full.identities.all { it.privateKey.size == 32 && it.privateKey.last() == 1.toByte() })
                full.identities.forEach { it.privateKey.fill(0) }
                check(progress.contains(1) && progress.contains(2))
                pass("name-free IPC returns two identities, multiple names, and incremental progress")
                delay(300)
                val early = recovery.discoverFromMnemonic(phrase, onProgress = { if (it.found > 0) recovery.finishWithFound() })
                check(!early.complete && early.identities.size == 1)
                early.identities.forEach { it.privateKey.fill(0) }
                pass("finish with found identities returns partial results promptly")
                delay(300)
                val interrupted = recovery.discoverFromMnemonic(phrase, hintName = "error", onProgress = {
                    if (it.message.startsWith("The search could not finish")) recovery.finishWithFound()
                })
                check(!interrupted.complete && interrupted.identities.size == 1)
                interrupted.identities.forEach { it.privateKey.fill(0) }
                pass("a later network failure preserves already discovered identities")
                delay(300)
                val limited = PlatformDiscovery(applicationContext, RecoveryFixtureService::class.java, timeoutMs = 1000)
                val timed = limited.discoverFromMnemonic(phrase, hintName = "wait", onProgress = {
                    if (it.message.startsWith("The search could not finish")) limited.finishWithFound()
                })
                check(!timed.complete && timed.identities.size == 1)
                timed.identities.forEach { it.privateKey.fill(0) }
                pass("the overall time limit stops network work without discarding found identities")
                delay(300)
                val job = launch { recovery.discoverFromMnemonic(phrase, hintName = "wait") }
                delay(300); job.cancelAndJoin(); delay(300)
                val retry = recovery.discoverFromMnemonic(phrase)
                check(retry.complete && retry.identities.size == 2)
                retry.identities.forEach { it.privateKey.fill(0) }
                pass("cancel releases the service and a fresh discovery succeeds")
                Log.i("SiwdRecoveryTest", "ALL RECOVERY REGRESSIONS PASSED")
            } catch (error: Throwable) {
                Log.e("SiwdRecoveryTest", "FAIL ${error.javaClass.simpleName}: ${error.message}")
                output.text = "Recovery regression failed"
            }
        }
    }
}

class RecoveryFixtureService : Service() {
    private val handler = object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(message: Message) {
            if (message.what != Wire.MSG_DISCOVER) return
            val recipient = message.replyTo
            val mode = message.data.getString(Wire.KEY_HINT)
            Thread {
                fun send(type: Int, count: Int) {
                    val bundle = Bundle().apply {
                        putInt(Wire.KEY_COUNT, count)
                        putString(Wire.KEY_PROGRESS, "Synthetic progress")
                        for (i in 0 until count) {
                            val prefix = "${Wire.KEY_PREFIX}$i"
                            putInt("${prefix}_idx", i); putInt("${prefix}_keyId", 7)
                            putString("${prefix}_id", "synthetic-$i")
                            putStringArrayList("${prefix}_names", arrayListOf("fixture-$i.dash", "alias-$i.dash"))
                            putByteArray("${prefix}_priv", ByteArray(32).apply { this[31] = 1 })
                            putString("${prefix}_pub", "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
                        }
                    }
                    recipient.send(Message.obtain(null, type).apply { data = bundle })
                }
                try {
                    send(Wire.MSG_PROGRESS, 1)
                    if (mode == "wait") Thread.sleep(10000)
                    Thread.sleep(200)
                    if (mode == "error") {
                        recipient.send(Message.obtain(null, Wire.MSG_ERROR).apply {
                            data = Bundle().apply { putString(Wire.KEY_ERROR, "Synthetic network failure") }
                        })
                    } else {
                        send(Wire.MSG_PROGRESS, 2); Thread.sleep(200); send(Wire.MSG_RESULT, 2)
                    }
                } catch (_: RemoteException) {}
            }.start()
        }
    }
    override fun onBind(intent: Intent?): IBinder = Messenger(handler).binder
    override fun onUnbind(intent: Intent?): Boolean { android.os.Process.killProcess(android.os.Process.myPid()); return false }
}
