import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Public origin the demo advertises (capability URLs, responseUri). */
export const PUBLIC_ORIGIN = env("SIWD_PUBLIC_ORIGIN", "http://127.0.0.1:8787");

export const PORT = envInt("PORT", 8787);
export const HOST = env("HOST", "127.0.0.1");
export const NETWORK = "testnet" as const;
export const REQUEST_TTL_SECONDS = envInt("SIWD_REQUEST_TTL_SECONDS", 120);
export const FINISH_GRACE_SECONDS = envInt("SIWD_FINISH_GRACE_SECONDS", 60);
export const BIND_COOKIE_MAX_AGE = REQUEST_TTL_SECONDS + FINISH_GRACE_SECONDS;
export const DATA_DIR = env(
  "SIWD_DATA_DIR",
  resolve(join(here, "..", "..", "data")),
);
export const DB_PATH = env("SIWD_DB_PATH", join(DATA_DIR, "demo.sqlite"));

/**
 * M1: verify with local simulator fixture keys (no live Platform).
 * M2 will add "platform".
 */
export const VERIFY_MODE = env("SIWD_VERIFY_MODE", "simulator") as
  | "simulator"
  | "platform";

/** Enable /dev/simulator UI and signing (never on production without review). */
export const ENABLE_SIMULATOR =
  env("SIWD_ENABLE_SIMULATOR", "true").toLowerCase() !== "false";

export const SITE_NAME = "Sign in with Dash — Demo";
export const IS_HTTPS = PUBLIC_ORIGIN.startsWith("https://");
export const IS_LOOPBACK =
  PUBLIC_ORIGIN.includes("127.0.0.1") ||
  PUBLIC_ORIGIN.includes("localhost");

export function absoluteUrl(path: string): string {
  const base = PUBLIC_ORIGIN.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
