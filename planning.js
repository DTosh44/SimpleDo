(function(root){
 'use strict';
 const C=root.SimpleDoCapacity,$=id=>document.getElementById(id);
 class Controller {
  constructor(store,hooks) {
   this.store=store;this.hooks=hooks;this.settings=this.loadSettings();
   this.calendar=new SimpleDoCalendar.Calendar(()=>{this.calendarStatus();this.hooks.changed();});
   this.renderSettings();
   $('workingHoursForm').onsubmit=e=>{e.preventDefault();this.saveSettings();};
   $('refreshCalendar').onclick=()=>this.calendar.refresh(true);
   $('settingsButton').addEventListener('click',()=>this.calendarSettings());
   $('settingsDialog').addEventListener('close',()=>{for(const p of ['outlook','google'])$('choices-'+p).replaceChildren();});
   for(const provider of ['outlook','google']) {
    $('connect-'+provider).onclick=()=>this.perform(()=>this.calendar.connect(provider));
    $('disconnect-'+provider).onclick=()=>this.perform(()=>this.calendar.disconnect(provider));
    $('save-'+provider).onclick=()=>this.perform(()=>this.calendar.select(provider,[...$('choices-'+provider).querySelectorAll('input:checked')].map(i=>i.value)));
   }
   const url=new URL(location.href);if(url.searchParams.has('calendar')) {
    if(url.searchParams.get('calendar')==='failed')$('calendarMessage').textContent='Calendar connection was declined or expired. Try connecting again.';
    url.searchParams.delete('calendar');history.replaceState({},'',url);
   }
  }
  loadSettings() {try{return C.validateSettings(this.store.state.planningSettings||C.defaults());}catch(_){return C.defaults();}}
  reload() {this.settings=this.loadSettings();this.renderSettings();}
  renderSettings() {
   $('planningTimeZone').value=this.settings.timeZone;$('planningDaysOff').value=this.settings.daysOff.join(', ');
   const names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];$('workingDays').replaceChildren();
   for(const i of [1,2,3,4,5,6,0]) {
    const day=this.settings.week[i],row=document.createElement('div');row.className='working-day';row.dataset.day=i;
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=day.enabled;check.dataset.field='enabled';label.append(check,document.createTextNode(names[i].slice(0,3)));row.append(label);
    for(const [field,name] of [['start','Start'],['end','End'],['breakStart','Break start'],['breakEnd','Break end']]) {
     const input=document.createElement('input');input.type='time';input.value=day[field];input.dataset.field=field;input.setAttribute('aria-label',names[i]+' '+name);input.disabled=!day.enabled;row.append(input);
    }
    check.onchange=()=>row.querySelectorAll('input[type=time]').forEach(input=>input.disabled=!check.checked);$('workingDays').append(row);
   }
  }
  saveSettings() {
   try {
    const week=Array(7);for(const row of $('workingDays').children)week[+row.dataset.day]=Object.fromEntries([...row.querySelectorAll('input')].map(i=>[i.dataset.field,i.type==='checkbox'?i.checked:i.value]));
    const settings=C.validateSettings({timeZone:$('planningTimeZone').value.trim(),week,daysOff:$('planningDaysOff').value.split(',').map(x=>x.trim()).filter(Boolean)});
    this.store.updatePlanningSettings(settings);this.settings=settings;$('planningError').textContent='Working hours saved on this device.';this.hooks.changed();
   }catch(error){$('planningError').textContent=error.message;}
  }
  account(client,user) {
   if(this.calendar.owner!==(user?.id||null)) for(const p of ['outlook','google'])$('choices-'+p).replaceChildren();
   this.calendar.account(client,user);
  }
  capacity(date,tasks) {return C.calculate(date,this.settings,this.hooks.tags?.scoped(tasks)||tasks,this.calendar.intervals(date));}
  indicator(date,tasks) {
   const result=this.capacity(date,tasks),el=document.createElement('div');el.className='day-capacity'+(result.over?' capacity-full':'');
   const text=document.createElement('div');text.className='capacity-text';
   text.textContent=(result.total?C.duration(result.meetings)+' meetings · '+C.duration(result.tasks)+' tasks · '+C.duration(result.free)+' free':'Day off'+(result.tasks?' · '+C.duration(result.tasks)+' tasks':''))+(result.over?' · '+C.duration(result.over)+' over':'')+(result.unestimated?' · '+result.unestimated+' unestimated':'')+(result.outside?' · '+C.duration(result.outside)+' other time':'')+(result.unestimatedOutside?' · '+result.unestimatedOutside+' unestimated outside work':'');
   const source=this.calendar.source(date);el.title='Estimated capacity in '+this.settings.timeZone+'; '+source+'. Work-capacity estimates include all matching availability tasks, regardless of the display filter. Completed estimates still count.';
   const bar=document.createElement('div');bar.className='capacity-bar';bar.setAttribute('role','img');bar.setAttribute('aria-label',text.textContent+'; estimate; '+source);
   for(const [name,value] of [['meetings',result.meetings],['tasks',Math.min(result.tasks,Math.max(0,result.total-result.meetings))]]) {const part=document.createElement('span');part.className='capacity-'+name;part.style.width=(result.total?Math.min(value,result.total)/result.total*100:0)+'%';bar.append(part);}
   const note=document.createElement('span');note.className='capacity-source';note.textContent='Estimate · '+source;
   el.append(text,bar,note);return el;
  }
  guidance(date,estimate,tasks,id=null,context=null) {
   if(!date)return {text:'',date:null};
   context=context||this.hooks.tags?.context(tasks.find(t=>t.id===id)||{})||'work';
   if(context==='outside')return C.suggest(date,estimate,[],this.settings,[],[],id,context);
   const start=new Date(date+'T12:00:00Z'),dates=Array.from({length:30},(_,i)=>{const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});
   // Never present an uncached future day as a calendar-confirmed recommendation.
   const hasCalendar=this.calendar.cache?.selected || this.calendar.providers.some(p=>p.connected&&p.selected.length);
   const candidates=hasCalendar?dates.filter(d=>this.calendar.source(d)==='calendar included'):dates;
   const result=C.suggest(date,estimate,candidates,this.settings,this.hooks.tags?.scoped(tasks)||tasks,this.calendar.intervals(date),id,context);
   const source=this.calendar.source(date);
   return {...result,text:result.text+' Estimate'+(source==='manual hours'?' from working hours only.':source==='calendar included'?'.':' — '+source+'.')};
  }
  async perform(action) {try{$('calendarMessage').textContent='Updating…';await action();$('calendarMessage').textContent='';await this.calendarSettings();}catch(error){$('calendarMessage').textContent=error.message;}}
  calendarStatus() {
   if(!this.calendar)return;
   $('calendarMessage').textContent=this.calendar.error||(!navigator.onLine&&this.calendar.cache?'Offline — cached availability may be outdated.':'');
   $('refreshCalendar').disabled=!this.calendar.owner||!navigator.onLine||this.calendar.busy;
   if($('settingsDialog').open)this.calendarSettings(false);
  }
  async calendarSettings(load=true) {
   const calendar=this.calendar,owner=calendar.owner,generation=calendar.generation;
   if(load)await calendar.refresh();
   if(owner!==calendar.owner||generation!==calendar.generation)return;
   $('calendarHint').textContent=!calendar.owner?'Sign in to SimpleDo to connect a calendar. Working hours work without an account.':'Read-only busy times. Choose which calendars count; events never become tasks.';
   for(const provider of ['outlook','google']) {
    const state=calendar.providers.find(p=>p.provider===provider),connected=Boolean(state?.connected);
    $('connect-'+provider).textContent=connected?'Reconnect':'Connect';$('connect-'+provider).disabled=!calendar.owner||!state?.configured||!navigator.onLine;
    $('disconnect-'+provider).hidden=!connected;$('disconnect-'+provider).disabled=!navigator.onLine;$('save-'+provider).disabled=!navigator.onLine;$('save-'+provider).hidden=!connected;$('choices-'+provider).hidden=!connected;
    $('provider-'+provider).textContent=connected?'Connected':state&&!state.configured?'Setup required':'Not connected';
    if(load&&connected&&navigator.onLine)try {
     const data=await calendar.calendars(provider);if(owner!==calendar.owner||generation!==calendar.generation)return;const choices=$('choices-'+provider);choices.replaceChildren();
     for(const c of data.calendars){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=c.id;input.checked=data.selected.includes(c.id);label.append(input,document.createTextNode(c.name));choices.append(label);}
    }catch(error){$('calendarMessage').textContent=error.message;}
   }
  }
 }
 root.SimpleDoPlanning={Controller};
})(globalThis);
