package org.siwd.authenticator.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DashBlue = Color(0xFF008DE4)
private val DashCyan = Color(0xFF00C2FF)
private val Warn = Color(0xFFF0B429)

private val DarkColors =
    darkColorScheme(
        primary = DashCyan,
        secondary = DashBlue,
        tertiary = Warn,
        background = Color(0xFF0F1419),
        surface = Color(0xFF1A2332),
        onPrimary = Color.Black,
        onBackground = Color(0xFFE7ECF3),
        onSurface = Color(0xFFE7ECF3),
    )

private val LightColors =
    lightColorScheme(
        primary = DashBlue,
        secondary = DashCyan,
        tertiary = Warn,
    )

@Composable
fun SiwdTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        content = content,
    )
}
