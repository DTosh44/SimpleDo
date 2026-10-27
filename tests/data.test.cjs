const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Store, parseBackup, KEY} = require('../data.js');
class Memory {
  constructor() {this.data = new Map(); this.fail = false;}
  getItem(k) {return this.data.get(k) ?? null;}
  setItem(k,v) {if(this.fail) throw Error('Quota exceeded'); this.data.set(k,v);}
}
const task = (id='a', extra={}) => ({id,title:'A task',notes:'Notes',date:'2030-10-17',completed:false,main:true,focusMinutes:45,priority:'high',createdAt:'2026-01-01T00:00:00.000Z',...extra});
const setup = () => {const memory = new Memory(), store = new Store(memory); store.load([task()]); return {memory,store};};
const row = (t, revision=1, deleted=false, conflict=false) => ({id:t.id,payload:t,revision,deleted,conflict});
test('upgrade preserves exact source and every task field', () => {
  const memory = new Memory(), original = JSON.stringify([task()]); memory.setItem('simpledo.tasks.v1',original);
  const store = new Store(memory); const tasks = store.load([]);
  assert.equal(memory.getItem('simpledo.preUpgrade.v1'),original);
  assert.equal(memory.getItem('simpledo.tasks.v1'),original);
  assert.equal(tasks[0].priority,'high'); assert.equal(tasks[0].focusMinutes,45);
  assert.deepEqual(parseBackup(JSON.stringify(store.backup())),tasks);
});
test('corrupt legacy data is never replaced or reseeded', () => {
  const memory = new Memory(); memory.setItem('simpledo.tasks.v1','bad json');
  assert.throws(()=>new Store(memory).load([task()]));
  assert.equal(memory.getItem('simpledo.tasks.v1'),'bad json'); assert.equal(memory.getItem(KEY),null);
});
test('merge is idempotent and existing edits win', () => {
  const {store} = setup(); store.restore([task('a',{title:'Older'}),task('b')],false);
  assert.equal(store.restore([task('a'),task('b')],false).length,2);
  assert.equal(store.live()[0].title,'A task');
});
test('replace retains a complete pre-restore snapshot and can restore empty', () => {
  const {store,memory} = setup(); assert.equal(store.restore([],true).length,0);
  assert.equal(JSON.parse(memory.getItem('simpledo.beforeRestore.v1')).tasks.length,1);
  assert.equal(store.state.records.a.deleted,true);
});
test('malformed backups reject atomically', () => {
  const {store}=setup();
  for (const tasks of [[task('a',{date:'2026-02-31'})],[task(),task()],[task('a',{completed:'yes'})],[task('a',{focusMinutes:181})],[task('__proto__')]])
    assert.throws(()=>parseBackup(JSON.stringify({app:'SimpleDo',version:1,tasks})));
  assert.throws(()=>parseBackup('{"tasks":[]}')); assert.equal(store.live().length,1);
});
test('failed recovery checkpoint prevents destructive replacement', () => {
  const {store,memory}=setup(); memory.fail=true;
  assert.throws(()=>store.restore([],true)); assert.equal(JSON.parse(memory.getItem(KEY)).records.a.deleted,false);
});
test('offline edits and deletions survive reload and repeat import does not resurrect', () => {
  const {store,memory}=setup(); store.commit([]);
  const reloaded = new Store(memory); reloaded.load([]);
  assert.equal(reloaded.pending()[0][1].deleted,true);
  assert.equal(reloaded.restore([task()],false).length,0);
});
test('conflicting edit keeps remote and recovers local with a distinct ID', () => {
  const {store}=setup(), sent=store.pending()[0][1];
  store.receive(row(task('a',{title:'Remote'}),2,false,true),sent);
  const tasks=store.live(); assert.equal(tasks.length,2);
  assert.equal(tasks.find(t=>t.id==='a').title,'Remote');
  assert.equal(tasks.find(t=>t.conflictOf==='a').title,'A task');
});
test('remote deletion wins original ID but offline edit remains recoverable', () => {
  const {store}=setup(), sent=store.pending()[0][1]; store.receive(row(task(),2,true,true),sent);
  assert.equal(store.live().length,1); assert.equal(store.live()[0].conflictOf,'a');
});
test('stale deletion cannot erase a newer remote edit', () => {
  const {store}=setup(); store.commit([]); const sent=store.pending()[0][1];
  store.receive(row(task('a',{title:'New edit'}),2,false,true),sent);
  assert.equal(store.live()[0].title,'New edit'); assert.equal(store.pending().length,0);
});
test('edits during successful upload remain queued at acknowledged revision', () => {
  const {store}=setup(), sent=store.pending()[0][1]; store.commit([task('a',{title:'Later'})]);
  store.receive(row(sent.task),sent); assert.equal(store.pending()[0][1].version,1); assert.equal(store.live()[0].title,'Later');
});
test('edits during conflicting upload preserve both versions without overwriting remote', () => {
  const {store}=setup(), sent=store.pending()[0][1]; store.commit([task('a',{title:'Later'})]);
  store.receive(row(task('a',{title:'Remote'}),2,false,true),sent);
  assert.equal(store.live().length,2); assert.equal(store.live().find(t=>t.conflictOf).title,'Later');
  assert.equal(store.pending().length,1); assert.notEqual(store.pending()[0][0],'a');
});
test('unrelated edits in stale tab preserve other tab additions', () => {
  const {store,memory}=setup(); const second=new Store(memory); second.load([]);
  store.commit([task(),task('b')]); second.commit([task('a',{title:'Other tab'})]);
  assert.equal(second.live().length,2);
});
test('account switch resets revisions only after explicit bind and retains live tasks', () => {
  const {store}=setup(); store.bind('account-a'); const sent=store.pending()[0][1]; store.receive(row(sent.task,5),sent);
  store.bind('account-b'); assert.equal(store.pending()[0][1].version,0); assert.equal(store.live().length,1);
});
test('stale response never regresses an acknowledged revision', () => {
  const {store}=setup(); const sent=store.pending()[0][1]; store.receive(row(sent.task,3),sent); store.receive(row(task('a',{title:'Old'}),2));
  assert.equal(store.live()[0].title,'A task'); assert.equal(store.state.records.a.version,3);
});
test('same-task edits in two browser tabs retain both versions', () => {
  const {store,memory}=setup(), second=new Store(memory); second.load([]);
  store.commit([task('a',{title:'First tab'})]); second.commit([task('a',{title:'Second tab'})]);
  assert.deepEqual(new Set(second.live().map(t=>t.title)), new Set(['First tab','Second tab']));
});
test('stale browser tab deletion keeps a newer edit', () => {
  const {store,memory}=setup(), second=new Store(memory); second.load([]);
  store.commit([task('a',{title:'Newer edit'})]); second.commit([]);
  assert.equal(second.live()[0].title,'Newer edit');
});
test('JSONB property ordering does not manufacture a conflict', () => {
 const {store}=setup(),sent=store.pending()[0][1];
 const reordered=Object.fromEntries(Object.entries(sent.task).reverse());
 store.receive(row(reordered,2,false,true),sent);
 assert.equal(store.live().length,1);
});
test('duration estimates and working hours survive backup/replace without changing focus preferences',()=>{
 const C=require('../capacity.js'),{parseBackupDocument}=require('../data.js');const {store}=setup();
 const settings={...C.defaults(),timeZone:'Europe/London'};store.updatePlanningSettings(settings);
 store.commit([{...store.live()[0],estimateMinutes:120}]);const doc=parseBackupDocument(JSON.stringify(store.backup()));
 assert.equal(doc.tasks[0].estimateMinutes,120);assert.equal(doc.tasks[0].focusMinutes,45);assert.equal(doc.planningSettings.timeZone,'Europe/London');
 store.restore([],true);store.restore(doc.tasks,true,doc.planningSettings);assert.equal(store.live()[0].estimateMinutes,120);
 assert.throws(()=>parseBackupDocument(JSON.stringify({...store.backup(),planningSettings:{timeZone:'bad'}})));
 assert.throws(()=>parseBackupDocument(JSON.stringify({...store.backup(),tasks:[{...task(),estimateMinutes:-1}]})));
});

test('multi-tag backups round-trip and reject malformed tag arrays atomically',()=>{
 const {store}=setup(),assigned={...store.live()[0],tagIds:['work','tag-marketing'],tagId:'home'};
 store.commit([assigned]);
 const backup=JSON.stringify(store.backup());
 assert.deepEqual(parseBackup(backup)[0].tagIds,['work','tag-marketing']);
 const invalid=[['home','work'],['work','work'],['bad id'],[17]];
 for(const tagIds of invalid)assert.throws(()=>parseBackup(JSON.stringify({...store.backup(),tasks:[{...assigned,tagIds}]})));
 assert.deepEqual(store.live()[0].tagIds,['work','tag-marketing']);
});
