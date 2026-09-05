package org.siwd.authenticator

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import org.siwd.authenticator.ui.SiwdNav
import org.siwd.authenticator.ui.theme.SiwdTheme

/** FragmentActivity required for BiometricPrompt. */
class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        enableEdgeToEdge()
        val initialUrl = intent?.data?.toString()
        setContent {
            SiwdTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    SiwdNav(initialCapabilityUrl = initialUrl)
                }
            }
        }
    }
}
