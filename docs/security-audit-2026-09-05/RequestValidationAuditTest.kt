// Audit reproduction; these assertions confirm insecure behavior, not security.
// Temporarily copy into protocol/src/test/kotlin/org/siwd/protocol/ to run.
package org.siwd.protocol

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RequestValidationAuditTest {
    private fun json(domain: String, response: String, version: Int = 1) = """
        {"version":$version,"network":"testnet","requestId":"audit-request",
        "nonce":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "origin":"https://victim.example.test","domain":"$domain",
        "action":"login","bindingPolicy":"identity_bound",
        "issuedAt":"2026-09-05T00:00:00Z","expiresAt":"2026-09-05T00:02:00Z",
        "responseUri":"$response"}
    """.trimIndent()

    @Test
    fun spoofedDisplayAndForeignResponseAreAcceptedWithoutChangingSignature() {
        val normal = RequestParse.parseAuthRequestJson(json("victim.example.test", "https://victim.example.test/dash-auth/v1/respond"))
        val spoofed = RequestParse.parseAuthRequestJson(json("reassuring.example.test", "https://collector.example.test/receive"))
        assertNotEquals(normal.domain, spoofed.domain)
        assertEquals("https://collector.example.test/receive", spoofed.responseUri)
        val identityId = "11111111111111111111111111111111"
        val first = RequestParse.toCanonical(normal, identityId, "audit.dash", 2)
        val second = RequestParse.toCanonical(spoofed, identityId, "audit.dash", 2)
        assertArrayEquals(buildCanonicalBytes(first), buildCanonicalBytes(second))
        val key = ByteArray(32).also { it[31] = 1 }
        assertTrue(SiwdSigner.verifyCanonical(first, SiwdSigner.signCanonicalBase64Url(second, key), SiwdSigner.publicKeyCompressed(key)))
    }

    @Test
    fun unsupportedVersionAndInsecureDestinationAreAccepted() {
        val parsed = RequestParse.parseAuthRequestJson(json("display.example.test", "http://collector.example.test/receive", 999))
        assertEquals(999, parsed.version)
        assertTrue(parsed.responseUri.startsWith("http:"))
    }
}
