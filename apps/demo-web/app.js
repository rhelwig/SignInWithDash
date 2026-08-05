/**
 * LiteSpeed / CloudLinux Node entry (loaded via require() from lsnode.js).
 * Must be CommonJS-compatible with no top-level await.
 *
 * package.json has "type": "module", so this file is still treated as ESM.
 * Use app.cjs as PassengerStartupFile instead.
 */
throw new Error("Use app.cjs as PassengerStartupFile (CommonJS entry for lsnode).");
