const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup() {
 const memory=new Map(),listeners={},sandbox={SimpleDoCapacity:require('../capacity.js'),navigator:{onLine:true},location:{assign(){}},setInterval(){},Date,URL,
  localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
  window:{addEventListener:(e,fn)=>listeners[e]=fn},document:{hidden:false,addEventListener(){}},console};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../calendar.js'),'utf8'),sandbox);
 return {calendar:new sandbox.SimpleDoCalendar.Calendar(()=>{}),sandbox,memory,listeners};
}
const providers=[{provider:'outlook',connected:true,configured:true,selected:['work']},{provider:'google',connected:false,configured:false,selected:[]}];
const client={functions:{async invoke(name,{body}) {
 if(body.action==='status')return {data:{providers}};
 if(body.action==='busy')return {data:{busy:[{start:'2026-10-20T09:00:00Z',end:'2026-10-20T10:00:00Z'}]}};
 return {data:{}};
}}};
test('client caches only busy intervals, marks offline data stale, and removes it on sign-out',async()=>{
 const {calendar,sandbox,memory}=setup();await calendar.account(client,{id:'one'});
 assert.equal(calendar.cache.owner,'one');assert.equal(calendar.cache.busy.length,1);assert.ok(!JSON.stringify(calendar.cache).includes('work'));
 const date=new Date(Date.parse(calendar.cache.start)+86400000).toISOString().slice(0,10);assert.equal(calendar.source(calendar.cache.start.slice(0,10)),'calendar unavailable');assert.equal(calendar.source(date),'calendar included');
 sandbox.navigator.onLine=false;assert.equal(calendar.source(date),'calendar may be outdated');
 await calendar.account(client,null);assert.equal(calendar.intervals(date).length,0);assert.equal(memory.size,0);
});
test('calendar API failure retains known availability with an explicit stale label',async()=>{
 const {calendar}=setup();await calendar.account(client,{id:'one'});const cached=calendar.cache;
 calendar.client={functions:{async invoke(){return {error:{}};}}};await calendar.refresh(true);
 assert.equal(calendar.cache,cached);assert.match(calendar.error,/unavailable/);assert.equal(calendar.source(new Date(Date.parse(cached.start)+86400000).toISOString().slice(0,10)),'calendar may be outdated');
});
test('in-flight responses from an old account cannot populate a new account cache',async()=>{
 const {calendar}=setup();let resolve;
 const delayed={functions:{invoke:()=>new Promise(r=>resolve=r)}};
 const first=calendar.account(delayed,{id:'one'});await new Promise(r=>setImmediate(r));
 await calendar.account(client,{id:'two'});resolve({data:{providers}});await first;await new Promise(r=>setImmediate(r));
 assert.ok(calendar.cache===null||calendar.cache.owner==='two');assert.equal(calendar.owner,'two');
});
