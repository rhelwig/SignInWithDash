package org.siwd.protocol

import com.google.gson.Strictness
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import java.io.StringReader
import java.net.URI
import java.time.Instant

/** Strict, bounded SIWD request parsing and origin validation. */
object RequestParse {
    fun parseAuthRequestJson(json: String): AuthRequest {
        require(json.toByteArray(Charsets.UTF_8).size <= 8192) { "Request too large" }
        val fields = mutableMapOf<String, String>()
        val reader = JsonReader(StringReader(json)).apply { strictness = Strictness.STRICT }
        val allowed = setOf("type", "version", "network", "requestId", "nonce", "origin", "domain", "action", "bindingPolicy", "issuedAt", "expiresAt", "responseUri", "requestedClaims")
        val seen = mutableSetOf<String>()
        reader.beginObject()
        while (reader.hasNext()) {
            val name = reader.nextName()
            require(name in allowed && seen.add(name)) { "Unknown or duplicate request field" }
            when (name) {
                "requestedClaims" -> {
                    val claims = mutableListOf<String>()
                    reader.beginArray()
                    while (reader.hasNext()) { require(claims.size < 2 && reader.peek() == JsonToken.STRING); claims.add(reader.nextString()) }
                    reader.endArray()
                    require(claims.toSet() == setOf("dash_identity_id", "dpns_name")) { "Unsupported claims" }
                }
                "version" -> { require(reader.peek() == JsonToken.NUMBER); fields[name] = reader.nextString(); require(fields[name] == "1") { "Unsupported version" } }
                else -> { require(reader.peek() == JsonToken.STRING); fields[name] = reader.nextString() }
            }
        }
        reader.endObject()
        require(reader.peek() == JsonToken.END_DOCUMENT) { "Trailing JSON" }
        fun str(name: String) = fields[name] ?: error("Missing $name")
        require(str("type") == "dash-auth-request" && "requestedClaims" in seen)
        require(str("nonce").matches(Regex("[A-Za-z0-9_-]{43}"))) { "Invalid nonce" }
        return AuthRequest(
            version = str("version").toInt(), network = Network.parse(str("network")),
            requestId = str("requestId"), nonce = base64UrlDecode(str("nonce")),
            origin = str("origin"), domain = str("domain"), action = Action.parse(str("action")),
            bindingPolicy = BindingPolicy.parse(str("bindingPolicy")), issuedAt = str("issuedAt"),
            expiresAt = str("expiresAt"), responseUri = str("responseUri"),
        ).also { validate(it) }
    }

    private fun endpoint(value: String): URI {
        require(value.length <= 2048 && value.none { it.code <= 32 || it == '\\' }) { "Invalid URL" }
        val uri = URI(value)
        val host = uri.host ?: error("URL must have an ASCII host")
        require(uri.rawUserInfo == null && uri.rawFragment == null && !host.endsWith(".")) { "Invalid URL authority" }
        require(uri.scheme == "https" || (uri.scheme == "http" && host in setOf("localhost", "127.0.0.1", "[::1]"))) { "HTTPS required" }
        require(uri.port == -1 || uri.port in 1..65535)
        return uri
    }

    fun validateCapabilityUrl(value: String) {
        val uri = endpoint(value)
        require(uri.rawQuery == null && uri.rawPath.matches(Regex("/dash-auth/v1/r/[A-Za-z0-9_-]{43}"))) { "Invalid capability URL" }
    }

    private fun origin(uri: URI): String {
        val defaultPort = if (uri.scheme == "https") 443 else 80
        val port = if (uri.port == -1 || uri.port == defaultPort) "" else ":${uri.port}"
        return "${uri.scheme}://${uri.host.lowercase()}$port"
    }

    fun validate(request: AuthRequest, capabilityUrl: String? = null, now: Instant = Instant.now()) {
        require(request.version == PROTOCOL_VERSION && request.nonce.size == 32)
        require(request.requestId.matches(Regex("[A-Za-z0-9_-]{16,64}"))) { "Invalid request ID" }
        val site = endpoint(request.origin)
        require((site.rawPath ?: "").isEmpty() && site.rawQuery == null && origin(site) == request.origin) { "Noncanonical origin" }
        require(request.domain == site.host.lowercase()) { "Displayed domain does not match origin" }
        val response = endpoint(request.responseUri)
        require(origin(response) == request.origin && response.rawPath == "/dash-auth/v1/respond" && response.rawQuery == null) { "Invalid response endpoint" }
        if (capabilityUrl != null) {
            val capability = endpoint(capabilityUrl)
            require(origin(capability) == request.origin && capability.rawQuery == null &&
                capability.rawPath.matches(Regex("/dash-auth/v1/r/[A-Za-z0-9_-]{43}"))) { "Request URL does not match signing origin" }
        }
        val issued = Instant.parse(request.issuedAt)
        val expires = Instant.parse(request.expiresAt)
        require(expires.epochSecond - issued.epochSecond in 30..300) { "Invalid request lifetime" }
        require(!issued.isAfter(now.plusSeconds(60)) && expires.isAfter(now)) { "Request expired or issued in the future" }
    }

    fun toCanonical(request: AuthRequest, identityId: String, dpnsName: String, keyId: Int): CanonicalInput =
        CanonicalInput(request.network, request.origin, request.action, request.bindingPolicy, request.requestId,
            request.nonce, request.issuedAt, request.expiresAt, identityId, dpnsName, keyId)
}
