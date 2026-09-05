package org.siwd.authenticator.security

import android.os.Build
import javax.crypto.Cipher
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/**
 * Gate SIWD approval behind device authentication.
 * Uses biometrics when enrolled; otherwise device PIN/pattern/password.
 */
object DeviceGate {
    fun canAuthenticate(activity: FragmentActivity): Boolean {
        val mgr = BiometricManager.from(activity)
        val res =
            mgr.canAuthenticate(Authenticators.BIOMETRIC_STRONG or Authenticators.DEVICE_CREDENTIAL)
        return res == BiometricManager.BIOMETRIC_SUCCESS ||
            res == BiometricManager.BIOMETRIC_STATUS_UNKNOWN ||
            mgr.canAuthenticate(Authenticators.DEVICE_CREDENTIAL) ==
            BiometricManager.BIOMETRIC_SUCCESS
    }

    fun authenticate(
        activity: FragmentActivity,
        title: String = "Confirm approval",
        subtitle: String = "Unlock to sign this Sign in with Dash request",
        cipher: Cipher? = null,
        onSuccess: (Cipher?) -> Unit,
        onError: (String) -> Unit,
    ) {
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt =
            BiometricPrompt(
                activity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        val authenticated = result.cryptoObject?.cipher
                        if (cipher != null && authenticated == null) onError("Cryptographic authentication failed")
                        else onSuccess(authenticated)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                            errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                        ) {
                            onError("Cancelled")
                        } else {
                            onError(errString.toString())
                        }
                    }

                    override fun onAuthenticationFailed() {
                        // User can retry; no hard fail
                    }
                },
            )

        val builder = BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle(subtitle)
        if (Build.VERSION.SDK_INT >= 30 || cipher == null) {
            builder.setAllowedAuthenticators(Authenticators.BIOMETRIC_STRONG or Authenticators.DEVICE_CREDENTIAL)
        } else {
            builder.setAllowedAuthenticators(Authenticators.BIOMETRIC_STRONG).setNegativeButtonText("Cancel")
        }
        try {
            if (cipher != null) prompt.authenticate(builder.build(), BiometricPrompt.CryptoObject(cipher))
            else prompt.authenticate(builder.build())
        } catch (e: Exception) {
            onError("Secure device authentication unavailable. ${e.message.orEmpty()}")
        }
    }
}
