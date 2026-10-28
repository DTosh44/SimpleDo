/* Production public config, isolated browser storage. No email or authenticated API calls. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'), http=require('node:http'), fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+relative+(relative.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(error,data)=>{
  if(error){res.writeHead(404);return res.end();}
  const types={'.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
  res.setHeader('Content-Type',types[path.extname(file)]||'text/html');res.end(data);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(base);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('simpledo.data.v2')).records).length),0,'fresh cloud-configured device has no samples');
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://simpledo.co.uk/');
  const cdp=await context.newCDPSession(page),{data,errors:manifestErrors}=await cdp.send('Page.getAppManifest');
  assert.ok(data,'manifest is discoverable');assert.equal(manifestErrors.length,0);
  const manifest=JSON.parse(data);assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){
   const response=await context.request.get(new URL(icon.src,base).href);assert.equal(response.status(),200);
   const bytes=await response.body(),size=Number(icon.sizes.split('x')[0]);
   assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  }
  await page.locator('#quickTaskInput').fill('Production fixture retained offline');
  await page.locator('#quickAddForm button[type=submit]').click();
  const before=await page.evaluate(()=>localStorage.getItem('simpledo.data.v2'));
  await page.goto(base+'?token_hash=synthetic-cache-check');
  const cached=await page.evaluate(async()=>{const keys=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())keys.push(request.url);return keys;});
  assert.ok(!cached.some(url=>url.includes('token_hash=')),'callback query variants are never cached');
  await context.setOffline(true);await page.goto(base);
  assert.equal(await page.evaluate(()=>localStorage.getItem('simpledo.data.v2')),before,'offline reload preserves exact task storage');
  assert.equal(await page.locator('#quickTaskInput').isEnabled(),true);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: production public config starts empty, valid manifest/PNG icons, mobile layout, callback cache exclusion and exact offline task preservation. No real login tested.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
