import { randomBytes, timingSafeEqual } from "node:crypto";
export const newCsrfToken = () => randomBytes(32).toString("hex");
export const csrfCookieName = (secure: boolean) => secure ? "__Host-siwd_csrf" : "siwd_csrf";
export function validCsrf(cookie: string | undefined, supplied: unknown): boolean {
  return typeof cookie === "string" && typeof supplied === "string" && /^[a-f0-9]{64}$/.test(cookie) && /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(cookie), Buffer.from(supplied));
}
export function csrfHtml(html: string, token: string): string {
  const hidden = `<input type="hidden" name="_csrf" value="${token}">`;
  return html.replace(/(<form\b[^>]*\bmethod=["']?post["']?[^>]*>)/gi, `$1${hidden}`)
    .replace(/<head>/i, `<head><meta name="csrf-token" content="${token}"><script src="/static/csrf.js"></script>`);
}
export const securityHeaders = {
  "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
};

/** Origin can be opaque on no-referrer form navigations (including Firefox).
 * Only browser-attested same-origin requests may use this fallback. A valid
 * CSRF token is still required by the caller; same-site is deliberately denied.
 */
export function validRequestOrigin(expected: string, origin: unknown, fetchSite: unknown): boolean {
  if (fetchSite !== undefined && fetchSite !== "same-origin") return false;
  if (origin === expected) return true;
  return (origin === "null" || origin === undefined) && fetchSite === "same-origin";
}
