/**
 * SQLite access for the demo site.
 *
 * Prefers better-sqlite3 (fast native). On hosts that cannot load the native
 * addon (old glibc / no compiler — typical shared hosting), falls back to
 * sql.js (WASM) with file persistence.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DB_PATH } from "./config.js";

export type RequestStatus =
  | "pending"
  | "approved"
  | "consumed"
  | "rejected"
  | "cancelled"
  | "expired";

export type AccountStatus = "active" | "deactivated" | "banned";

/** Minimal better-sqlite3-compatible surface used by this app. */
export type RunResult = { changes: number; lastInsertRowid: number | bigint };

export type Statement = {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => RunResult;
};

export type DemoDb = {
  prepare: (sql: string) => Statement;
  exec: (sql: string) => void;
  pragma: (src: string) => unknown;
  transaction: <T>(fn: () => T) => () => T;
  close: () => void;
};

let db: DemoDb | null = null;
let backend: "better-sqlite3" | "sql.js" = "better-sqlite3";
let initPromise: Promise<DemoDb> | null = null;

export function dbBackend(): typeof backend {
  return backend;
}

/** Call once at process start (async-safe). Subsequent getDb() is sync. */
export async function initDb(): Promise<DemoDb> {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    try {
      db = openBetterSqlite3(DB_PATH);
      backend = "better-sqlite3";
    } catch (e) {
      console.warn(
        "[siwd-db] better-sqlite3 unavailable, using sql.js WASM fallback:",
        e instanceof Error ? e.message : e,
      );
      db = await openSqlJs(DB_PATH);
      backend = "sql.js";
    }
    migrate(db);
    console.log(`[siwd-db] backend=${backend} path=${DB_PATH}`);
    return db;
  })();
  return initPromise;
}

export function getDb(): DemoDb {
  if (!db) {
    throw new Error("Database not initialized — call await initDb() at startup");
  }
  return db;
}

function openBetterSqlite3(path: string): DemoDb {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const d = new Database(path);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  return d as DemoDb;
}

async function openSqlJs(path: string): Promise<DemoDb> {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require("sql.js");
  // sql.js package.json may not export "./package.json"; locate wasm via main entry.
  const sqlJsEntry = require.resolve("sql.js");
  // typically .../node_modules/sql.js/dist/sql-wasm.js
  const wasmBinary = readFileSync(join(dirname(sqlJsEntry), "sql-wasm.wasm"));
  const SQL = await initSqlJs({ wasmBinary });
  const fileBuf = existsSync(path) ? readFileSync(path) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = fileBuf ? new SQL.Database(fileBuf) : new SQL.Database();
  raw.run("PRAGMA foreign_keys = ON;");

  let dirty = false;
  /** Nesting depth of explicit transactions. export() mid-transaction aborts it. */
  let txDepth = 0;
  const persist = () => {
    if (!dirty || txDepth > 0) return;
    const data = raw.export();
    writeFileSync(path, Buffer.from(data));
    dirty = false;
  };

  const wrapStatement = (sql: string): Statement => ({
    get: (...params: unknown[]) => {
      const stmt = raw.prepare(sql);
      try {
        if (params.length) stmt.bind(normalizeParams(params));
        if (stmt.step()) return stmt.getAsObject();
        return undefined;
      } finally {
        stmt.free();
      }
    },
    all: (...params: unknown[]) => {
      const stmt = raw.prepare(sql);
      const rows: unknown[] = [];
      try {
        if (params.length) stmt.bind(normalizeParams(params));
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    run: (...params: unknown[]) => {
      raw.run(sql, normalizeParams(params));
      dirty = true;
      const changes = raw.getRowsModified() as number;
      const idRow = raw.exec("SELECT last_insert_rowid() as id");
      const lastInsertRowid =
        idRow?.[0]?.values?.[0]?.[0] != null
          ? Number(idRow[0].values[0][0])
          : 0;
      // Never export while a transaction is open — sql.js export() ends the txn
      // and subsequent SELECTs (e.g. finish → account by lastInsertRowid) miss rows.
      persist();
      return { changes, lastInsertRowid };
    },
  });

  return {
    prepare: (sql: string) => wrapStatement(sql),
    exec: (sql: string) => {
      raw.exec(sql);
      dirty = true;
      persist();
    },
    pragma: (src: string) => {
      raw.run(`PRAGMA ${src}`);
      return undefined;
    },
    transaction:
      <T>(fn: () => T) =>
      () => {
        raw.run("BEGIN");
        txDepth += 1;
        try {
          const result = fn();
          raw.run("COMMIT");
          txDepth -= 1;
          dirty = true;
          persist();
          return result;
        } catch (e) {
          try {
            raw.run("ROLLBACK");
          } catch {
            /* ignore */
          }
          txDepth = Math.max(0, txDepth - 1);
          throw e;
        }
      },
    close: () => {
      persist();
      raw.close();
    },
  };
}

function normalizeParams(params: unknown[]): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0] as unknown[];
  }
  return params.map((p) => {
    if (p === undefined) return null;
    // sql.js bind is happier with plain numbers than bigint
    if (typeof p === "bigint") return Number(p);
    return p;
  });
}

function migrate(d: DemoDb) {
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
