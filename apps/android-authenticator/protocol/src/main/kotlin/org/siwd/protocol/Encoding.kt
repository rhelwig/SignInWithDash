package org.siwd.protocol

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant

val MAGIC: ByteArray = byteArrayOf(0x53, 0x49, 0x57, 0x44) // "SIWD"

/** Base58 alphabet used by Dash Platform identity IDs (Bitcoin-style). */
private const val BASE58_ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

fun utf8(s: String): ByteArray = s.toByteArray(StandardCharsets.UTF_8)

fun concat(vararg parts: ByteArray): ByteArray {
    val total = parts.sumOf { it.size }
    val out = ByteArray(total)
    var o = 0
    for (p in parts) {
        System.arraycopy(p, 0, out, o, p.size)
        o += p.size
    }
    return out
}

fun u8(n: Int): ByteArray {
    require(n in 0..0xff) { "u8 out of range: $n" }
    return byteArrayOf(n.toByte())
}

fun u16be(n: Int): ByteArray {
    require(n in 0..0xffff) { "u16 out of range: $n" }
    return byteArrayOf(((n ushr 8) and 0xff).toByte(), (n and 0xff).toByte())
}

fun u32be(n: Int): ByteArray {
    require(n >= 0) { "u32 out of range: $n" }
    return ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(n).array()
}

fun i64be(n: Long): ByteArray =
    ByteBuffer.allocate(8).order(ByteOrder.BIG_ENDIAN).putLong(n).array()

fun lengthPrefixedUtf8(s: String): ByteArray {
    val bytes = utf8(s)
    require(bytes.size <= 0xffff) { "UTF-8 field too long: ${bytes.size}" }
    return concat(u16be(bytes.size), bytes)
}

fun unixSecondsFromRfc3339(iso: String): Long {
    // Accept with or without fractional seconds
    val instant = Instant.parse(iso)
    return instant.epochSecond
}

fun decodeIdentityId(identityId: String): ByteArray {
    val raw = base58Decode(identityId)
    require(raw.size == 32) { "identity id must decode to 32 bytes, got ${raw.size}" }
    return raw
}

fun encodeIdentityId(raw: ByteArray): String {
    require(raw.size == 32) { "identity id raw must be 32 bytes" }
    return base58Encode(raw)
}

fun buildCanonicalBytes(input: CanonicalInput): ByteArray {
    val identityRaw = decodeIdentityId(input.identityId)
    val issued = unixSecondsFromRfc3339(input.issuedAt)
    val expires = unixSecondsFromRfc3339(input.expiresAt)
    return concat(
        MAGIC,
        u32be(PROTOCOL_VERSION),
        u8(input.network.wire),
        lengthPrefixedUtf8(input.origin),
        u8(input.action.wire),
        u8(input.bindingPolicy.wire),
        lengthPrefixedUtf8(input.requestId),
        input.nonce,
        i64be(issued),
        i64be(expires),
        identityRaw,
        lengthPrefixedUtf8(input.dpnsName),
        u32be(input.keyId),
    )
}

fun sha256(data: ByteArray): ByteArray =
    MessageDigest.getInstance("SHA-256").digest(data)

fun sha256d(data: ByteArray): ByteArray = sha256(sha256(data))

fun digestCanonical(input: CanonicalInput): ByteArray =
    sha256d(buildCanonicalBytes(input))

fun bytesToHex(bytes: ByteArray): String =
    bytes.joinToString("") { b -> "%02x".format(b.toInt() and 0xff) }

fun hexToBytes(hex: String): ByteArray {
    require(hex.length % 2 == 0) { "hex length must be even" }
    return ByteArray(hex.length / 2) { i ->
        hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
}

fun base64UrlEncode(bytes: ByteArray): String {
    val b64 = java.util.Base64.getEncoder().withoutPadding().encodeToString(bytes)
    return b64.replace('+', '-').replace('/', '_')
}

fun base64UrlDecode(s: String): ByteArray {
    val padded = s.replace('-', '+').replace('_', '/')
    val pad = when (padded.length % 4) {
        0 -> ""
        2 -> "=="
        3 -> "="
        else -> error("invalid base64url length")
    }
    return java.util.Base64.getDecoder().decode(padded + pad)
}

/** Display form: strip trailing ".dash" parent label. */
fun displayDashName(full: String): String {
    val n = full.trim()
    return if (n.endsWith(".dash", ignoreCase = true)) {
        n.dropLast(".dash".length)
    } else {
        n
    }
}

private fun base58Encode(input: ByteArray): String {
    if (input.isEmpty()) return ""
    var zeros = 0
    while (zeros < input.size && input[zeros].toInt() == 0) zeros++
    val input58 = ByteArray(input.size * 2)
    var length = 0
    for (b in input) {
        var carry = b.toInt() and 0xff
        var j = 0
        var k = input58.size - 1
        while (k >= 0 && (carry != 0 || j < length)) {
            carry += 256 * (input58[k].toInt() and 0xff)
            input58[k] = (carry % 58).toByte()
            carry /= 58
            k--
            j++
        }
        length = j
    }
    var start = input58.size - length
    while (start < input58.size && input58[start].toInt() == 0) start++
    val sb = StringBuilder()
    repeat(zeros) { sb.append('1') }
    for (i in start until input58.size) {
        sb.append(BASE58_ALPHABET[input58[i].toInt()])
    }
    return sb.toString()
}

private fun base58Decode(input: String): ByteArray {
    if (input.isEmpty()) return ByteArray(0)
    val input58 = ByteArray(input.length)
    for (i in input.indices) {
        val c = input[i]
        val digit = BASE58_ALPHABET.indexOf(c)
        require(digit >= 0) { "invalid Base58 character: $c" }
        input58[i] = digit.toByte()
    }
    var zeros = 0
    while (zeros < input58.size && input58[zeros].toInt() == 0) zeros++
    val decoded = ByteArray(input.length)
    var length = 0
    for (b in input58) {
        var carry = b.toInt() and 0xff
        var j = 0
        var k = decoded.size - 1
        while (k >= 0 && (carry != 0 || j < length)) {
            carry += 58 * (decoded[k].toInt() and 0xff)
            decoded[k] = (carry % 256).toByte()
            carry /= 256
            k--
            j++
        }
        length = j
    }
    var start = decoded.size - length
    while (start < decoded.size && decoded[start].toInt() == 0) start++
    val out = ByteArray(zeros + (decoded.size - start))
    // leading zeros already 0
    System.arraycopy(decoded, start, out, zeros, decoded.size - start)
    return out
}
