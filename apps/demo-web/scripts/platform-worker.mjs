#!/usr/bin/env node
/**
 * Isolated Evo SDK worker so WASM network I/O is not affected by the HTTP server process.
 * Usage:
 *   node platform-worker.mjs resolve <name>
 *   node platform-worker.mjs discover <hash1,hash2,...>
 *   node platform-worker.mjs identity <identityId>
 */
import { EvoSDK } from "@dashevo/evo-sdk";

const [cmd, arg] = process.argv.slice(2);

/** Purpose enum → SIWD string (Platform DPP IdentityPublicKeyPurpose). */
const PURPOSE = {
  0: "AUTHENTICATION",
  1: "ENCRYPTION",
  2: "DECRYPTION",
  3: "TRANSFER",
  4: "SYSTEM",
  5: "VOTING",
};

/** SecurityLevel enum → SIWD string. */
const SECURITY_LEVEL = {
  0: "MASTER",
  1: "CRITICAL",
  2: "HIGH",
  3: "MEDIUM",
};

/**
 * Normalize WASM Identity / Identifier / plain object into a base58 identity id string.
 */
function identityIdOf(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    if (typeof value.toJSON === "function") {
      const j = value.toJSON();
      if (typeof j === "string") return j;
      if (j && typeof j.id === "string") return j.id;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof value.id === "function") {
      const id = value.id();
      return identityIdOf(id);
    }
    if (value.id != null && value.id !== value) return identityIdOf(value.id);
  } catch {
    /* ignore */
  }
  if (typeof value.toString === "function") {
    const s = value.toString();
    if (s && s !== "[object Object]" && !s.startsWith("Identity") && !s.startsWith("Identifier")) {
      return s;
    }
  }
  return null;
}

/**
 * Decode public key material to hex. Platform JSON often uses base64 for `data`.
 */
function publicKeyToHex(data) {
  if (data == null) return undefined;
  if (data instanceof Uint8Array) return Buffer.from(data).toString("hex");
  if (typeof data !== "string") return undefined;
  const s = data.replace(/^0x/, "").trim();
  if (!s) return undefined;
  // Hex (compressed secp256k1 pubkeys are 33 bytes → 66 hex chars)
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    return s.toLowerCase();
  }
  // Base64
  try {
    return Buffer.from(s, "base64").toString("hex");
  } catch {
    return undefined;
  }
}

function mapPurpose(v) {
  if (v == null || v === "") return "AUTHENTICATION";
  if (typeof v === "number") return PURPOSE[v] ?? String(v);
  const s = String(v);
  if (/^\d+$/.test(s)) return PURPOSE[Number(s)] ?? s;
  return s.toUpperCase();
}

function mapSecurityLevel(v) {
  if (v == null || v === "") return "HIGH";
  if (typeof v === "number") return SECURITY_LEVEL[v] ?? String(v);
  const s = String(v);
  if (/^\d+$/.test(s)) return SECURITY_LEVEL[Number(s)] ?? s;
  return s.toUpperCase();
}

/**
 * Look up identities for a single public-key hash (HASH160 hex).
 *
 * Prefer byPublicKeyHash: byNonUniquePublicKeyHash currently returns [] for
 * unique AUTH keys on testnet trusted mode, which previously short-circuited
 * discovery and produced "no platform identities found".
 */
async function lookupByHash(sdk, hash) {
  const ids = new Set();

  try {
    const one = await sdk.identities.byPublicKeyHash(hash);
    const id = identityIdOf(one);
    if (id) ids.add(id);
  } catch {
    /* try non-unique next */
  }

  try {
    const many = await sdk.identities.byNonUniquePublicKeyHash(hash);
    if (Array.isArray(many)) {
      for (const x of many) {
        const id = identityIdOf(x);
        if (id) ids.add(id);
      }
    }
  } catch {
    /* empty */
  }

  return [...ids];
}

async function main() {
  const sdk = EvoSDK.testnetTrusted();
  await sdk.connect();

  if (cmd === "health") {
    console.log(JSON.stringify({ ok: true, network: "testnet", source: "evo-sdk" }));
    return;
  }

  if (cmd === "resolve") {
    const label = String(arg || "").replace(/\.dash$/i, "").trim().toLowerCase();
    const identityId = (await sdk.dpns.resolveName(label)) ?? null;
    console.log(JSON.stringify({ name: label + ".dash", identityId, network: "testnet" }));
    return;
  }

  if (cmd === "discover") {
    const hashes = String(arg || "")
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/^0x/, ""))
      .filter(Boolean);
    const found = [];
    const identitySet = new Set();
    for (const h of hashes) {
      const ids = await lookupByHash(sdk, h);
      if (ids.length) {
        found.push({ publicKeyHash: h, identityIds: ids });
        ids.forEach((id) => identitySet.add(id));
      }
    }
    const identities = [];
    for (const id of identitySet) {
      identities.push(await summarize(sdk, id));
    }
    console.log(JSON.stringify({ network: "testnet", found, identities }));
    return;
  }

  if (cmd === "identity") {
    console.log(JSON.stringify(await summarize(sdk, arg)));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

async function summarize(sdk, identityId) {
  const identity = await sdk.identities.fetch(identityId);
  if (!identity) return null;

  // Prefer toJSON() — WASM objects expose numeric enums + base64 key data reliably.
  let json = null;
  try {
    if (typeof identity.toJSON === "function") json = identity.toJSON();
  } catch {
    json = null;
  }

  const idStr = (json && json.id) || identityIdOf(identity) || String(identityId);
  const keysRaw = json?.publicKeys ?? identity.publicKeys ?? identity.keys ?? [];
  const list = Array.isArray(keysRaw)
    ? keysRaw
    : typeof keysRaw === "object" && keysRaw
      ? Object.values(keysRaw)
      : [];

  const keys = list.map((rec) => {
    const r = rec || {};
    const publicKeyHex = publicKeyToHex(r.data ?? r.publicKey ?? r.key);
    return {
      id: Number(r.id ?? r.keyId ?? 0),
      purpose: mapPurpose(r.purpose ?? r.keyPurpose),
      securityLevel: mapSecurityLevel(r.securityLevel ?? r.level),
      disabled: Boolean(r.disabled ?? r.disabledAt ?? false),
      publicKeyHex,
    };
  });

  let usernames = [];
  try {
    const u = await sdk.dpns.usernames({ identityId: idStr });
    usernames = (u || []).map((n) => (n.endsWith(".dash") ? n : `${n}.dash`));
  } catch {
    try {
      const one = await sdk.dpns.username(idStr);
      if (one) usernames = [one.endsWith(".dash") ? one : `${one}.dash`];
    } catch {
      /* optional */
    }
  }
  return { identityId: idStr, keys, usernames };
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e?.message || String(e) }));
  process.exit(1);
});
