package org.siwd.protocol

const val PROTOCOL_VERSION: Int = 1
const val ALGORITHM_ID: String = "dash-platform-ecdsa-recoverable-sha256d"

enum class Network(val wire: Int) {
    TESTNET(0),
    MAINNET(1);

    companion object {
        fun fromWire(v: Int): Network =
            entries.firstOrNull { it.wire == v }
                ?: error("unknown network wire value: $v")

        fun parse(s: String): Network =
            when (s.lowercase()) {
                "testnet" -> TESTNET
                "mainnet" -> MAINNET
                else -> error("unknown network: $s")
            }
    }

    fun jsonName(): String = name.lowercase()
}

enum class Action(val wire: Int) {
    REGISTER(1),
    LOGIN(2),
    LINK(3);

    companion object {
        fun parse(s: String): Action =
            when (s.lowercase()) {
                "register" -> REGISTER
                "login" -> LOGIN
                "link" -> LINK
                else -> error("unknown action: $s")
            }
    }

    fun jsonName(): String = name.lowercase()
}

enum class BindingPolicy(val wire: Int) {
    IDENTITY_BOUND(1),
    NAME_BOUND(2);

    companion object {
        fun parse(s: String): BindingPolicy =
            when (s.lowercase()) {
                "identity_bound" -> IDENTITY_BOUND
                "name_bound" -> NAME_BOUND
                else -> error("unknown bindingPolicy: $s")
            }
    }

    fun jsonName(): String = name.lowercase()
}

data class CanonicalInput(
    val network: Network,
    val origin: String,
    val action: Action,
    val bindingPolicy: BindingPolicy,
    val requestId: String,
    val nonce: ByteArray,
    val issuedAt: String,
    val expiresAt: String,
    val identityId: String,
    val dpnsName: String,
    val keyId: Int,
) {
    init {
        require(nonce.size == 32) { "nonce must be 32 bytes" }
        require(keyId >= 0) { "keyId must be non-negative" }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is CanonicalInput) return false
        return network == other.network &&
            origin == other.origin &&
            action == other.action &&
            bindingPolicy == other.bindingPolicy &&
            requestId == other.requestId &&
            nonce.contentEquals(other.nonce) &&
            issuedAt == other.issuedAt &&
            expiresAt == other.expiresAt &&
            identityId == other.identityId &&
            dpnsName == other.dpnsName &&
            keyId == other.keyId
    }

    override fun hashCode(): Int {
        var result = network.hashCode()
        result = 31 * result + origin.hashCode()
        result = 31 * result + action.hashCode()
        result = 31 * result + bindingPolicy.hashCode()
        result = 31 * result + requestId.hashCode()
        result = 31 * result + nonce.contentHashCode()
        result = 31 * result + issuedAt.hashCode()
        result = 31 * result + expiresAt.hashCode()
        result = 31 * result + identityId.hashCode()
        result = 31 * result + dpnsName.hashCode()
        result = 31 * result + keyId
        return result
    }
}

data class AuthRequest(
    val version: Int,
    val network: Network,
    val requestId: String,
    val nonce: ByteArray,
    val origin: String,
    val domain: String,
    val action: Action,
    val bindingPolicy: BindingPolicy,
    val issuedAt: String,
    val expiresAt: String,
    val responseUri: String,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is AuthRequest) return false
        return version == other.version &&
            network == other.network &&
            requestId == other.requestId &&
            nonce.contentEquals(other.nonce) &&
            origin == other.origin &&
            domain == other.domain &&
            action == other.action &&
            bindingPolicy == other.bindingPolicy &&
            issuedAt == other.issuedAt &&
            expiresAt == other.expiresAt &&
            responseUri == other.responseUri
    }

    override fun hashCode(): Int {
        var result = version
        result = 31 * result + network.hashCode()
        result = 31 * result + requestId.hashCode()
        result = 31 * result + nonce.contentHashCode()
        result = 31 * result + origin.hashCode()
        result = 31 * result + domain.hashCode()
        result = 31 * result + action.hashCode()
        result = 31 * result + bindingPolicy.hashCode()
        result = 31 * result + issuedAt.hashCode()
        result = 31 * result + expiresAt.hashCode()
        result = 31 * result + responseUri.hashCode()
        return result
    }
}
