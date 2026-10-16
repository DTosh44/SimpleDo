const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../daily.js'),{Store,parseBackupDocument}=require('../data.js');
const task=(id,props={})=>({id,title:id,date:'2026-10-16',completed:false,main:false,createdAt:'2026-10-01T10:00:00Z',...props});
test('daily summary distinguishes an empty day from a completed day',()=>{
 const empty=D.summarize([]);assert.equal(empty.total,0);assert.equal(empty.percent,0);assert.equal(empty.featured,null);
 const done=D.summarize([task('a',{completed:true})]);assert.equal(done.remaining,0);assert.equal(done.percent,100);assert.equal(done.completed.length,1);
});
test('Main Thing is featured only while unfinished; fallback is honestly Up next',()=>{
 const all=[task('old'),task('important',{main:true,estimateMinutes:60,tagId:'work'}),task('done',{completed:true})];
 let s=D.summarize(all);assert.equal(s.featured.id,'important');assert.equal(s.label,'The Main Thing');assert.equal(s.done,1);assert.equal(s.remaining,2);assert.equal(s.others[0].id,'old');
 s=D.summarize(all.map(t=>t.id==='important'?{...t,completed:true}:t));assert.equal(s.featured.id,'old');assert.equal(s.label,'Up next');assert.equal(s.completed.length,2);
});
test('filters change the displayed tasks while progress remains all of today',()=>{
 const all=[task('work',{tagId:'work'}),task('home',{tagId:'home',completed:true})];const s=D.summarize(all,all.filter(t=>t.tagId==='home'));
 assert.equal(s.total,2);assert.equal(s.done,1);assert.equal(s.remaining,1);assert.equal(s.visible,1);assert.equal(s.featured,null);assert.equal(s.completed.length,1);
});
test('stable ordering leaves old tasks unchanged and Main Thing first',()=>{
 const all=[task('late',{createdAt:'2026-10-02Z'}),task('early',{createdAt:'2026-10-01Z'}),task('important',{main:true,dayOrder:999}),task('custom',{dayOrder:0})],before=JSON.stringify(all);
 assert.deepEqual(D.ordered(all).map(t=>t.id),['important','custom','early','late']);assert.equal(JSON.stringify(all),before);
 assert.deepEqual(D.ordered([task('z'),task('a')]).map(t=>t.id),['z','a'],'equal timestamps keep the existing input order');
});
test('explicit reorder/keyboard shifts affect only the matching day and status/priority group',()=>{
 const all=[task('a'),task('b'),task('main',{main:true}),task('done',{completed:true}),task('tomorrow',{date:'2026-10-17'}),task('inbox',{date:null})];
 const reordered=D.reorder(all,'b','a');assert.deepEqual(D.ordered(reordered).filter(t=>['a','b'].includes(t.id)).map(t=>t.id),['b','a']);
 assert.equal(reordered[2],all[2]);assert.equal(reordered[3],all[3]);assert.equal(reordered[4],all[4]);assert.equal(reordered[5],all[5]);assert.equal(all[0].dayOrder,undefined);
 assert.deepEqual(D.ordered(D.shift(reordered,'a',-1)).filter(t=>['a','b'].includes(t.id)).map(t=>t.id),['a','b']);
 for(const target of ['main','done','tomorrow','inbox','b'])assert.equal(D.reorder(all,'b',target),all);
 assert.equal(D.shift(all,'a',-1),all);assert.equal(D.shift(all,'inbox',1),all);
});
test('day order survives existing backup and simulated revision sync without changing task fields',()=>{
 class Memory{constructor(){this.map=new Map();}getItem(k){return this.map.get(k)||null;}setItem(k,v){this.map.set(k,v);}}
 const a=new Store(new Memory()),b=new Store(new Memory());a.load([task('a',{notes:'Preserve',priority:'high'}),task('b',{focusMinutes:15,tagId:'home'})]);b.load([]);
 a.commit(D.shift(a.live(),'b',-1));const document=parseBackupDocument(JSON.stringify(a.backup()));assert.equal(document.tasks.find(t=>t.id==='a').notes,'Preserve');
 a.bind('owner');for(const [id,sent]of a.pending())b.receive({id,payload:sent.task,revision:1,deleted:false});
 assert.deepEqual(D.ordered(b.live()).map(t=>t.id),['b','a']);assert.equal(b.live().find(t=>t.id==='b').tagId,'home');assert.equal(b.live().find(t=>t.id==='a').priority,'high');
});
test('large daily lists remain read-only, keep all completed tasks and select one feature',()=>{
 const tasks=Array.from({length:5000},(_,i)=>task('task-'+i,{completed:i%2===0,main:i===3,dayOrder:i})),before=JSON.stringify(tasks);const s=D.summarize(tasks);
 assert.equal(s.total,5000);assert.equal(s.done,2500);assert.equal(s.others.length,2499);assert.equal(s.featured.id,'task-3');assert.equal(JSON.stringify(tasks),before);
});
