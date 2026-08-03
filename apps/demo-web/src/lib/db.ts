import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DB_PATH } from "./config.js";

export type RequestStatus =
  | "pending"
  | "approved"
  | "consumed"
  | "rejected"
  | "cancelled"
  | "expired";

export type AccountStatus = "active" | "deactivated";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT NOT NULL,
      dpns_name TEXT NOT NULL,
      binding_policy TEXT NOT NULL DEFAULT 'identity_bound',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_login_at TEXT,
      UNIQUE(identity_id),
      UNIQUE(dpns_name)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      end_reason TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_requests (
      request_id TEXT PRIMARY KEY,
      capability_token_hash TEXT NOT NULL UNIQUE,
      binding_token_hash TEXT NOT NULL,
      nonce_b64url TEXT NOT NULL,
      action TEXT NOT NULL,
      binding_policy TEXT NOT NULL,
      origin TEXT NOT NULL,
      domain TEXT NOT NULL,
      network TEXT NOT NULL,
      status TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      response_uri TEXT NOT NULL,
      identity_id TEXT,
      dpns_name TEXT,
      key_id INTEGER,
      finish_grant_hash TEXT,
      finish_expires_at TEXT,
      account_id INTEGER REFERENCES accounts(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_requests_status ON auth_requests(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_dpns ON accounts(dpns_name);

    CREATE TABLE IF NOT EXISTS rate_buckets (
      bucket_key TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL
    );
  `);

  // Lightweight migrations for existing demo DBs
  const cols = d
    .prepare(`PRAGMA table_info(sessions)`)
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "end_reason")) {
    d.exec(`ALTER TABLE sessions ADD COLUMN end_reason TEXT`);
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
