/** Platform JSON adapter: omitted optional disabledAt/contractBounds mean enabled/unbounded per DPP. */
export function normalizePlatformKey(key) {
  const enums = (value, names) => Number.isInteger(value) ? (names[value] ?? "UNKNOWN") :
    typeof value === "string" && names.includes(value) ? value : "UNKNOWN";
  const disabledAt = key.disabledAt;
  const disabled = Object.hasOwn(key, "disabled") && typeof key.disabled !== "boolean" ? null :
    key.disabled === true ? true :
    disabledAt == null ? false : (Number.isFinite(disabledAt) && disabledAt >= 0 ? true : null);
  let data = key.data;
  if (data instanceof Uint8Array) data = Buffer.from(data).toString("hex");
  else if (typeof data === "string" && !/^(02|03)[0-9a-f]{64}$/i.test(data)) {
    data = /^[A-Za-z0-9+/]+={0,2}$/.test(data) ? Buffer.from(data, "base64").toString("hex") : null;
  }
  return {
    id: Number.isInteger(key.id) && key.id >= 0 ? key.id : null,
    purpose: enums(key.purpose, ["AUTHENTICATION", "ENCRYPTION", "DECRYPTION", "TRANSFER", "SYSTEM", "VOTING"]),
    securityLevel: enums(key.securityLevel, ["MASTER", "CRITICAL", "HIGH", "MEDIUM"]),
    keyType: enums(key.type, ["ECDSA_SECP256K1", "BLS12_381", "ECDSA_HASH160", "BIP13_SCRIPT_HASH", "EDDSA_25519_HASH160"]),
    disabled,
    contractBounds: key.contractBounds ?? null,
    publicKeyHex: typeof data === "string" ? data.toLowerCase() : null,
  };
}
export function eligiblePlatformKey(key) {
  return !!key && Number.isInteger(key.id) && key.id >= 0 && key.id <= 0xffffffff &&
    key.purpose === "AUTHENTICATION" && key.securityLevel === "HIGH" &&
    key.keyType === "ECDSA_SECP256K1" && key.disabled === false &&
    Object.hasOwn(key, "contractBounds") && key.contractBounds === null &&
    typeof key.publicKeyHex === "string" && /^(02|03)[0-9a-f]{64}$/.test(key.publicKeyHex);
}
