/**
 * Load apps/demo-web/.env into process.env (does not override existing vars).
 * Keeps secrets out of git; copy from .env.example.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
/** apps/demo-web (parent of src/) */
export const DEMO_WEB_ROOT = join(here, "..", "..");

export function loadDemoEnv(): void {
  const envPath = join(DEMO_WEB_ROOT, ".env");
  if (!existsSync(envPath)) return;
  dotenvConfig({ path: envPath, override: false });
}

export function envFileExists(): boolean {
  return existsSync(join(DEMO_WEB_ROOT, ".env"));
}

export function envFilePath(): string {
  return join(DEMO_WEB_ROOT, ".env");
}
