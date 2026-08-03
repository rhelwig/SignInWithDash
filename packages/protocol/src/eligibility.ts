/**
 * Identity key eligibility per PROTOCOL.md §12 and D-010.
 * MVP: AUTHENTICATION / HIGH / ECDSA_SECP256K1 only.
 */

export type KeyPurpose =
  | "AUTHENTICATION"
  | "ENCRYPTION"
  | "DECRYPTION"
  | "TRANSFER"
  | "VOTING";

export type SecurityLevel = "MASTER" | "CRITICAL" | "HIGH" | "MEDIUM";

export type KeyType = "ECDSA_SECP256K1" | "BLS12381" | "ECDSA_HASH160" | string;

export interface PlatformKeyFixture {
  keyId: number;
  keyPurpose: KeyPurpose | string;
  securityLevel: SecurityLevel | string;
  keyType?: KeyType;
  disabled: boolean;
  /** If true, key is contract-bounded in a way that forbids general SIWD use. */
  boundsForbidSiwd?: boolean;
}

export function isKeyEligibleForSiwd(key: PlatformKeyFixture): boolean {
  if (key.disabled) return false;
  if (key.boundsForbidSiwd) return false;
  if (key.keyPurpose !== "AUTHENTICATION") return false;
  if (key.securityLevel !== "HIGH") return false;
  const keyType = key.keyType ?? "ECDSA_SECP256K1";
  if (keyType !== "ECDSA_SECP256K1") return false;
  return true;
}

export function keyIneligibilityReason(
  key: PlatformKeyFixture,
): "key_ineligible" | null {
  return isKeyEligibleForSiwd(key) ? null : "key_ineligible";
}
