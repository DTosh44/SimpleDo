/* Run with `node tests/browser.cjs`. Requires Playwright and its Chromium browser. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const server = http.createServer((req,res) => {
  const file = path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  const name = file.endsWith('/') ? file+'index.html' : file;
  if(!name.startsWith(root+path.sep)) {res.writeHead(403); return res.end();}
  fs.readFile(name,(error,data) => {if(error){res.writeHead(404);return res.end();} res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(data);});
});
const legacy = {id:'existing-task',title:'My existing task',notes:'Keep every detail',date:'2030-10-17',completed:false,main:true,focusMinutes:45,priority:'high',createdAt:'2026-01-01T00:00:00.000Z'};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const context = await browser.newContext({acceptDownloads:true}); const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(task=>{if(!localStorage.getItem('simpledo.data.v2')) localStorage.setItem('simpledo.tasks.v1',JSON.stringify([task]));},legacy);
  const settings=()=>page.getByRole('button',{name:'Settings',exact:true}).click();
  const importBackup=async backup=>{
    await settings(); await page.locator('#backupFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.locator('#restoreDialog').waitFor({state:'visible'});
  };
  try {
    await page.goto(base); await settings();
    assert.match(await page.locator('#accountMessage').innerText(),/not configured/);
    const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#exportBackup').click()]);
    assert.match(download.suggestedFilename(),/^SimpleDo-Backup-\d{4}-\d{2}-\d{2}.json$/);
    const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(backup.tasks[0].priority,'high'); assert.equal(backup.tasks[0].focusMinutes,45);
    await page.locator('#closeSettings').click();
    const imported={app:'SimpleDo',version:1,tasks:[...backup.tasks,{...legacy,id:'other',title:'Imported task',main:false}]};
    for(let n=0;n<2;n++) {await importBackup(imported); await page.locator('#mergeBackup').click();}
    assert.equal(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('simpledo.data.v2')).records).filter(r=>!r.deleted).length),2);
    await importBackup(backup); assert.equal(await page.locator('#replaceBackup').isDisabled(),true);
    await page.locator('#replaceConfirm').check(); await page.locator('#replaceBackup').click();
    assert.equal(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('simpledo.data.v2')).records).filter(r=>!r.deleted).length),1);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('simpledo.beforeRestore.v1')).tasks.length),2);
    // Existing Inbox importer remains a separate append-only flow.
    await page.locator('#importTasksFile').setInputFiles({name:'list.txt',mimeType:'text/plain',buffer:Buffer.from('One Inbox task\nOne Inbox task\nSecond Inbox task')});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('simpledo.data.v2')).records && Object.values(JSON.parse(localStorage.getItem('simpledo.data.v2')).records).filter(r=>!r.deleted).length===3);
    await page.getByRole('button',{name:'Edit One Inbox task',exact:true}).first().click();
    await page.locator('#startTaskFromEditor').click(); await page.locator('#focusDurationSelect').selectOption('15'); await page.locator('#focusStartButton').click();
    assert.match(await page.locator('#focusCountdown').innerText(),/1[45]:\d\d/);
    assert.match(await page.title(),/1[45]:\d\d · SimpleDo/);
    await page.locator('#focusPauseButton').click(); assert.match(await page.title(),/^Paused /);
    await page.locator('#focusPauseButton').click();
    await page.locator('#closeFocusDialog').click();
    // Loaded shell can reopen offline; preference and running timer stay local.
    await page.evaluate(()=>navigator.serviceWorker.ready); await page.waitForFunction(()=>navigator.serviceWorker.controller);
    await context.setOffline(true); await page.reload();
    assert.equal(await page.locator('#globalFocusButton').isVisible(),true);
    await page.locator('#quickTaskInput').fill('Offline capture'); await page.locator('#quickAddForm button').click();
    await page.reload(); assert.equal(await page.getByRole('button',{name:'Edit Offline capture',exact:true}).count(),2);
    await context.setOffline(false);
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/simpledo-mobile.png',fullPage:false});
    for (const selector of ['#newTaskButton','#settingsButton','#globalFocusButton']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 390,selector + ' fits on mobile');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await settings(); await page.screenshot({path:'/tmp/simpledo-settings.png'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#closeSettings').click();
    await page.setViewportSize({width:1440,height:1000}); await page.screenshot({path:'/tmp/simpledo-desktop.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS: migration, JSON download, merge, repeat import, replace confirmation, recovery copy, Inbox import, focus, offline reload/edit, desktop/mobile layout.');
  } finally {await browser.close(); server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
