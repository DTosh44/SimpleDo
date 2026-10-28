const {test}=require('node:test');
const assert=require('node:assert/strict');
const completion=require('../completion.js');
const hours=n=>n*3600000;
const task=(completed,completedAt)=>({id:'x',title:'Done',date:null,completed,...(completedAt?{completedAt}:{})});

test('all five completion visibility periods are available and indefinite is backward-compatible',()=>{
  assert.deepEqual(completion.CHOICES.map(item=>item.value),
    ['end-of-day','48-hours','3-days','5-days','indefinitely']);
  assert.equal(completion.normalize('invalid'),completion.DEFAULT);
  const now=new Date(2026,9,28,12,0).getTime();
  const old=task(true,new Date(now-hours(300)).toISOString());
  assert.equal(completion.visibleInInbox(old,completion.DEFAULT,now),true);
  assert.equal(completion.visibleInInbox(old,'indefinitely',now),true);
});

test('timed options use actual hours and hide only completed Inbox cards',()=>{
  const now=new Date(2026,9,28,12,0).getTime();
  const at=ago=>new Date(now-hours(ago)).toISOString();
  for(const [policy,limit] of [['48-hours',48],['3-days',72],['5-days',120]]){
    assert.equal(completion.visibleInInbox(task(true,at(limit-0.01)),policy,now),true,policy+' just before cutoff');
    assert.equal(completion.visibleInInbox(task(true,at(limit)),policy,now),false,policy+' at cutoff');
    assert.equal(completion.visibleInInbox(task(false,at(limit+1000)),policy,now),true,policy+' unfinished stays visible');
  }
  assert.equal(completion.visibleInInbox(task(true), '48-hours',now),true,'legacy completed tasks without timestamps cannot be aged');
  assert.equal(completion.visibleInInbox(task(true,new Date(now+hours(1)).toISOString()),'48-hours',now),true,'future clocks must not hide tasks');
});

test('end-of-day uses the local calendar date, not a 24-hour rolling window',()=>{
  const before=new Date(2026,9,28,23,59,59).getTime();
  const midnight=new Date(2026,9,29,0,0,0).getTime();
  const done=task(true,new Date(before).toISOString());
  assert.equal(completion.visibleInInbox(done,'end-of-day',before),true);
  assert.equal(completion.visibleInInbox(done,'end-of-day',midnight),false);
});

test('Todays wins count actual completions across Inbox and scheduled days, sorted newest first',()=>{
  const now=new Date(2026,9,28,15,0).getTime();
  const recent=new Date(2026,9,28,14,55).toISOString();
  const earlier=new Date(2026,9,28,9,10).toISOString();
  const yesterday=new Date(2026,9,27,20,0).toISOString();
  const records=[
    {id:'today',title:'Scheduled',date:'2026-10-28',completed:true,completedAt:earlier},
    {id:'inbox',title:'Inbox',date:null,completed:true,completedAt:recent},
    {id:'old',date:null,completed:true,completedAt:yesterday},
    {id:'legacy',date:null,completed:true},
    {id:'undone',date:null,completed:false,completedAt:recent}
  ];
  assert.deepEqual(completion.completedToday(records,now).map(t=>t.id),['inbox','today']);
  assert.equal(records.length,5,'counting never mutates task history');
});

test('visibility preference is stored locally, invalid values fall back safely',()=>{
  const items=new Map();
  const storage={getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value)};
  assert.equal(completion.read(storage),'indefinitely');
  completion.save(storage,'3-days');
  assert.equal(completion.read(storage),'3-days');
  assert.equal(completion.read({getItem:()=> 'bogus'}),'indefinitely');
  assert.equal(completion.read({getItem:()=>{throw Error('blocked');}}),'indefinitely');
});

function memory(initial={}) {
  const records=new Map(Object.entries(initial));
  return {getItem:key=>records.has(key)?records.get(key):null,
    setItem:(key,value)=>records.set(key,String(value))};
}
function prefClient(server,owner){
  return {
    from(table){
      assert.equal(table,'simpledo_preferences');
      let queriedOwner=null;
      return {select(fields){assert.equal(fields,'name,value,revision');return this;},
        eq(key,value){assert.equal(key,'user_id');queriedOwner=value;return this;},
        async limit(count){
          assert.equal(count,1);assert.equal(queriedOwner,owner);
          const row=server.get(owner);
          return {data:row?[{...row}]:[],error:null};
        }};
    },
    async rpc(name,args){
      assert.equal(name,'sync_simpledo_preference');
      assert.equal(args.preference_name,'inbox_completed_visibility');
      let row=server.get(owner),conflict=false;
      if(!row){
        if(args.expected_revision!==0)return {data:null,error:Error('Preference history missing')};
        row={name:'inbox_completed_visibility',value:args.preference_value,revision:1};
      }else if(row.value===args.preference_value){} // duplicate request
      else if(row.revision!==args.expected_revision)conflict=true;
      else row={...row,value:args.preference_value,revision:row.revision+1};
      server.set(owner,{...row});
      return {data:{...row,conflict},error:null};
    }
  };
}

test('signed-in preference synchronises across devices, persists after reload and works offline',async()=>{
  const server=new Map(),storageA=memory(),storageB=memory();
  const a=new completion.PreferenceStore(storageA),b=new completion.PreferenceStore(storageB);
  assert.equal(a.value,'indefinitely');assert.equal(b.value,'indefinitely');
  a.bind('account-1');b.bind('account-1');
  const valid=()=>true;let refreshedB=0;
  a.set('48-hours');
  assert.equal(a.pending,true,'offline selection remains in storage');
  await a.sync(prefClient(server,'account-1'),'account-1',valid);
  assert.equal(server.get('account-1').value,'48-hours');assert.equal(a.pending,false);
  await b.sync(prefClient(server,'account-1'),'account-1',valid,()=>refreshedB++);
  assert.equal(b.value,'48-hours');assert.equal(refreshedB,1,'remote update notifies the UI');
  b.set('3-days');
  await b.sync(prefClient(server,'account-1'),'account-1',valid);
  await a.sync(prefClient(server,'account-1'),'account-1',valid);
  assert.equal(a.value,'3-days');assert.equal(b.value,'3-days');
  b.set('end-of-day'); // disconnected before write
  assert.equal(b.pending,true);
  const reloaded=new completion.PreferenceStore(storageB);reloaded.bind('account-1');
  assert.equal(reloaded.value,'end-of-day');assert.equal(reloaded.pending,true);
  await reloaded.sync(prefClient(server,'account-1'),'account-1',valid);
  await a.sync(prefClient(server,'account-1'),'account-1',valid);
  assert.equal(a.value,'end-of-day');
  assert.equal(reloaded.pending,false);
});

test('stale offline preference cannot silently overwrite a newer cloud choice',async()=>{
  const server=new Map(),a=new completion.PreferenceStore(memory()),b=new completion.PreferenceStore(memory());
  a.bind('account-1');b.bind('account-1');a.set('48-hours');
  await a.sync(prefClient(server,'account-1'),'account-1',()=>true);
  await b.sync(prefClient(server,'account-1'),'account-1',()=>true);
  b.set('end-of-day'); // offline device
  a.set('5-days');
  await a.sync(prefClient(server,'account-1'),'account-1',()=>true);
  const messages=[];
  await b.sync(prefClient(server,'account-1'),'account-1',()=>true,null,message=>messages.push(message));
  assert.equal(b.value,'5-days','cloud choice wins a stale edit');
  assert.equal(b.pending,false);
  assert.match(messages[0],/another device/i);
});

test('account switching neither leaks nor overwrites preferences',async()=>{
  const server=new Map(),storage=memory(),device=new completion.PreferenceStore(storage);
  completion.save(storage,'48-hours'); // a pre-existing local preference
  device.bind('owner-one');
  await device.sync(prefClient(server,'owner-one'),'owner-one',()=>true);
  assert.equal(server.get('owner-one').value,'48-hours','one-time guest preference migrates');
  device.unbind();
  device.bind('owner-two');
  assert.equal(device.value,'indefinitely','new account does not inherit another account choice');
  assert.equal(device.pending,false);
  await device.sync(prefClient(server,'owner-two'),'owner-two',()=>true);
  assert.equal(server.has('owner-two'),false,'default choice does not create unrequested account row');
  device.set('5-days');
  await device.sync(prefClient(server,'owner-two'),'owner-two',()=>true);
  assert.equal(server.get('owner-two').value,'5-days');
  device.unbind();device.bind('owner-one');
  assert.equal(device.value,'48-hours','return to the first account restores its own choice');
  await device.sync(prefClient(server,'owner-one'),'owner-one',()=>true);
  assert.equal(server.get('owner-one').value,'48-hours');
});

test('new devices adopt existing account preference before uploading old local preferences',async()=>{
  const server=new Map([['owner',{name:'inbox_completed_visibility',value:'3-days',revision:8}]]);
  const storage=memory();completion.save(storage,'5-days');
  const pref=new completion.PreferenceStore(storage);
  pref.bind('owner');
  assert.equal(pref.value,'5-days','legacy choice can be considered locally');
  await pref.sync(prefClient(server,'owner'),'owner',()=>true);
  assert.equal(pref.value,'3-days','the existing account wins the initial reconciliation');
  assert.equal(pref.pending,false);
  assert.equal(server.get('owner').revision,8,'no rewrite of the cloud preference');
});
