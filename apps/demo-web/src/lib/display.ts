/**
 * Display helpers. Canonical protocol/storage values still use full
 * normalized DPNS names (e.g. alice.dash). UI shows the label only.
 */

/** "alice.dash" → "alice"; other strings returned unchanged (trimmed). */
export function displayDashName(name: string | null | undefined): string {
  if (!name) return "";
  const n = name.trim();
  if (n.toLowerCase().endsWith(".dash")) {
    return n.slice(0, -".dash".length);
  }
  return n;
}

/**
 * Public-list obfuscation for optional account email addresses.
 * e.g. `todo@example.com` → `t***@e***.com`
 */
export function obfuscateEmail(email: string | null | undefined): string {
  if (!email) return "";
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const localObf = local.length <= 1 ? "*" : `${local[0]}***`;
  const parts = domain.split(".");
  const domainObf = parts
    .map((part, i) => {
      // Keep the final TLD readable when multi-label.
      if (parts.length > 1 && i === parts.length - 1) return part;
      if (!part) return "*";
      return part.length <= 1 ? "*" : `${part[0]}***`;
    })
    .join(".");
  return `${localObf}@${domainObf}`;
}

/** Basic shape check for contact / account email fields. */
export function isValidEmailShape(email: string): boolean {
  const e = email.trim();
  // Practical check: one @, local + domain labels, no spaces.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}
