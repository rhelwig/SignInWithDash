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

async function main() {
  const sdk = EvoSDK.testnetTrusted();
  await sdk.connect();

  if (cmd === "resolve") {
    const label = String(arg || "").replace(/\.dash$/i, "").trim().toLowerCase();
    const identityId = (await sdk.dpns.resolveName(label)) ?? null;
    console.log(JSON.stringify({ name: label + ".dash", identityId, network: "testnet" }));
    return;
  }

  if (cmd === "discover") {
    const hashes = String(arg || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const found = [];
    const identitySet = new Set();
    for (const h of hashes) {
      let ids = [];
      try {
        const many = await sdk.identities.byNonUniquePublicKeyHash(h);
        if (Array.isArray(many)) {
          ids = many.map((x) => (typeof x === "string" ? x : x?.id)).filter(Boolean);
        }
      } catch {
        try {
          const one = await sdk.identities.byPublicKeyHash(h);
          if (one) ids = [typeof one === "string" ? one : one.id].filter(Boolean);
        } catch {
          /* empty */
        }
      }
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
  const keysRaw = identity.publicKeys ?? identity.keys ?? [];
  const list = Array.isArray(keysRaw)
    ? keysRaw
    : typeof keysRaw === "object" && keysRaw
      ? Object.values(keysRaw)
      : [];
  const keys = list.map((rec) => {
    const r = rec || {};
    let publicKeyHex;
    const data = r.data ?? r.publicKey ?? r.key;
    if (typeof data === "string") publicKeyHex = data.replace(/^0x/, "");
    if (data instanceof Uint8Array) publicKeyHex = Buffer.from(data).toString("hex");
    return {
      id: Number(r.id ?? r.keyId ?? 0),
      purpose: String(r.purpose ?? r.keyPurpose ?? "AUTHENTICATION"),
      securityLevel: String(r.securityLevel ?? r.level ?? "HIGH"),
      disabled: Boolean(r.disabled ?? r.disabledAt ?? false),
      publicKeyHex,
    };
  });
  let usernames = [];
  try {
    const u = await sdk.dpns.usernames({ identityId });
    usernames = (u || []).map((n) => (n.endsWith(".dash") ? n : `${n}.dash`));
  } catch {
    try {
      const one = await sdk.dpns.username(identityId);
      if (one) usernames = [one.endsWith(".dash") ? one : `${one}.dash`];
    } catch {
      /* optional */
    }
  }
  return { identityId, keys, usernames };
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e?.message || String(e) }));
  process.exit(1);
});
