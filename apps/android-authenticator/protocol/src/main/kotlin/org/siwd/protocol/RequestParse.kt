package org.siwd.protocol

/**
 * Minimal JSON field extraction for SIWD request objects (no heavy JSON lib).
 * Expects the shape returned by GET /dash-auth/v1/r/{token}.
 */
object RequestParse {
    fun parseAuthRequestJson(json: String): AuthRequest {
        fun str(key: String): String =
            stringField(json, key) ?: error("missing string field: $key")

        fun int(key: String): Int =
            intField(json, key) ?: error("missing int field: $key")

        val nonceB64 = str("nonce")
        return AuthRequest(
            version = int("version"),
            network = Network.parse(str("network")),
            requestId = str("requestId"),
            nonce = base64UrlDecode(nonceB64),
            origin = str("origin"),
            domain = str("domain"),
            action = Action.parse(str("action")),
            bindingPolicy = BindingPolicy.parse(str("bindingPolicy")),
            issuedAt = str("issuedAt"),
            expiresAt = str("expiresAt"),
            responseUri = str("responseUri"),
        )
    }

    fun toCanonical(
        request: AuthRequest,
        identityId: String,
        dpnsName: String,
        keyId: Int,
    ): CanonicalInput =
        CanonicalInput(
            network = request.network,
            origin = request.origin,
            action = request.action,
            bindingPolicy = request.bindingPolicy,
            requestId = request.requestId,
            nonce = request.nonce,
            issuedAt = request.issuedAt,
            expiresAt = request.expiresAt,
            identityId = identityId,
            dpnsName = dpnsName,
            keyId = keyId,
        )

    private fun stringField(json: String, key: String): String? {
        val patterns =
            listOf(
                """"$key"\s*:\s*"((?:\\.|[^"\\])*)"""".toRegex(),
            )
        val m = patterns.first().find(json) ?: return null
        return unescapeJson(m.groupValues[1])
    }

    private fun intField(json: String, key: String): Int? {
        val m = """"$key"\s*:\s*(-?\d+)""".toRegex().find(json) ?: return null
        return m.groupValues[1].toInt()
    }

    private fun unescapeJson(s: String): String =
        s
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .replace("\\n", "\n")
            .replace("\\r", "\r")
            .replace("\\t", "\t")
}
