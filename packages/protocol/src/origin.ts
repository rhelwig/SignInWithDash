/**
 * Origin normalization per PROTOCOL.md §10.
 * Development loopback HTTP is allowed; production requires HTTPS.
 */

export interface NormalizedOrigin {
  origin: string;
  domain: string;
}

export function normalizeOrigin(input: string): NormalizedOrigin {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`invalid origin URL: ${input}`);
  }

  if (url.username || url.password) {
    throw new Error("origin must not include userinfo");
  }
  if (url.pathname !== "" && url.pathname !== "/") {
    throw new Error("origin must not include a path");
  }
  if (url.search || url.hash) {
    throw new Error("origin must not include query or fragment");
  }

  const scheme = url.protocol.replace(":", "").toLowerCase();
  const hostRaw = url.hostname;

  if (!hostRaw) {
    throw new Error("empty host");
  }
  if (hostRaw.endsWith(".")) {
    throw new Error("trailing-dot hosts are invalid for SIWD v1");
  }

  // Unicode → A-labels via URL parser (hostname is already punycoded by URL)
  const host = hostRaw.toLowerCase();

  const isLoopback =
    host === "127.0.0.1" || host === "localhost" || host === "[::1]";

  if (scheme === "https") {
    // ok
  } else if (scheme === "http" && isLoopback) {
    // development only
  } else if (scheme === "http") {
    throw new Error("http is only allowed for loopback development origins");
  } else {
    throw new Error(`unsupported origin scheme: ${scheme}`);
  }

  let port = url.port;
  if (scheme === "https" && (port === "443" || port === "")) {
    port = "";
  }
  if (scheme === "http" && (port === "80" || port === "")) {
    port = "";
  }

  const hostPort = port ? `${host}:${port}` : host;
  const origin = `${scheme}://${hostPort}`;
  return { origin, domain: host };
}
