import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const root=new URL('../../../rpg-campaign-platform/', import.meta.url).pathname;
const require=createRequire(root+'package.json');
const {chromium,firefox}=require('playwright'); const Database=require('better-sqlite3');
const {SCHEMA_SQL}=await import(root+'apps/campaign-platform/src/db/schema.ts');
const dir=mkdtempSync(join(tmpdir(),'siwd-http-test-'));
const db=new Database(join(dir,'campaign-platform.sqlite'));db.exec(SCHEMA_SQL);
db.prepare("INSERT INTO users VALUES('audit','audit','Audit','owner','now')").run();
db.prepare("INSERT INTO sessions VALUES('synthetic-session','audit','now','2999-01-01T00:00:00Z','audit')").run();
db.close();
const child=spawn(process.execPath,['--import','tsx','apps/campaign-platform/src/server.ts'],{cwd:root,env:{...process.env,NODE_ENV:'test',CAMPAIGN_PLATFORM_PORT:'18766',CAMPAIGN_PLATFORM_HOST:'127.0.0.1',CAMPAIGN_PLATFORM_DATA_DIR:dir,CAMPAIGN_PLATFORM_PUBLIC_BASE_URL:'http://127.0.0.1:18766',CAMPAIGN_PLATFORM_SIWD_NETWORK:'testnet'},stdio:['ignore','pipe','pipe']});
const demoRoot = new URL('../../apps/demo-web/', import.meta.url).pathname;
const demoChild = spawn(process.execPath, ['--import','tsx','src/server.ts'], {cwd:demoRoot, env:{...process.env,PORT:'18792',HOST:'127.0.0.1',SIWD_DB_PATH:':memory:',SIWD_PUBLIC_ORIGIN:'http://127.0.0.1:18792',SIWD_VERIFY_MODE:'simulator',SIWD_ENABLE_SIMULATOR:'true'},stdio:['ignore','ignore','pipe']});
let errors='';demoChild.stderr.on('data',d=>errors+=d);child.stderr.on('data',d=>errors+=d);
const evil=createServer((req,res)=>res.end('<html><body>Sibling-origin test</body></html>'));
await new Promise(r=>evil.listen(0,'127.0.0.1',r));
let browser;
try {
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:18766/healthz');if(r.ok)break;}catch{} await new Promise(r=>setTimeout(r,100));if(i===99)throw Error(errors);}
 browser=await (process.env.BROWSER === 'firefox' ? firefox : chromium).launch({headless:true});const page=await browser.newPage();
 await page.context().addCookies([{name:'campaign_platform_session',value:'synthetic-session',url:'http://127.0.0.1:18766'}]);
 await page.goto('http://127.0.0.1:18766/account');
 assert.ok(await page.locator('meta[name="csrf-token"]').getAttribute('content'));
 assert.ok(await page.locator('form[method=post] input[name=_csrf]').count());
 const cookie=(await page.context().cookies()).find(c=>c.name==='siwd_csrf');assert.ok(cookie);
 // Same-origin authorized mutation passes CSRF and reaches ordinary validation.
 const accepted=await page.evaluate(async()=>{const r=await fetch('/auth/dash/link',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'dashName=invalid!'});return r.status;});
 assert.equal(accepted,400);
 await page.goto(`http://127.0.0.1:${evil.address().port}/`);
 const cross=await page.evaluate(async()=>{await fetch('http://127.0.0.1:18766/logout',{method:'POST',mode:'no-cors',credentials:'include'});return true;});assert.ok(cross);
 await page.goto('http://127.0.0.1:18766/account');assert.ok(page.url().endsWith('/account'));
 console.log('PASS real browser: sibling-origin POST cannot log out an authenticated Latitude user');
 const oversized=await fetch('http://127.0.0.1:18766/dash-auth/v1/respond',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(20000)})});
 assert.equal(oversized.status,413);
 console.log('PASS Latitude body limit, CSRF meta/form insertion and same-origin fetch integration');
 for(const base of ['http://127.0.0.1:18766','http://127.0.0.1:18792']){
  const sibling=await fetch(base+'/logout',{method:'POST',headers:{Origin:'https://sibling.ronhelwig.com'}});assert.equal(sibling.status,403);
  const r=await fetch(base+'/');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.equal(r.headers.get('cache-control'),'no-store');
 }
 // A same-origin form with no-referrer must actually log out, not just reach a route.
 await page.goto('http://127.0.0.1:18766/account');
 const postPromise=page.waitForResponse(r=>r.url().endsWith('/logout') && r.request().method()==='POST');
 await page.locator('form[action="/logout"] button').first().click();
 const posted=await postPromise;
 assert.equal(posted.status(),303);
 await page.waitForURL('http://127.0.0.1:18766/');
 await page.goto('http://127.0.0.1:18766/account');assert.ok(page.url().includes('/login'));
 console.log('PASS actual browser form logout: session revoked, cookie removed, homepage loaded');
 for (const base of ['http://127.0.0.1:18766','http://127.0.0.1:18792']) {
   const home=await fetch(base+'/'); const html=await home.text();
   const token=html.match(/name="csrf-token" content="([a-f0-9]+)"/)[1];
   const headers={Origin:'null','Sec-Fetch-Site':'same-origin','Content-Type':'application/x-www-form-urlencoded',Cookie:'siwd_csrf='+token};
   for (const body of ['', '_csrf='+'b'.repeat(64)]) {
     const rejected=await fetch(base+'/logout',{method:'POST',headers,body,redirect:'manual'});assert.equal(rejected.status,403);
   }
   for (const site of ['same-site','cross-site','none']) {
     const rejected=await fetch(base+'/logout',{method:'POST',headers:{...headers,'Sec-Fetch-Site':site},body:'_csrf='+token,redirect:'manual'});assert.equal(rejected.status,403);
   }
   const accepted=await fetch(base+'/logout',{method:'POST',headers,body:'_csrf='+token,redirect:'manual'});
   assert.equal(accepted.status,303); assert.equal(accepted.headers.get('location'),'/');
 }
 console.log('PASS both sites: null-origin logout redirects home; missing/invalid CSRF and cross-site metadata still rejected');
 console.log('PASS both applications: wrong origins rejected and security headers present');
}finally{await browser?.close();child.kill('SIGTERM');demoChild.kill('SIGTERM');await new Promise(r=>evil.close(r));}
