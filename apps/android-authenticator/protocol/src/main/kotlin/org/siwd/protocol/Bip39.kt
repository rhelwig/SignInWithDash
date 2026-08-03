package org.siwd.protocol

import org.bouncycastle.crypto.digests.SHA512Digest
import org.bouncycastle.crypto.macs.HMac
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.jce.provider.BouncyCastleProvider
import java.security.MessageDigest
import java.security.Security
import java.text.Normalizer
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Minimal BIP-39 (English) + BIP-32 helpers for SIWD identity derivation.
 * Wordlist is the standard BIP-39 English list (2048 words).
 */
object Bip39 {
    init {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
    }

    fun normalizeMnemonic(phrase: String): String =
        Normalizer.normalize(phrase.trim().lowercase().replace(Regex("\\s+"), " "), Normalizer.Form.NFKD)

    fun validateMnemonic(phrase: String): Boolean {
        val words = normalizeMnemonic(phrase).split(" ")
        if (words.size !in listOf(12, 15, 18, 21, 24)) return false
        if (words.any { it !in WORD_SET }) return false
        // Checksum validation
        val bits = words.joinToString("") { w ->
            WORD_LIST.indexOf(w).toString(2).padStart(11, '0')
        }
        val entLen = bits.length * 32 / 33
        val entropyBits = bits.substring(0, entLen)
        val checksumBits = bits.substring(entLen)
        val entropy = bitsToBytes(entropyBits)
        val hash = MessageDigest.getInstance("SHA-256").digest(entropy)
        val expected = bytesToBits(hash).substring(0, words.size / 3)
        return checksumBits == expected
    }

    fun mnemonicToSeed(phrase: String, passphrase: String = ""): ByteArray {
        val normalized = normalizeMnemonic(phrase)
        val salt = "mnemonic$passphrase"
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512")
        val spec = PBEKeySpec(normalized.toCharArray(), salt.toByteArray(Charsets.UTF_8), 2048, 512)
        return factory.generateSecret(spec).encoded
    }

    private fun bitsToBytes(bits: String): ByteArray {
        val padded = bits.padEnd((bits.length + 7) / 8 * 8, '0')
        return ByteArray(padded.length / 8) { i ->
            padded.substring(i * 8, i * 8 + 8).toInt(2).toByte()
        }
    }

    private fun bytesToBits(bytes: ByteArray): String =
        bytes.joinToString("") { b -> (b.toInt() and 0xff).toString(2).padStart(8, '0') }

    val WORD_LIST: List<String> by lazy {
        // Standard BIP-39 English wordlist (subset loaded from resource string is large;
        // embedded via companion file Bip39Wordlist.kt)
        Bip39Wordlist.WORDS
    }

    private val WORD_SET: Set<String> by lazy { WORD_LIST.toSet() }
}

/**
 * BIP-32 secp256k1 HD key derivation (private parent → private child).
 */
object Bip32 {
    private val HMAC_KEY = "Bitcoin seed".toByteArray(Charsets.UTF_8)

    data class ExtKey(val key: ByteArray, val chainCode: ByteArray) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is ExtKey) return false
            return key.contentEquals(other.key) && chainCode.contentEquals(other.chainCode)
        }

        override fun hashCode(): Int = 31 * key.contentHashCode() + chainCode.contentHashCode()
    }

    fun masterFromSeed(seed: ByteArray): ExtKey {
        val i = hmacSha512(HMAC_KEY, seed)
        return ExtKey(i.copyOfRange(0, 32), i.copyOfRange(32, 64))
    }

    fun derivePath(master: ExtKey, path: String): ExtKey {
        var key = master
        val body = path.removePrefix("m/").removePrefix("M/")
        if (body.isEmpty()) return key
        for (part in body.split("/")) {
            if (part.isEmpty()) continue
            val hardened = part.endsWith("'") || part.endsWith("h") || part.endsWith("H")
            val index =
                part.trimEnd('\'', 'h', 'H').toLong() +
                    if (hardened) 0x80000000L else 0L
            key = ckdPriv(key, index)
        }
        return key
    }

    private fun ckdPriv(parent: ExtKey, index: Long): ExtKey {
        val data =
            if (index >= 0x80000000L) {
                byteArrayOf(0) + parent.key + int32be(index)
            } else {
                val pub = SiwdSigner.publicKeyCompressed(parent.key)
                pub + int32be(index)
            }
        val i = hmacSha512(parent.chainCode, data)
        val il = i.copyOfRange(0, 32)
        val ir = i.copyOfRange(32, 64)
        val n =
            java.math.BigInteger(
                "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
                16,
            )
        val parseIl = java.math.BigInteger(1, il)
        require(parseIl < n && parseIl != java.math.BigInteger.ZERO)
        val ki =
            parseIl
                .add(java.math.BigInteger(1, parent.key))
                .mod(n)
                .toByteArray()
                .let { raw ->
                    when {
                        raw.size == 32 -> raw
                        raw.size > 32 -> raw.copyOfRange(raw.size - 32, raw.size)
                        else -> ByteArray(32 - raw.size) + raw
                    }
                }
        return ExtKey(ki, ir)
    }

    private fun int32be(v: Long): ByteArray =
        byteArrayOf(
            ((v ushr 24) and 0xff).toByte(),
            ((v ushr 16) and 0xff).toByte(),
            ((v ushr 8) and 0xff).toByte(),
            (v and 0xff).toByte(),
        )

    private fun hmacSha512(key: ByteArray, data: ByteArray): ByteArray {
        val hmac = HMac(SHA512Digest())
        hmac.init(KeyParameter(key))
        hmac.update(data, 0, data.size)
        val out = ByteArray(hmac.macSize)
        hmac.doFinal(out, 0)
        return out
    }
}

/**
 * Dash Platform identity key paths (DIP-9 / Platform wallet layout).
 * m/9'/coin_type'/5'/0'/0'/identity_index'/key_index'
 */
object IdentityDerivation {
    /** testnet coin type 1'; mainnet 5 */
    fun path(network: Network, identityIndex: Int, keyIndex: Int): String {
        val coin = if (network == Network.TESTNET) 1 else 5
        return "m/9'/$coin'/5'/0'/0'/$identityIndex'/$keyIndex'"
    }

    fun derivePrivateKey(
        seed: ByteArray,
        network: Network,
        identityIndex: Int,
        keyIndex: Int,
    ): ByteArray {
        val master = Bip32.masterFromSeed(seed)
        return Bip32.derivePath(master, path(network, identityIndex, keyIndex)).key
    }

    fun publicKeyHash160(compressedPub: ByteArray): ByteArray {
        val sha = MessageDigest.getInstance("SHA-256").digest(compressedPub)
        return ripemd160(sha)
    }

    private fun ripemd160(input: ByteArray): ByteArray {
        val d = org.bouncycastle.crypto.digests.RIPEMD160Digest()
        d.update(input, 0, input.size)
        val out = ByteArray(d.digestSize)
        d.doFinal(out, 0)
        return out
    }
}
