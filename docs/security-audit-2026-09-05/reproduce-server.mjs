// Diagnostic audit, not a passing-security test. Uses synthetic keys, memory DBs,
// a loopback Platform stub, and an advanced clock. Never contacts a live site.
// From apps/demo-web: node --import tsx ../../docs/security-audit-2026-09-05/reproduce-server.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const demo = new URL('../../apps/demo-web/', import.meta.url);
const campaign = new URL('../../../rpg-campaign-platform/', import.meta.url);
const requireCampaign = createRequire(new URL('package.json', campaign));
const Database = requireCampaign('better-sqlite3');
const protocol = await import(new URL('../../packages/protocol/dist/index.js', import.meta.url));
const privateKey = new Uint8Array(32); privateKey[31] = 1;
const publicKeyHex = Buffer.from(protocol.publicKeyFromPrivate(privateKey)).toString('hex');
const identityId = protocol.encodeIdentityId(new Uint8Array(32).fill(7));
const realNow = Date.now;
let advanceOnIdentity = null;
let unavailable = false;
const bridge = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (unavailable) { res.writeHead(503); res.end('{"error":"synthetic outage"}'); return; }
  if (req.url.startsWith('/identity/')) {
    if (advanceOnIdentity !== null) Date.now = () => advanceOnIdentity;
    res.end(JSON.stringify({ identityId, keys: [{ id: 2, purpose: 'AUTHENTICATION', securityLevel: 'HIGH', disabled: false, publicKeyHex }] }));
  } else {
    res.end(JSON.stringify({ identityId, name: 'audit.dash', network: 'testnet' }));
  }
});
await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
const bridgeUrl = `http://127.0.0.1:${bridge.address().port}`;
Object.assign(process.env, {
  SIWD_DB_PATH: ':memory:', SIWD_VERIFY_MODE: 'platform', SIWD_PLATFORM_BRIDGE: bridgeUrl,
  SIWD_PLATFORM_BRIDGES: '', SIWD_PLATFORM_LOCAL_FALLBACK: '0', SIWD_ENABLE_SIMULATOR: 'false',
  SIWD_PUBLIC_ORIGIN: 'https://demo.example.test', SIWD_SITE_OWNER_NAMES: 'audit',
  CAMPAIGN_PLATFORM_PUBLIC_BASE_URL: 'https://campaign.example.test',
  CAMPAIGN_PLATFORM_SIWD_PLATFORM_BRIDGE: bridgeUrl, CAMPAIGN_PLATFORM_SIWD_NETWORK: 'testnet',
});
const { initDb } = await import(new URL('src/lib/db.ts', demo));
const store = await import(new URL('src/lib/store.ts', demo));
const siwd = await import(new URL('apps/campaign-platform/src/auth/siwd.ts', campaign));
const { SCHEMA_SQL } = await import(new URL('apps/campaign-platform/src/db/schema.ts', campaign));
const demoDb = await initDb();
const db = new Database(':memory:'); db.exec(SCHEMA_SQL);
db.prepare("INSERT INTO users(id,username,display_name,role,created_at) VALUES ('audit-user','audit','Audit','player','now')").run();
db.prepare('INSERT INTO dash_identities(user_id,dash_identity_id,dash_username,linked_at) VALUES(?,?,?,?)').run('audit-user', identityId, 'audit.dash', 'now');
function response(req) {
  const canonical = { ...req, nonce: protocol.base64urlDecode(req.nonce), identityId, dpnsName: 'audit.dash', keyId: 2 };
  return { version: 1, requestId: req.requestId, network: req.network, bindingPolicy: req.bindingPolicy,
    identityId, dpnsName: 'audit.dash', keyId: 2, algorithm: protocol.ALGORITHM_ID,
    signature: protocol.signCanonicalBase64Url(canonical, privateKey) };
}
async function makeCampaign() {
  const created = await siwd.createSiwdRequest(db, { action: 'login', dashName: 'audit' });
  const req = siwd.publicSiwdRequest(db, new URL(created.capabilityUrl).pathname.split('/').pop());
  return { created, req, body: response(req) };
}
try {
  // Start valid, then emulate Platform verification taking longer than the TTL.
  const created = store.createAuthRequest({ action: 'login', bindingPolicy: 'identity_bound', origin: 'https://demo.example.test', domain: 'demo.example.test' });
  const req = store.toPublicRequest(store.getRequestById(created.requestId));
  advanceOnIdentity = Date.parse(req.expiresAt) + 1000;
  assert.equal((await store.respondToRequest(response(req))).ok, true);
  const finished = store.finishRequest(created.requestId, created.bindingToken, 'audit');
  assert.equal(finished.ok, true);
  console.log('CONFIRMED demo: verification that crosses request expiry still creates a session');
  // Session-cookie deletion by browsers does not expire the server-side token.
  Date.now = realNow; advanceOnIdentity = null;
  demoDb.prepare("UPDATE sessions SET created_at='2000-01-01T00:00:00.000Z',last_seen_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(finished.sessionId);
  assert.ok(store.getSession(finished.sessionId));
  console.log('CONFIRMED demo: a session dated 2000 is accepted without server-side expiry');
  const late = await makeCampaign();
  advanceOnIdentity = Date.parse(late.req.expiresAt) + 1000;
  assert.equal((await siwd.respondSiwd(db, late.body)).status, 'approved');
  assert.equal(siwd.finishSiwd(db, late.created.id, late.created.binding).id, 'audit-user');
  console.log('CONFIRMED Latitude: verification crossing request expiry is accepted');
  Date.now = realNow; advanceOnIdentity = null;
  const old = await makeCampaign(); await siwd.respondSiwd(db, old.body);
  db.prepare("UPDATE siwd_requests SET expires_at='2000-01-01T00:00:00.000Z',approved_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(old.created.id);
  assert.equal(siwd.finishSiwd(db, old.created.id, old.created.binding).id, 'audit-user');
  console.log('CONFIRMED Latitude: approved request dated 2000 can be finished with retained binding');
  assert.throws(() => siwd.finishSiwd(db, old.created.id, old.created.binding));
  console.log('CONTROL PASS: second finish is rejected');
  const outage = await makeCampaign(); unavailable = true;
  await assert.rejects(siwd.respondSiwd(db, outage.body));
  assert.equal(siwd.siwdStatus(db, outage.created.id, outage.created.binding).status, 'pending');
  const demoOutage = store.createAuthRequest({ action: 'login', bindingPolicy: 'identity_bound', origin: 'https://demo.example.test', domain: 'demo.example.test' });
  const denied = await store.respondToRequest(response(store.toPublicRequest(store.getRequestById(demoOutage.requestId))));
  assert.equal(denied.ok, false); assert.equal(denied.code, 'platform_unavailable');
  console.log('CONTROL PASS: both Platform verifiers fail closed during a synthetic outage');
} finally {
  Date.now = realNow; demoDb.close(); db.close();
  await new Promise(resolve => bridge.close(resolve));
}
