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
