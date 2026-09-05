// Non-destructive checks for the two explicitly authorized operator sites.
// Creates unsigned pending challenges only. Never logs capability URLs/cookies.
const sites = [
  { base: 'https://dashlogin.ronhelwig.com', name: 'dashlogin', network: 'testnet' },
  { base: 'https://latitude.ronhelwig.com', name: 'latitude', network: 'mainnet' },
];
const headersOf = r => Object.fromEntries(['cache-control', 'referrer-policy', 'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options'].map(h => [h, r.headers.get(h)]));
async function get(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(45000), redirect: 'manual' });
}
for (const site of sites) {
  const health = await get(site.base + '/healthz');
  console.log(site.name, 'health', health.status, await health.json());
  const landing = await get(site.base + '/login');
  const landingHtml = await landing.text();
  const csrf = landingHtml.match(/name="csrf-token" content="([^"]+)"/)?.[1];
  const jar = new Map(landing.headers.getSetCookie().map(h => { const pair=h.split(';')[0]; const at=pair.indexOf('='); return [pair.slice(0,at), pair.slice(at+1)]; }));
  const cookieHeader = () => [...jar].map(([k,v]) => `${k}=${v}`).join('; ');
  const mutationHeaders = () => ({ 'content-type':'application/json', origin:site.base, 'x-csrf-token':csrf || '', cookie:cookieHeader() });
  const start = performance.now();
  const ceremony = await get(site.base + (site.name === 'dashlogin' ? '/login' : '/auth/dash/login'), site.name === 'latitude' ? {
    method: 'POST', headers: { ...mutationHeaders(), 'content-type': 'application/x-www-form-urlencoded' }, body: 'dashName=rhelwig7.dash',
  } : {headers: {cookie:cookieHeader()}});
  const html = await ceremony.text();
  console.log(site.name, 'ceremony', ceremony.status, 'seconds', ((performance.now() - start) / 1000).toFixed(2), headersOf(ceremony));
  const bindHeaders = ceremony.headers.getSetCookie();
  console.log(site.name, 'cookie attributes', bindHeaders.map(h => h.slice(h.indexOf(';') + 1).trim()));
  for (const h of bindHeaders) { const pair=h.split(';')[0]; const at=pair.indexOf('='); jar.set(pair.slice(0,at),pair.slice(at+1)); }
  const cookies = cookieHeader();
  const cap = html.match(/https:\/\/[^\s"<>]+\/dash-auth\/v1\/r\/[A-Za-z0-9_-]+/)?.[0];
  if (!cap) { console.log(site.name, 'NO CAPABILITY FOUND'); continue; }
  const request = await get(cap); const body = await request.json();
  console.log(site.name, 'request', request.status, headersOf(request), { network: body.network, origin: body.origin, domain: body.domain, action: body.action, ttlSeconds: (Date.parse(body.expiresAt) - Date.parse(body.issuedAt)) / 1000 });
  const statusUrl = `${site.base}/dash-auth/v1/status?requestId=${encodeURIComponent(body.requestId)}`;
  const unbound = await get(statusUrl); await unbound.arrayBuffer();
  const bound = await get(statusUrl, { headers: { cookie: cookies } });
  console.log(site.name, 'status without/with binding', unbound.status, bound.status, (await bound.json()).status);
  const finish = await get(site.base + '/dash-auth/v1/finish', { method: 'POST', headers: mutationHeaders(), body: JSON.stringify({ requestId: body.requestId }) });
  await finish.arrayBuffer(); console.log(site.name, 'unapproved finish', finish.status);
  if (site.name === 'dashlogin') {
    const cancel = await get(site.base + '/dash-auth/v1/cancel', { method: 'POST', headers: mutationHeaders(), body: JSON.stringify({ requestId: body.requestId }) });
    await cancel.arrayBuffer();
    const simulator = await get(site.base + '/dev/simulator'); await simulator.arrayBuffer();
    console.log(site.name, 'simulator', simulator.status);
    const platform = await get(site.base + '/dash-auth/v1/platform/resolve?name=ronhelwig4test');
    const resolved = await platform.json();
    console.log(site.name, 'live DPNS lookup', platform.status, { network: resolved.network, resolved: Boolean(resolved.identityId) });
  }
}
