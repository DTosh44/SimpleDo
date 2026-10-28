const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../data.js');
class Memory{constructor(){this.data=new Map();}getItem(k){return this.data.get(k)||null;}setItem(k,v){this.data.set(k,v);}}
function setup(initial=[],owner=null){
 const memory=new Memory(),sessionStorage=new Memory(),store=new D.Store(memory);store.load(initial);if(owner)store.bind(owner);
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',addEventListener(){},querySelector(){return {};}});return elements.get(id);};
 const calls=[],user={id:'existing-user',email:'test@example.com'},auth={onAuthStateChange(fn){this.event=fn;},async getSession(){return {data:{session:null}};}};
 for(const name of ['signUp','signInWithPassword','signInWithOtp','resetPasswordForEmail','updateUser'])auth[name]=async args=>{calls.push({name,args});return {data:{session:{user},user},error:null};};
 const sandbox={SimpleDoData:D,SIMPLEDO_CONFIG:{supabaseUrl:'https://test.supabase.co',supabasePublicKey:'sb_publishable_test'},supabase:{createClient(){return {auth};}},document:{getElementById:$,addEventListener(){}},navigator:{onLine:true},window:{addEventListener(){}},localStorage:memory,sessionStorage,setTimeout(){},clearTimeout(){},setInterval(){},URL,location:{href:'https://simpledo.co.uk/?capture=type#inbox'},history:{replaceState(){}},atob};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../cloud.js'),'utf8'),sandbox);
 const controller=new sandbox.SimpleDoCloud.Controller(store,{changed(){},notify(){}});
 const view={dialog:{open:false},mode:'signin',open(mode){this.mode=mode;this.dialog.open=true;},close(){this.dialog.open=false;},message(text){this.text=text;}};controller.view=view;
 return {store,memory,sessionStorage,controller,view,calls,user,$,auth};
}
const task={id:'local',title:'Keep local work',notes:'Private notes'};
test('empty device binds automatically; local tasks, tags, tombstones and another owner require consent',()=>{
 const a=setup();a.controller.session({user:a.user});assert.equal(a.store.state.owner,a.user.id);assert.equal(a.controller.allowed,true);
 for(const kind of ['task','tag','tombstone','other-owner']){
  const b=setup(kind==='task'||kind==='tombstone'?[task]:[],kind==='other-owner'?'previous-user':null);
  if(kind==='tag'){new (require('../tags.js').Catalog)(b.store).edit(null,{name:'Local tag',color:'blue'});}
  if(kind==='tombstone')b.store.commit([]);
  const before=b.memory.getItem(D.KEY);
  b.controller.session({user:b.user});assert.equal(b.controller.allowed,false,kind);assert.equal(b.view.mode,'merge');assert.equal(b.memory.getItem(D.KEY),before);
 }
});
test('password login and signup use official API with exact safe redirect and no password persistence',async()=>{
 const a=setup();await a.controller.authenticate('signin','test@example.com','unique-password');assert.equal(a.calls[0].name,'signInWithPassword');assert.equal(a.controller.allowed,true);
 const b=setup();await b.controller.authenticate('signup','new@example.com','unique-password');
 assert.equal(b.calls[0].name,'signUp');assert.equal(b.calls[0].args.options.emailRedirectTo,'https://simpledo.co.uk/');assert.match(b.view.text,/confirm/);
 assert.equal(b.store.state.owner,null,'registration does not bypass confirmation or bind a session');
 for(const device of [a,b]){assert.ok(!JSON.stringify([...device.memory.data]).includes('unique-password'));assert.ok(!JSON.stringify(device.store.backup()).includes('unique-password'));}
});
test('password recovery survives initial-session events and reload; update preserves user ID and task history',async()=>{
 const a=setup([task]);await Promise.resolve();a.controller.session({user:a.user},'PASSWORD_RECOVERY');assert.equal(a.view.mode,'password');
 a.controller.session({user:a.user},'INITIAL_SESSION');assert.equal(a.view.mode,'password');assert.equal(a.view.dialog.open,true);
 await a.controller.authenticate('password','','new-unique-password');assert.equal(a.calls[0].name,'updateUser');assert.equal(a.controller.user.id,a.user.id);assert.equal(a.store.live()[0].title,task.title);assert.equal(a.store.state.owner,null,'password setup does not silently merge local tasks');
 assert.equal(a.sessionStorage.getItem('simpledo.passwordRecovery.v1')||'','');assert.ok(!JSON.stringify([...a.memory.data]).includes('new-unique-password'));
});
test('forgot password is neutral and magic links cannot create replacement accounts',async()=>{
 const a=setup();await a.controller.authenticate('forgot','unknown@example.com','');assert.equal(a.calls[0].name,'resetPasswordForEmail');assert.equal(a.calls[0].args,'unknown@example.com');assert.match(a.view.text,/If this email/);
 await a.controller.authenticate('magic','test@example.com','');assert.equal(a.calls[1].args.options.shouldCreateUser,false);assert.equal(a.calls[1].args.options.emailRedirectTo,'https://simpledo.co.uk/');
 await assert.rejects(a.controller.authenticate('password','','new-unique-password'),/sign in/);
 await assert.rejects(a.controller.authenticate('signup','test@example.com','short'),/12 characters/);
});
test('existing owner resumes without consent; choosing local preserves tasks and does not bind',()=>{
 const a=setup([task],'existing-user');a.controller.session({user:a.user});assert.equal(a.controller.allowed,true);assert.equal(a.view.dialog.open,false);
 const b=setup([task]);b.controller.session({user:b.user});b.controller.local();assert.equal(b.store.state.owner,null);assert.equal(b.controller.allowed,false);assert.equal(b.store.live()[0].title,task.title);assert.equal(b.memory.getItem('simpledo.localMode.v1'),'true');
});
test('recovery remains usable when per-tab persistence is unavailable',async()=>{
 const a=setup();await Promise.resolve();a.sessionStorage.setItem=()=>{throw Error('Storage blocked');};a.sessionStorage.getItem=()=>{throw Error('Storage blocked');};
 a.controller.session({user:a.user},'PASSWORD_RECOVERY');assert.equal(a.view.mode,'password');
 a.controller.session({user:a.user},'TOKEN_REFRESHED');assert.equal(a.view.mode,'password');assert.equal(a.view.dialog.open,true);
 await a.controller.authenticate('password','','unique-recovery-password');assert.equal(a.controller.recovering,false);
});
