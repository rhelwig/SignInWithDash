/** SIWD protocol version field. */
export const PROTOCOL_VERSION = 1 as const;

export type Network = "testnet" | "mainnet";
export type Action = "register" | "login" | "link";
export type BindingPolicy = "identity_bound" | "name_bound";

export const ALGORITHM_ID = "dash-platform-ecdsa-recoverable-sha256d" as const;

export interface AuthRequestFields {
  version: typeof PROTOCOL_VERSION;
  network: Network;
  origin: string;
  domain: string;
  action: Action;
  bindingPolicy: BindingPolicy;
  requestId: string;
  /** 32 raw nonce bytes */
  nonce: Uint8Array;
  /** RFC 3339 issued time */
  issuedAt: string;
  /** RFC 3339 expiry time */
  expiresAt: string;
  responseUri: string;
  requestedClaims: readonly string[];
}

export interface AuthResponseFields {
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  network: Network;
  bindingPolicy: BindingPolicy;
  identityId: string;
  dpnsName: string;
  keyId: number;
  algorithm: typeof ALGORITHM_ID;
  /** Unpadded base64url of 65 signature bytes */
  signature: string;
}

export interface CanonicalInput {
  network: Network;
  origin: string;
  action: Action;
  bindingPolicy: BindingPolicy;
  requestId: string;
  nonce: Uint8Array;
  issuedAt: string;
  expiresAt: string;
  identityId: string;
  dpnsName: string;
  keyId: number;
}

export type RejectReason =
  | "invalid_request"
  | "unsupported_version"
  | "expired"
  | "not_pending"
  | "not_approved"
  | "binding_mismatch"
  | "signature_invalid"
  | "key_ineligible"
  | "name_ineligible"
  | "platform_unavailable"
  | "policy_mismatch"
  | "conflict"
  | "rate_limited"
  | "cancelled"
  | "internal_error";
