const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T=require('../tags.js');
const {Store, KEY, same} = require('../data.js');
class Memory {constructor(){this.data=new Map();}getItem(k){return this.data.get(k)||null;}setItem(k,v){this.data.set(k,v);}}
const task=(id,title=id)=>({id,title,notes:'',date:null,completed:false,main:false});
function device(server,initial=[],href='https://example.com/SimpleDo/') {
  const store = new Store(new Memory()); store.load(initial);
  const elements = new Map(); const $=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',value:'test@example.com',addEventListener(){},querySelector(){return {};}});return elements.get(id);};
  let user=null; let fail=false;
  const client = {
    auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}};},async signInWithOtp(){return {error:null};},async signOut(){return {error:null};}},
    async rpc(name,args) {
      if(fail) throw Error('Network down');
      const isTag=name==='sync_tag',id=isTag?args.tag_id:args.task_id,payload=isTag?args.tag_payload:args.task_payload,deleted=isTag?payload.deleted:args.is_deleted;
      const key=user+':'+(isTag?'tags:':'')+id; let row=server.get(key); let conflict=false;
      if(!row) row={id,payload,revision:1,deleted,user_id:user,kind:isTag?'tags':'tasks'};
      else if(JSON.stringify(row.payload)===JSON.stringify(payload)&&row.deleted===deleted) {}
      else if(row.revision!==args.expected_revision&&!(isTag&&deleted&&!row.deleted)) conflict=true;
      else row={...row,payload:isTag&&deleted&&row.revision!==args.expected_revision?{...row.payload,deleted:true,updatedAt:payload.updatedAt}:payload,deleted,revision:row.revision+1};
      server.set(key,structuredClone(row)); return {data:{...structuredClone(row),conflict},error:null};
    },
    from(table){let owner,after;return {select(){return this;},eq(k,v){owner=v;return this;},gt(k,v){after=v;return this;},order(){return this;},async limit(n){if(fail)throw Error('Network down');return {data:[...server.values()].filter(r=>r.user_id===owner&&r.id>after&&(r.kind||'tasks')===(table==='simpledo_tags'?'tags':'tasks')).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,n),error:null};}};}
  };
  const sandbox={SimpleDoData:{KEY,same},SIMPLEDO_CONFIG:{supabaseUrl:'https://test.supabase.co',supabasePublicKey:'sb_publishable_test'},
    supabase:{createClient(){return client;}},document:{getElementById:$,addEventListener(){},hidden:false},navigator:{onLine:true},
    window:{addEventListener(){}},setTimeout(){return 0;},clearTimeout(){},setInterval(){},URL,location:{href},history:{replaceState(){}},atob};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../cloud.js'),'utf8'),sandbox);
  const messages=[],tags=new T.Catalog(store); const controller=new sandbox.SimpleDoCloud.Controller(store,{tags,changed(){},notify(m){messages.push(m);}});
  return {store,tags,controller,sandbox,$,messages,signIn(id){user=id;controller.session({user:{id,email:id+'@example.com'}});},fail(v){fail=v;}};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('public HTTP cannot initialize authentication or change local tasks; loopback remains usable',()=>{
 const a=device(new Map(),[task('keep')],'http://simpledo.co.uk/');
 assert.equal(a.controller.client,undefined);
 assert.match(a.$('accountError').textContent,/https:\/\/simpledo.co.uk/);
 assert.equal(a.store.live()[0].id,'keep');
 for(const url of ['http://localhost:8000/','http://127.0.0.1:8000/','http://[::1]:8000/','https://simpledo.co.uk/']){
  assert.ok(device(new Map(),[],url).controller.client,url);
 }
});
test('two devices sync creation, offline edits, completion, preference and deletion',async()=>{
 const server=new Map(),a=device(server,[task('a')]),b=device(server); await settle();
 a.signIn('owner'); b.signIn('owner');
 await a.controller.sync(); assert.equal(server.size,0,'sign-in alone does not upload');
 a.controller.enable(); b.controller.enable(); await a.controller.sync(); await b.controller.sync();
 assert.equal(b.store.live()[0].id,'a');
 b.sandbox.navigator.onLine=false;
 b.store.commit([task('a','Edited offline')]); await b.controller.sync(); assert.equal(a.store.live()[0].title,'a');
 // Simulate offline reload: queue is still in durable storage.
 assert.equal(new Store(b.store.storage).load([])[0].title,'Edited offline');
 b.sandbox.navigator.onLine=true; await b.controller.sync(); await a.controller.sync();
 assert.equal(a.store.live()[0].title,'Edited offline');
 a.store.commit([{...a.store.live()[0],completed:true,focusMinutes:60,estimateMinutes:120,main:true,date:'2030-01-01'}]);
 await a.controller.sync(); await b.controller.sync(); assert.equal(b.store.live()[0].focusMinutes,60);assert.equal(b.store.live()[0].estimateMinutes,120); assert.equal(b.store.live()[0].completed,true);
 a.store.commit([]); await a.controller.sync(); await b.controller.sync(); assert.equal(b.store.live().length,0);
});
test('concurrent edits recover local copy, retry uploads it, and sign-out pauses networking',async()=>{
 const server=new Map(),a=device(server,[task('a')]),b=device(server);await settle();a.signIn('owner');a.controller.enable();await a.controller.sync();b.signIn('owner');b.controller.enable();await b.controller.sync();
 a.store.commit([task('a','Device A')]);b.store.commit([task('a','Device B')]);
 await a.controller.sync();await b.controller.sync();await b.controller.sync();await a.controller.sync();
 assert.equal(a.store.live().length,2);assert.equal(b.store.live().length,2);
 assert.deepEqual(new Set(a.store.live().map(t=>t.title)),new Set(['Device A','Device B']));
 assert.ok(b.messages.some(m=>m.includes('Conflicting')));
 await a.controller.signOut();a.store.commit([...a.store.live(),task('private')]);await a.controller.sync();
 assert.equal([...server.values()].some(r=>r.id==='private'),false);
});
test('network failures retain queue and retry; account changes require consent',async()=>{
 const server=new Map(),a=device(server,[task('a')]);await settle();a.signIn('one');a.controller.enable();a.fail(true);await a.controller.sync();
 assert.equal(a.store.pending().length,1);a.fail(false);await a.controller.sync();assert.equal(a.store.pending().length,0);
 a.signIn('two');await a.controller.sync();assert.equal(server.size,1);assert.equal(a.$('mergeAccount').hidden,false);
 a.controller.enable();await a.controller.sync();assert.equal(server.size,2);assert.equal(a.store.live().length,1);
});

test('two devices sync custom labels and task assignments, including offline rename/delete',async()=>{
 const server=new Map(),a=device(server,[task('a')]),b=device(server);await settle();a.signIn('owner');a.controller.enable();b.signIn('owner');b.controller.enable();
 const tag=a.tags.edit(null,{name:'Garden',color:'orange'});a.store.commit([{...a.store.live()[0],tagId:tag.id,capacityContext:'outside'}]);
 await a.controller.sync();await b.controller.sync();assert.equal(b.tags.resolve(tag.id).name,'Garden');assert.equal(b.store.live()[0].tagId,tag.id);
 b.sandbox.navigator.onLine=false;b.tags.edit(tag.id,{name:'Outside',color:'purple'});b.sandbox.navigator.onLine=true;await b.controller.sync();await a.controller.sync();assert.equal(a.tags.resolve(tag.id).name,'Outside');
 a.tags.remove(tag.id);b.tags.edit(tag.id,{name:'Stale rename',color:'blue'});await a.controller.sync();await b.controller.sync();assert.equal(b.tags.resolve(tag.id),null);assert.equal(b.store.live().length,1);
});
test('missing tag migration does not block task synchronization',async()=>{
 const server=new Map(),a=device(server,[task('a')]);await settle();a.signIn('owner');a.controller.enable();
 a.tags.edit(null,{name:'Garden',color:'orange'});const rpc=a.controller.client.rpc.bind(a.controller.client);
 a.controller.client.rpc=async(name,args)=>name==='sync_tag'?{error:Error('Function missing')}:rpc(name,args);
 await a.controller.sync();assert.equal(server.get('owner:a').payload.title,'a');assert.equal(a.tags.pending().length,1);assert.equal(a.$('syncStatus').textContent,'Tags need attention');
});
