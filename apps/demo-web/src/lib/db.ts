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

export type AccountStatus = "active" | "deactivated" | "banned";

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
      email TEXT,
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

    CREATE TABLE IF NOT EXISTS site_access_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      allowlist_enabled INTEGER NOT NULL DEFAULT 0,
      user_invites_enabled INTEGER NOT NULL DEFAULT 1,
      invites_per_user INTEGER NOT NULL DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS allowlist_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dpns_name TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      invited_by_account_id INTEGER REFERENCES accounts(id),
      created_at TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS ban_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      reason TEXT,
      created_by_account_id INTEGER REFERENCES accounts(id),
      created_at TEXT NOT NULL,
      UNIQUE(kind, value)
    );

    CREATE INDEX IF NOT EXISTS idx_allowlist_dpns ON allowlist_entries(dpns_name);
    CREATE INDEX IF NOT EXISTS idx_ban_kind_value ON ban_entries(kind, value);
  `);

  // Lightweight migrations for existing demo DBs
  const sessionCols = d
    .prepare(`PRAGMA table_info(sessions)`)
    .all() as Array<{ name: string }>;
  if (!sessionCols.some((c) => c.name === "end_reason")) {
    d.exec(`ALTER TABLE sessions ADD COLUMN end_reason TEXT`);
  }

  const accountCols = d
    .prepare(`PRAGMA table_info(accounts)`)
    .all() as Array<{ name: string }>;
  if (!accountCols.some((c) => c.name === "email")) {
    d.exec(`ALTER TABLE accounts ADD COLUMN email TEXT`);
  }

  // Singleton access settings row
  d.prepare(
    `INSERT OR IGNORE INTO site_access_settings
      (id, allowlist_enabled, user_invites_enabled, invites_per_user)
     VALUES (1, 0, 1, 3)`,
  ).run();
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
