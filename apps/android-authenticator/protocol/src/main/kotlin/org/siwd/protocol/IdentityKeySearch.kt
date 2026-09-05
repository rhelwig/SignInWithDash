package org.siwd.protocol

/** Match wallet slots to verified on-chain public keys; a Platform key ID is
 * not a derivation index. Callers supply only eligible login keys. */
object IdentityKeySearch {
    data class Match(val identityIndex: Int, val keyIndex: Int, val keyId: Int,
                     val privateKey: ByteArray, val publicKey: ByteArray)
    fun find(seed: ByteArray, network: Network, targets: Map<Int, ByteArray>,
             maxIdentityIndex: Int = 19, maxKeyIndex: Int = 31): Match? {
        require(maxIdentityIndex in 0..19 && maxKeyIndex in 0..31)
        require(targets.keys.all { it >= 0 })
        require(targets.values.all { it.size == 33 && (it[0] == 2.toByte() || it[0] == 3.toByte()) })
        if (targets.isEmpty()) return null
        val master = Bip32.masterFromSeed(seed)
        try {
            for (identityIndex in 0..maxIdentityIndex) {
                val branchPath = IdentityDerivation.path(network, identityIndex, 0).substringBeforeLast('/')
                val branch = Bip32.derivePath(master, branchPath)
                try {
                    for (slot in 0..maxKeyIndex) {
                        val child = Bip32.derivePath(branch, "m/$slot'")
                        try {
                            val pub = SiwdSigner.publicKeyCompressed(child.key)
                            val target = targets.entries.firstOrNull { it.value.contentEquals(pub) }
                            if (target != null) return Match(identityIndex, slot, target.key, child.key.copyOf(), pub)
                        } finally { child.key.fill(0); child.chainCode.fill(0) }
                    }
                } finally { branch.key.fill(0); branch.chainCode.fill(0) }
            }
            return null
        } finally { master.key.fill(0); master.chainCode.fill(0) }
    }
}
