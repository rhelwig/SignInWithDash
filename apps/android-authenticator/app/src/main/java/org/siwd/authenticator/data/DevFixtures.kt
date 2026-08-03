package org.siwd.authenticator.data

import org.siwd.protocol.SiwdSigner
import org.siwd.protocol.encodeIdentityId
import org.siwd.protocol.hexToBytes

/**
 * Development identities matching apps/demo-web simulator fixtures.
 * NOT recovery phrases — deterministic test scalars only.
 */
object DevFixtures {
    data class Identity(
        val label: String,
        val identityId: String,
        val fullDpnsName: String,
        val keyId: Int,
        val privateKey: ByteArray,
        val publicKeyCompressed: ByteArray,
    )

    private fun priv(lastByte: Int): ByteArray {
        val p = ByteArray(32)
        p[31] = lastByte.toByte()
        return p
    }

    private fun identityRaw(fill: Int): ByteArray = ByteArray(32) { fill.toByte() }

    val all: List<Identity> by lazy {
        listOf(
            run {
                val priv = priv(1)
                Identity(
                    label = "alice",
                    identityId = encodeIdentityId(identityRaw(0x11)),
                    fullDpnsName = "alice.dash",
                    keyId = 2,
                    privateKey = priv,
                    publicKeyCompressed = SiwdSigner.publicKeyCompressed(priv),
                )
            },
            run {
                val priv = priv(2)
                Identity(
                    label = "bob",
                    identityId = encodeIdentityId(identityRaw(0x22)),
                    fullDpnsName = "bob.dash",
                    keyId = 2,
                    privateKey = priv,
                    publicKeyCompressed = SiwdSigner.publicKeyCompressed(priv),
                )
            },
        )
    }

    fun byIdentityId(id: String): Identity? = all.find { it.identityId == id }
}
