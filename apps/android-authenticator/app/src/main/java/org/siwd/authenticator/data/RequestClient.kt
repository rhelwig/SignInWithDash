package org.siwd.authenticator.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.siwd.protocol.AuthRequest
import org.siwd.protocol.CanonicalInput
import org.siwd.protocol.RequestParse
import org.siwd.protocol.SiwdSigner
import org.siwd.protocol.ALGORITHM_ID
import org.siwd.protocol.PROTOCOL_VERSION
import java.util.concurrent.TimeUnit

class RequestClient(
    private val http: OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build(),
) {
    fun fetchRequest(capabilityUrl: String): AuthRequest {
        RequestParse.validateCapabilityUrl(capabilityUrl)
        val req =
            Request.Builder()
                .url(capabilityUrl)
                .header("Accept", "application/json")
                .get()
                .build()
        http.newCall(req).execute().use { resp ->
            val source = resp.body?.source() ?: error("Empty response")
            require(!source.request(8193)) { "Response too large" }
            val body = source.readUtf8()
            if (!resp.isSuccessful) {
                error("Request fetch failed (HTTP ${resp.code})")
            }
            return RequestParse.parseAuthRequestJson(body).also {
                RequestParse.validate(it, capabilityUrl)
                require(it.network == NetworkConfig.network) { "Wrong Dash network" }
            }
        }
    }

    fun signAndRespond(
        authRequest: AuthRequest,
        identityId: String,
        dpnsName: String,
        keyId: Int,
        privateKey: ByteArray,
    ): String {
        require(authRequest.network == NetworkConfig.network) {
            "This app is ${NetworkConfig.networkLabel}-only"
        }
        RequestParse.validate(authRequest)
        val canon =
            CanonicalInput(
                network = authRequest.network,
                origin = authRequest.origin,
                action = authRequest.action,
                bindingPolicy = authRequest.bindingPolicy,
                requestId = authRequest.requestId,
                nonce = authRequest.nonce,
                issuedAt = authRequest.issuedAt,
                expiresAt = authRequest.expiresAt,
                identityId = identityId,
                dpnsName = dpnsName,
                keyId = keyId,
            )
        val signature = SiwdSigner.signCanonicalBase64Url(canon, privateKey)
        val json =
            """
            {
              "type": "dash-auth-response",
              "version": $PROTOCOL_VERSION,
              "requestId": ${jsonStr(authRequest.requestId)},
              "network": ${jsonStr(authRequest.network.jsonName())},
              "bindingPolicy": ${jsonStr(authRequest.bindingPolicy.jsonName())},
              "identityId": ${jsonStr(identityId)},
              "dpnsName": ${jsonStr(dpnsName)},
              "keyId": $keyId,
              "algorithm": ${jsonStr(ALGORITHM_ID)},
              "signature": ${jsonStr(signature)}
            }
            """.trimIndent()

        val req =
            Request.Builder()
                .url(authRequest.responseUri)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .post(json.toRequestBody("application/json; charset=utf-8".toMediaType()))
                .build()
        http.newCall(req).execute().use { resp ->
            val source = resp.body?.source() ?: error("Empty response")
            require(!source.request(8193)) { "Response too large" }
            val body = source.readUtf8()
            if (!resp.isSuccessful) {
                error("Approval rejected (HTTP ${resp.code})")
            }
            return body
        }
    }

    private fun jsonStr(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
