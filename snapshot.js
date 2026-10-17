/* Read-only projections of current tasks. Dates describe schedules, not activity history. */
(function(root){
 'use strict';
 const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const key=date=>date.toISOString().slice(0,10);
 const shift=(value,days)=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return key(d);};
 function period(range,today,custom=null) {
  if(!dateValid(today))throw Error('Invalid Snapshot date.');
  if(range==='custom') {
   if(!custom||!dateValid(custom.start)||!dateValid(custom.end))throw Error('Choose valid From and To dates.');
   if(custom.start>custom.end)throw Error('From must be on or before To.');
   return {start:custom.start,end:custom.end};
  }
  const d=new Date(today+'T12:00:00Z'),year=d.getUTCFullYear(),month=d.getUTCMonth();
  if(range==='week'){const start=shift(today,-((d.getUTCDay()+6)%7));return {start,end:shift(start,6)};}
  if(range==='month')return {start:key(new Date(Date.UTC(year,month,1))),end:key(new Date(Date.UTC(year,month+1,0)))};
  if(range==='year')return {start:year+'-01-01',end:year+'-12-31'};
  return {start:today,end:today};
 }
 // Aggregate custom ranges using a scale that fits the dates, even across years.
 // Buckets include both ends and never contain tasks outside the selected period.
 function customDensity(bounds) {
  const bins=[],first=bounds.start,last=bounds.end;
  const days=Math.round((Date.parse(last+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/86400000)+1;
  const dayLabel=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  if(days===1)return {bins,unit:'day'};
  if(days<=14) {
   for(let d=first;d<=last;d=shift(d,1))bins.push({start:d,end:d,label:dayLabel(d),count:0});
   return {bins,unit:'day'};
  }
  if(days<=120) {
   for(let d=first;d<=last;) {
    const toSunday=(7-new Date(d+'T12:00:00Z').getUTCDay())%7;
    const stop=[shift(d,toSunday),last].sort()[0];
    bins.push({start:d,end:stop,label:dayLabel(d),count:0});
    d=shift(stop,1);
   }
   return {bins,unit:'week'};
  }
  if(days<=1098) {
   for(let d=first;d<=last;) {
    const [year,month]=d.slice(0,7).split('-').map(Number);
    const stop=[key(new Date(Date.UTC(year,month,0))),last].sort()[0];
    const label=new Intl.DateTimeFormat('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
    bins.push({start:d,end:stop,label,count:0});
    d=shift(stop,1);
   }
   return {bins,unit:'month'};
  }
  const firstYear=+first.slice(0,4),lastYear=+last.slice(0,4);
  const step=Math.max(1,Math.ceil((lastYear-firstYear+1)/36));
  const isoYear=year=>String(year).padStart(4,'0');
  for(let year=firstYear;year<=lastYear;year+=step) {
   const endYear=Math.min(year+step-1,lastYear);
   bins.push({
    start:year===firstYear?first:isoYear(year)+'-01-01',
    end:endYear===lastYear?last:isoYear(endYear)+'-12-31',
    label:year===endYear?String(year):year+'–'+endYear,count:0
   });
  }
  return {bins,unit:step===1?'year':'year group'};
 }
 function summarize(tasks,range,today,catalog={resolve:()=>null},custom=null) {
  const bounds=period(range,today,custom),inRange=date=>date>=bounds.start&&date<=bounds.end;
  const cohort=tasks.filter(t=>t&&typeof t==='object'&&(!dateValid(t.date)||inRange(t.date)));
  const counts={inbox:0,scheduled:0,completed:0,returned:0};
  const groups=new Map([['work',{id:'work',name:'Work',color:'blue',count:0}],['home',{id:'home',name:'Home',color:'orange',count:0}],['untagged',{id:'untagged',name:'No tag',color:'grey',count:0}]]);
  for(const task of cohort) {
   const dated=dateValid(task.date);
   if(task.completed)counts.completed++;
   else if(dated)counts.scheduled++;
   else {counts.inbox++;if(task.rolled)counts.returned++;}
   let tag=task.tagId?catalog.resolve(task.tagId):null;
   if(tag?.unavailable)tag={id:'unavailable',name:'Tag unavailable',color:'grey'};
   const id=tag?.id||'untagged';
   if(!groups.has(id))groups.set(id,{id,name:tag.name,color:tag.color,count:0});
   groups.get(id).count++;
  }
  let bins=[],unit=range==='year'?'month':range==='month'?'week':'day';
  if(range==='custom')({bins,unit}=customDensity(bounds));
  else if(range==='year')for(let i=0;i<12;i++) {
   const start=bounds.start.slice(0,4)+'-'+String(i+1).padStart(2,'0')+'-01';
   bins.push({start,end:key(new Date(Date.UTC(+start.slice(0,4),i+1,0))),label:new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z')),count:0});
  } else if(range!=='today'&&range!=='custom')for(let start=bounds.start;start<=bounds.end;start=shift(start,range==='week'?1:7)) {
   const end=range==='week'?start:[shift(start,6),bounds.end].sort()[0];
   const label=range==='week'?new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z')):Number(start.slice(-2))+(start===end?'':'–'+Number(end.slice(-2)));
   bins.push({start,end,label,count:0});
  }
  const dated=cohort.filter(t=>dateValid(t.date));
  for(const task of dated){const bin=bins.find(b=>task.date>=b.start&&task.date<=b.end);if(bin)bin.count++;}
  return {...bounds,total:cohort.length,counts,tags:[...groups.values()],bins,unit,dated:dated.length,undated:cohort.length-dated.length,samples:cohort.filter(t=>t.demo).length};
 }
 class Controller {
  constructor(hooks) {
   this.hooks=hooks;this.range='today';
   document.getElementById('snapshotRanges').addEventListener('click',event=>{
    const button=event.target.closest('button[data-snapshot-range]');if(!button)return;
    this.range=button.dataset.snapshotRange;this.render();
   });
  }
  render() {
   const $=id=>document.getElementById(id),model=summarize(this.hooks.tasks(),this.range,this.hooks.today(),this.hooks.catalog());
   const format=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
   $('snapshotPeriod').textContent=format(model.start)+(model.start===model.end?'':' – '+format(model.end));
   document.querySelectorAll('[data-snapshot-range]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.snapshotRange===this.range)));
   for(const [name,value] of Object.entries(model.counts))$('snapshot-'+name).textContent=value;
   $('snapshotEmpty').hidden=model.total!==0;
   $('snapshotScope').textContent=model.total+' '+(model.total===1?'task':'tasks')+' · Inbox and undated tasks included'+(model.samples?' · includes samples':'');
   $('snapshotStatusBar').replaceChildren();
   for(const [name,count] of [['inbox',model.counts.inbox],['scheduled',model.counts.scheduled],['completed',model.counts.completed]]) {
    const part=document.createElement('span');part.className='snapshot-status-'+name;part.style.width=(model.total?100*count/model.total:0)+'%';$('snapshotStatusBar').append(part);
   }
   $('snapshotTagBar').replaceChildren();$('snapshotTags').replaceChildren();
   for(const tag of model.tags) {
    const color=this.hooks.palette()[tag.color]||'#747474';
    if(tag.count){const segment=document.createElement('span');segment.style.width=100*tag.count/model.total+'%';segment.style.backgroundColor=color;$('snapshotTagBar').append(segment);}
    const item=document.createElement('li'),label=document.createElement('span'),dot=document.createElement('span'),count=document.createElement('strong');
    label.className='task-tag';dot.className='tag-dot';dot.style.backgroundColor=color;dot.setAttribute('aria-hidden','true');label.append(dot,document.createTextNode(tag.name));count.textContent=tag.count;
    item.append(label,count);$('snapshotTags').append(item);
   }
   $('snapshotBins').dataset.range=this.range;
   $('snapshotDensity').hidden=this.range==='today';$('snapshotBins').replaceChildren();
   $('snapshotDensityLabel').textContent=this.range==='year'?'By month':this.range==='month'?'By week of the month':'By day';
   $('snapshotDensityNote').textContent=model.dated+' dated '+(model.dated===1?'task':'tasks')+'; '+model.undated+' undated not plotted. Counts include completed tasks, not estimated hours.';
   const max=Math.max(1,...model.bins.map(b=>b.count));
   for(const bin of model.bins) {
    const item=document.createElement('li'),number=document.createElement('strong'),track=document.createElement('span'),fill=document.createElement('span'),label=document.createElement('span');
    item.setAttribute('aria-label',format(bin.start)+(bin.start===bin.end?'':' to '+format(bin.end))+': '+bin.count+' tasks');
    number.textContent=bin.count;track.className='snapshot-density-track';track.setAttribute('aria-hidden','true');fill.style.height=(100*bin.count/max)+'%';track.append(fill);label.textContent=bin.label;item.append(number,track,label);$('snapshotBins').append(item);
   }
  }
 }
 const api={period,summarize,Controller};
 if(typeof module!=='undefined')module.exports=api;else root.SimpleDoSnapshot=api;
})(globalThis);
