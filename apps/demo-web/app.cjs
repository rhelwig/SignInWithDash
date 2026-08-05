/**
 * LiteSpeed Node / CloudLinux application entry.
 * lsnode.js loads the startup file with require() — no ESM top-level await.
 */
"use strict";

// Enable TypeScript / ESM imports used by src/server.ts
require("tsx/cjs");

// Side-effect: starts the Hono HTTP server (Passenger / LiteSpeed PORT aware)
require("./src/server.ts");
