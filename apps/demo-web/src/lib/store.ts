import {
  isKeyEligibleForSiwd,
  verifyCanonical,
  base64urlDecode,
  type Action,
  type BindingPolicy,
  type CanonicalInput,
  type Network,
} from "@siwd/protocol";
import type { RequestStatus } from "./db.js";
import { getDb } from "./db.js";
import {
  BIND_COOKIE_MAX_AGE,
  FINISH_GRACE_SECONDS,
  NETWORK,
  PUBLIC_ORIGIN,
  REQUEST_TTL_SECONDS,
  VERIFY_MODE,
  absoluteUrl,
} from "./config.js";
import {
  base64url,
  newRequestId,
  newSessionId,
  randomTokenBytes,
  sha256Hex,
  timingSafeEqualHex,
} from "./crypto-util.js";
import { evaluateAccountAccess } from "./access.js";
import { getPlatformKeyForSiwd } from "./platform.js";
import { getSimulatorPlatform } from "./simulator-keys.js";

export interface AuthRequestRow {
  request_id: string;
  capability_token_hash: string;
  binding_token_hash: string;
  nonce_b64url: string;
  action: string;
  binding_policy: string;
  origin: string;
  domain: string;
  network: string;
  status: RequestStatus;
  issued_at: string;
  expires_at: string;
  response_uri: string;
  identity_id: string | null;
  dpns_name: string | null;
  key_id: number | null;
  finish_grant_hash: string | null;
  finish_expires_at: string | null;
  account_id: number | null;
  created_at: string;
}

export interface AccountRow {
  id: number;
  identity_id: string;
  dpns_name: string;
  binding_policy: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  /** Optional contact email saved by the user (never required for SIWD login). */
  email: string | null;
}

/** How a session was closed server-side (null while active). */
export type SessionEndReason =
  | "logout"
  | "revoked"
  | "revoke_others"
  | "deactivate"
  | "banned";

export interface SessionRow {
  id: string;
  account_id: number;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  end_reason: SessionEndReason | string | null;
  user_agent: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function expireIfNeeded(row: AuthRequestRow): AuthRequestRow {
  if (row.status !== "pending" && row.status !== "approved") return row;
  const now = Date.now();
  if (row.status === "pending" && Date.parse(row.expires_at) <= now) {
    getDb()
      .prepare(
        `UPDATE auth_requests SET status = 'expired' WHERE request_id = ? AND status = 'pending'`,
      )
      .run(row.request_id);
    return { ...row, status: "expired" };
  }
  if (
    row.status === "approved" &&
    row.finish_expires_at &&
    Date.parse(row.finish_expires_at) <= now
  ) {
    getDb()
      .prepare(
        `UPDATE auth_requests SET status = 'expired' WHERE request_id = ? AND status = 'approved'`,
      )
      .run(row.request_id);
    return { ...row, status: "expired" };
  }
  return row;
}

export function createAuthRequest(input: {
  action: Action;
  bindingPolicy: BindingPolicy;
  origin: string;
  domain: string;
}): {
  requestId: string;
  capabilityToken: string;
  capabilityUrl: string;
  bindingToken: string;
  expiresAt: string;
  issuedAt: string;
} {
  const requestId = newRequestId();
  const capabilityToken = base64url(randomTokenBytes(32)); // 256-bit
  const bindingToken = base64url(randomTokenBytes(32));
  const nonce = randomTokenBytes(32);
  const issuedAt = nowIso();
  const expiresAt = new Date(
    Date.now() + REQUEST_TTL_SECONDS * 1000,
  ).toISOString();
  const responseUri = absoluteUrl("/dash-auth/v1/respond");

  getDb()
    .prepare(
      `INSERT INTO auth_requests (
        request_id, capability_token_hash, binding_token_hash, nonce_b64url,
        action, binding_policy, origin, domain, network, status,
        issued_at, expires_at, response_uri, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    )
    .run(
      requestId,
      sha256Hex(capabilityToken),
      sha256Hex(bindingToken),
      base64url(nonce),
      input.action,
      input.bindingPolicy,
      input.origin,
      input.domain,
      NETWORK,
      issuedAt,
      expiresAt,
      responseUri,
      issuedAt,
    );

  return {
    requestId,
    capabilityToken,
    capabilityUrl: absoluteUrl(`/dash-auth/v1/r/${capabilityToken}`),
    bindingToken,
    expiresAt,
    issuedAt,
  };
}

export function getRequestById(requestId: string): AuthRequestRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM auth_requests WHERE request_id = ?`)
    .get(requestId) as AuthRequestRow | undefined;
  return row ? expireIfNeeded(row) : null;
}

export function getRequestByCapabilityToken(
  token: string,
): AuthRequestRow | null {
  const hash = sha256Hex(token);
  const row = getDb()
    .prepare(`SELECT * FROM auth_requests WHERE capability_token_hash = ?`)
    .get(hash) as AuthRequestRow | undefined;
  return row ? expireIfNeeded(row) : null;
}

export function bindingMatches(
  row: AuthRequestRow,
  bindingToken: string | undefined,
): boolean {
  if (!bindingToken) return false;
  return timingSafeEqualHex(row.binding_token_hash, sha256Hex(bindingToken));
}

export function toPublicRequest(row: AuthRequestRow) {
  return {
    type: "dash-auth-request" as const,
    version: 1,
    network: row.network as Network,
    requestId: row.request_id,
    nonce: row.nonce_b64url,
    origin: row.origin,
    domain: row.domain,
    action: row.action as Action,
    bindingPolicy: row.binding_policy as BindingPolicy,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    responseUri: row.response_uri,
    requestedClaims: ["dash_identity_id", "dpns_name"] as const,
  };
}

export type RespondResult =
  | { ok: true; requestId: string }
  | { ok: false; code: string; http: number; message: string };

export async function respondToRequest(body: {
  type?: string;
  version?: number;
  requestId: string;
  network: string;
  bindingPolicy: string;
  identityId: string;
  dpnsName: string;
  keyId: number;
  algorithm: string;
  signature: string;
}): Promise<RespondResult> {
  const row = getRequestById(body.requestId);
  if (!row) {
    return {
      ok: false,
      code: "invalid_request",
      http: 404,
      message: "Unknown request",
    };
  }
  if (row.status === "expired") {
    return { ok: false, code: "expired", http: 409, message: "Request expired" };
  }
  if (row.status !== "pending") {
    // Idempotent identical re-submit not implemented; reject non-pending
    return {
      ok: false,
      code: "not_pending",
      http: 409,
      message: "Request is not pending",
    };
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    getDb()
      .prepare(
        `UPDATE auth_requests SET status = 'expired' WHERE request_id = ?`,
      )
      .run(row.request_id);
    return { ok: false, code: "expired", http: 409, message: "Request expired" };
  }

  if (body.version !== 1) {
    return {
      ok: false,
      code: "unsupported_version",
      http: 400,
      message: "Unsupported version",
    };
  }
  if (body.network !== row.network) {
    return {
      ok: false,
      code: "signature_invalid",
      http: 401,
      message: "Network mismatch",
    };
  }
  if (body.bindingPolicy !== row.binding_policy) {
    return {
      ok: false,
      code: "policy_mismatch",
      http: 400,
      message: "Binding policy mismatch",
    };
  }
  if (body.algorithm !== "dash-platform-ecdsa-recoverable-sha256d") {
    return {
      ok: false,
      code: "signature_invalid",
      http: 401,
      message: "Unsupported algorithm",
    };
  }

  const issuedMs = Date.parse(row.issued_at);
  if (issuedMs - Date.now() > 60_000) {
    return {
      ok: false,
      code: "invalid_request",
      http: 400,
      message: "issuedAt too far in the future",
    };
  }

  const canon: CanonicalInput = {
    network: row.network as Network,
    origin: row.origin,
    action: row.action as Action,
    bindingPolicy: row.binding_policy as BindingPolicy,
    requestId: row.request_id,
    nonce: base64urlDecode(row.nonce_b64url),
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    identityId: body.identityId,
    dpnsName: body.dpnsName,
    keyId: body.keyId,
  };

  // Prefer live Platform when available; fall back to simulator fixtures.
  let publicKey: Uint8Array | null = null;
  let usedPlatform = false;

  if (VERIFY_MODE === "platform" || VERIFY_MODE === "hybrid" || VERIFY_MODE === "simulator") {
    // Try Platform for non-fixture identities (and always when mode=platform)
    const isFixture = Boolean(getSimulatorPlatform(body.identityId, body.dpnsName));
    if (VERIFY_MODE === "platform" || (VERIFY_MODE !== "simulator" && !isFixture) || process.env.SIWD_TRY_PLATFORM === "1") {
      try {
        const plat = await getPlatformKeyForSiwd(
          body.identityId,
          body.dpnsName,
          body.keyId,
        );
        if (plat.ok) {
          if (
            !isKeyEligibleForSiwd({
              keyId: body.keyId,
              keyPurpose: plat.keyPurpose,
              securityLevel: plat.securityLevel,
              disabled: plat.disabled,
            })
          ) {
            return {
              ok: false,
              code: "key_ineligible",
              http: 401,
              message: "Key not eligible",
            };
          }
          publicKey = plat.publicKey;
          usedPlatform = true;
        } else if (VERIFY_MODE === "platform") {
          return {
            ok: false,
            code: plat.code,
            http: plat.code === "platform_unavailable" ? 503 : 401,
            message: plat.message,
          };
        }
      } catch (e) {
        if (VERIFY_MODE === "platform") {
          return {
            ok: false,
            code: "platform_unavailable",
            http: 503,
            message: e instanceof Error ? e.message : "Platform error",
          };
        }
      }
    }

    if (!usedPlatform) {
      const platform = getSimulatorPlatform(body.identityId, body.dpnsName);
      if (!platform) {
        return {
          ok: false,
          code: "platform_unavailable",
          http: 503,
          message:
            "Unknown identity (not on Platform fixtures and Platform lookup failed)",
        };
      }
      if (platform.unavailable) {
        return {
          ok: false,
          code: "platform_unavailable",
          http: 503,
          message: "Platform unavailable",
        };
      }
      if (
        platform.dpnsStatus !== "finalized" ||
        platform.dpnsResolvedIdentityId !== body.identityId
      ) {
        return {
          ok: false,
          code: "name_ineligible",
          http: 401,
          message: "Name not eligible",
        };
      }
      const key = platform.keys.find((k) => k.keyId === body.keyId);
      if (
        !key ||
        !isKeyEligibleForSiwd({
          keyId: key.keyId,
          keyPurpose: key.keyPurpose,
          securityLevel: key.securityLevel,
          disabled: key.disabled,
        })
      ) {
        return {
          ok: false,
          code: "key_ineligible",
          http: 401,
          message: "Key not eligible",
        };
      }
      publicKey = key.publicKey;
    }
  }

  if (!publicKey) {
    return {
      ok: false,
      code: "internal_error",
      http: 500,
      message: "No verification key",
    };
  }

  const ok = verifyCanonical(canon, body.signature, publicKey);
  if (!ok) {
    return {
      ok: false,
      code: "signature_invalid",
      http: 401,
      message: "Invalid signature",
    };
  }

  const finishGrant = base64url(randomTokenBytes(32));
  const finishExpires = new Date(
    Date.now() + FINISH_GRACE_SECONDS * 1000,
  ).toISOString();

  const updated = getDb()
    .prepare(
      `UPDATE auth_requests SET
        status = 'approved',
        identity_id = ?,
        dpns_name = ?,
        key_id = ?,
        finish_grant_hash = ?,
        finish_expires_at = ?
      WHERE request_id = ? AND status = 'pending'`,
    )
    .run(
      body.identityId,
      body.dpnsName,
      body.keyId,
      sha256Hex(finishGrant),
      finishExpires,
      row.request_id,
    );

  if (updated.changes !== 1) {
    return {
      ok: false,
      code: "not_pending",
      http: 409,
      message: "Request race lost",
    };
  }

  // Store finish grant in binding-scoped way: we put it only server-side hash;
  // browser finish uses binding cookie alone for demo (finish grant checked via approved status).
  // PROTOCOL allows one-time finish grant; demo treats approved+binding as grant.
  return { ok: true, requestId: row.request_id };
}

export function cancelRequest(
  requestId: string,
  bindingToken: string | undefined,
): RespondResult {
  const row = getRequestById(requestId);
  if (!row || !bindingMatches(row, bindingToken)) {
    return {
      ok: false,
      code: "binding_mismatch",
      http: 401,
      message: "Binding required",
    };
  }
  if (row.status === "pending") {
    getDb()
      .prepare(
        `UPDATE auth_requests SET status = 'cancelled' WHERE request_id = ? AND status = 'pending'`,
      )
      .run(requestId);
  }
  return { ok: true, requestId };
}

export function rejectRequest(
  requestId: string,
  capabilityToken: string,
): RespondResult {
  const row = getRequestByCapabilityToken(capabilityToken);
  if (!row || row.request_id !== requestId) {
    return {
      ok: false,
      code: "invalid_request",
      http: 404,
      message: "Unknown request",
    };
  }
  if (row.status === "pending") {
    getDb()
      .prepare(
        `UPDATE auth_requests SET status = 'rejected' WHERE request_id = ? AND status = 'pending'`,
      )
      .run(requestId);
  }
  return { ok: true, requestId };
}

export type FinishResult =
  | {
      ok: true;
      sessionId: string;
      account: AccountRow;
      isNew: boolean;
    }
  | { ok: false; code: string; http: number; message: string };

export function finishRequest(
  requestId: string,
  bindingToken: string | undefined,
  userAgent: string | undefined,
): FinishResult {
  const row = getRequestById(requestId);
  if (!row || !bindingMatches(row, bindingToken)) {
    return {
      ok: false,
      code: "binding_mismatch",
      http: 401,
      message: "Binding required",
    };
  }
  if (row.status === "expired") {
    return { ok: false, code: "expired", http: 409, message: "Request expired" };
  }
  if (row.status !== "approved") {
    return {
      ok: false,
      code: "not_approved",
      http: 409,
      message: "Request not approved",
    };
  }
  if (
    row.finish_expires_at &&
    Date.parse(row.finish_expires_at) <= Date.now()
  ) {
    getDb()
      .prepare(
        `UPDATE auth_requests SET status = 'expired' WHERE request_id = ?`,
      )
      .run(requestId);
    return { ok: false, code: "expired", http: 409, message: "Finish window expired" };
  }
  if (!row.identity_id || !row.dpns_name) {
    return {
      ok: false,
      code: "internal_error",
      http: 500,
      message: "Missing identity on approved request",
    };
  }

  const d = getDb();
  const finish = d.transaction(() => {
    const existing = d
      .prepare(`SELECT * FROM accounts WHERE identity_id = ?`)
      .get(row.identity_id) as AccountRow | undefined;

    let account: AccountRow;
    let isNew = false;
    const ts = nowIso();

    if (!existing) {
      // register or first login creates account (demo: login and register both upsert)
      if (row.action === "link") {
        throw Object.assign(new Error("No account to link"), {
          code: "conflict",
          http: 409,
        });
      }
      const gate = evaluateAccountAccess({
        identityId: row.identity_id!,
        dpnsName: row.dpns_name!,
        isNewAccount: true,
      });
      if (!gate.allow) {
        throw Object.assign(new Error(gate.message), {
          code: gate.code,
          http: 403,
        });
      }
      const info = d
        .prepare(
          `INSERT INTO accounts (identity_id, dpns_name, binding_policy, status, created_at, last_login_at)
           VALUES (?, ?, ?, 'active', ?, ?)`,
        )
        .run(row.identity_id, row.dpns_name, row.binding_policy, ts, ts);
      account = d
        .prepare(`SELECT * FROM accounts WHERE id = ?`)
        .get(info.lastInsertRowid) as AccountRow;
      isNew = true;
    } else {
      // Re-check ban list (name/identity may have been banned after account creation)
      const gate = evaluateAccountAccess({
        identityId: row.identity_id!,
        dpnsName: row.dpns_name!,
        isNewAccount: false,
      });
      if (!gate.allow) {
        throw Object.assign(new Error(gate.message), {
          code: gate.code,
          http: 403,
        });
      }
      if (existing.status === "banned") {
        // Ban list entry was lifted; restore the account on successful sign-in
        d.prepare(
          `UPDATE accounts SET status = 'active', dpns_name = ?, last_login_at = ? WHERE id = ?`,
        ).run(row.dpns_name, ts, existing.id);
      } else if (existing.status !== "active") {
        throw Object.assign(new Error("Account deactivated"), {
          code: "conflict",
          http: 409,
        });
      } else {
        // identity_bound: name may update as handle
        d.prepare(
          `UPDATE accounts SET dpns_name = ?, last_login_at = ? WHERE id = ?`,
        ).run(row.dpns_name, ts, existing.id);
      }
      account = d
        .prepare(`SELECT * FROM accounts WHERE id = ?`)
        .get(existing.id) as AccountRow;
    }

    const consumed = d
      .prepare(
        `UPDATE auth_requests SET status = 'consumed', account_id = ?
         WHERE request_id = ? AND status = 'approved'`,
      )
      .run(account.id, requestId);
    if (consumed.changes !== 1) {
      throw Object.assign(new Error("Finish race"), {
        code: "not_approved",
        http: 409,
      });
    }

    const sessionId = newSessionId();
    d.prepare(
      `INSERT INTO sessions (id, account_id, created_at, last_seen_at, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, account.id, ts, ts, userAgent ?? null);

    return { sessionId, account, isNew };
  });

  try {
    const result = finish();
    return { ok: true, ...result };
  } catch (e) {
    const err = e as { code?: string; http?: number; message?: string };
    return {
      ok: false,
      code: err.code ?? "internal_error",
      http: err.http ?? 500,
      message: err.message ?? "Finish failed",
    };
  }
}

export function getSession(
  sessionId: string | undefined,
): (SessionRow & { account: AccountRow }) | null {
  if (!sessionId) return null;
  const row = getDb()
    .prepare(
      `SELECT s.*, a.id as a_id, a.identity_id, a.dpns_name, a.binding_policy,
              a.status as a_status, a.created_at as a_created, a.last_login_at,
              a.email as a_email
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.id = ? AND s.revoked_at IS NULL AND a.status = 'active'`,
    )
    .get(sessionId) as
    | (SessionRow & {
        a_id: number;
        identity_id: string;
        dpns_name: string;
        binding_policy: string;
        a_status: string;
        a_created: string;
        last_login_at: string | null;
        a_email: string | null;
      })
    | undefined;
  if (!row) return null;
  getDb()
    .prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
    .run(nowIso(), sessionId);
  return {
    id: row.id,
    account_id: row.account_id,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
    end_reason: row.end_reason ?? null,
    user_agent: row.user_agent,
    account: {
      id: row.a_id,
      identity_id: row.identity_id,
      dpns_name: row.dpns_name,
      binding_policy: row.binding_policy,
      status: row.a_status,
      created_at: row.a_created,
      last_login_at: row.last_login_at,
      email: row.a_email ?? null,
    },
  };
}

/** Save or clear the optional contact email on an account. */
export function setAccountEmail(
  accountId: number,
  email: string | null,
): void {
  const value = email && email.trim() ? email.trim() : null;
  getDb()
    .prepare(`UPDATE accounts SET email = ? WHERE id = ?`)
    .run(value, accountId);
}

export function endSession(
  sessionId: string,
  accountId: number,
  reason: SessionEndReason,
): boolean {
  const r = getDb()
    .prepare(
      `UPDATE sessions SET revoked_at = ?, end_reason = ?
       WHERE id = ? AND account_id = ? AND revoked_at IS NULL`,
    )
    .run(nowIso(), reason, sessionId, accountId);
  return r.changes === 1;
}

/** @deprecated prefer endSession with an explicit reason */
export function revokeSession(sessionId: string, accountId: number): boolean {
  return endSession(sessionId, accountId, "revoked");
}

export function endAllSessions(
  accountId: number,
  reason: SessionEndReason,
  except?: string,
): number {
  if (except) {
    return getDb()
      .prepare(
        `UPDATE sessions SET revoked_at = ?, end_reason = ?
         WHERE account_id = ? AND revoked_at IS NULL AND id != ?`,
      )
      .run(nowIso(), reason, accountId, except).changes;
  }
  return getDb()
    .prepare(
      `UPDATE sessions SET revoked_at = ?, end_reason = ?
       WHERE account_id = ? AND revoked_at IS NULL`,
    )
    .run(nowIso(), reason, accountId).changes;
}

export function revokeAllSessions(accountId: number, except?: string): number {
  return endAllSessions(accountId, "revoke_others", except);
}

export function listSessions(accountId: number): SessionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM sessions WHERE account_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(accountId) as SessionRow[];
}

export function listPublicAccounts(): AccountRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM accounts WHERE status = 'active' ORDER BY dpns_name COLLATE NOCASE ASC`,
    )
    .all() as AccountRow[];
}

export function deactivateAccount(accountId: number): void {
  const d = getDb();
  d.transaction(() => {
    d.prepare(`UPDATE accounts SET status = 'deactivated' WHERE id = ?`).run(
      accountId,
    );
    d.prepare(
      `UPDATE sessions SET revoked_at = ?, end_reason = ?
       WHERE account_id = ? AND revoked_at IS NULL`,
    ).run(nowIso(), "deactivate", accountId);
  })();
}

/** Simple fixed-window rate limit. Returns true if allowed. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const d = getDb();
  const now = Date.now();
  const row = d
    .prepare(`SELECT window_start, count FROM rate_buckets WHERE bucket_key = ?`)
    .get(key) as { window_start: number; count: number } | undefined;
  if (!row || now - row.window_start >= windowMs) {
    d.prepare(
      `INSERT INTO rate_buckets (bucket_key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(bucket_key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
    ).run(key, now);
    return true;
  }
  if (row.count >= limit) return false;
  d.prepare(
    `UPDATE rate_buckets SET count = count + 1 WHERE bucket_key = ?`,
  ).run(key);
  return true;
}

export function bindCookieOptions(secure: boolean) {
  return {
    path: "/dash-auth/v1",
    httpOnly: true,
    secure,
    sameSite: "Strict" as const,
    maxAge: BIND_COOKIE_MAX_AGE,
  };
}

export function sessionCookieOptions(secure: boolean) {
  // Session cookie: no maxAge → browser session only (D-025)
  return {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax" as const, // Lax so top-level nav works after login
  };
}

export { PUBLIC_ORIGIN };
