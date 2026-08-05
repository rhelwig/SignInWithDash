/**
 * Dash Platform testnet access via an isolated Evo SDK worker process.
 * Keeps WASM network I/O out of the HTTP server process (more reliable).
 *
 * On shared hosts that cannot reach DAPI seeds, set SIWD_PLATFORM_BRIDGE to a
 * small HTTP bridge (scripts/platform-bridge.mjs) reverse-tunneled from a
 * machine that can (see docs/DEPLOY-DASHLOGIN.md).
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workerPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "platform-worker.mjs",
);

const PLATFORM_BRIDGE = (process.env.SIWD_PLATFORM_BRIDGE || "")
  .trim()
  .replace(/\/$/, "");

async function runViaBridge(
  pathAndQuery: string,
  init?: RequestInit,
): Promise<unknown> {
  const url = `${PLATFORM_BRIDGE}${pathAndQuery}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(90_000),
  });
  const text = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Platform bridge bad JSON (${resp.status}): ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    const err =
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      (parsed as { error: unknown }).error;
    throw new Error(
      typeof err === "string"
        ? err
        : `Platform bridge HTTP ${resp.status}: ${text.slice(0, 200)}`,
    );
  }
  return parsed;
}

function runWorker(args: string[], timeoutMs = 90_000): Promise<unknown> {
  // Prefer remote bridge when configured (shared hosting).
  if (PLATFORM_BRIDGE) {
    const [cmd, arg] = args;
    if (cmd === "resolve") {
      return runViaBridge(`/resolve?name=${encodeURIComponent(arg || "")}`);
    }
    if (cmd === "identity") {
      return runViaBridge(`/identity/${encodeURIComponent(arg || "")}`);
    }
    if (cmd === "discover") {
      const hashes = (arg || "").split(",").filter(Boolean);
      return runViaBridge("/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKeyHashes: hashes }),
      });
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, ...args], {
      cwd: join(dirname(workerPath), ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Platform worker timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = stdout.trim() || stderr.trim();
      try {
        const parsed = JSON.parse(text);
        if (code !== 0 || parsed.error) {
          reject(new Error(parsed.error || stderr || `worker exit ${code}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(
          new Error(
            `Platform worker bad output (code ${code}): ${text || stderr}`,
          ),
        );
      }
    });
  });
}

export async function resolveDpnsName(
  name: string,
): Promise<{ identityId: string | null; label: string }> {
  const label = name.replace(/\.dash$/i, "").trim().toLowerCase();
  const r = (await runWorker(["resolve", label])) as {
    identityId: string | null;
    name: string;
  };
  return { identityId: r.identityId, label };
}

export async function fetchIdentitySummary(identityId: string): Promise<{
  identityId: string;
  keys: Array<{
    id: number;
    purpose: string;
    securityLevel: string;
    disabled: boolean;
    publicKeyHex?: string;
  }>;
  usernames: string[];
} | null> {
  const r = (await runWorker(["identity", identityId])) as {
    identityId: string;
    keys: Array<{
      id: number;
      purpose: string;
      securityLevel: string;
      disabled: boolean;
      publicKeyHex?: string;
    }>;
    usernames: string[];
  } | null;
  return r;
}

export async function identitiesByPublicKeyHash(
  publicKeyHashHex: string,
): Promise<string[]> {
  const hash = publicKeyHashHex.replace(/^0x/, "").toLowerCase();
  const r = await discoverByPublicKeyHashes([hash]);
  const ids = new Set<string>();
  for (const f of r.found || []) {
    f.identityIds?.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/**
 * Batch public-key-hash discovery in one worker process (one WASM connect).
 */
export async function discoverByPublicKeyHashes(
  publicKeyHashes: string[],
): Promise<{
  found: Array<{ publicKeyHash: string; identityIds: string[] }>;
  identities: Array<{
    identityId: string;
    keys: Array<{
      id: number;
      purpose: string;
      securityLevel: string;
      disabled: boolean;
      publicKeyHex?: string;
    }>;
    usernames: string[];
  }>;
}> {
  const hashes = publicKeyHashes
    .map((h) => h.replace(/^0x/, "").toLowerCase())
    .filter(Boolean);
  if (!hashes.length) {
    return { found: [], identities: [] };
  }
  // Worker CLI takes a single comma-separated arg for discover.
  const r = (await runWorker(["discover", hashes.join(",")])) as {
    found: Array<{ publicKeyHash: string; identityIds: string[] }>;
    identities: Array<{
      identityId: string;
      keys: Array<{
        id: number;
        purpose: string;
        securityLevel: string;
        disabled: boolean;
        publicKeyHex?: string;
      }>;
      usernames: string[];
    }>;
  };
  return {
    found: r.found || [],
    identities: r.identities || [],
  };
}

/**
 * Resolve verification material for SIWD respond path.
 */
export async function getPlatformKeyForSiwd(
  identityId: string,
  dpnsName: string,
  keyId: number,
): Promise<
  | {
      ok: true;
      publicKey: Uint8Array;
      keyPurpose: string;
      securityLevel: string;
      disabled: boolean;
    }
  | { ok: false; code: string; message: string }
> {
  try {
    const label = dpnsName.replace(/\.dash$/i, "");
    const resolved = await resolveDpnsName(label);
    if (!resolved.identityId) {
      return { ok: false, code: "name_ineligible", message: "Name unresolved" };
    }
    if (resolved.identityId !== identityId) {
      return {
        ok: false,
        code: "name_ineligible",
        message: "Name resolves to a different identity",
      };
    }

    const summary = await fetchIdentitySummary(identityId);
    if (!summary) {
      return {
        ok: false,
        code: "platform_unavailable",
        message: "Identity not found",
      };
    }
    const key = summary.keys.find((k) => k.id === keyId);
    if (!key) {
      return { ok: false, code: "key_ineligible", message: "Key id not found" };
    }
    if (key.disabled) {
      return { ok: false, code: "key_ineligible", message: "Key disabled" };
    }
    const purpose = key.purpose.toUpperCase();
    const level = key.securityLevel.toUpperCase();
    if (!purpose.includes("AUTH")) {
      return { ok: false, code: "key_ineligible", message: "Not auth key" };
    }
    if (!level.includes("HIGH")) {
      return {
        ok: false,
        code: "key_ineligible",
        message: "Only AUTHENTICATION/HIGH allowed",
      };
    }
    if (!key.publicKeyHex) {
      return {
        ok: false,
        code: "platform_unavailable",
        message: "Could not read public key material",
      };
    }
    return {
      ok: true,
      publicKey: new Uint8Array(Buffer.from(key.publicKeyHex, "hex")),
      keyPurpose: "AUTHENTICATION",
      securityLevel: "HIGH",
      disabled: false,
    };
  } catch (e) {
    return {
      ok: false,
      code: "platform_unavailable",
      message: e instanceof Error ? e.message : "Platform error",
    };
  }
}
