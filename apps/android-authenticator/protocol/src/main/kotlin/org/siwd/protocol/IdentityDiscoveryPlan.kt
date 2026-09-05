package org.siwd.protocol

/** Network lookup order; key matching after discovery is broader (32 slots).
 * Discover multiple identities without needing a DPNS name. */
object IdentityDiscoveryPlan {
    fun positions(maxIdentityIndex: Int = 19): List<Pair<Int, Int>> {
        require(maxIdentityIndex in 0..19)
        return (0..5).flatMap { slot -> (0..maxIdentityIndex).map { identity -> identity to slot } }
    }
}
