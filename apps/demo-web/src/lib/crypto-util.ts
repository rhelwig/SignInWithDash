import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomTokenBytes(n = 32): Buffer {
  return randomBytes(n);
}

export function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function base64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function newRequestId(): string {
  // ULID-like sortable id without external dep: time + random
  const t = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const r = base64url(randomBytes(12)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return `01${t}${r}`.slice(0, 26);
}

export function newSessionId(): string {
  return base64url(randomBytes(32));
}
