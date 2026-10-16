const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../capacity.js');
const settings=()=>({...C.defaults(),timeZone:'Europe/London'});
const task=(minutes,date='2026-10-20')=>({id:'t',date,estimateMinutes:minutes});
const busy=(start,end)=>({start:'2026-10-20T'+start+':00Z',end:'2026-10-20T'+end+':00Z'});
test('working hours exclude lunch; weekend and days off have no room',()=>{
 let s=settings();assert.equal(C.calculate('2026-10-20',s).total,420);assert.equal(C.calculate('2026-10-18',s).total,0);
 s.daysOff=['2026-10-20'];assert.equal(C.calculate('2026-10-20',s).total,0);
});
test('overlaps across calendars and lunch/outside working hours count once',()=>{
 const r=C.calculate('2026-10-20',settings(),[],[busy('07:00','09:30'),busy('08:00','10:00'),busy('11:00','13:00'),busy('15:00','18:00')]);
 // BST: working UTC08-16, lunch11:30-12:30. Union occupied:08-10,11-11:30,12:30-13,15-16 = 4h.
 assert.equal(r.meetings,240);assert.equal(r.free,180);
});
test('all-day busy event removes working capacity but never creates a task',()=>{
 const r=C.calculate('2026-10-20',settings(),[],[{start:'2026-10-19T23:00:00Z',end:'2026-10-20T23:00:00Z'}]);
 assert.equal(r.meetings,420);assert.equal(r.free,0);assert.equal(r.tasks,0);
});
test('unestimated and completed work remain distinct from estimated free time',()=>{
 const r=C.calculate('2026-10-20',settings(),[task(120),{id:'u',date:'2026-10-20'}, {...task(60),completed:true}]);
 assert.equal(r.tasks,180);assert.equal(r.free,240);assert.equal(r.unestimated,1);
});
test('over-capacity remains explicit; users can still schedule work on days off',()=>{
 const r=C.calculate('2026-10-20',settings(),[task(480)]);assert.equal(r.free,0);assert.equal(r.over,60);
 const off=C.calculate('2026-10-18',settings(),[task(120,'2026-10-18')]);assert.equal(off.over,120);
});
test('DST spring removes nonexistent hours and autumn counts repeated hours',()=>{
 const s=settings();s.week[0]={enabled:true,start:'01:00',end:'04:00',breakStart:'',breakEnd:''};
 assert.equal(C.calculate('2026-03-29',s).total,120);assert.equal(C.calculate('2026-10-25',s).total,240);
});
test('half-hour DST changes and overnight UTC boundaries work',()=>{
 const s=settings();s.timeZone='Australia/Lord_Howe';s.week[0]={enabled:true,start:'01:00',end:'04:00',breakStart:'',breakEnd:''};
 assert.equal(C.calculate('2026-10-04',s).total,150);assert.equal(C.calculate('2026-04-05',s).total,210);
 s.timeZone='Pacific/Auckland';assert.equal(C.calculate('2026-10-20',s).total,420);
});
test('suggestions select first later day with enough capacity and exclude the moved task',()=>{
 const s=settings(),tasks=[{id:'busy',date:'2026-10-20',estimateMinutes:390},task(120)];
 const r=C.suggest('2026-10-20',120,['2026-10-20','2026-10-21','2026-10-22'],s,tasks,[],'t');
 assert.equal(r.current.free,30);assert.equal(r.date,'2026-10-21');assert.match(r.text,/Wednesday/);assert.equal(tasks[1].date,'2026-10-20');
});
test('working settings reject invalid zones, dates, hours and half a break',()=>{
 for(const patch of [{timeZone:'Mars/Nowhere'},{daysOff:['2026-02-31']},{week:[]}])assert.throws(()=>C.validateSettings({...settings(),...patch}));
 const s=settings();s.week[1].breakStart='';assert.throws(()=>C.validateSettings(s));
});
