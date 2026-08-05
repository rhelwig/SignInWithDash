package org.siwd.authenticator.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.Checkbox
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
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.siwd.authenticator.data.DevFixtures
import org.siwd.authenticator.data.KnownSitesStore
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
    knownSites: KnownSitesStore,
    onPasteUrl: (String) -> Unit,
    onScan: () -> Unit,
    onImport: () -> Unit,
    onFixtures: () -> Unit,
) {
    val context = LocalContext.current
    var url by remember { mutableStateOf("") }
    var sites by remember { mutableStateOf(knownSites.list()) }
    val stored = remember { identityStore.list() }

    fun openSite(site: KnownSitesStore.Site) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(site.openUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (_: Exception) {
            // no browser
        }
    }

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
                            stored.joinToString {
                                displayDashName(
                                    it.fullDpnsNames.firstOrNull() ?: it.identityId.take(8),
                                )
                            }
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
            Text("Dev fixtures (alice / bob — local simulator only)")
        }

        // Known sites — open relying party in the device browser
        Text("Your sites", style = MaterialTheme.typography.titleMedium)
        Text(
            "Sites you have signed into from this app. Open them in the browser on this device " +
                "(you may need to sign in again if the browser has no session cookie).",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
        )
        if (sites.isEmpty()) {
            Text(
                "No sites yet — complete a login and they will appear here.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        } else {
            sites.forEach { site ->
                Card(Modifier.fillMaxWidth()) {
                    Column(
                        Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            site.domain.ifBlank { site.origin },
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                        )
                        if (site.dpnsName.isNotBlank()) {
                            Text(
                                "as ${displayDashName(site.dpnsName)}",
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                            )
                        }
                        Text(
                            site.origin,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { openSite(site) }) {
                                Text("Open website")
                            }
                            TextButton(
                                onClick = {
                                    knownSites.remove(site.origin, site.identityId)
                                    sites = knownSites.list()
                                },
                            ) {
                                Text("Remove")
                            }
                        }
                    }
                }
            }
        }

        Text(
            "Identity discovery talks to Dash Platform testnet from this device " +
                "(DAPI + public trusted quorum context). No website proxy.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
        )
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
    var passphrase by remember { mutableStateOf("") }
    var hintName by remember { mutableStateOf("") }
    var showPhrase by remember { mutableStateOf(true) }
    var showPassphrase by remember { mutableStateOf(false) }
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
        Text(
            "Enter the words of the recovery phrase in order, separated by a single space " +
                "(for example: word1 word2 word3 …). Extra spaces are cleaned up automatically. " +
                "Use a testnet-only phrase — never mainnet.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
        )
        Text(
            "If you set an optional BIP-39 passphrase when creating the wallet " +
                "(sometimes called the 13th or 25th word), enter it below. Leave blank if you did not.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
        )
        Text(
            "Discovery talks to Dash Platform testnet from this device (on-device DAPI + " +
                "public trusted quorums). Private keys never leave the phone. " +
                "Enter your DPNS name below if you have one — it helps when hash lookup is flaky.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
        OutlinedTextField(
            value = hintName,
            onValueChange = { hintName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("DPNS name (optional assist)") },
            supportingText = {
                Text("e.g. ronhelwig4test — helps when public-key-hash lookup is flaky")
            },
            singleLine = true,
        )
        OutlinedTextField(
            value = phrase,
            onValueChange = { phrase = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("BIP-39 recovery phrase") },
            supportingText = {
                Text("12 or 24 words, lowercase English BIP-39 words, space-separated")
            },
            visualTransformation =
                if (showPhrase) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions =
                KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    keyboardType = KeyboardType.Text,
                ),
            minLines = 3,
        )
        OutlinedTextField(
            value = passphrase,
            onValueChange = { passphrase = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("BIP-39 passphrase (optional)") },
            supportingText = {
                Text("Extra word/password from wallet creation — not part of the 12/24 words")
            },
            visualTransformation =
                if (showPassphrase) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions =
                KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    keyboardType = KeyboardType.Password,
                ),
            singleLine = true,
        )
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Checkbox(
                checked = showPhrase,
                onCheckedChange = { showPhrase = it },
            )
            Text(
                "Show phrase",
                modifier = Modifier.padding(start = 4.dp),
            )
            Spacer(Modifier.weight(1f))
            Checkbox(
                checked = showPassphrase,
                onCheckedChange = { showPassphrase = it },
            )
            Text(
                "Show passphrase",
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        Button(
            onClick = {
                busy = true
                error = null
                status = "Discovering identities on testnet (on-device DAPI)…"
                scope.launch {
                    try {
                        val found =
                            withContext(Dispatchers.IO) {
                                discovery.discoverFromMnemonic(
                                    phrase = phrase,
                                    hintName = hintName.trim().ifBlank { null },
                                    passphrase = passphrase,
                                )
                            }
                        if (found.isEmpty()) {
                            error =
                                "No Platform identities found for this phrase (checked identity indexes 0–5). " +
                                    "Confirm it is a testnet phrase and that an identity already exists " +
                                    "(create identity/username in testnet DashPay first)."
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
                            phrase = ""
                            passphrase = ""
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
        Text(
            "Dev fixtures (local hybrid/simulator sites only — not dashlogin public platform mode):",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f),
        )
        DevFixtures.all.forEach { id ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(id.label, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                    Text(id.fullDpnsName, fontFamily = FontFamily.Monospace)
                    Text(
                        "Synthetic keys — not live testnet identities",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                    )
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
                is Fixture -> "${fixture.label} (local fixture only)"
            }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApproveScreen(
    capabilityUrl: String,
    client: RequestClient,
    sitePrefs: SiteNamePrefs,
    knownSites: KnownSitesStore,
    identityStore: SecureIdentityStore,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val activity = context as FragmentActivity
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var request by remember { mutableStateOf<AuthRequest?>(null) }

    val imported = remember { identityStore.list() }
    val choices =
        remember(imported) {
            // Prefer real imported identities first so public platform demos don't default to alice/bob.
            imported.map { SignerChoice.Imported(it) } +
                DevFixtures.all.map { SignerChoice.Fixture(it) }
        }
    var choice by remember {
        mutableStateOf(
            choices.firstOrNull { it is SignerChoice.Imported } ?: choices.first(),
        )
    }
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
                knownSites.recordLogin(
                    origin = req.origin,
                    domain = req.domain,
                    identityId = choice.identityId,
                    dpnsName = fullName,
                )
                result =
                    "Approved. Return to the browser — it should finish signing you in.\n$body"
            } catch (e: Exception) {
                val raw = e.message ?: e.toString()
                error =
                    if (
                        raw.contains("name_ineligible", ignoreCase = true) ||
                            raw.contains("Name unresolved", ignoreCase = true) ||
                            raw.contains("Name resolves to a different", ignoreCase = true)
                    ) {
                        raw +
                            "\n\nPublic platform demos need a real testnet DPNS name " +
                            "imported from your recovery phrase. alice/bob fixtures only " +
                            "work against a local hybrid/simulator site."
                    } else {
                        raw
                    }
            } finally {
                busy = false
            }
        }
    }

    fun openOriginInBrowser() {
        val req = request ?: return
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(req.origin))
            context.startActivity(intent)
        } catch (_: Exception) {
            error = "Could not open browser for ${req.origin}"
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
                    Button(
                        onClick = { openOriginInBrowser() },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Open website on this device")
                    }
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
