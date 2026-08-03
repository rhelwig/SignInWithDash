package org.siwd.protocol

import org.bouncycastle.crypto.params.ECDomainParameters
import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.params.ECPublicKeyParameters
import org.bouncycastle.crypto.signers.ECDSASigner
import org.bouncycastle.jce.ECNamedCurveTable
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.jce.spec.ECNamedCurveParameterSpec
import org.bouncycastle.math.ec.ECPoint
import java.math.BigInteger
import java.security.Security

/**
 * Dash Platform recoverable compact ECDSA (65 bytes, header 31–34, low-S).
 */
object SiwdSigner {
    init {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
    }

    private val curve: ECNamedCurveParameterSpec =
        ECNamedCurveTable.getParameterSpec("secp256k1")
    private val domain =
        ECDomainParameters(curve.curve, curve.g, curve.n, curve.h)
    private val halfN: BigInteger = curve.n.shiftRight(1)

    fun publicKeyCompressed(privateKey: ByteArray): ByteArray {
        require(privateKey.size == 32)
        val d = BigInteger(1, privateKey)
        val q: ECPoint = curve.g.multiply(d).normalize()
        return q.getEncoded(true)
    }

    fun signCanonical(input: CanonicalInput, privateKey: ByteArray): ByteArray {
        require(privateKey.size == 32)
        val digest = digestCanonical(input)
        return signDigestRecoverable(digest, privateKey)
    }

    fun signCanonicalBase64Url(input: CanonicalInput, privateKey: ByteArray): String =
        base64UrlEncode(signCanonical(input, privateKey))

    fun verifyCanonical(
        input: CanonicalInput,
        signatureB64Url: String,
        expectedPublicKeyCompressed: ByteArray,
    ): Boolean {
        require(expectedPublicKeyCompressed.size == 33)
        val sig65 = try {
            base64UrlDecode(signatureB64Url)
        } catch (_: Exception) {
            return false
        }
        if (sig65.size != 65) return false
        val parsed = try {
            parseRecoverable(sig65)
        } catch (_: Exception) {
            return false
        }
        val digest = digestCanonical(input)
        val recovered = try {
            recoverPublicKey(digest, parsed.r, parsed.s, parsed.recoveryId)
        } catch (_: Exception) {
            return false
        }
        if (!recovered.contentEquals(expectedPublicKeyCompressed)) return false
        return verifyDigest(digest, parsed.r, parsed.s, expectedPublicKeyCompressed)
    }

    data class ParsedSig(val recoveryId: Int, val r: BigInteger, val s: BigInteger)

    fun parseRecoverable(sig65: ByteArray): ParsedSig {
        require(sig65.size == 65)
        val header = sig65[0].toInt() and 0xff
        require(header in 31..34) { "invalid recoverable header: $header" }
        val recoveryId = header - 31
        val r = BigInteger(1, sig65.copyOfRange(1, 33))
        val s = BigInteger(1, sig65.copyOfRange(33, 65))
        require(s <= halfN) { "high-S signature rejected" }
        return ParsedSig(recoveryId, r, s)
    }

    private fun signDigestRecoverable(digest: ByteArray, privateKey: ByteArray): ByteArray {
        val d = BigInteger(1, privateKey)
        val signer = ECDSASigner()
        signer.init(true, ECPrivateKeyParameters(d, domain))
        val components = signer.generateSignature(digest)
        var r = components[0]
        var s = components[1]
        // low-S
        if (s > halfN) {
            s = curve.n.subtract(s)
        }
        val pub = publicKeyCompressed(privateKey)
        // find recovery id
        for (recId in 0..3) {
            val recovered = try {
                recoverPublicKey(digest, r, s, recId)
            } catch (_: Exception) {
                continue
            }
            if (recovered.contentEquals(pub)) {
                return pack(recId, r, s)
            }
        }
        error("could not determine recovery id")
    }

    private fun pack(recoveryId: Int, r: BigInteger, s: BigInteger): ByteArray {
        val out = ByteArray(65)
        out[0] = (27 + recoveryId + 4).toByte()
        val rb = bigIntTo32(r)
        val sb = bigIntTo32(s)
        System.arraycopy(rb, 0, out, 1, 32)
        System.arraycopy(sb, 0, out, 33, 32)
        return out
    }

    private fun bigIntTo32(n: BigInteger): ByteArray {
        val raw = n.toByteArray()
        return when {
            raw.size == 32 -> raw
            raw.size > 32 -> raw.copyOfRange(raw.size - 32, raw.size)
            else -> ByteArray(32 - raw.size) + raw
        }
    }

    private fun verifyDigest(
        digest: ByteArray,
        r: BigInteger,
        s: BigInteger,
        pubCompressed: ByteArray,
    ): Boolean {
        val q = curve.curve.decodePoint(pubCompressed)
        val signer = ECDSASigner()
        signer.init(false, ECPublicKeyParameters(q, domain))
        return signer.verifySignature(digest, r, s)
    }

    /**
     * SEC1-style public key recovery for secp256k1.
     */
    private fun recoverPublicKey(
        digest: ByteArray,
        r: BigInteger,
        s: BigInteger,
        recoveryId: Int,
    ): ByteArray {
        val n = curve.n
        val i = BigInteger.valueOf((recoveryId / 2).toLong())
        val x = r.add(i.multiply(n))
        val prime =
            BigInteger(
                "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F",
                16,
            )
        if (x >= prime) error("x out of range")
        val R = decompressKey(x, (recoveryId and 1) == 1)
        if (!R.multiply(n).isInfinity) error("nR not infinity")
        val e = BigInteger(1, digest)
        val eInv = BigInteger.ZERO.subtract(e).mod(n)
        val rInv = r.modInverse(n)
        val srInv = rInv.multiply(s).mod(n)
        val eInvrInv = rInv.multiply(eInv).mod(n)
        val q = ECAlgorithmsSum(curve.g.multiply(eInvrInv), R.multiply(srInv))
        return q.normalize().getEncoded(true)
    }

    private fun decompressKey(xBN: BigInteger, yBit: Boolean): ECPoint {
        val compEnc = ByteArray(33)
        compEnc[0] = if (yBit) 0x03 else 0x02
        val xBytes = bigIntTo32(xBN)
        System.arraycopy(xBytes, 0, compEnc, 1, 32)
        return curve.curve.decodePoint(compEnc)
    }

    private fun ECAlgorithmsSum(a: ECPoint, b: ECPoint): ECPoint = a.add(b)
}
