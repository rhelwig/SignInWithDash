import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePlatformKey, eligiblePlatformKey } from '../scripts/platform-key.mjs';
import { withPlatformCapacity } from './lib/platform-capacity.ts';
import { validRequestOrigin, validCsrf, csrfHtml } from './lib/http-security.ts';
import { ensureInitialized, IdentityPublicKey } from '@dashevo/evo-sdk';
const raw = { id: 1, purpose: 0, securityLevel: 2, type: 0, contractBounds: null, data: 'A+MIfg18ifDK6dvNhMH2eW60hkTpOrXaljC3JJZ95pgj' };
// Public on-chain testnet metadata, not a private key.
test('accepts the deployed SDK key shape and explicitly omitted optional disabledAt', () => assert.equal(eligiblePlatformKey(normalizePlatformKey(raw)), true));
test('SDK 5 JSON preserves legacy keys and rejects limited or unknown key formats', async () => {
  await ensureInitialized();
  const options = { keyId: 2, purpose: 0, securityLevel: 2, keyType: 0,
    data: Buffer.from(raw.data, 'base64') };
  for (const [limits, expected] of [
    [{}, true], [{ disabledAt: 1 }, false], [{ expiresAt: 1n }, false],
    [{ expiresAt: 9007199254740993n }, false], [{ totalBudget: 0n }, false],
    [{ totalBudget: 100n }, false],
  ]) {
    const key = new IdentityPublicKey({ ...options, ...limits });
    try {
      const json = key.toJSON();
      // Match the worker -> HTTP bridge -> verifier JSON round trip.
      const summary = JSON.parse(JSON.stringify(normalizePlatformKey(json)));
      assert.equal(summary.expiresAt, json.expiresAt ?? null);
      assert.equal(summary.totalBudget, json.totalBudget ?? null);
      assert.equal(eligiblePlatformKey(summary), expected);
    } finally { key.free(); }
  }
  for (const patch of [{ $formatVersion: '1' }, { $formatVersion: '2' },
    { $formatVersion: null }, { expiresAt: 0 }, { expiresAt: 'invalid' }, { totalBudget: 0 }]) {
    assert.equal(eligiblePlatformKey(normalizePlatformKey({ ...raw, ...patch })), false);
  }
});
test('rejects missing or incorrect authorization metadata', () => {
  for (const patch of [{purpose:undefined},{securityLevel:undefined},{type:undefined},{purpose:1},{securityLevel:0},{disabledAt:1},{disabled:false,disabledAt:1},{disabled:"false"},{contractBounds:{}},{data:'garbage'},{id:-1}])
    assert.equal(eligiblePlatformKey(normalizePlatformKey({...raw,...patch})),false,JSON.stringify(patch));
  const summarized = normalizePlatformKey(raw); delete summarized.contractBounds;
  assert.equal(eligiblePlatformKey(summarized),false);
});
test('verification capacity rejects excess work and is returned on failure', async () => {
  let release; const barrier=new Promise(r=>release=r);
  const active=Array.from({length:4},()=>withPlatformCapacity(()=>barrier));
  await assert.rejects(withPlatformCapacity(async()=>1),/busy/);
  release(); await Promise.all(active);
  await assert.rejects(withPlatformCapacity(async()=>{throw new Error('failure')}));
  assert.equal(await withPlatformCapacity(async()=>42),42);
});
test('CSRF tokens require exact equality and form injection is bounded to POST',()=>{
  const token='a'.repeat(64); assert.ok(validCsrf(token,token));
  assert.equal(validCsrf(token,'b'.repeat(64)),false); assert.equal(validCsrf(undefined,token),false);
  assert.match(csrfHtml('<html><head></head><form method="post"></form></html>',token),/name="_csrf"/);
});

test("opaque-origin form submissions need same-origin metadata and CSRF", () => {
  const expected = "https://latitude.ronhelwig.com";
  const token = "a".repeat(64);
  for (const origin of [expected, "null", undefined]) {
    assert.equal(validRequestOrigin(expected, origin, "same-origin"), true);
    assert.equal(validCsrf(token, undefined), false);
    assert.equal(validCsrf(token, "b".repeat(64)), false);
  }
  assert.equal(validRequestOrigin(expected, expected, undefined), true);
  for (const site of [undefined, "same-site", "cross-site", "none"]) {
    assert.equal(validRequestOrigin(expected, "null", site), false);
    assert.equal(validRequestOrigin(expected, undefined, site), false);
  }
  for (const origin of ["https://evil.example", "https://dashlogin.ronhelwig.com", "", expected + ".evil.example"]) {
    assert.equal(validRequestOrigin(expected, origin, "same-origin"), false);
  }
  assert.equal(validRequestOrigin(expected, expected, "cross-site"), false);
});
