/* Calendar access is independent of task sync. Provider tokens never reach this module. */
(function(root){
 'use strict';
 const KEY='simpledo.availability.v1';
 class Calendar {
  constructor(changed) {
   this.changed=changed;this.client=null;this.owner=null;this.cache=null;this.providers=[];this.error='';this.generation=0;this.busy=false;this.days=30;
   this.readCache();
   window.addEventListener('online',()=>this.refresh(true));
   window.addEventListener('offline',()=>this.changed());
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.refresh();});
   this.interval=setInterval(()=>{if(!document.hidden)this.refresh();},60000);
  }
  readCache() {try{const data=JSON.parse(localStorage.getItem(KEY)||'null');if(data&&typeof data.owner==='string'&&Array.isArray(data.busy)&&data.busy.every(x=>Number.isFinite(Date.parse(x.start))&&Number.isFinite(Date.parse(x.end)))&&Number.isFinite(data.fetchedAt)&&typeof data.selected==='boolean'&&Number.isFinite(Date.parse(data.start))&&Number.isFinite(Date.parse(data.end)))this.cache=data;}catch(_){/* A missing cache never affects tasks. */}}
  async account(client,user) {
   const next=user?.id||null;
   if(next!==this.owner){this.generation++;this.owner=next;this.providers=[];this.error='';if(this.cache?.owner!==next){this.cache=null;try{localStorage.removeItem(KEY);}catch(_){}}}
   this.client=client;this.changed();if(next)await this.refresh(true);
  }
  async request(body) {
   if(!this.client||!this.owner)throw Error('Sign in to SimpleDo to connect a calendar.');
   const {data,error}=await this.client.functions.invoke('calendars',{body});
   if(error){let message='Calendar backend unavailable. Check setup or reconnect in Settings.';try{const detail=await error.context?.json();if(detail?.error)message=detail.error;}catch(_){}throw Error(message);}
   if(data?.error)throw Error(data.error);return data;
  }
  range(days) {if(this.days!==days){this.days=days;this.refresh(true);}}
  intervals(date) {
   const c=this.cache;if(!this.owner||c?.owner!==this.owner)return [];
   return c.busy;
  }
  source(date) {
   if(!this.owner)return 'manual hours';
   const c=this.cache;
   if(c?.owner===this.owner&&c.selected && date>c.start.slice(0,10)&&date<new Date(Date.parse(c.end)-86400000).toISOString().slice(0,10)) {
    const stale=!navigator.onLine||this.error||Date.now()-c.fetchedAt>15*60000;
    return stale?'calendar may be outdated':'calendar included';
   }
   if(this.providers.some(p=>p.connected&&p.selected.length))return 'calendar unavailable';
   return 'manual hours';
  }
  async refresh(force=false) {
   if(!this.owner||!this.client||!navigator.onLine)return;
   if(this.busy){if(force)this.refreshQueued=true;return;}
   if(!force&&this.cache?.owner===this.owner&&Date.now()-this.cache.fetchedAt<15*60000&&this.providers.length)return;
   this.busy=true;const generation=this.generation,owner=this.owner;
   const valid=()=>owner===this.owner&&generation===this.generation;
   try {
    const status=await this.request({action:'status'});if(!valid())return;if(!Array.isArray(status.providers)||!status.providers.every(p=>['outlook','google'].includes(p.provider)&&Array.isArray(p.selected)))throw Error('Calendar backend returned an invalid response.');this.providers=status.providers;
    const selected=this.providers.filter(p=>p.connected&&p.selected.length);
    const start=new Date();start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-1);
    const end=new Date(start);end.setUTCDate(end.getUTCDate()+this.days+3);
    const busy=[];
    for(const provider of selected) for(let from=new Date(start);from<end;) {
     const to=new Date(Math.min(end.getTime(),from.getTime()+60*86400000));
     const data=await this.request({action:'busy',provider:provider.provider,start:from.toISOString(),end:to.toISOString()});if(!valid())return;
     if(!Array.isArray(data.busy)||!data.busy.every(b=>Number.isFinite(Date.parse(b.start))&&Number.isFinite(Date.parse(b.end))&&Date.parse(b.end)>Date.parse(b.start)))throw Error('Calendar availability is incomplete.');
     busy.push(...data.busy);from=to;
    }
    if(!valid())return;
    const merged=SimpleDoCapacity.merge(busy.map(b=>[Date.parse(b.start),Date.parse(b.end)])).map(([s,e])=>({start:new Date(s).toISOString(),end:new Date(e).toISOString()}));
    this.cache={owner,start:start.toISOString(),end:end.toISOString(),fetchedAt:Date.now(),selected:Boolean(selected.length),busy:merged};
    this.error='';try{localStorage.setItem(KEY,JSON.stringify(this.cache));}catch(_){this.error='Availability could not be cached for offline use.';}
   }catch(error){if(valid())this.error=error.message;}finally{this.busy=false;if(valid())this.changed();if(this.refreshQueued){this.refreshQueued=false;this.refresh(true);}}
  }
  async connect(provider) {const data=await this.request({action:'connect',provider});const url=new URL(data.url);if(!['login.microsoftonline.com','accounts.google.com'].includes(url.hostname)||url.protocol!=='https:')throw Error('Invalid calendar authorization URL.');location.assign(url.href);}
  async calendars(provider) {return this.request({action:'calendars',provider});}
  async select(provider,selected) {await this.request({action:'select',provider,selected});this.invalidate();await this.refresh(true);}
  async disconnect(provider) {await this.request({action:'disconnect',provider});this.invalidate();await this.refresh(true);}
  invalidate() {this.generation++;this.cache=null;try{localStorage.removeItem(KEY);}catch(_){}this.changed();}
 }
 root.SimpleDoCalendar={Calendar};
})(globalThis);
