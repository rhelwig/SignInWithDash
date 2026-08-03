package org.siwd.authenticator.security

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
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt =
            BiometricPrompt(
                activity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        onSuccess()
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

        val info =
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                // Biometric if available, otherwise device PIN/pattern/password
                .setAllowedAuthenticators(
                    Authenticators.BIOMETRIC_STRONG or Authenticators.DEVICE_CREDENTIAL,
                )
                .build()

        try {
            prompt.authenticate(info)
        } catch (e: Exception) {
            // Fallback: if authenticator combination fails on old devices, try device credential only
            try {
                val fallback =
                    BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setSubtitle(subtitle)
                        .setAllowedAuthenticators(Authenticators.DEVICE_CREDENTIAL)
                        .build()
                prompt.authenticate(fallback)
            } catch (e2: Exception) {
                onError(e2.message ?: e.message ?: "Device authentication unavailable")
            }
        }
    }
}
