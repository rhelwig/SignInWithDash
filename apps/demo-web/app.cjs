/**
 * LiteSpeed Node / CloudLinux application entry.
 * lsnode.js loads the startup file with require() — no ESM top-level await.
 */
"use strict";

// Load the TypeScript entry through tsx's ESM API. Using require() here makes
// transitive ESM packages (including @siwd/protocol) fail during startup.
const { tsImport } = require("tsx/esm/api");

// Side-effect: starts the Hono HTTP server (Passenger / LiteSpeed PORT aware).
tsImport("./src/server.ts", __filename).catch((error) => {
  console.error("SIWD startup failed", error);
  process.exitCode = 1;
});
