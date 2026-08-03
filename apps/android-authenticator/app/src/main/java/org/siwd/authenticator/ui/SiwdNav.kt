package org.siwd.authenticator.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.siwd.authenticator.data.PlatformDiscovery
import org.siwd.authenticator.data.RequestClient
import org.siwd.authenticator.data.SecureIdentityStore
import org.siwd.authenticator.data.SiteNamePrefs
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Default discovery proxy = local demo site (override via shared prefs later). */
const val DEFAULT_PLATFORM_PROXY = "http://10.0.2.2:8787"

@Composable
fun SiwdNav(initialCapabilityUrl: String?) {
    val nav = rememberNavController()
    val context = LocalContext.current
    val appCtx = context.applicationContext
    val sitePrefs = remember { SiteNamePrefs(appCtx) }
    val identityStore = remember { SecureIdentityStore(appCtx) }
    val prefs =
        remember {
            appCtx.getSharedPreferences("siwd_app", 0)
        }
    val proxyBase =
        remember {
            prefs.getString("platform_proxy", null)
                ?: // Emulator → host loopback; physical device should set LAN IP of demo machine
                DEFAULT_PLATFORM_PROXY
        }
    val client = remember { RequestClient() }
    val discovery = remember { PlatformDiscovery(proxyBase) }

    val start =
        if (!initialCapabilityUrl.isNullOrBlank()) {
            "approve/${enc(initialCapabilityUrl)}"
        } else {
            "home"
        }

    NavHost(navController = nav, startDestination = start) {
        composable("home") {
            HomeScreen(
                identityStore = identityStore,
                proxyBase = proxyBase,
                onSaveProxy = { url ->
                    prefs.edit().putString("platform_proxy", url).apply()
                },
                onPasteUrl = { url -> nav.navigate("approve/${enc(url)}") },
                onScan = { nav.navigate("scan") },
                onImport = { nav.navigate("import") },
                onFixtures = { nav.navigate("setup") },
            )
        }
        composable("scan") {
            QrScanScreen(
                onResult = { text ->
                    nav.popBackStack()
                    nav.navigate("approve/${enc(text.trim())}")
                },
                onCancel = { nav.popBackStack() },
            )
        }
        composable("import") {
            ImportPhraseScreen(
                discovery = discovery,
                identityStore = identityStore,
                onDone = { nav.popBackStack() },
                onBack = { nav.popBackStack() },
            )
        }
        composable("setup") {
            SetupScreen(
                identityStore = identityStore,
                onBack = { nav.popBackStack() },
            )
        }
        composable(
            route = "approve/{url}",
            arguments = listOf(navArgument("url") { type = NavType.StringType }),
        ) { entry ->
            val url = dec(entry.arguments?.getString("url").orEmpty())
            ApproveScreen(
                capabilityUrl = url,
                client = client,
                sitePrefs = sitePrefs,
                identityStore = identityStore,
                onDone = { nav.popBackStack("home", inclusive = false) },
                onBack = { nav.popBackStack() },
            )
        }
    }
}

private fun enc(s: String): String =
    URLEncoder.encode(s, StandardCharsets.UTF_8.toString())

private fun dec(s: String): String =
    URLDecoder.decode(s, StandardCharsets.UTF_8.toString())
