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
  const api={KEY,DEFAULT,CHOICES,normalize,visibleInInbox,completedToday,read,save};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.SimpleDoCompletion=api;
})(globalThis);
