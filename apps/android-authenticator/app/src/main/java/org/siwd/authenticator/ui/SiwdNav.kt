package org.siwd.authenticator.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.siwd.authenticator.data.RequestClient
import org.siwd.authenticator.data.SiteNamePrefs
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Composable
fun SiwdNav(initialCapabilityUrl: String?) {
    val nav = rememberNavController()
    val context = LocalContext.current
    val sitePrefs = remember { SiteNamePrefs(context.applicationContext) }
    val client = remember { RequestClient() }

    val start =
        if (!initialCapabilityUrl.isNullOrBlank()) {
            "approve/${enc(initialCapabilityUrl)}"
        } else {
            "home"
        }

    NavHost(navController = nav, startDestination = start) {
        composable("home") {
            HomeScreen(
                onPasteUrl = { url -> nav.navigate("approve/${enc(url)}") },
                onOpenSetup = { nav.navigate("setup") },
            )
        }
        composable("setup") {
            SetupScreen(onBack = { nav.popBackStack() })
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
