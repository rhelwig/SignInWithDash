package org.siwd.authenticator

import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import org.siwd.authenticator.data.SecureIdentityStore
import org.siwd.authenticator.security.DeviceGate
import org.siwd.protocol.SiwdSigner

/** Runs only in an isolated audit package; never reads an installed user's keys. */
class KeySecurityTestActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val output = TextView(this).apply { setPadding(24, 48, 24, 24) }
        setContentView(output)
        fun report(message: String) { output.append(message + "\n"); Log.i("SiwdKeySecurityTest", message) }
        if (!packageName.endsWith(".testnet.securityaudit")) { report("REFUSED: isolated testnet audit package required"); return }
        try {
            val store = SecureIdentityStore(this)
            val existing = store.list()
            val expected = if (existing.isEmpty()) ByteArray(32).also { java.security.SecureRandom().nextBytes(it) } else null
            val identity = existing.singleOrNull() ?: store.wrap("synthetic-testnet", 0, 1, listOf("synthetic.dash"), expected!!.clone(), SiwdSigner.publicKeyCompressed(expected)).also { store.saveAll(listOf(it)) }
            check(store.list().single().publicKeyHex == identity.publicKeyHex)
            report("PASS metadata survives storage without decryption")
            var blocked = false
            try { store.decrypt(identity, store.decryptionCipher()).fill(0) } catch (_: Exception) { blocked = true }
            check(blocked) { "Decryption worked without fresh authentication" }
            report("PASS unauthenticated private-key decryption blocked")
            DeviceGate.authenticate(this, title = "SIWD synthetic security test", subtitle = "Generated test data only; no Dash transaction", cipher = store.decryptionCipher(),
                onSuccess = { cipher ->
                    try {
                        val privateKey = store.decrypt(identity, cipher!!)
                        try {
                            check(org.siwd.protocol.bytesToHex(SiwdSigner.publicKeyCompressed(privateKey)) == identity.publicKeyHex)
                            if (expected != null) check(privateKey.contentEquals(expected))
                            report("PASS authenticated decryption returns the correct synthetic key")
                        } finally { privateKey.fill(0); expected?.fill(0) }
                        var secondBlocked = false
                        try { store.decrypt(identity, store.decryptionCipher()).fill(0) } catch (_: Exception) { secondBlocked = true }
                        check(secondBlocked)
                        report("PASS a second decryption requires fresh authentication")
                        report("PASS secure key storage test complete")
                    } catch (error: Exception) { expected?.fill(0); report("FAIL authenticated operation: " + error.javaClass.simpleName) }
                }, onError = { expected?.fill(0); report("Authentication not completed: " + it) })
        } catch (error: Exception) { report("FAIL setup: " + error.javaClass.simpleName) }
    }
}
