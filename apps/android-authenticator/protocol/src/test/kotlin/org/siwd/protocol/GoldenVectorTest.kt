package org.siwd.protocol

import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Cross-check Kotlin encoder/signer against TypeScript-generated golden vectors.
 */
class GoldenVectorTest {
    private val vectorsRoot: File? = findVectors()

    private fun findVectors(): File? {
        var dir = File(System.getProperty("user.dir")).absoluteFile
        repeat(10) {
            val cand = File(dir, "test-vectors/v1")
            if (cand.isDirectory) return cand
            dir = dir.parentFile ?: return null
        }
        return null
    }

    @Test
    fun positiveVectors_matchCanonicalDigestAndVerify() {
        assumeTrue(vectorsRoot != null, "test-vectors/v1 not found from ${System.getProperty("user.dir")}")
        val positive = File(vectorsRoot, "positive")
        val files = positive.listFiles { f -> f.extension == "json" }?.sortedBy { it.name }
        assertTrue(!files.isNullOrEmpty(), "no positive vectors")

        for (file in files!!) {
            val root = JsonParser.parseString(file.readText()).asJsonObject
            if (root.get("expect")?.asString != "accept") continue

            val request = root.getAsJsonObject("request")
            val response = root.getAsJsonObject("response")
            val platform = root.getAsJsonObject("platform")
            val expectedCanonical = root.get("canonical_hex").asString
            val expectedDigest = root.get("digest_sha256d_hex").asString
            val sig =
                response.get("signature_b64url")?.asString
                    ?: response.get("signature").asString

            val input =
                CanonicalInput(
                    network = Network.parse(request.get("network").asString),
                    origin = request.get("origin").asString,
                    action = Action.parse(request.get("action").asString),
                    bindingPolicy = BindingPolicy.parse(request.get("bindingPolicy").asString),
                    requestId = request.get("requestId").asString,
                    nonce = base64UrlDecode(request.get("nonce_b64url").asString),
                    issuedAt = request.get("issuedAt").asString,
                    expiresAt = request.get("expiresAt").asString,
                    identityId = response.get("identityId").asString,
                    dpnsName = response.get("dpnsName").asString,
                    keyId = response.get("keyId").asInt,
                )

            assertEquals(
                expectedCanonical,
                bytesToHex(buildCanonicalBytes(input)),
                "canonical mismatch ${file.name}",
            )
            assertEquals(
                expectedDigest,
                bytesToHex(digestCanonical(input)),
                "digest mismatch ${file.name}",
            )
            assertTrue(
                SiwdSigner.verifyCanonical(
                    input,
                    sig,
                    hexToBytes(platform.get("publicKey_hex_compressed").asString),
                ),
                "signature verify failed ${file.name}",
            )
        }
    }

    @Test
    fun testKeyScalarOne_publicKeyMatchesFixture() {
        assumeTrue(vectorsRoot != null)
        val keyFile = File(vectorsRoot, "keys/test-secp256k1-1.json")
        assumeTrue(keyFile.isFile)
        val root = JsonParser.parseString(keyFile.readText()).asJsonObject
        val priv = hexToBytes(root.get("privateKey_hex").asString)
        val expectedPub = root.get("publicKey_hex_compressed").asString
        assertEquals(expectedPub, bytesToHex(SiwdSigner.publicKeyCompressed(priv)))
    }

    @Test
    fun displayDashName_stripsParent() {
        assertEquals("alice", displayDashName("alice.dash"))
        assertEquals("bob", displayDashName("bob.dash"))
    }
}
