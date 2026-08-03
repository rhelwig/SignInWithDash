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
