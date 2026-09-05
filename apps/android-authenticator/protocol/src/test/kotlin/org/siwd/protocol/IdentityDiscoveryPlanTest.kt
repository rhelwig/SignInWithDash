package org.siwd.protocol

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class IdentityDiscoveryPlanTest {
    @Test fun scansEverySupportedIdentityBeforeLaterKeySlots() {
        val positions = IdentityDiscoveryPlan.positions()
        assertEquals(120, positions.size)
        assertEquals(120, positions.distinct().size)
        assertEquals((0..19).map { it to 0 }, positions.take(20))
        assertTrue((19 to 5) in positions)
        assertTrue((5 to 0) in positions) // An empty earlier identity must not stop recovery.
    }
    @Test fun rejectsUnboundedSearches() {
        for (index in listOf(-1, 20, Int.MAX_VALUE)) {
            try { IdentityDiscoveryPlan.positions(index); fail("unbounded search accepted") }
            catch (_: IllegalArgumentException) {}
        }
    }
}
