/* Read-only projections of current tasks. Dates describe schedules, not activity history. */
(function(root){
 'use strict';
 const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const key=date=>date.toISOString().slice(0,10);
 const shift=(value,days)=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return key(d);};
 function period(range,today) {
  if(!dateValid(today))throw Error('Invalid Snapshot date.');
  const d=new Date(today+'T12:00:00Z'),year=d.getUTCFullYear(),month=d.getUTCMonth();
  if(range==='week'){const start=shift(today,-((d.getUTCDay()+6)%7));return {start,end:shift(start,6)};}
  if(range==='month')return {start:key(new Date(Date.UTC(year,month,1))),end:key(new Date(Date.UTC(year,month+1,0)))};
  if(range==='year')return {start:year+'-01-01',end:year+'-12-31'};
  return {start:today,end:today};
 }
 function summarize(tasks,range,today,catalog={resolve:()=>null}) {
  const bounds=period(range,today),inRange=date=>date>=bounds.start&&date<=bounds.end;
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
  const bins=[];
  if(range==='year')for(let i=0;i<12;i++) {
   const start=bounds.start.slice(0,4)+'-'+String(i+1).padStart(2,'0')+'-01';
   bins.push({start,end:key(new Date(Date.UTC(+start.slice(0,4),i+1,0))),label:new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z')),count:0});
  } else if(range!=='today')for(let start=bounds.start;start<=bounds.end;start=shift(start,range==='week'?1:7)) {
   const end=range==='week'?start:[shift(start,6),bounds.end].sort()[0];
   const label=range==='week'?new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z')):Number(start.slice(-2))+(start===end?'':'–'+Number(end.slice(-2)));
   bins.push({start,end,label,count:0});
  }
  const dated=cohort.filter(t=>dateValid(t.date));
  for(const task of dated){const bin=bins.find(b=>task.date>=b.start&&task.date<=b.end);if(bin)bin.count++;}
  return {...bounds,total:cohort.length,counts,tags:[...groups.values()],bins,dated:dated.length,undated:cohort.length-dated.length,samples:cohort.filter(t=>t.demo).length};
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
