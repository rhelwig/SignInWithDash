/**
 * Site access policy for the demo: allowlist, user invites, and ban lists.
 * Gating is applied at finish (account create / login), not at QR issue time.
 */
import { PUBLIC_ORIGIN, REPO_URL, SITE_OWNER_NAMES } from "./config.js";
import { getDb } from "./db.js";
import { displayDashName } from "./display.js";
import type { AccountRow } from "./store.js";

/** Local copy of end-reason literal to avoid circular import with store. */
type BanEndReason = "banned";

export type AllowlistSource = "owner" | "invite" | "seed";

export interface SiteAccessSettings {
  allowlist_enabled: boolean;
  user_invites_enabled: boolean;
  invites_per_user: number;
}

export interface AllowlistEntry {
  id: number;
  dpns_name: string;
  source: AllowlistSource | string;
  invited_by_account_id: number | null;
  created_at: string;
  note: string | null;
}

export interface BanEntry {
  id: number;
  kind: "dpns_name" | "identity_id" | string;
  value: string;
  reason: string | null;
  created_by_account_id: number | null;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Normalize UI or wire input to full lowercase DPNS name (`label.dash`). */
export function normalizeDpnsName(input: string): string | null {
  let n = input.trim().toLowerCase();
  if (n.startsWith("@")) n = n.slice(1);
  if (!n) return null;
  if (!n.endsWith(".dash")) n = `${n}.dash`;
  const label = n.slice(0, -".dash".length);
  // Demo-friendly: letters, digits, hyphen; 1–63 chars
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;
  return n;
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeDpnsName(a);
  const nb = normalizeDpnsName(b);
  return !!na && !!nb && na === nb;
}

/**
 * Site owners from SIWD_SITE_OWNER_NAMES.
 * If unset, every signed-in user is treated as an owner (local demo bootstrap).
 */
export function isSiteOwner(account: AccountRow): boolean {
  if (SITE_OWNER_NAMES.length === 0) return true;
  return SITE_OWNER_NAMES.some(
    (o) =>
      namesMatch(o, account.dpns_name) ||
      o.toLowerCase() === account.identity_id.toLowerCase(),
  );
}

export function ownersConfigured(): boolean {
  return SITE_OWNER_NAMES.length > 0;
}

export function getAccessSettings(): SiteAccessSettings {
  const row = getDb()
    .prepare(
      `SELECT allowlist_enabled, user_invites_enabled, invites_per_user
       FROM site_access_settings WHERE id = 1`,
    )
    .get() as
    | {
        allowlist_enabled: number;
        user_invites_enabled: number;
        invites_per_user: number;
      }
    | undefined;
  if (!row) {
    return {
      allowlist_enabled: false,
      user_invites_enabled: true,
      invites_per_user: 3,
    };
  }
  return {
    allowlist_enabled: !!row.allowlist_enabled,
    user_invites_enabled: !!row.user_invites_enabled,
    invites_per_user: Math.max(0, row.invites_per_user | 0),
  };
}

export function updateAccessSettings(
  patch: Partial<SiteAccessSettings>,
): SiteAccessSettings {
  const cur = getAccessSettings();
  const next = {
    allowlist_enabled:
      patch.allowlist_enabled !== undefined
        ? patch.allowlist_enabled
        : cur.allowlist_enabled,
    user_invites_enabled:
      patch.user_invites_enabled !== undefined
        ? patch.user_invites_enabled
        : cur.user_invites_enabled,
    invites_per_user:
      patch.invites_per_user !== undefined
        ? Math.max(0, Math.min(100, patch.invites_per_user | 0))
        : cur.invites_per_user,
  };
  getDb()
    .prepare(
      `UPDATE site_access_settings
       SET allowlist_enabled = ?, user_invites_enabled = ?, invites_per_user = ?
       WHERE id = 1`,
    )
    .run(
      next.allowlist_enabled ? 1 : 0,
      next.user_invites_enabled ? 1 : 0,
      next.invites_per_user,
    );
  return next;
}

export function listAllowlist(): AllowlistEntry[] {
  return getDb()
    .prepare(
      `SELECT * FROM allowlist_entries ORDER BY dpns_name COLLATE NOCASE ASC`,
    )
    .all() as AllowlistEntry[];
}

export function isAllowlisted(dpnsName: string): boolean {
  const n = normalizeDpnsName(dpnsName);
  if (!n) return false;
  const row = getDb()
    .prepare(`SELECT 1 FROM allowlist_entries WHERE dpns_name = ?`)
    .get(n);
  return !!row;
}

export function addAllowlistEntry(input: {
  dpnsName: string;
  source: AllowlistSource;
  invitedByAccountId?: number | null;
  note?: string | null;
}):
  | { ok: true; entry: AllowlistEntry }
  | { ok: false; code: string; message: string } {
  const n = normalizeDpnsName(input.dpnsName);
  if (!n) {
    return {
      ok: false,
      code: "invalid_name",
      message: "Enter a valid Dash name (e.g. alice or alice.dash)",
    };
  }
  if (isBannedName(n)) {
    return {
      ok: false,
      code: "banned",
      message: "That Dash name is on the ban list",
    };
  }
  // Allowlist is only for *new* accounts; skip names that already signed in.
  if (findActiveAccountByDpnsName(n)) {
    return {
      ok: false,
      code: "already_has_account",
      message: `${displayDashName(n)} already has an account on this site`,
    };
  }
  try {
    const info = getDb()
      .prepare(
        `INSERT INTO allowlist_entries (dpns_name, source, invited_by_account_id, created_at, note)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        n,
        input.source,
        input.invitedByAccountId ?? null,
        nowIso(),
        input.note ?? null,
      );
    const entry = getDb()
      .prepare(`SELECT * FROM allowlist_entries WHERE id = ?`)
      .get(info.lastInsertRowid) as AllowlistEntry;
    return { ok: true, entry };
  } catch {
    return {
      ok: false,
      code: "already_listed",
      message: "That Dash name is already on the allowlist",
    };
  }
}

export function removeAllowlistEntry(id: number): boolean {
  return (
    getDb().prepare(`DELETE FROM allowlist_entries WHERE id = ?`).run(id)
      .changes === 1
  );
}

export function countInvitesByAccount(accountId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM allowlist_entries
       WHERE invited_by_account_id = ? AND source = 'invite'`,
    )
    .get(accountId) as { c: number };
  return row.c;
}

export function invitesRemaining(account: AccountRow): number {
  const s = getAccessSettings();
  if (!s.user_invites_enabled) return 0;
  // Owners are not capped when inviting via the invite form
  if (isSiteOwner(account)) return Number.POSITIVE_INFINITY;
  return Math.max(0, s.invites_per_user - countInvitesByAccount(account.id));
}

export function listInvitesByAccount(accountId: number): AllowlistEntry[] {
  return getDb()
    .prepare(
      `SELECT * FROM allowlist_entries
       WHERE invited_by_account_id = ? AND source = 'invite'
       ORDER BY created_at DESC`,
    )
    .all(accountId) as AllowlistEntry[];
}

/** Copy-paste message for messengers after inviting a Dash name. */
export function cannedInviteMessage(
  inviteeDpns: string,
  inviterDpns: string,
): string {
  const invitee = displayDashName(inviteeDpns);
  const inviter = displayDashName(inviterDpns);
  const origin = PUBLIC_ORIGIN.replace(/\/$/, "");
  return [
    `You're invited to try Sign in with Dash`,
    ``,
    `${inviter} reserved a spot for your Dash name: ${invitee}`,
    ``,
    `Sign in here (first approval creates your site account):`,
    `${origin}/login`,
    ``,
    `You'll need a Dash Platform testnet identity and to approve the Sign in with Dash request (QR or link) from a device you control.`,
    ``,
    `Please go easy on this demo — it runs on shared hosting, and a heavier load can make it unusable for everyone. If you want to stress-test or explore freely, hosting your own copy is very welcome:`,
    REPO_URL,
    ``,
    `Thanks for trying it out!`,
  ].join("\n");
}

/** Active site account matching a Dash name (if any). */
export function findActiveAccountByDpnsName(
  rawName: string,
): AccountRow | null {
  const n = normalizeDpnsName(rawName);
  if (!n) return null;
  const row = getDb()
    .prepare(
      `SELECT * FROM accounts
       WHERE lower(dpns_name) = lower(?) AND status = 'active'
       LIMIT 1`,
    )
    .get(n) as AccountRow | undefined;
  return row ?? null;
}

/**
 * Add a Dash name to the allowlist as a user invite (or owner add).
 */
export function createInvite(
  inviter: AccountRow,
  rawName: string,
):
  | { ok: true; entry: AllowlistEntry; message: string }
  | { ok: false; code: string; message: string } {
  const s = getAccessSettings();
  const owner = isSiteOwner(inviter);

  if (!s.user_invites_enabled && !owner) {
    return {
      ok: false,
      code: "invites_disabled",
      message: "User invites are disabled on this site",
    };
  }

  if (!owner) {
    const left = invitesRemaining(inviter);
    if (left <= 0) {
      return {
        ok: false,
        code: "invite_quota",
        message: `You have used all ${s.invites_per_user} invite(s)`,
      };
    }
  }

  const existing = findActiveAccountByDpnsName(rawName);
  if (existing) {
    const label = displayDashName(existing.dpns_name);
    return {
      ok: false,
      code: "already_has_account",
      message: `${label} already has an account on this site — no invite needed. They can sign in directly.`,
    };
  }

  const source: AllowlistSource = owner && !s.user_invites_enabled ? "owner" : "invite";
  const added = addAllowlistEntry({
    dpnsName: rawName,
    source,
    invitedByAccountId: inviter.id,
  });
  if (!added.ok) return added;
  return {
    ok: true,
    entry: added.entry,
    message: cannedInviteMessage(added.entry.dpns_name, inviter.dpns_name),
  };
}

export function listBans(): BanEntry[] {
  return getDb()
    .prepare(`SELECT * FROM ban_entries ORDER BY created_at DESC`)
    .all() as BanEntry[];
}

export function isBannedName(dpnsName: string): boolean {
  const n = normalizeDpnsName(dpnsName);
  if (!n) return false;
  return !!getDb()
    .prepare(
      `SELECT 1 FROM ban_entries WHERE kind = 'dpns_name' AND value = ?`,
    )
    .get(n);
}

export function isBannedIdentity(identityId: string): boolean {
  const id = identityId.trim();
  if (!id) return false;
  return !!getDb()
    .prepare(
      `SELECT 1 FROM ban_entries WHERE kind = 'identity_id' AND value = ?`,
    )
    .get(id);
}

export function isBanned(identityId: string, dpnsName: string): boolean {
  return isBannedIdentity(identityId) || isBannedName(dpnsName);
}

/**
 * Enforce ban: mark matching accounts banned and revoke sessions.
 * Returns number of accounts affected.
 */
export function applyBanToExistingAccounts(
  kind: "dpns_name" | "identity_id",
  value: string,
): number {
  const d = getDb();
  const ts = nowIso();
  return d.transaction(() => {
    let accounts: AccountRow[];
    if (kind === "dpns_name") {
      const n = normalizeDpnsName(value);
      if (!n) return 0;
      accounts = d
        .prepare(`SELECT * FROM accounts WHERE dpns_name = ?`)
        .all(n) as AccountRow[];
    } else {
      accounts = d
        .prepare(`SELECT * FROM accounts WHERE identity_id = ?`)
        .all(value.trim()) as AccountRow[];
    }
    for (const a of accounts) {
      d.prepare(`UPDATE accounts SET status = 'banned' WHERE id = ?`).run(a.id);
      d.prepare(
        `UPDATE sessions SET revoked_at = ?, end_reason = ?
         WHERE account_id = ? AND revoked_at IS NULL`,
      ).run(ts, "banned" satisfies BanEndReason, a.id);
    }
    return accounts.length;
  })();
}

export function addBan(input: {
  kind: "dpns_name" | "identity_id";
  value: string;
  reason?: string | null;
  createdByAccountId?: number | null;
}):
  | { ok: true; entry: BanEntry; accountsBanned: number }
  | { ok: false; code: string; message: string } {
  let value = input.value.trim();
  if (input.kind === "dpns_name") {
    const n = normalizeDpnsName(value);
    if (!n) {
      return {
        ok: false,
        code: "invalid_name",
        message: "Enter a valid Dash name to ban",
      };
    }
    value = n;
  } else if (!value) {
    return {
      ok: false,
      code: "invalid_identity",
      message: "Enter an identity ID to ban",
    };
  }

  try {
    const info = getDb()
      .prepare(
        `INSERT INTO ban_entries (kind, value, reason, created_by_account_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.kind,
        value,
        input.reason ?? null,
        input.createdByAccountId ?? null,
        nowIso(),
      );
    const entry = getDb()
      .prepare(`SELECT * FROM ban_entries WHERE id = ?`)
      .get(info.lastInsertRowid) as BanEntry;
    const accountsBanned = applyBanToExistingAccounts(input.kind, value);
    return { ok: true, entry, accountsBanned };
  } catch {
    return {
      ok: false,
      code: "already_banned",
      message: "That entry is already on the ban list",
    };
  }
}

export function removeBan(id: number): boolean {
  return (
    getDb().prepare(`DELETE FROM ban_entries WHERE id = ?`).run(id).changes ===
    1
  );
}

export type AccessDecision =
  | { allow: true }
  | { allow: false; code: string; message: string };

/**
 * Decide whether finish may create a session for this identity/name.
 * Existing active accounts may log in even when not on the allowlist.
 * New accounts require allowlist (when enabled) unless the name is a configured site owner.
 */
export function evaluateAccountAccess(input: {
  identityId: string;
  dpnsName: string;
  isNewAccount: boolean;
}): AccessDecision {
  if (isBanned(input.identityId, input.dpnsName)) {
    // Ensure any lingering account is revoked
    applyBanToExistingAccounts("identity_id", input.identityId);
    const n = normalizeDpnsName(input.dpnsName);
    if (n) applyBanToExistingAccounts("dpns_name", n);
    return {
      allow: false,
      code: "banned",
      message: "This Dash name or identity is not allowed on this site",
    };
  }

  if (!input.isNewAccount) {
    return { allow: true };
  }

  const settings = getAccessSettings();
  if (!settings.allowlist_enabled) {
    return { allow: true };
  }

  // Configured site owners may always create an account (bootstrap).
  if (
    SITE_OWNER_NAMES.length > 0 &&
    SITE_OWNER_NAMES.some(
      (o) =>
        namesMatch(o, input.dpnsName) ||
        o.toLowerCase() === input.identityId.toLowerCase(),
    )
  ) {
    return { allow: true };
  }

  if (isAllowlisted(input.dpnsName)) {
    return { allow: true };
  }

  return {
    allow: false,
    code: "not_allowlisted",
    message:
      "This site only allows approved Dash names to create accounts. Ask a current user for an invite, or contact the site owner.",
  };
}
