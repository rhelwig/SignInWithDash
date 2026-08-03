package org.siwd.authenticator.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.siwd.authenticator.data.DevFixtures
import org.siwd.authenticator.data.PlatformDiscovery
import org.siwd.authenticator.data.RequestClient
import org.siwd.authenticator.data.SecureIdentityStore
import org.siwd.authenticator.data.SiteNamePrefs
import org.siwd.authenticator.security.DeviceGate
import org.siwd.protocol.AuthRequest
import org.siwd.protocol.SiwdSigner
import org.siwd.protocol.displayDashName
import org.siwd.protocol.hexToBytes
import java.time.Instant

@Composable
fun HomeScreen(
    identityStore: SecureIdentityStore,
    proxyBase: String,
    onSaveProxy: (String) -> Unit,
    onPasteUrl: (String) -> Unit,
    onScan: () -> Unit,
    onImport: () -> Unit,
    onFixtures: () -> Unit,
) {
    var url by remember { mutableStateOf("") }
    var proxy by remember { mutableStateOf(proxyBase) }
    val stored = remember { identityStore.list() }

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
        Card {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Never enter a mainnet recovery phrase. Testnet only.",
                    color = MaterialTheme.colorScheme.tertiary,
                )
                Text(
                    if (stored.isEmpty()) {
                        "No imported identities yet — import a testnet phrase or use dev fixtures."
                    } else {
                        "Loaded identities: ${stored.size} (${
                            stored.joinToString { displayDashName(it.fullDpnsNames.firstOrNull() ?: it.identityId.take(8)) }
                        })"
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        Button(onClick = onScan, modifier = Modifier.fillMaxWidth()) {
            Text("Scan login QR")
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
        Button(onClick = onImport, modifier = Modifier.fillMaxWidth()) {
            Text("Import testnet recovery phrase")
        }
        TextButton(onClick = onFixtures) {
            Text("Dev fixtures (alice / bob)")
        }

        OutlinedTextField(
            value = proxy,
            onValueChange = { proxy = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Platform discovery proxy") },
            supportingText = {
                Text(
                    "Demo-web base URL for live testnet discovery. Emulator: http://10.0.2.2:8787 · " +
                        "Phone: http://YOUR_PC_LAN_IP:8787",
                )
            },
            singleLine = true,
        )
        TextButton(onClick = { onSaveProxy(proxy.trim()) }) {
            Text("Save proxy URL")
        }
    }
}

@Composable
fun ImportPhraseScreen(
    discovery: PlatformDiscovery,
    identityStore: SecureIdentityStore,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    var phrase by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Import testnet phrase", style = MaterialTheme.typography.headlineSmall)
        Text(
            "The phrase is used once to discover identities on Dash Platform testnet, " +
                "then discarded. Only HIGH authentication keys are stored encrypted on device.",
        )
        OutlinedTextField(
            value = phrase,
            onValueChange = { phrase = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("BIP-39 recovery phrase") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            minLines = 3,
        )
        Button(
            onClick = {
                busy = true
                error = null
                status = "Discovering identities on testnet…"
                scope.launch {
                    try {
                        val found =
                            withContext(Dispatchers.IO) {
                                discovery.discoverFromMnemonic(phrase.trim())
                            }
                        if (found.isEmpty()) {
                            error =
                                "No Platform identities found for this phrase (checked identity indexes 0–5). " +
                                    "Confirm it is a testnet identity phrase and the discovery proxy is reachable."
                        } else {
                            val stored =
                                found.map {
                                    SecureIdentityStore.ofKeys(
                                        identityId = it.identityId,
                                        identityIndex = it.identityIndex,
                                        keyId = it.keyId,
                                        names = it.fullDpnsNames.ifEmpty { listOf("unnamed.dash") },
                                        privateKey = it.privateKey,
                                        publicKey = it.publicKey,
                                    )
                                }
                            identityStore.saveAll(stored)
                            // Best-effort wipe of phrase from UI state
                            phrase = ""
                            status =
                                "Imported ${stored.size} identity(ies):\n" +
                                    stored.joinToString("\n") {
                                        "• ${it.fullDpnsNames.joinToString { n -> displayDashName(n) }} (${it.identityId.take(12)}…)"
                                    }
                        }
                    } catch (e: Exception) {
                        error = e.message ?: e.toString()
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy && phrase.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (busy) "Working…" else "Discover & save")
        }
        if (status != null) Text(status!!)
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        TextButton(onClick = onBack) { Text("Back") }
        if (status != null && error == null && !busy) {
            Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Done") }
        }
    }
}

@Composable
fun SetupScreen(
    identityStore: SecureIdentityStore,
    onBack: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Identities", style = MaterialTheme.typography.headlineSmall)
        Text("Imported (encrypted):")
        val stored = identityStore.list()
        if (stored.isEmpty()) {
            Text("None yet.", color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        } else {
            stored.forEach { id ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            id.fullDpnsNames.joinToString { displayDashName(it) },
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                        )
                        Text(id.identityId, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                        Text("key ${id.keyId} · identity index ${id.identityIndex}")
                    }
                }
            }
        }
        Text("Dev fixtures (always available for local demo):")
        DevFixtures.all.forEach { id ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(id.label, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    Text(id.fullDpnsName, fontFamily = FontFamily.Monospace)
                }
            }
        }
        TextButton(
            onClick = {
                identityStore.clear()
            },
        ) {
            Text("Clear imported identities")
        }
        Button(onClick = onBack) { Text("Back") }
    }
}

private sealed class SignerChoice {
    data class Imported(val stored: SecureIdentityStore.StoredIdentity) : SignerChoice()

    data class Fixture(val fixture: DevFixtures.Identity) : SignerChoice()

    val identityId: String
        get() =
            when (this) {
                is Imported -> stored.identityId
                is Fixture -> fixture.identityId
            }

    val defaultName: String
        get() =
            when (this) {
                is Imported -> stored.fullDpnsNames.firstOrNull() ?: "unnamed.dash"
                is Fixture -> fixture.fullDpnsName
            }

    val keyId: Int
        get() =
            when (this) {
                is Imported -> stored.keyId
                is Fixture -> fixture.keyId
            }

    val privateKey: ByteArray
        get() =
            when (this) {
                is Imported -> hexToBytes(stored.privateKeyHex)
                is Fixture -> fixture.privateKey
            }

    val label: String
        get() =
            when (this) {
                is Imported ->
                    displayDashName(stored.fullDpnsNames.firstOrNull() ?: stored.identityId.take(10))
                is Fixture -> fixture.label
            }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApproveScreen(
    capabilityUrl: String,
    client: RequestClient,
    sitePrefs: SiteNamePrefs,
    identityStore: SecureIdentityStore,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val activity = LocalContext.current as FragmentActivity
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var request by remember { mutableStateOf<AuthRequest?>(null) }

    val choices =
        remember {
            identityStore.list().map { SignerChoice.Imported(it) } +
                DevFixtures.all.map { SignerChoice.Fixture(it) }
        }
    var choice by remember { mutableStateOf(choices.first()) }
    var nameInput by remember { mutableStateOf(displayDashName(choice.defaultName)) }
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
                sitePrefs.getLastName(req.origin, choice.identityId) ?: choice.defaultName
            nameInput = displayDashName(preferred)
            loading = false
        } catch (e: Exception) {
            error = e.message ?: e.toString()
            loading = false
        }
    }

    LaunchedEffect(choice, request) {
        val req = request ?: return@LaunchedEffect
        val preferred =
            sitePrefs.getLastName(req.origin, choice.identityId) ?: choice.defaultName
        nameInput = displayDashName(preferred)
    }

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

    fun doSign() {
        val req = request ?: return
        busy = true
        result = null
        error = null
        scope.launch {
            try {
                val fullName = fullNameFromInput(nameInput)
                val body =
                    withContext(Dispatchers.IO) {
                        client.signAndRespond(
                            authRequest = req,
                            identityId = choice.identityId,
                            dpnsName = fullName,
                            keyId = choice.keyId,
                            privateKey = choice.privateKey,
                        )
                    }
                sitePrefs.setLastName(req.origin, choice.identityId, fullName)
                result =
                    "Approved. Return to the browser — it should finish signing you in.\n$body"
            } catch (e: Exception) {
                error = e.message ?: e.toString()
            } finally {
                busy = false
            }
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
            error != null && result == null ->
                Text(error!!, color = MaterialTheme.colorScheme.error)
            request != null -> {
                val req = request!!
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Website", style = MaterialTheme.typography.labelMedium)
                        Text(req.domain, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        Text("Action: ${req.action.jsonName()}")
                        Text("Network: ${req.network.jsonName()}")
                        Text(
                            if (secondsLeft > 0) "Expires in ${secondsLeft}s" else "Expired",
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
                        value = choice.label,
                        onValueChange = {},
                        readOnly = true,
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier =
                            Modifier
                                .menuAnchor()
                                .fillMaxWidth(),
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        choices.forEach { c ->
                            DropdownMenuItem(
                                text = { Text(c.label) },
                                onClick = {
                                    choice = c
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
                        Text("Defaults to the name last used for this site / identity.")
                    },
                    singleLine = true,
                )

                Button(
                    onClick = {
                        DeviceGate.authenticate(
                            activity = activity,
                            onSuccess = { doSign() },
                            onError = { msg -> error = msg },
                        )
                    },
                    enabled = !busy && secondsLeft > 0,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (busy) "Signing…" else "Approve & sign in")
                }

                Text(
                    "Unlock with fingerprint if enrolled, otherwise your device PIN/pattern/password.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                )

                if (result != null) {
                    Text(result!!, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
                        Text("Done")
                    }
                }
                if (error != null && result != null) {
                    Text(error!!, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
