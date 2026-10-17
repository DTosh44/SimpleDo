const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../snapshot.js'),T=require('../tags.js');
const custom={id:'tag-garden',name:'Garden',color:'purple',createdAt:'2026-01-01T00:00:00Z'};
const catalog={resolve:id=>[...T.DEFAULTS,custom].find(t=>t.id===id)||(id==='tag-removed'?null:{id,unavailable:true})};
test('Snapshot uses Monday weeks and inclusive calendar month/year bounds',()=>{
 assert.deepEqual(S.period('week','2026-10-18'),{start:'2026-10-12',end:'2026-10-18'});
 assert.deepEqual(S.period('week','2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
 assert.deepEqual(S.period('month','2028-02-29'),{start:'2028-02-01',end:'2028-02-29'});
 assert.deepEqual(S.period('year','2026-10-16'),{start:'2026-01-01',end:'2026-12-31'});
 assert.deepEqual(S.period('today','2026-10-16'),{start:'2026-10-16',end:'2026-10-16'});
});
test('Inbox and undated completed tasks appear in every range; dated tasks follow schedules',()=>{
 const tasks=[{id:'i',title:'Inbox',createdAt:'2020-01-01T00:00:00Z'},{id:'r',rolled:true},{id:'u',completed:true},{id:'s',date:'2026-10-16'},{id:'c',date:'2026-10-16',completed:true},{id:'future',date:'2026-10-17'},{id:'old',date:'2025-10-16',completed:true}];
 const result=S.summarize(tasks,'today','2026-10-16',catalog);
 assert.deepEqual(result.counts,{inbox:2,scheduled:1,completed:2,returned:1});assert.equal(result.total,5);assert.equal(result.undated,3);
 const week=S.summarize(tasks,'week','2026-10-16',catalog);assert.equal(week.counts.scheduled,2);assert.equal(week.counts.inbox,2);
 assert.equal(Object.values(result.counts).slice(0,3).reduce((a,b)=>a+b),result.total,'returned is a subset, not a fourth status');
});
test('returned count includes only currently unfinished returned Inbox tasks',()=>{
 const result=S.summarize([{rolled:true},{rolled:true,completed:true},{date:'2026-10-16',rolled:true},{date:'2026-10-15'}],'today','2026-10-16',catalog);
 assert.equal(result.counts.returned,1);assert.equal(result.counts.inbox,1);assert.equal(result.counts.scheduled,1);
});
test('tag breakdown includes Work, Home, custom, removed, missing and untagged safely',()=>{
 const result=S.summarize([{tagId:'work'},{tagId:'home'},{tagId:custom.id},{tagId:'tag-removed'},{tagId:'tag-not-synced'},{}],'today','2026-10-16',catalog);
 const counts=Object.fromEntries(result.tags.map(t=>[t.name,t.count]));
 assert.deepEqual(counts,{Work:1,Home:1,'No tag':2,Garden:1,'Tag unavailable':1});assert.equal(result.tags.reduce((a,t)=>a+t.count,0),result.total);
});
test('density aggregates only dated tasks, including completed, into days, weeks and months',()=>{
 const tasks=[{date:'2026-10-01'},{date:'2026-10-07',completed:true},{date:'2026-10-08'},{date:'2026-10-31'},{date:'2026-11-01'},{}];
 const month=S.summarize(tasks,'month','2026-10-16',catalog);assert.deepEqual(month.bins.map(b=>b.count),[2,1,0,0,1]);assert.equal(month.bins[4].end,'2026-10-31');
 const year=S.summarize(tasks,'year','2026-10-16',catalog);assert.equal(year.bins.length,12);assert.equal(year.bins[9].count,4);assert.equal(year.bins[10].count,1);
 const week=S.summarize(tasks,'week','2026-10-08',catalog);assert.equal(week.bins.length,7);assert.equal(week.bins.reduce((a,b)=>a+b.count,0),2);
});
test('missing dates and empty data produce honest zero/undated states',()=>{
 const result=S.summarize([{id:'a',date:null},{id:'b',date:'invalid'}],'today','2026-10-16');assert.equal(result.undated,2);assert.equal(result.counts.inbox,2);
 const empty=S.summarize([],'year','2026-10-16',catalog);assert.equal(empty.total,0);assert.ok(empty.bins.every(b=>b.count===0));assert.ok(empty.tags.every(t=>t.count===0));
});
test('Snapshot is read-only and ignores timestamps rather than inventing completion history',()=>{
 const tasks=[{id:'a',date:'2026-10-16',completed:true,updatedAt:'2025-01-01T00:00:00Z',notes:'keep this'},{id:'b',date:null,rolled:true}];
 const before=JSON.stringify(tasks);for(const range of ['today','week','month','year'])assert.equal(S.summarize(tasks,range,'2026-10-16',catalog).counts.completed,1);
 assert.equal(JSON.stringify(tasks),before);
});
test('calendar date boundaries remain stable around DST and leap-day transitions',()=>{
 const result=S.summarize([{date:'2026-03-29'},{date:'2026-03-30'}],'week','2026-03-29',catalog);assert.equal(result.dated,1);assert.equal(result.end,'2026-03-29');
 const leap=S.summarize([{date:'2028-02-29'}],'month','2028-02-15',catalog);assert.equal(leap.bins.at(-1).label,'29');assert.equal(leap.bins.at(-1).count,1);
});

test('custom Snapshot uses exact inclusive From and To dates, across years',()=>{
 const dates={start:'2026-04-25',end:'2027-09-18'};
 assert.deepEqual(S.period('custom','2026-10-17',dates),dates);
 assert.deepEqual(S.period('custom','2026-10-17',{start:'2026-02-28',end:'2026-02-28'}),{start:'2026-02-28',end:'2026-02-28'});
 for(const invalid of [
  {start:'2027-09-18',end:'2026-04-25'},
  {start:'2026-02-30',end:'2027-09-18'},
  {start:'',end:'2027-09-18'},
  {start:'2026-04-25',end:''}
 ]) assert.throws(()=>S.period('custom','2026-10-17',invalid),/From|valid/);
 assert.throws(()=>S.period('custom','2026-10-17'),/valid/);
});

test('custom Snapshot includes boundary dates, excludes outside dates and keeps undated tasks',()=>{
 const dates={start:'2026-04-25',end:'2027-09-18'};
 const tasks=[
  {id:'before',date:'2026-04-24'},
  {id:'first',date:'2026-04-25'},
  {id:'middle',date:'2027-01-01',tagId:'work'},
  {id:'last',date:'2027-09-18',completed:true},
  {id:'after',date:'2027-09-19'},
  {id:'inbox',date:null,rolled:true},
  {id:'undated-completed',completed:true}
 ];
 const before=JSON.stringify(tasks);
 const view=S.summarize(tasks,'custom','2026-10-17',catalog,dates);
 assert.deepEqual({start:view.start,end:view.end},dates);
 assert.equal(view.total,5);
 assert.deepEqual(view.counts,{inbox:1,scheduled:2,completed:2,returned:1});
 assert.equal(view.dated,3);
 assert.equal(view.bins.length,18,'April 2026 to September 2027 is 18 monthly bins');
 assert.equal(view.unit,'month');
 assert.deepEqual({start:view.bins[0].start,end:view.bins[0].end},{start:'2026-04-25',end:'2026-04-30'});
 assert.deepEqual({start:view.bins.at(-1).start,end:view.bins.at(-1).end},{start:'2027-09-01',end:'2027-09-18'});
 assert.equal(view.bins.reduce((n,b)=>n+b.count,0),view.dated);
 assert.equal(JSON.stringify(tasks),before,'reading a custom range must not write to tasks');
});

test('custom Snapshot selects daily, weekly, monthly and annual density based on interval',()=>{
 const anchor='2026-10-17';
 const daily=S.summarize([{date:'2026-03-29'},{date:'2026-04-01'}],'custom',anchor,catalog,{start:'2026-03-28',end:'2026-04-02'});
 assert.equal(daily.unit,'day');assert.equal(daily.bins.length,6);assert.equal(daily.bins.reduce((n,b)=>n+b.count,0),2);
 const week=S.summarize([{date:'2026-03-29'},{date:'2026-04-01'}],'custom',anchor,catalog,{start:'2026-03-28',end:'2026-05-15'});
 assert.equal(week.unit,'week');assert.equal(week.bins[0].end,'2026-03-29');
 assert.equal(week.bins.at(-1).end,'2026-05-15');
 assert.equal(week.bins.reduce((n,b)=>n+b.count,0),2);
 const month=S.summarize([{date:'2028-02-29'},{date:'2028-03-01'}],'custom',anchor,catalog,{start:'2027-12-31',end:'2028-04-01'});
 assert.equal(month.unit,'week','short periods use weeks even across a leap year');
 assert.equal(month.bins.reduce((n,b)=>n+b.count,0),2);
 const annual=S.summarize([{date:'2020-01-01'},{date:'2029-09-18'},{date:'2029-09-19'}],'custom',anchor,catalog,{start:'2020-01-01',end:'2029-09-18'});
 assert.equal(annual.unit,'year');assert.equal(annual.bins.length,10);
 assert.equal(annual.bins.reduce((n,b)=>n+b.count,0),2);
 const long=S.summarize([{date:'1980-06-01'},{date:'2020-01-01'}],'custom',anchor,catalog,{start:'1900-01-01',end:'2099-12-31'});
 assert.equal(long.unit,'year group');assert.ok(long.bins.length<=36);
 assert.equal(long.bins.reduce((n,b)=>n+b.count,0),2);
 const single=S.summarize([{date:'2027-09-18'}],'custom',anchor,catalog,{start:'2027-09-18',end:'2027-09-18'});
 assert.equal(single.bins.length,0);assert.equal(single.counts.scheduled,1);
});
