/* Real Chromium UI, with explicitly simulated speech events and OCR replies. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.SIMPLEDO_CONFIG = Object.freeze({supabaseUrl: "", supabasePublicKey: ""});');}const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));const name=file.endsWith('/')?file+'index.html':file;if(!name.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(name,(e,data)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(data);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Test-only wrapper exposes the real controller while retaining app capture/storage hooks.
  await page.route('**/capture-ui.js*',async route=>{const source=fs.readFileSync(path.join(root,'capture-ui.js'),'utf8');await route.fulfill({contentType:'text/javascript',body:source+'\nconst OriginalCapture=SimpleDoCaptureUI.Controller;SimpleDoCaptureUI.Controller=class extends OriginalCapture{constructor(hooks){super(hooks);window.testCapture=this;}};'});});
  await page.addInitScript(()=>{localStorage.setItem('simpledo.demoRemoved.v1','true');window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});
  const live=()=>page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('simpledo.data.v2')).records).filter(r=>!r.deleted).map(r=>r.task));
  await page.goto(base);
  await page.locator('#quickTaskInput').fill('Typed capture');await page.locator('#quickAddForm button[type=submit]').click();assert.equal((await live()).length,1);
  await page.locator('#captureSpeak').click();assert.match(await page.locator('#captureSpeechHint').innerText(),/unavailable/);assert.equal(await page.locator('#captureStart').isVisible(),false);
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreCaptureStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='simpledo.captureDraft.v1')throw Error('session full');return original.call(this,k,v);};});await page.locator('#captureText').fill('Memory draft');await page.locator('#captureClose').click();await page.locator('#captureSpeak').click();assert.equal(await page.locator('#captureText').inputValue(),'Memory draft');await page.evaluate(()=>restoreCaptureStorage());
  await page.locator('#captureText').fill('Book dentist\nMow lawn\nMow lawn\n[x] Already finished');await page.locator('#captureReviewText').click();assert.equal(await page.locator('.capture-row').count(),4);
  await page.locator('#captureTag').selectOption('home');await page.locator('#captureAdd').click();await page.evaluate(()=>testCapture.add());assert.equal((await live()).length,3);assert.equal((await live()).filter(t=>t.tagIds?.includes('home')&&t.capacityContext==='outside').length,2);
  // Voice/text capture follows the same near-match warning and safe default.
  await page.locator('#captureSpeak').click();
  await page.locator('#captureText').fill('Book dentists');
  await page.locator('#captureReviewText').click();
  await page.locator('#captureAdd').click();
  assert.equal(await page.locator('#similarTaskDialog').isVisible(),true);
  assert.match(await page.locator('#similarTaskRows').innerText(),/Book dentist/);
  await page.locator('#similarTaskConfirm').click();
  assert.equal((await live()).some(t=>t.title==='Book dentists'),false);
  await page.locator('#captureSpeak').click();
  await page.locator('#captureText').fill('Book dentists');
  await page.locator('#captureReviewText').click();
  await page.locator('#captureAdd').click();
  await page.getByRole('checkbox',{name:'Add anyway: Book dentists'}).check();
  await page.locator('#similarTaskConfirm').click();
  assert.equal((await live()).filter(t=>t.title==='Book dentists').length,1);
  await page.locator('#captureScan').click();assert.match(await page.locator('#captureScanHint').innerText(),/configured service/);assert.equal(await page.locator('#capturePhoto').isDisabled(),true);await page.locator('#captureCancel').click();
  // A real browser running a fake native recognizer verifies interaction, not microphone compatibility.
  const installSpeech=()=>{window.webkitSpeechRecognition=class{constructor(){window.testRecognition=this;}start(){this.onstart?.();}stop(){this.onend?.();}abort(){this.aborted=true;}};};await page.addInitScript(installSpeech);await page.evaluate(installSpeech);
  await page.locator('#captureSpeak').click();await page.locator('#captureStart').click();assert.equal(await page.locator('#captureRecording').isVisible(),true);assert.equal(await page.locator('#captureText').getAttribute('readonly'),'');
  await page.evaluate(()=>{const results=[[{transcript:'Book the MOT'}]];results[0].isFinal=true;testRecognition.onresult({resultIndex:0,results});});
  await page.locator('#captureStop').click();await page.locator('#captureText').fill('Book the car MOT');await page.locator('#captureClose').click();await page.reload();await page.locator('#captureSpeak').click();assert.equal(await page.locator('#captureText').inputValue(),'Book the car MOT');
  await page.locator('#captureReviewText').click();await page.locator('#captureAdd').click();assert.ok((await live()).some(t=>t.title==='Book the car MOT'));
  await page.locator('#captureSpeak').click();await page.locator('#captureStart').click();await page.evaluate(()=>testRecognition.onerror({error:'not-allowed'}));assert.match(await page.locator('#captureMessage').innerText(),/permission was declined/);await page.locator('#captureCancel').click();assert.equal(await page.evaluate(()=>testRecognition.aborted),true);
  // Test-only client simulates authenticated OCR service success, confidence and failure.
  await page.evaluate(()=>{window.scanCalls=0;window.scanMode='success';testCapture.account({functions:{invoke:async(name,{body})=>{if(body.action==='status')return {data:{available:true}};scanCalls++;if(scanMode==='failure')return {error:{}};return {data:{lines:[{text:'• Email Simon',confidence:.98},{text:'2. Unclear handwriting',confidence:.6},{text:'[x] Done already',confidence:.99},{text:'Email Simon',confidence:.99}]}};}}},{id:'fake-account'});});
  await page.locator('#captureScan').click();await page.waitForFunction(()=>!document.getElementById('capturePhoto').disabled);
  await page.locator('#captureImageFile').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});assert.match(await page.locator('#captureMessage').innerText(),/JPEG/);assert.equal(await page.evaluate(()=>scanCalls),0);
  const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,800,600);x.fillStyle='#000';x.font='30px sans-serif';x.fillText('Email Simon',20,50);return c.toDataURL('image/jpeg').split(',')[1];});
  const upload=()=>page.locator('#captureImageFile').setInputFiles({name:'list.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo,'base64')});
  await upload();await page.locator('#captureReview').waitFor({state:'visible'});assert.equal(await page.locator('.capture-row').count(),4);assert.equal(await page.locator('[aria-label="Include item 2"]').isChecked(),false);assert.equal(await page.locator('[aria-label="Include item 3"]').isChecked(),false);
  await page.locator('[aria-label="Task 2"]').fill('Corrected handwriting');await page.locator('[aria-label="Include item 2"]').check();await page.locator('#captureTag').selectOption('work');await page.locator('[aria-label="Remove item 4"]').click();await page.locator('#captureBack').click();await page.locator('#captureText').fill('One more task');await page.locator('#captureReviewText').click();assert.equal(await page.locator('[aria-label="Include item 3"]').isChecked(),false,'adding more text retains completed-item exclusion');assert.equal(await page.locator('#captureTag').inputValue(),'work');await page.screenshot({path:'/tmp/simpledo-capture-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#captureAdd').click();assert.equal((await live()).filter(t=>t.tagIds?.includes('work')).length,3);assert.equal((await live()).filter(t=>t.title==='Email Simon').length,1);
  await page.locator('#captureScan').click();await page.waitForFunction(()=>!document.getElementById('captureUpload').disabled);await page.locator('#captureText').fill('Keep this draft');await page.evaluate(()=>scanMode='failure');await upload();await page.waitForFunction(()=>!testCapture.busy);assert.match(await page.locator('#captureMessage').innerText(),/failed/);assert.equal(await page.locator('#captureText').inputValue(),'Keep this draft');
  await context.setOffline(true);await upload();assert.match(await page.locator('#captureMessage').innerText(),/connection/);assert.equal(await page.locator('#captureText').inputValue(),'Keep this draft');await page.locator('#captureCancel').click();
  await page.locator('#quickTaskInput').fill('Offline type');await page.locator('#quickAddForm button[type=submit]').click();assert.ok((await live()).some(t=>t.title==='Offline type'));await context.setOffline(false);
  const before=await live();await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='simpledo.data.v2')throw new DOMException('full','QuotaExceededError');return original.call(this,k,v);};});
  await page.locator('#quickTaskInput').fill('Keep on storage failure');await page.locator('#quickAddForm button[type=submit]').click();assert.equal(await page.locator('#quickTaskInput').inputValue(),'Keep on storage failure');assert.deepEqual(await live(),before);
  await page.reload();assert.equal(await page.locator('#quickTaskInput').inputValue(),'Keep on storage failure');await page.locator('#quickAddForm button[type=submit]').click();assert.equal((await live()).filter(t=>t.title==='Keep on storage failure').length,1);
  assert.equal(await page.locator('#captureSpeak').evaluate(e=>getComputedStyle(e).color),'rgb(142, 41, 82)','voice capture uses legible dark pink');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/simpledo-capture-desktop.png'});assert.deepEqual(errors,[]);
  await page.goto(base+'?capture=speak');await page.locator('#captureDialog').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>Boolean(window.testRecognition)),false,'shortcut never starts microphone');await page.locator('#captureCancel').click();
  const native=await browser.newContext({serviceWorkers:'block'}),nativePage=await native.newPage();await nativePage.goto(base);console.log('Native Chrome '+browser.version()+' API presence (no microphone test): '+await nativePage.evaluate(()=>JSON.stringify({SpeechRecognition:typeof SpeechRecognition,webkitSpeechRecognition:typeof webkitSpeechRecognition})));await native.close();
  await context.close();console.log('PASS: real desktop/mobile Chromium capture UI, simulated speech/OCR, draft retention, duplicate/tag import, offline and storage failure preservation.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
