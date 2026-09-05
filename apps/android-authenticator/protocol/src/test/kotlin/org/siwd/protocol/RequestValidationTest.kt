package org.siwd.protocol

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant

class RequestValidationTest {
    private val site = "https://example.test"
    private val capability = "$site/dash-auth/v1/r/${"A".repeat(43)}"
    private fun json(): String {
        val now = Instant.now()
        return """{"type":"dash-auth-request","version":1,"network":"testnet",
          "requestId":"0123456789ABCDEFGHIJKLMNOP","nonce":"${"A".repeat(43)}",
          "origin":"$site","domain":"example.test","action":"login","bindingPolicy":"identity_bound",
          "issuedAt":"$now","expiresAt":"${now.plusSeconds(120)}",
          "responseUri":"$site/dash-auth/v1/respond","requestedClaims":["dash_identity_id","dpns_name"]}"""
    }
    @Test fun validRequestAndBoundUrl() { val request=RequestParse.parseAuthRequestJson(json()); assertDoesNotThrow { RequestParse.validate(request,capability) } }
    @Test fun rejectsSpoofedDomainAndDestination() {
        for (body in listOf(json().replace("\"domain\":\"example.test\"", "\"domain\":\"trusted.test\""), json().replace("$site/dash-auth/v1/respond", "https://collector.test/dash-auth/v1/respond")))
            assertThrows(Exception::class.java) { RequestParse.parseAuthRequestJson(body) }
    }
    @Test fun rejectsDuplicateFieldsWrongVersionAndMalformedJson() {
        for(body in listOf(json().replace("\"version\":1", "\"version\":999"),json().replace("\"version\":1", "\"version\":1,\"version\":1"),json()+" garbage",json().replace("\"version\":1", "\"version\":1.0")))
            assertThrows(Exception::class.java) { RequestParse.parseAuthRequestJson(body) }
    }
    @Test fun rejectsWrongFetchOriginExpiredAndOversizedRequests() {
        val request=RequestParse.parseAuthRequestJson(json())
        assertThrows(Exception::class.java) { RequestParse.validate(request,capability.replace("example.test","evil.test")) }
        assertThrows(Exception::class.java) { RequestParse.validate(request,capability,Instant.now().plusSeconds(121)) }
        assertThrows(Exception::class.java) { RequestParse.validate(request.copy(expiresAt=Instant.parse(request.issuedAt).plusSeconds(600).toString())) }
        assertThrows(Exception::class.java) { RequestParse.parseAuthRequestJson(" ".repeat(9000)+json()) }
    }
    @Test fun rejectsUnsafeUrlVariants() {
        for(url in listOf(capability.replace("https:","http:"),capability.replace("example.test","example.test@evil.test"),capability+"?token=bad",capability+"#fragment",capability.replace("example.test","example.test.")))
            assertThrows(Exception::class.java) { RequestParse.validateCapabilityUrl(url) }
    }
}
