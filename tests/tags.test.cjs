const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../tags.js'),C=require('../capacity.js'),{Store,parseBackupDocument}=require('../data.js');
class Memory{constructor(){this.map=new Map();}getItem(k){return this.map.get(k)||null;}setItem(k,v){this.map.set(k,v);}}
function setup(){const store=new Store(new Memory());store.load([{id:'a',title:'Existing task',date:'2026-10-20',estimateMinutes:60}]);return {store,tags:new T.Catalog(store)};}
test('default tags are stable and old tasks stay untagged',()=>{
 const {store,tags}=setup();assert.deepEqual(tags.list().map(t=>[t.id,t.name,t.color]),[['work','Work','blue'],['home','Home','orange']]);
 assert.equal(store.live()[0].tagId,undefined);assert.equal(tags.context(store.live()[0]),'work');assert.throws(()=>tags.edit('work',{name:'Renamed',color:'blue'}));
});
test('custom tags validate names/colors, rename by ID, and delete without changing tasks',()=>{
 const {store,tags}=setup(),tag=tags.edit(null,{name:'Garden',color:'orange'});
 store.commit([{...store.live()[0],tagId:tag.id,capacityContext:'outside'}]);const before=store.live();
 tags.edit(tag.id,{name:'Outdoors',color:'purple'});assert.equal(tags.resolve(tag.id).name,'Outdoors');assert.equal(store.live()[0].tagId,tag.id);
 tags.remove(tag.id);assert.equal(tags.resolve(tag.id),null);assert.deepEqual(store.live(),before);assert.equal(tags.context(store.live()[0]),'outside');
 assert.throws(()=>tags.edit(null,{name:'work',color:'blue'}));assert.throws(()=>tags.edit(null,{name:'Unsafe',color:'url(javascript:bad)'}));
});
test('Home and separate custom tags do not consume work capacity or get work-day suggestions',()=>{
 const {tags}=setup(),separate=tags.edit(null,{name:'Reading',color:'blue'}),work=tags.edit(null,{name:'Client',color:'purple',context:'work'});
 const tasks=[{id:'home',tagId:'home',date:'2026-10-20',estimateMinutes:120},{id:'custom',tagId:separate.id,capacityContext:'outside',date:'2026-10-20',estimateMinutes:30},{id:'work',tagId:work.id,date:'2026-10-20',estimateMinutes:60},{id:'u',date:'2026-10-20',estimateMinutes:15}];
 const s={...C.defaults(),timeZone:'Europe/London'},r=C.calculate('2026-10-20',s,tags.scoped(tasks));
 assert.equal(r.tasks,75);assert.equal(r.outside,150);assert.equal(r.free,345);
 const advice=C.suggest('2026-10-20',120,['2026-10-21'],s,tasks,[],null,'outside');assert.equal(advice.current,null);assert.equal(advice.date,null);
});
test('backup merge/replace preserves metadata, labels and tombstones without duplicating IDs',()=>{
 const {store,tags}=setup(),tag=tags.edit(null,{name:'Garden',color:'orange'});store.commit([{...store.live()[0],tagId:tag.id,capacityContext:'outside'}]);
 const doc=parseBackupDocument(JSON.stringify(store.backup()));tags.edit(tag.id,{name:'New name',color:'pink'});
 store.restore(doc.tasks,false,undefined,doc.tags);assert.equal(tags.resolve(tag.id).name,'New name');
 tags.remove(tag.id);store.restore(doc.tasks,false,undefined,doc.tags);assert.equal(tags.resolve(tag.id),null);
 store.restore(doc.tasks,true,undefined,doc.tags);assert.equal(tags.resolve(tag.id).name,'Garden');assert.equal(tags.list().length,3);
 const recovery=JSON.parse(store.storage.getItem('simpledo.beforeRestore.v1'));assert.ok(recovery.tags.some(t=>t.id===tag.id&&t.deleted));
});
test('invalid tag backup rejects before task replacement',()=>{
 const {store}=setup();const raw=store.backup();assert.throws(()=>parseBackupDocument(JSON.stringify({...raw,tags:[{id:'work',name:'Fake'}]})));assert.equal(store.live()[0].title,'Existing task');
});
test('metadata edits survive reload, reset revisions only on explicit account merge',()=>{
 const {store,tags}=setup(),tag=tags.edit(null,{name:'Trips',color:'blue'});const sent=tags.pending()[0][1];tags.receive({id:tag.id,payload:tag,revision:3},sent);
 const next=new Store(store.storage);next.load([]);const catalog=new T.Catalog(next);assert.equal(catalog.resolve(tag.id).name,'Trips');
 next.bind('account');assert.equal(catalog.pending()[0][1].version,0);assert.equal(next.live().length,1);
});
test('remote deletion beats stale rename and keeps task references recoverable',()=>{
 const {store,tags}=setup(),tag=tags.edit(null,{name:'Trips',color:'blue'});store.commit([{...store.live()[0],tagId:tag.id,capacityContext:'outside'}]);
 const sent=tags.pending()[0][1];tags.receive({id:tag.id,payload:{...tag,deleted:true},revision:4,conflict:true},sent);
 assert.equal(tags.resolve(tag.id),null);assert.equal(store.live().length,1);assert.equal(tags.context(store.live()[0]),'outside');
});
test('metadata changes during an upload stay queued at the acknowledged revision',()=>{
 const {tags}=setup(),tag=tags.edit(null,{name:'Trips',color:'blue'}),sent=tags.pending()[0][1];tags.edit(tag.id,{name:'Travel',color:'blue'});
 tags.receive({id:tag.id,payload:tag,revision:1,conflict:false},sent);assert.equal(tags.pending()[0][1].version,1);assert.equal(tags.resolve(tag.id).name,'Travel');
});

test('multi-tag tasks read legacy labels, combine work areas, and respect Home capacity',()=>{
 const {store,tags}=setup(),marketing=tags.edit(null,{name:'Marketing',color:'pink',context:'outside'});
 assert.deepEqual(T.taskIds({tagId:'work'}),['work']);
 assert.deepEqual(T.taskIds({tagIds:['work',marketing.id],tagId:'home'}),['work',marketing.id]);
 const mixed={...store.live()[0],tagIds:['work',marketing.id]};
 store.commit([mixed]);assert.equal(tags.context(store.live()[0]),'work');
 assert.deepEqual(store.live()[0].tagIds,['work',marketing.id]);
 const doc=parseBackupDocument(JSON.stringify(store.backup()));assert.deepEqual(doc.tasks[0].tagIds,['work',marketing.id]);
 store.restore(doc.tasks,true,undefined,doc.tags);assert.deepEqual(store.live()[0].tagIds,['work',marketing.id]);
 assert.equal(tags.context({tagIds:['home',marketing.id]}),'outside');
 const monday='2026-10-20',settings={...C.defaults(),timeZone:'Europe/London'};
 const totals=C.calculate(monday,settings,tags.scoped([{id:'w',date:monday,estimateMinutes:30,tagIds:['work',marketing.id]},{id:'h',date:monday,estimateMinutes:45,tagIds:['home',marketing.id]}]));
 assert.equal(totals.tasks,30);assert.equal(totals.outside,45);
});
