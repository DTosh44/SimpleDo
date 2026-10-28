/* A non-destructive presentation preference. Task completion timestamps sync as task data. */
(function(root){
  'use strict';
  const KEY='simpledo.inboxCompletedVisibility.v1';
  const DEFAULT='indefinitely'; // Preserve the existing Inbox experience until changed.
  const CHOICES=Object.freeze([
    {value:'end-of-day',label:'End of the day'},
    {value:'48-hours',label:'48 hours'},
    {value:'3-days',label:'3 days'},
    {value:'5-days',label:'5 days'},
    {value:'indefinitely',label:'Indefinitely'}
  ]);
  const DURATIONS={'48-hours':48,'3-days':72,'5-days':120};
  const normalize=value=>CHOICES.some(choice=>choice.value===value)?value:DEFAULT;
  const dateOf=value=>{
    if(typeof value!=='string'||!value)return null;
    const n=Date.parse(value);
    return Number.isFinite(n)?n:null;
  };
  const sameLocalDay=(a,b)=>{
    const first=new Date(a),second=new Date(b);
    return first.getFullYear()===second.getFullYear() &&
      first.getMonth()===second.getMonth() && first.getDate()===second.getDate();
  };
  function visibleInInbox(task,choice,now=Date.now()){
    if(!task.completed)return true;
    const policy=normalize(choice);
    if(policy==='indefinitely')return true;
    const completed=dateOf(task.completedAt);
    // Old completed tasks have no trustworthy completion time. Do not invent one.
    if(completed===null || completed>now)return true;
    if(policy==='end-of-day')return sameLocalDay(completed,now);
    return now-completed<DURATIONS[policy]*3600000;
  }
  function completedToday(tasks,now=Date.now()){
    return tasks.filter(task=>{
      if(!task.completed)return false;
      const completed=dateOf(task.completedAt);
      return completed!==null && completed<=now && sameLocalDay(completed,now);
    }).sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt));
  }
  function read(storage){
    try{return normalize(storage.getItem(KEY));}catch(_){return DEFAULT;}
  }
  function save(storage,choice){
    const value=normalize(choice);
    storage.setItem(KEY,value);
    return value;
  }
  // Store the active preference per authenticated user, without putting it in task data.
  // Anonymous/legacy choice remains a seed only, never an overwrite of existing cloud state.
  const ACCOUNT_KEY_PREFIX='simpledo.inboxCompletedVisibility.account.v1.';
  const NAME='inbox_completed_visibility';
  const allowed=value=>CHOICES.some(choice=>choice.value===value);
  function validateAccountState(value) {
    if(!value||typeof value!=='object'||!allowed(value.value)||
      !Number.isSafeInteger(value.revision)||value.revision<0||
      typeof value.dirty!=='boolean'||typeof value.seed!=='boolean') return null;
    return {value:value.value,revision:value.revision,dirty:value.dirty,seed:value.seed};
  }
  class PreferenceStore {
    constructor(storage) {
      this.storage=storage;
      this.owner=null;
      this.state={value:read(storage),revision:0,dirty:false,seed:false};
      this.sequence=0;
    }
    get value(){return this.state.value;}
    get pending(){return Boolean(this.owner&&(this.state.dirty||this.state.seed));}
    accountKey(owner){return ACCOUNT_KEY_PREFIX+encodeURIComponent(owner);}
    bind(owner){
      if(typeof owner!=='string'||!owner)throw Error('A signed-in account is required.');
      if(owner===this.owner)return false;
      let state=null;
      const existing=this.storage.getItem(this.accountKey(owner));
      if(existing!==null) {
        try{state=validateAccountState(JSON.parse(existing));}catch(_){/* Retain unreadable bytes; use a safe fallback. */}
        if(!state)throw Error('Saved completed-task preference is unreadable. Existing data has been preserved.');
      } else {
        const guest=this.storage.getItem(KEY);
        state={value:normalize(guest),revision:0,dirty:false,seed:allowed(guest)};
        // A local choice seeds an *empty* cloud preference, not an existing account.
        this.storage.setItem(this.accountKey(owner),JSON.stringify(state));
      }
      this.owner=owner;this.state=state;this.sequence++;
      return true;
    }
    unbind(){
      if(this.owner===null)return false;
      this.owner=null;
      this.state={value:read(this.storage),revision:0,dirty:false,seed:false};
      this.sequence++;
      return true;
    }
    set(value){
      if(!allowed(value))throw Error('Choose a valid completed-task visibility period.');
      if(this.state.value===value)return value;
      if(!this.owner){
        save(this.storage,value);
        this.state={value,revision:0,dirty:false,seed:false};
      } else {
        const next={value,revision:this.state.revision,dirty:true,seed:false};
        this.storage.setItem(this.accountKey(this.owner),JSON.stringify(next));
        this.state=next;
      }
      this.sequence++;
      return value;
    }
    apply(state){
      const next=validateAccountState(state);
      if(!next||!this.owner)throw Error('Invalid synced completion preference.');
      // Persist before reflecting the new value; an unavailable browser store must not silently lose changes.
      this.storage.setItem(this.accountKey(this.owner),JSON.stringify(next));
      const changed=next.value!==this.state.value;
      this.state=next;
      this.sequence++;
      return changed;
    }
    async sync(client,owner,valid,onChange,onConflict){
      if(this.owner!==owner||!valid())return;
      const {data,error}=await client.from('simpledo_preferences')
        .select('name,value,revision').eq('user_id',owner).limit(1);
      if(error)throw error;
      if(this.owner!==owner||!valid())return;
      if(!Array.isArray(data)||data.length>1)throw Error('Invalid preference response.');
      const remote=data[0]||null;
      if(remote&&(remote.name!==NAME||!allowed(remote.value)||
        !Number.isSafeInteger(remote.revision)||remote.revision<1))
        throw Error('Invalid cloud preference; local selection has been preserved.');
      let local=this.state;
      let changed=false;
      if(remote){
        // Read cloud before writing: a fresh second device always adopts the account's choice.
        if(!local.dirty || local.value===remote.value){
          changed=this.apply({value:remote.value,revision:remote.revision,dirty:false,seed:false});
          if(changed)onChange?.(this.value);
          return;
        }
        if(remote.revision!==local.revision){
          // Stale offline writes must not silently overwrite another device.
          changed=this.apply({value:remote.value,revision:remote.revision,dirty:false,seed:false});
          if(changed)onChange?.(this.value);
          onConflict?.('Inbox visibility changed on another device; cloud value retained. Choose again to override.');
          return;
        }
      } else if(!local.dirty&&!local.seed){
        // No user preference exists yet: use the indefinite default without writing it.
        return;
      }
      const startSequence=this.sequence;
      const {data:result,error:writeError}=await client.rpc('sync_simpledo_preference',{
        preference_name:NAME,preference_value:local.value,expected_revision:local.revision
      });
      if(writeError)throw writeError;
      if(this.owner!==owner||!valid())return;
      if(!result||result.name!==NAME||!allowed(result.value)||
        !Number.isSafeInteger(result.revision)||result.revision<1||typeof result.conflict!=='boolean')
        throw Error('Invalid cloud preference response.');
      if(this.sequence!==startSequence){
        // A different selection was made while the network request was in flight.
        // Rebase the latest selection, leave it pending and retry on the next poll.
        const next={...this.state,revision:result.revision,dirty:true,seed:false};
        this.apply(next);
        return;
      }
      changed=this.apply({value:result.value,revision:result.revision,dirty:false,seed:false});
      if(changed)onChange?.(this.value);
      if(result.conflict)onConflict?.('Inbox visibility changed on another device; cloud value retained. Choose again to override.');
    }
  }
  const api={KEY,DEFAULT,CHOICES,normalize,visibleInInbox,completedToday,read,save,PreferenceStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.SimpleDoCompletion=api;
})(globalThis);
