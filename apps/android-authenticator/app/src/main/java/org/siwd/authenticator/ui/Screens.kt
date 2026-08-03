package org.siwd.authenticator.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.siwd.authenticator.data.DevFixtures
import org.siwd.authenticator.data.RequestClient
import org.siwd.authenticator.data.SiteNamePrefs
import org.siwd.protocol.AuthRequest
import org.siwd.protocol.displayDashName
import java.time.Instant

@Composable
fun HomeScreen(
    onPasteUrl: (String) -> Unit,
    onOpenSetup: () -> Unit,
) {
    var url by remember { mutableStateOf("") }
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("TESTNET ONLY", color = MaterialTheme.colorScheme.tertiary, fontWeight = FontWeight.Bold)
        Text("Sign in with Dash", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Approve website logins with your Dash identity. Private keys never leave this device.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
        )
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Never enter a mainnet recovery phrase. This build is for testnet demos " +
                        "(including the localhost SIWD site).",
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }
        }
        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Capability URL (paste the QR code's text here)") },
            singleLine = true,
        )
        Button(
            onClick = { if (url.isNotBlank()) onPasteUrl(url.trim()) },
            modifier = Modifier.fillMaxWidth(),
            enabled = url.contains("/dash-auth/v1/r/"),
        ) {
            Text("Open login request")
        }
        TextButton(onClick = onOpenSetup) {
            Text("Dev fixture identities (alice / bob)")
        }
        Text(
            "Camera QR scan and phrase import come next. Samsung Galaxy A7 is the first sideload target.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
    }
}

@Composable
fun SetupScreen(onBack: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Dev fixture identities", style = MaterialTheme.typography.headlineSmall)
        Text(
            "These match the demo website simulator. They use deterministic test private keys, " +
                "not BIP-39 phrases. Phrase import + Platform discovery will replace this path.",
        )
        DevFixtures.all.forEach { id ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(id.label, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    Text("Full name: ${id.fullDpnsName}", fontFamily = FontFamily.Monospace)
                    Text("Identity: ${id.identityId}", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                    Text("Key id: ${id.keyId}")
                }
            }
        }
        Button(onClick = onBack) { Text("Back") }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApproveScreen(
    capabilityUrl: String,
    client: RequestClient,
    sitePrefs: SiteNamePrefs,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var request by remember { mutableStateOf<AuthRequest?>(null) }
    var identity by remember { mutableStateOf(DevFixtures.all.first()) }
    var nameInput by remember { mutableStateOf(displayDashName(identity.fullDpnsName)) }
    var expanded by remember { mutableStateOf(false) }
    var secondsLeft by remember { mutableIntStateOf(0) }
    var result by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    fun fullNameFromInput(label: String): String {
        val t = label.trim()
        return if (t.endsWith(".dash", ignoreCase = true)) t.lowercase() else "$t.dash"
    }

    LaunchedEffect(capabilityUrl) {
        loading = true
        error = null
        try {
            val req =
                withContext(Dispatchers.IO) {
                    client.fetchRequest(capabilityUrl)
                }
            request = req
            val preferred =
                sitePrefs.getLastName(req.origin, identity.identityId)
                    ?: identity.fullDpnsName
            nameInput = displayDashName(preferred)
            loading = false
        } catch (e: Exception) {
            error = e.message ?: e.toString()
            loading = false
        }
    }

    // When identity changes, default name to last-used for this site+identity
    LaunchedEffect(identity, request) {
        val req = request ?: return@LaunchedEffect
        val preferred =
            sitePrefs.getLastName(req.origin, identity.identityId)
                ?: identity.fullDpnsName
        nameInput = displayDashName(preferred)
    }

    // Countdown
    LaunchedEffect(request) {
        val req = request ?: return@LaunchedEffect
        while (true) {
            val left =
                try {
                    Instant.parse(req.expiresAt).epochSecond - Instant.now().epochSecond
                } catch (_: Exception) {
                    0L
                }
            secondsLeft = left.toInt().coerceAtLeast(0)
            if (left <= 0) break
            delay(1000)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Approve login", style = MaterialTheme.typography.headlineSmall)
        TextButton(onClick = onBack) { Text("Cancel") }

        when {
            loading -> Text("Loading request…")
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
            request != null -> {
                val req = request!!
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Website", style = MaterialTheme.typography.labelMedium)
                        Text(req.domain, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        Text("Action: ${req.action.jsonName()}")
                        Text("Network: ${req.network.jsonName()}")
                        Text("Binding: ${req.bindingPolicy.jsonName()}")
                        Text(
                            if (secondsLeft > 0) {
                                "Expires in ${secondsLeft}s"
                            } else {
                                "Expired"
                            },
                            color =
                                if (secondsLeft > 0) {
                                    MaterialTheme.colorScheme.tertiary
                                } else {
                                    MaterialTheme.colorScheme.error
                                },
                        )
                    }
                }

                Card(
                    colors =
                        CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                        ),
                ) {
                    Text(
                        "Only approve if you personally started this login for ${req.domain} moments ago.",
                        Modifier.padding(12.dp),
                    )
                }

                Text("Sign in as", style = MaterialTheme.typography.labelLarge)
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                    OutlinedTextField(
                        value = identity.label,
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier =
                            Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        DevFixtures.all.forEach { id ->
                            DropdownMenuItem(
                                text = { Text(id.label) },
                                onClick = {
                                    identity = id
                                    expanded = false
                                },
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = nameInput,
                    onValueChange = { nameInput = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Dash name (without .dash)") },
                    supportingText = {
                        Text("Defaults to the name last used for this site. Changing it updates what is signed.")
                    },
                    singleLine = true,
                )

                Button(
                    onClick = {
                        busy = true
                        result = null
                        error = null
                        scope.launch {
                            try {
                                val fullName = fullNameFromInput(nameInput)
                                val body =
                                    withContext(Dispatchers.IO) {
                                        client.signAndRespond(req, identity, fullName)
                                    }
                                sitePrefs.setLastName(req.origin, identity.identityId, fullName)
                                result = "Approved. Return to the browser — it should finish signing you in.\n$body"
                            } catch (e: Exception) {
                                error = e.message ?: e.toString()
                            } finally {
                                busy = false
                            }
                        }
                    },
                    enabled = !busy && secondsLeft > 0,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (busy) "Signing…" else "Approve & sign in")
                }

                if (result != null) {
                    Text(result!!, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
                        Text("Done")
                    }
                }
            }
        }
    }
}
