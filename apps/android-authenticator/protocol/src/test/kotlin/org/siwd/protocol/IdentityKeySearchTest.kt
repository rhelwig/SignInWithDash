package org.siwd.protocol

import kotlin.test.*
import org.junit.jupiter.api.Test

class IdentityKeySearchTest {
    // Synthetic seed and public fixtures independently generated with Python
    // HMAC-SHA512 BIP32 derivation and cryptography's secp256k1 implementation.
    private fun seed() = ByteArray(64) { it.toByte() }
    private val slot2 = hexToBytes("039020bef6f2ddcbc775ad0bbe29437f582b5cc79f15699495991f7ca602f4c11e")
    private val identity7 = hexToBytes("03bc66bc9f8bb1879979df03a5bfe450d4c98bdd7c5834b3d81947c2d6aed83703")

    @Test fun `Platform key IDs are independent of derivation slots`() {
        val input = seed()
        val match = assertNotNull(IdentityKeySearch.find(input, Network.TESTNET, mapOf(37 to slot2)))
        assertEquals(37, match.keyId)
        assertEquals(2, match.keyIndex)
        assertEquals(0, match.identityIndex)
        assertContentEquals(slot2, SiwdSigner.publicKeyCompressed(match.privateKey))
        assertContentEquals(seed(), input)
        match.privateKey.fill(0)
    }

    @Test fun `name assisted recovery finds keys beyond the old search range`() {
        val match = assertNotNull(IdentityKeySearch.find(seed(), Network.TESTNET, mapOf(1 to identity7)))
        assertEquals(7, match.identityIndex)
        assertEquals(9, match.keyIndex)
        assertEquals(1, match.keyId)
        assertContentEquals(identity7, SiwdSigner.publicKeyCompressed(match.privateKey))
        match.privateKey.fill(0)
    }

    @Test fun `wrong seed network and insufficient bounds do not match`() {
        assertNull(IdentityKeySearch.find(ByteArray(64) { 42 }, Network.TESTNET, mapOf(1 to slot2), 0, 3))
        assertNull(IdentityKeySearch.find(seed(), Network.MAINNET, mapOf(1 to slot2), 0, 3))
        assertNull(IdentityKeySearch.find(seed(), Network.TESTNET, mapOf(1 to identity7), 5, 5))
        assertFailsWith<IllegalArgumentException> { IdentityKeySearch.find(seed(), Network.TESTNET, emptyMap(), 20) }
    }

    @Test fun `BIP39 passphrases use Unicode NFKD normalization`() {
        val phrase = "abandon ".repeat(11) + "about"
        val expected = hexToBytes("af8bbd2566df7b69d926f2b09dfdbd75db6c994a3399b2cc65f928d63e3fd4e61218ee0d15f8c810be4d45e66d47b43c15a5cc753976b1666912377ff7ae9818")
        assertContentEquals(expected, Bip39.mnemonicToSeed(phrase, "caf\u00e9"))
        assertContentEquals(expected, Bip39.mnemonicToSeed(phrase, "cafe\u0301"))
    }

}
