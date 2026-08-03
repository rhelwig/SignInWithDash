package org.siwd.authenticator.data

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.siwd.protocol.Action
import org.siwd.protocol.AuthRequest
import org.siwd.protocol.BindingPolicy
import org.siwd.protocol.CanonicalInput
import org.siwd.protocol.Network
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
            .build(),
) {
    fun fetchRequest(capabilityUrl: String): AuthRequest {
        val req =
            Request.Builder()
                .url(capabilityUrl)
                .header("Accept", "application/json")
                .get()
                .build()
        http.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                error("Fetch failed ${resp.code}: $body")
            }
            return RequestParse.parseAuthRequestJson(body)
        }
    }

    fun signAndRespond(
        authRequest: AuthRequest,
        identity: DevFixtures.Identity,
        dpnsName: String = identity.fullDpnsName,
    ): String {
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
                identityId = identity.identityId,
                dpnsName = dpnsName,
                keyId = identity.keyId,
            )
        // Refuse mainnet in this testnet build
        require(authRequest.network == Network.TESTNET) {
            "This app is testnet-only"
        }
        val signature = SiwdSigner.signCanonicalBase64Url(canon, identity.privateKey)
        val json =
            """
            {
              "type": "dash-auth-response",
              "version": $PROTOCOL_VERSION,
              "requestId": ${jsonStr(authRequest.requestId)},
              "network": ${jsonStr(authRequest.network.jsonName())},
              "bindingPolicy": ${jsonStr(authRequest.bindingPolicy.jsonName())},
              "identityId": ${jsonStr(identity.identityId)},
              "dpnsName": ${jsonStr(dpnsName)},
              "keyId": ${identity.keyId},
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
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) {
                error("Respond failed ${resp.code}: $body")
            }
            return body
        }
    }

    private fun jsonStr(s: String): String =
        "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
