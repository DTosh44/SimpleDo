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
    const capacityContext = await browser.newContext({timezoneId:'Europe/London'});
    const capacityPage = await capacityContext.newPage(); capacityPage.on('pageerror',e=>errors.push(e.message));
    const [tuesday,wednesday,sunday] = (()=>{
      const day=new Date();day.setDate(day.getDate()+((2-day.getDay()+7)%7||7));
      const key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
      const tue=key(day);day.setDate(day.getDate()+1);const wed=key(day);day.setDate(day.getDate()+4);return [tue,wed,key(day)];
    })();
    await capacityPage.addInitScript(({legacy,tuesday})=>{
      if(!localStorage.getItem('simpledo.data.v2'))localStorage.setItem('simpledo.tasks.v1',JSON.stringify([{...legacy,id:'full-day',title:'Existing scheduled work',date:tuesday,estimateMinutes:390}]));
    },{legacy,tuesday});
    await capacityPage.goto(base);
    await capacityPage.locator('#newTaskButton').click();await capacityPage.locator('#taskTitle').fill('Two hour task');
    await capacityPage.locator('#taskEstimate').selectOption('120');await capacityPage.locator('#taskDate').selectOption('custom');await capacityPage.locator('#customDateInput').fill(tuesday);
    await capacityPage.locator('#scheduleMessage').filter({hasText:'Wednesday'}).waitFor();
    assert.equal(await capacityPage.locator('#customDateInput').inputValue(),tuesday,'suggestion does not move a task automatically');
    await capacityPage.locator('#useSuggestedDay').click();assert.equal(await capacityPage.locator('#customDateInput').inputValue(),wednesday);
    await capacityPage.locator('#saveTaskButton').click();
    const estimateTask=await capacityPage.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('simpledo.data.v2')).records).find(r=>r.task.title==='Two hour task').task);
    assert.equal(estimateTask.estimateMinutes,120);assert.equal(estimateTask.date,wednesday);assert.equal(estimateTask.focusMinutes,undefined);
    await capacityPage.getByRole('button',{name:'Edit Two hour task',exact:true}).first().click();
    await capacityPage.locator('#customDateInput').fill(tuesday);await capacityPage.locator('#saveTaskButton').click();
    assert.equal(await capacityPage.evaluate(id=>JSON.parse(localStorage.getItem('simpledo.data.v2')).records[id].task.date,estimateTask.id),tuesday,'user may ignore capacity guidance');
    assert.match(await capacityPage.locator('#day-'+tuesday+' .capacity-text').innerText(),/over/);
    await capacityPage.setViewportSize({width:1440,height:2600});
    await capacityPage.locator('[data-task-id="'+estimateTask.id+'"]').first().dragTo(capacityPage.locator('#day-'+sunday));
    assert.equal(await capacityPage.evaluate(id=>JSON.parse(localStorage.getItem('simpledo.data.v2')).records[id].task.date,estimateTask.id),sunday,'drag onto a day off is accepted');
    await capacityPage.getByRole('button',{name:'Settings',exact:true}).click();await capacityPage.getByText('Working hours',{exact:true}).click();
    await capacityPage.locator('#planningTimeZone').fill('Europe/London');
    await capacityPage.locator('[data-day="2"] [data-field="start"]').fill('10:00');
    await capacityPage.locator('[data-day="2"] [data-field="end"]').fill('16:00');
    await capacityPage.getByRole('button',{name:'Save working hours',exact:true}).click();
    assert.match(await capacityPage.locator('#planningError').innerText(),/saved/);
    await capacityPage.setViewportSize({width:390,height:844});await capacityPage.screenshot({path:'/tmp/simpledo-capacity-settings.png'});
    const settingsBox=await capacityPage.locator('#workingDays').boundingBox();assert.ok(settingsBox.x+settingsBox.width<=390);
    await capacityPage.locator('#closeSettings').click();await capacityPage.locator('#day-'+tuesday).scrollIntoViewIfNeeded();await capacityPage.screenshot({path:'/tmp/simpledo-capacity-mobile.png'});
    await capacityPage.setViewportSize({width:1440,height:1000});await capacityPage.screenshot({path:'/tmp/simpledo-capacity-desktop.png'});
    await capacityPage.setViewportSize({width:1440,height:1000});
    async function createTagged(title,tag,estimate='',date='') {
      await capacityPage.locator('#newTaskButton').click();await capacityPage.locator('#taskTitle').fill(title);await capacityPage.locator('#taskTag').selectOption(tag);
      await capacityPage.locator('#taskEstimate').selectOption(estimate);
      if(date){await capacityPage.locator('#taskDate').selectOption('custom');await capacityPage.locator('#customDateInput').fill(date);assert.match(await capacityPage.locator('#scheduleMessage').innerText(),/Outside working hours/);}
      await capacityPage.locator('#saveTaskButton').click();
    }
    await createTagged('Buy groceries','home','60',tuesday);await createTagged('Review budget','work');
    assert.equal(await capacityPage.locator('#workspace .task-tag').filter({hasText:'Home'}).count(),1);
    assert.equal(await capacityPage.locator('#workspace .task-tag').filter({hasText:'Home'}).locator('.tag-dot').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(239, 155, 45)');
    assert.match(await capacityPage.locator('#day-'+tuesday+' .capacity-text').innerText(),/1h other time/);
    await capacityPage.getByRole('button',{name:'Settings',exact:true}).click();await capacityPage.locator('#tagForm').evaluate(el=>el.closest('details').open=true);
    await capacityPage.locator('#tagName').fill('Garden');await capacityPage.locator('#tagColor').selectOption('purple');await capacityPage.getByRole('button',{name:'Save tag',exact:true}).click();
    const customId=await capacityPage.locator('#customTagChoice').inputValue();assert.match(customId,/^tag-/);await capacityPage.locator('#closeSettings').click();
    await createTagged('Plant bulbs',customId,'30',tuesday);
    await capacityPage.locator('#tagFilter').selectOption('work');assert.equal(await capacityPage.getByRole('button',{name:'Edit Review budget',exact:true}).count(),2);assert.equal(await capacityPage.getByRole('button',{name:'Edit Buy groceries',exact:true}).count(),0);
    await capacityPage.locator('#tagFilter').selectOption('home');assert.match(await capacityPage.locator('#inboxTasks').innerText(),/No Inbox tasks with this tag/);assert.equal(await capacityPage.getByRole('button',{name:'Edit Buy groceries',exact:true}).count(),2);assert.equal(await capacityPage.getByRole('button',{name:'Edit Review budget',exact:true}).count(),0);
    await capacityPage.locator('#tagFilter').selectOption(customId);assert.equal(await capacityPage.getByRole('button',{name:'Edit Plant bulbs',exact:true}).count(),2);
    await capacityPage.locator('#tagFilter').selectOption('');
    await capacityPage.getByRole('button',{name:'Settings',exact:true}).click();await capacityPage.locator('#customTagChoice').selectOption(customId);await capacityPage.locator('#tagName').fill('Outdoors');await capacityPage.getByRole('button',{name:'Save tag',exact:true}).click();
    assert.equal(await capacityPage.locator('#workspace .task-tag').filter({hasText:'Outdoors'}).count(),1);
    const [tagDownload]=await Promise.all([capacityPage.waitForEvent('download'),capacityPage.locator('#exportBackup').click()]);
    const tagBackup=JSON.parse(fs.readFileSync(await tagDownload.path(),'utf8'));assert.ok(tagBackup.tags.some(t=>t.id===customId&&t.name==='Outdoors'));assert.ok(tagBackup.tasks.some(t=>t.title==='Buy groceries'&&t.tagId==='home'));
    await capacityPage.locator('#deleteCustomTag').click();assert.equal(await capacityPage.locator('#tagName').inputValue(),'');assert.equal(await capacityPage.locator('#deleteCustomTag').isVisible(),false);await capacityPage.locator('#closeSettings').click();
    assert.equal(await capacityPage.getByRole('button',{name:'Edit Plant bulbs',exact:true}).count(),2);assert.equal(await capacityPage.locator('#workspace .task-tag').filter({hasText:'Outdoors'}).count(),0);
    assert.match(await capacityPage.locator('#day-'+tuesday+' .capacity-text').innerText(),/1h 30m other time/);
    const preserved=await capacityPage.evaluate(()=>JSON.parse(localStorage.getItem('simpledo.data.v2')).records['full-day'].task);assert.equal(preserved.tagId,undefined);
    await capacityPage.evaluate(()=>navigator.serviceWorker.ready);await capacityPage.waitForFunction(()=>navigator.serviceWorker.controller);
    await capacityContext.setOffline(true);await capacityPage.reload();assert.equal(await capacityPage.locator('#workspace .task-tag').filter({hasText:'Home'}).count(),1);await capacityContext.setOffline(false);
    await capacityPage.setViewportSize({width:390,height:844});await capacityPage.locator('#day-'+tuesday).scrollIntoViewIfNeeded();await capacityPage.screenshot({path:'/tmp/simpledo-tags-mobile.png'});
    await capacityPage.setViewportSize({width:1440,height:1000});await capacityPage.locator('#day-'+tuesday).scrollIntoViewIfNeeded();await capacityPage.screenshot({path:'/tmp/simpledo-tags-desktop.png'});
    await capacityContext.close();assert.deepEqual(errors,[]);
    console.log('PASS: migration, JSON download, merge, repeat import, replace confirmation, recovery copy, Inbox import, focus, offline reload/edit, desktop/mobile layout, working hours, task estimates, optional suggestions, drag onto a day off, tag creation/filtering/rename/delete, tag export and offline reload.');
  } finally {await browser.close(); server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
