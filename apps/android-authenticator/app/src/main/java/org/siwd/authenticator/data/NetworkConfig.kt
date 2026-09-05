package org.siwd.authenticator.data

import org.siwd.authenticator.BuildConfig
import org.siwd.protocol.Network

/** Compile-time network for this APK. Testnet and mainnet are separate apps. */
object NetworkConfig {
    val isMainnet: Boolean = BuildConfig.IS_MAINNET
    val network: Network = if (isMainnet) Network.MAINNET else Network.TESTNET
    val networkLabel: String = if (isMainnet) "mainnet" else "testnet"
    val quorumBaseUrl: String = BuildConfig.QUORUM_BASE_URL
    val badge: String = if (isMainnet) "MAINNET" else "TESTNET ONLY"
}
