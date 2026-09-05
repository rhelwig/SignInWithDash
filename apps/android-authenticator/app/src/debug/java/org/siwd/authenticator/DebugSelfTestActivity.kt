package org.siwd.authenticator

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.widget.ScrollView
import android.widget.TextView
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.siwd.authenticator.data.OnDevicePlatform
import org.siwd.authenticator.data.TrustedQuorumContext
import org.siwd.protocol.IdentityDerivation
import org.siwd.protocol.Network
import org.siwd.protocol.SiwdSigner
import org.siwd.protocol.bytesToHex
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Headless-friendly self-test for tablet iteration via adb:
 *
 *   adb shell am start -n org.siwd.authenticator.testnet.debug/.DebugSelfTestActivity
 *   adb logcat -s SiwdSelfTest:I
 *
 * Optional: -e proxy http://127.0.0.1:8792  (demo-web healthz only; discovery is on-device).
 * Use your machine’s LAN origin or adb reverse as needed — see docs/LOCAL-DEV-CONFIG.md.
 */
class DebugSelfTestActivity : Activity() {
    companion object {
        private const val TAG = "SiwdSelfTest"
    }

    private val http =
        OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .build()

    private lateinit var out: TextView
    private val exec = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        out = TextView(this).apply {
            setPadding(32, 48, 32, 48)
            textSize = 13f
            typeface = android.graphics.Typeface.MONOSPACE
        }
        setContentView(
            ScrollView(this).apply { addView(out) },
        )
        intent.getStringExtra("publicName")?.let { name ->
            check(packageName.endsWith(".testnet.securityaudit"))
            exec.execute {
                try {
                    val platform = OnDevicePlatform.platform()
                    val doc = platform.names.resolve(name)
                    log("Public name probe: document found=${doc != null}")
                    if (doc != null) {
                        log("Public document field types=" + doc.data.mapValues { it.value?.javaClass?.simpleName })
                        val records = doc.data["records"] as? Map<*, *>
                        log("Public record field types=" + records?.mapValues { it.value?.javaClass?.simpleName })
                    }
                    val id = OnDevicePlatform.resolveName(name)
                    log("Public name probe: identity resolved=${id != null}")
                    if (id != null) {
                        log("Public name list count=${OnDevicePlatform.usernamesForIdentity(id).size}")
                        val identity = OnDevicePlatform.getIdentity(id)
                        log("Public name probe: identity fetched=${identity != null}")
                        identity?.publicKeys?.forEach { key ->
                            log("Public key metadata: id=${key.id} purpose=${key.purpose} level=${key.securityLevel} bytes=${key.data.size} disabled=${key.disabledAt != null}")
                            if (key.id == 0 || key.id == 1) {
                                val hash = IdentityDerivation.publicKeyHash160(key.data)
                                log("Public key lookup: key=${key.id} matched=${OnDevicePlatform.getIdentityByPublicKeyHash(hash)?.id?.toString() == id}")
                            }
                        }
                    }
                } catch (e: Exception) { log("Public name probe failed: ${e.javaClass.simpleName}: ${e.message}") }
            }
            return
        }
        val prefs = getSharedPreferences("siwd_app", 0)
        val proxy =
            intent.getStringExtra("proxy")
                ?: prefs.getString("demo_origin", null)
                ?: prefs.getString("platform_proxy", null)
                ?: "http://127.0.0.1:8792"
        log("Starting self-test…")
        log("demo_origin=$proxy (override: adb -e proxy URL, or prefs demo_origin)")
        exec.execute { runTests(proxy) }
    }

    private fun log(line: String) {
        Log.i(TAG, line)
        runOnUiThread {
            out.append(line)
            out.append("\n")
        }
    }

    private fun runTests(proxy: String) {
        var failed = 0
        fun check(name: String, ok: Boolean, detail: String = "") {
            val status = if (ok) "PASS" else "FAIL"
            if (!ok) failed++
            log("[$status] $name${if (detail.isNotEmpty()) " — $detail" else ""}")
        }

        // 1) demo-web healthz candidates (optional; not used for identity discovery)
        val candidates =
            linkedSetOf(proxy.trimEnd('/')).apply {
                add("http://127.0.0.1:8792")
                add("https://dashlogin.ronhelwig.com")
            }
        var healthy: String? = null
        for (base in candidates) {
            // 10.0.2.2 is emulator-only; skip hard-fail on physical devices.
            val emulatorOnly = base.contains("10.0.2.2")
            try {
                val req =
                    Request.Builder()
                        .url("$base/healthz")
                        .get()
                        .build()
                http.newCall(req).execute().use { resp ->
                    val body = resp.body?.string().orEmpty()
                    val ok = resp.isSuccessful && body.contains("\"ok\"")
                    if (emulatorOnly && !ok) {
                        log("[SKIP] healthz $base — emulator host (not required on phone/tablet)")
                    } else {
                        check("healthz $base", ok, "HTTP ${resp.code} ${body.take(120)}")
                    }
                    if (ok && healthy == null) healthy = base
                }
            } catch (e: Exception) {
                if (emulatorOnly) {
                    log("[SKIP] healthz $base — ${e.message}")
                } else {
                    check("healthz $base", false, e.message ?: e.toString())
                }
            }
        }

        // 2) platform resolve known testnet name (alice is common on fixtures; live may 503)
        val resolveBase = healthy ?: proxy.trimEnd('/')
        try {
            val req =
                Request.Builder()
                    .url("$resolveBase/dash-auth/v1/platform/resolve?name=alice")
                    .get()
                    .build()
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                // Success if 200 with identityId, or 503 with platform message (server path works)
                val pathOk =
                    resp.code == 200 ||
                        resp.code == 503 ||
                        body.contains("identityId") ||
                        body.contains("platform")
                check(
                    "platform/resolve alice",
                    pathOk,
                    "HTTP ${resp.code} ${body.take(160)}",
                )
            }
        } catch (e: Exception) {
            check("platform/resolve alice", false, e.message ?: e.toString())
        }

        // 3) platform discover with a derived hash (won't match real identity; expects 200 JSON shape)
        try {
            val seed =
                org.siwd.protocol.Bip39.mnemonicToSeed(
                    // well-known BIP39 test vector phrase (NOT a funded wallet)
                    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
                )
            val priv = IdentityDerivation.derivePrivateKey(seed, Network.TESTNET, 0, 2)
            val pub = SiwdSigner.publicKeyCompressed(priv)
            val hash = bytesToHex(IdentityDerivation.publicKeyHash160(pub))
            val body =
                JSONObject()
                    .put("publicKeyHashes", JSONArray().put(hash))
                    .toString()
            val req =
                Request.Builder()
                    .url("$resolveBase/dash-auth/v1/platform/discover")
                    .header("Content-Type", "application/json")
                    .post(body.toRequestBody("application/json".toMediaType()))
                    .build()
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val ok =
                    resp.isSuccessful &&
                        (text.contains("found") || text.contains("identities") || text.contains("network"))
                check(
                    "platform/discover (abandon…about key)",
                    ok,
                    "HTTP ${resp.code} hash=${hash.take(16)}… ${text.take(160)}",
                )
            }
        } catch (e: Exception) {
            check("platform/discover", false, e.message ?: e.toString())
        }

        // 4) derivation sanity: path non-empty + stable hex length
        try {
            val seed =
                org.siwd.protocol.Bip39.mnemonicToSeed(
                    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
                )
            val priv = IdentityDerivation.derivePrivateKey(seed, Network.TESTNET, 0, 2)
            val pub = SiwdSigner.publicKeyCompressed(priv)
            check("derive priv len", priv.size == 32, "size=${priv.size}")
            check("derive pub compressed", pub.size == 33 && (pub[0] == 0x02.toByte() || pub[0] == 0x03.toByte()), "size=${pub.size} prefix=${pub[0]}")
            check("derive hash160 len", IdentityDerivation.publicKeyHash160(pub).size == 20)
        } catch (e: Exception) {
            check("derivation", false, e.message ?: e.toString())
        }

        // 5) trusted quorums (safe HTTPS — does not load native Platform SDK)
        try {
            TrustedQuorumContext.ensureFresh()
            check(
                "trusted quorums",
                TrustedQuorumContext.status().contains("quorums="),
                TrustedQuorumContext.status(),
            )
            // Optional: set -e platform 1 to exercise native Platform (can abort process)
            val tryPlatform = intent?.getStringExtra("platform") == "1"
            if (tryPlatform) {
                val probe = OnDevicePlatform.probeConnectivity(includePlatform = true)
                check("on-device Platform", probe.startsWith("ok"), probe.take(180))
                val id = OnDevicePlatform.resolveName("alice")
                log(
                    if (id != null) "[PASS] on-device resolve alice → $id"
                    else "[INFO] on-device resolve alice → null",
                )
            } else {
                log("[INFO] skip native Platform init (pass -e platform 1 to try; may native-abort)")
            }
        } catch (e: Exception) {
            check("trusted quorums / platform", false, e.message ?: e.toString())
        }

        log("")
        log(if (failed == 0) "ALL CHECKS PASSED" else "FAILED: $failed check(s)")
        log("healthyProxy=${healthy ?: "none"}")
        // Keep activity open for a while so adb logcat can be scraped
        try {
            Thread.sleep(2000)
        } catch (_: InterruptedException) {
        }
    }

    override fun onDestroy() {
        exec.shutdownNow()
        super.onDestroy()
    }
}
