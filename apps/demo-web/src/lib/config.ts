import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDemoEnv } from "./load-env.js";

// Load apps/demo-web/.env once before any env() reads (existing process env wins).
loadDemoEnv();

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

/**
 * Public origin the demo advertises (capability URLs, responseUri).
 * Default port 8792 avoids Solvent (8787) and DecentSite (8790/8791).
 */
export const PUBLIC_ORIGIN = env("SIWD_PUBLIC_ORIGIN", "http://127.0.0.1:8792");

export const PORT = envInt("PORT", 8792);
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
 * Verification mode:
 * - simulator: fixture keys only
 * - platform: live Dash Platform testnet only
 * - hybrid (default): try Platform, fall back to fixtures (dev-friendly)
 */
export const VERIFY_MODE = env("SIWD_VERIFY_MODE", "hybrid") as
  | "simulator"
  | "platform"
  | "hybrid";

/** Enable /dev/simulator UI and signing (never on production without review). */
export const ENABLE_SIMULATOR =
  env("SIWD_ENABLE_SIMULATOR", "true").toLowerCase() !== "false";

export const SITE_NAME = "Sign in with Dash — Demo";
export const IS_HTTPS = PUBLIC_ORIGIN.startsWith("https://");
export const IS_LOOPBACK =
  PUBLIC_ORIGIN.includes("127.0.0.1") ||
  PUBLIC_ORIGIN.includes("localhost");

/**
 * Dash names and/or identity IDs that may manage allowlist, bans, and settings.
 * Comma-separated. Labels may omit `.dash`. If empty, every signed-in user is
 * treated as an owner (convenient for local demos; set this on a public host).
 */
export const SITE_OWNER_NAMES: string[] = env("SIWD_SITE_OWNER_NAMES", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Public donate page (footer + home). */
export const DONATE_URL = env(
  "SIWD_DONATE_URL",
  "https://myrpg.ronhelwig.com/donate",
);

/** Source / self-host link used in invite messages and shared-host notice. */
export const REPO_URL = env(
  "SIWD_REPO_URL",
  "https://github.com/rhelwig/SignInWithDash",
);

/**
 * When true, show a shared-host courtesy notice on public pages.
 * Off by default (VPS / self-hosted). Set SIWD_SHARED_HOST_NOTICE=true if needed.
 */
export const SHARED_HOST_NOTICE =
  env("SIWD_SHARED_HOST_NOTICE", "false").toLowerCase() === "true";

/**
 * Contact form (signed-in users only). Generalized for self-hosters:
 * set SIWD_CONTACT_TO to the inbox that should receive submissions.
 * Leave empty to disable the form (no default recipient is baked in).
 */
export const CONTACT_TO = env("SIWD_CONTACT_TO", "").trim();

/** From-address for outbound contact mail (defaults to SMTP user when set). */
export const CONTACT_FROM = env("SIWD_CONTACT_FROM", "").trim();

/** SMTP host for contact mail. When empty, submissions are logged only (dev). */
export const SMTP_HOST = env("SIWD_SMTP_HOST", "").trim();
export const SMTP_PORT = envInt("SIWD_SMTP_PORT", 587);
export const SMTP_SECURE =
  env("SIWD_SMTP_SECURE", "false").toLowerCase() === "true";
export const SMTP_USER = env("SIWD_SMTP_USER", "").trim();
export const SMTP_PASS = env("SIWD_SMTP_PASS", "");

/** True when this deployment accepts contact form submissions. */
export const CONTACT_ENABLED = CONTACT_TO.length > 0;

export function absoluteUrl(path: string): string {
  const base = PUBLIC_ORIGIN.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export const SESSION_ABSOLUTE_SECONDS = envInt("SIWD_SESSION_ABSOLUTE_SECONDS", 43200);
export const SESSION_IDLE_SECONDS = envInt("SIWD_SESSION_IDLE_SECONDS", 1800);
if (REQUEST_TTL_SECONDS < 30 || REQUEST_TTL_SECONDS > 300 || FINISH_GRACE_SECONDS < 1 || FINISH_GRACE_SECONDS > 60) throw new Error("SIWD request TTL must be 30..300s and finish grace 1..60s");
if (SESSION_IDLE_SECONDS < 60 || SESSION_ABSOLUTE_SECONDS < SESSION_IDLE_SECONDS || SESSION_ABSOLUTE_SECONDS > 86400) throw new Error("Invalid SIWD session timeouts");
if (process.env.NODE_ENV === "production" && (!IS_HTTPS || VERIFY_MODE !== "platform" || ENABLE_SIMULATOR || SITE_OWNER_NAMES.length === 0)) throw new Error("Production requires HTTPS, Platform verification, owners, and disabled simulator");
