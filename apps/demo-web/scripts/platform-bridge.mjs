#!/usr/bin/env node
/**
 * Tiny HTTP bridge around platform-worker.mjs for hosts that cannot reach
 * Dash Platform DAPI seeds (shared hosting outbound restrictions).
 *
 * Run on a machine that CAN reach testnet DAPI (e.g. your laptop), then
 * reverse-tunnel to the public host:
 *
 *   node scripts/platform-bridge.mjs
 *   ssh -N -R 127.0.0.1:19792:127.0.0.1:19792 -p 21098 user@host
 *
 * On the public host set:
 *   SIWD_PLATFORM_BRIDGE=http://127.0.0.1:19792
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.SIWD_PLATFORM_BRIDGE_PORT || 19792);
const HOST = process.env.SIWD_PLATFORM_BRIDGE_HOST || "127.0.0.1";
const workerPath = join(dirname(fileURLToPath(import.meta.url)), "platform-worker.mjs");

let activeWorkers = 0;
function runWorker(args, timeoutMs = 30_000) {
  if (activeWorkers >= 4) return Promise.reject(new Error("Platform busy"));
  activeWorkers++;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, ...args], {
      cwd: join(dirname(workerPath), ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Platform worker timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length + d.length > 1024 * 1024) { child.kill("SIGKILL"); return; }
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      if (stderr.length + d.length > 64 * 1024) { child.kill("SIGKILL"); return; }
      stderr += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = stdout.trim() || stderr.trim();
      try {
        const parsed = JSON.parse(text);
        if (code !== 0 || parsed.error) {
          reject(new Error(parsed.error || stderr || `worker exit ${code}`));
          return;
        }
        resolve(parsed);
      } catch {
        reject(
          new Error(
            `Platform worker bad output (code ${code}): ${text || stderr}`,
          ),
        );
      }
    });
  }).finally(() => { activeWorkers--; });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

let healthCache = null;
let healthInFlight = null;

async function platformHealth() {
  if (healthCache && healthCache.expiresAt > Date.now()) return healthCache.result;
  if (healthInFlight) return healthInFlight;
  healthInFlight = runWorker(["health"], 30_000)
    .then((result) => {
      const health = { ...result, bridge: true };
      healthCache = { expiresAt: Date.now() + 15_000, result: health };
      return health;
    })
    .finally(() => {
      healthInFlight = null;
    });
  return healthInFlight;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, 200, await platformHealth());
    }
    if (req.method === "GET" && url.pathname === "/resolve") {
      const name = (url.searchParams.get("name") || "").replace(/\.dash$/i, "");
      if (!/^[a-z0-9-]{1,63}$/i.test(name)) return send(res, 400, { error: "invalid name" });
      const r = await runWorker(["resolve", name.toLowerCase()]);
      return send(res, 200, r);
    }
    if (req.method === "GET" && url.pathname.startsWith("/identity/")) {
      const id = decodeURIComponent(url.pathname.slice("/identity/".length));
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) return send(res, 400, { error: "invalid id" });
      const r = await runWorker(["identity", id]);
      return send(res, 200, r);
    }
    if (req.method === "POST" && url.pathname === "/discover") {
      let raw = "";
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { send(res, 413, { error: "body too large" }); req.resume(); return; }
        raw += chunk;
      }
      const body = raw ? JSON.parse(raw) : {};
      const hashes = body.publicKeyHashes || [];
      if (!Array.isArray(hashes) || !hashes.length || hashes.length > 128 || !hashes.every(h => typeof h === "string" && /^[a-f0-9]{40}$/i.test(h))) return send(res, 400, { error: "invalid publicKeyHashes" });
      const r = await runWorker(["discover", hashes.join(",")]);
      return send(res, 200, r);
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, e instanceof SyntaxError ? 400 : 503, { error: "Platform request unavailable" });
  }
});

server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
server.listen(PORT, HOST, () => {
  console.log(`SIWD platform bridge on http://${HOST}:${PORT}`);
  console.log(`worker: ${workerPath}`);
});
