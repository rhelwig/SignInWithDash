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

function runWorker(args, timeoutMs = 90_000) {
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
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
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
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, 200, { ok: true, bridge: true });
    }
    if (req.method === "GET" && url.pathname === "/resolve") {
      const name = (url.searchParams.get("name") || "").replace(/\.dash$/i, "");
      if (!name) return send(res, 400, { error: "name required" });
      const r = await runWorker(["resolve", name.toLowerCase()]);
      return send(res, 200, r);
    }
    if (req.method === "GET" && url.pathname.startsWith("/identity/")) {
      const id = decodeURIComponent(url.pathname.slice("/identity/".length));
      if (!id) return send(res, 400, { error: "id required" });
      const r = await runWorker(["identity", id]);
      return send(res, 200, r);
    }
    if (req.method === "POST" && url.pathname === "/discover") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      const hashes = body.publicKeyHashes || [];
      if (!hashes.length) return send(res, 400, { error: "publicKeyHashes required" });
      const r = await runWorker(["discover", hashes.join(",")]);
      return send(res, 200, r);
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 503, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SIWD platform bridge on http://${HOST}:${PORT}`);
  console.log(`worker: ${workerPath}`);
});
