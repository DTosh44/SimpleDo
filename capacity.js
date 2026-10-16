/* Pure capacity calculations. All event intervals are UTC; working hours are wall time in an IANA zone. */
(function (root) {
  'use strict';
  const tags = typeof module !== 'undefined' ? require('./tags.js') : root.SimpleDoTags;
  const MIN = 60000, DAY = 1440 * MIN;
  const formatters = new Map(), windowsCache = new Map();
  const defaults = () => ({timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London', week:Array.from({length:7},(_,i)=>({enabled:i>0&&i<6,start:'09:00',end:'17:00',breakStart:'12:30',breakEnd:'13:30'})),daysOff:[]});
  const minutes = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0,2))*60+Number(value.slice(3)) : NaN;
  const dateValid = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  function validateSettings(settings) {
    if (!settings || typeof settings.timeZone!=='string' || !Array.isArray(settings.week) || settings.week.length!==7 || !Array.isArray(settings.daysOff) || settings.daysOff.length>1000 || !settings.daysOff.every(dateValid)) throw Error('Check your working hours and days off.');
    try { new Intl.DateTimeFormat('en',{timeZone:settings.timeZone}).format(); } catch (_) { throw Error('Enter a valid time zone, such as Europe/London.'); }
    const week=settings.week.map(day=>{
      if(!day || typeof day.enabled!=='boolean' || !Number.isFinite(minutes(day.start)) || !Number.isFinite(minutes(day.end)) || minutes(day.start)>=minutes(day.end)) throw Error('Each working day needs an end time after its start.');
      const hasBreak=Boolean(day.breakStart || day.breakEnd);
      if(hasBreak && (!Number.isFinite(minutes(day.breakStart)) || !Number.isFinite(minutes(day.breakEnd)) || minutes(day.breakStart)>=minutes(day.breakEnd))) throw Error('Enter both break times, with the end after the start, or leave both empty.');
      return {enabled:day.enabled,start:day.start,end:day.end,breakStart:day.breakStart||'',breakEnd:day.breakEnd||''};
    });
    return {timeZone:settings.timeZone,week,daysOff:[...new Set(settings.daysOff)].sort()};
  }
  function merge(intervals) {
    const sorted=intervals.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).map(x=>[...x]).sort((a,b)=>a[0]-b[0]);
    const result=[];
    for(const [a,b] of sorted) {const last=result[result.length-1];if(last&&a<=last[1])last[1]=Math.max(last[1],b);else result.push([a,b]);}
    return result;
  }
  function subtract(windows, busy) {
    let result=windows;
    for(const [a,b] of merge(busy)) result=result.flatMap(([s,e])=> b<=s||a>=e ? [[s,e]] : [[s,Math.min(e,a)],[Math.max(s,b),e]].filter(([x,y])=>y>x));
    return result;
  }
  function offsetAt(epoch,zone) {
    if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
    const p=Object.fromEntries(formatters.get(zone).formatToParts(new Date(epoch)).map(x=>[x.type,x.value]));
    return (Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(epoch/MIN)*MIN)/MIN;
  }
  function dayWindows(date,settings) {
    const key=date+JSON.stringify(settings);
    if(windowsCache.has(key))return windowsCache.get(key);
    if(!dateValid(date))throw Error('Invalid planning date.');
    const base=Date.parse(date+'T00:00:00Z'),day=settings.week[new Date(base).getUTCDay()];
    if(!day.enabled||settings.daysOff.includes(date))return [];
    // Divide UTC into constant-offset segments. This preserves repeated hours
    // and excludes nonexistent hours across DST, including half-hour shifts.
    const segments=[];let start=base-DAY,offset=offsetAt(start,settings.timeZone);
    for(let cursor=start+6*60*MIN;cursor<=base+2*DAY;cursor+=6*60*MIN) {
      const next=offsetAt(cursor,settings.timeZone);
      if(next!==offset) {
        let lo=cursor-6*60*MIN,hi=cursor;
        while(hi-lo>MIN){const mid=Math.floor((lo+hi)/2/MIN)*MIN;if(offsetAt(mid,settings.timeZone)===offset)lo=mid;else hi=mid;}
        segments.push([start,hi,offset]);start=hi;offset=next;
      }
    }
    segments.push([start,base+2*DAY,offset]);
    const map=(a,b)=>merge(segments.map(([s,e,o])=>[Math.max(s,base+(a-o)*MIN),Math.min(e,base+(b-o)*MIN)]));
    let result=map(minutes(day.start),minutes(day.end));
    if(day.breakStart)result=subtract(result,map(minutes(day.breakStart),minutes(day.breakEnd)));
    if(windowsCache.size>800)windowsCache.clear();windowsCache.set(key,result);
    return result;
  }
  function calculate(date,settings,tasks=[],busy=[]) {
    const windows=dayWindows(date,settings);
    const total=windows.reduce((sum,[a,b])=>sum+(b-a)/MIN,0);
    const freeWindows=subtract(windows,busy.map(b=>[Date.parse(b.start),Date.parse(b.end)]));
    const afterMeetings=freeWindows.reduce((sum,[a,b])=>sum+(b-a)/MIN,0);
    const all=tasks.filter(t=>t.date===date);
    const scheduled=all.filter(t=>tags.context(t)==='work');
    const outside=all.filter(t=>tags.context(t)==='outside');
    const estimated=scheduled.reduce((sum,t)=>sum+(Number.isInteger(t.estimateMinutes)&&t.estimateMinutes>0?t.estimateMinutes:0),0);
    return {outside:outside.reduce((sum,t)=>sum+(t.estimateMinutes||0),0),unestimatedOutside:outside.filter(t=>!t.estimateMinutes).length,total,meetings:total-afterMeetings,tasks:estimated,free:Math.max(0,afterMeetings-estimated),over:Math.max(0,estimated-afterMeetings),unestimated:scheduled.filter(t=>!t.estimateMinutes).length};
  }
  function duration(value) {const n=Math.round(value);return n>=60 ? Math.floor(n/60)+'h'+(n%60?' '+n%60+'m':'') : n+'m';}
  function suggest(date,estimate,dates,settings,tasks,busy=[],excludeId=null,context='work') {
    if(context==='outside')return {current:null,date:null,text:'Outside working hours — separate availability is not set up yet.'};
    const others=tasks.filter(t=>t.id!==excludeId);
    const current=calculate(date,settings,others,busy);
    if(!estimate)return {current,date:null,text:current.free===0?'This day is looking quite full. Add an estimate to check this task.':'Time is an estimate; this task has no duration yet.'};
    if(current.free>=estimate)return {current,date:null,text:duration(current.free)+' available before this task.'};
    const next=dates.filter(d=>d>date).find(d=>calculate(d,settings,others,busy).free>=estimate);
    const label=next ? new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(next+'T12:00:00Z')) : '';
    return {current,date:next||null,text:next ? label+' looks better — '+duration(calculate(next,settings,others,busy).free)+' available.' : 'This day is looking quite full. You can still schedule it here.'};
  }
  const api={defaults,validateSettings,merge,subtract,dayWindows,calculate,duration,suggest};
  if(typeof module!=='undefined')module.exports=api;else root.SimpleDoCapacity=api;
})(globalThis);
