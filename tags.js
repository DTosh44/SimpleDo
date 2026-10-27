/* Stable multi-tag identities. Catalog changes never remove task records. */
(function(root){
 'use strict';
 const PALETTE={blue:'#4578c9',orange:'#ef9b2d',pink:'#e3447d',purple:'#7851ad',mustard:'#e0c44d',grey:'#747474'};
 const DEFAULTS=[{id:'work',name:'Work',color:'blue',context:'work'},{id:'home',name:'Home',color:'orange',context:'outside'}];
 const copy=x=>JSON.parse(JSON.stringify(x));
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const validId=id=>typeof id==='string' && /^tag-[a-zA-Z0-9-]{1,100}$/.test(id);
 function validateTag(tag) {
  if(!tag||!validId(tag.id)||typeof tag.name!=='string'||!tag.name.trim()||tag.name.length>32||/[\r\n\t]/.test(tag.name)||!Object.hasOwn(PALETTE,tag.color)||!['work','outside'].includes(tag.context)||typeof tag.deleted!=='boolean'||['createdAt','updatedAt'].some(k=>typeof tag[k]!=='string'||!Number.isFinite(Date.parse(tag[k]))))throw Error('Invalid tag data. Your current tasks have not been replaced.');
  return {id:tag.id,name:tag.name.trim(),color:tag.color,context:tag.context,deleted:tag.deleted,createdAt:tag.createdAt,updatedAt:tag.updatedAt};
 }
 function validateList(list) {
  if(!Array.isArray(list)||list.length>1000)throw Error('Invalid tag list.');
  const tags=list.map(validateTag);if(new Set(tags.map(t=>t.id)).size!==tags.length)throw Error('The backup has duplicate tag IDs.');return tags;
 }
 function restoreRecords(records={},definitions,replace) {
  if(definitions===undefined)return records;
  const next=copy(records),incoming=validateList(definitions),known=new Set(incoming.map(t=>t.id));
  if(replace)for(const [id,r] of Object.entries(next))if(!known.has(id))next[id]={...r,tag:{...r.tag,deleted:true,updatedAt:new Date().toISOString()},dirty:true};
  for(const tag of incoming)if(replace||!Object.hasOwn(next,tag.id))next[tag.id]={tag,version:next[tag.id]?.version||0,dirty:true};
  return next;
 }
 function taskIds(task={}) {
  return Array.isArray(task.tagIds)?task.tagIds:(task.tagId?[task.tagId]:[]);
 }
 function context(task,records={}) {
  const ids=taskIds(task);
  if(ids.includes('home'))return 'outside';
  if(ids.includes('work'))return 'work';
  if(ids.some(id=>records[id]?.tag.context==='work'))return 'work';
  if(ids.some(id=>records[id]?.tag.context==='outside'))return 'outside';
  return task.capacityContext || (ids.length?'outside':'work');
 }
 class Catalog {
  constructor(store){this.store=store;}
  records(){return this.store.state.tagRecords||{};}
  definitions(){return Object.values(this.records()).map(r=>copy(r.tag));}
  list(){return [...DEFAULTS,...this.definitions().filter(t=>!t.deleted).sort((a,b)=>a.name.localeCompare(b.name))];}
  resolve(id){if(!id)return null;const builtin=DEFAULTS.find(t=>t.id===id);if(builtin)return builtin;const record=this.records()[id];return record ? record.tag.deleted?null:record.tag : {id,name:'Tag unavailable',color:'grey',context:'outside',unavailable:true};}
  context(task){return context(task,this.records());}
  scoped(tasks){return tasks.map(t=>({...t,capacityContext:this.context(t)}));}
  edit(id,values) {
   this.store.state=this.store.read()||this.store.state;
   const records=this.records(),old=records[id];
   if(id&&!validId(id))throw Error('Work and Home are fixed default tags.');
   if(id&&(!old||old.tag.deleted))throw Error('This tag was removed. Create a new tag instead.');
   const now=new Date().toISOString();
   const tag=validateTag({id:id||'tag-'+crypto.randomUUID(),name:values.name?.trim(),color:values.color,context:values.context||old?.tag.context||'outside',createdAt:old?.tag.createdAt||now,updatedAt:now,deleted:false});
   if(this.list().some(t=>t.id!==tag.id&&t.name.toLocaleLowerCase()===tag.name.toLocaleLowerCase()))throw Error('A tag with that name already exists.');
   this.store.state.tagRecords={...records,[tag.id]:{tag,version:old?.version||0,dirty:true}};this.store.write();return tag;
  }
  remove(id) {
   this.store.state=this.store.read()||this.store.state;const old=this.records()[id];
   if(!old)throw Error('Only custom tags can be deleted.');
   this.store.state.tagRecords={...this.records(),[id]:{...old,tag:{...old.tag,deleted:true,updatedAt:new Date().toISOString()},dirty:true}};this.store.write();
  }
  pending(){this.store.state=this.store.read()||this.store.state;return Object.entries(this.records()).filter(([,r])=>r.dirty).map(([id,r])=>[id,copy(r)]);}
  receive(row,sent) {
   this.store.state=this.store.read()||this.store.state;const records=this.records(),old=records[row.id],tag=validateTag(row.payload);
   if(row.id!==tag.id||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Invalid synced tag.');
   if(old&&row.revision<old.version)return false;
   if(sent&&old&&!same(old,sent)&&!row.conflict){old.version=row.revision;this.store.write();return false;}
   if(!sent&&old?.dirty)return false;
   const next={tag,version:row.revision,dirty:false};if(same(old,next))return false;
   this.store.state.tagRecords={...records,[row.id]:next};this.store.write();return true;
  }
  async sync(client,owner,valid,changed) {
   let didChange=false;
   try {
    for(const [id,record] of this.pending()) {
     if(!valid())return;
     const {data,error}=await client.rpc('sync_tag',{tag_id:id,tag_payload:record.tag,expected_revision:record.version});
     if(error)throw error;if(!valid())return;didChange=this.receive(data,record)||didChange;
    }
    let after='';
    while(valid()) {
     const {data,error}=await client.from('simpledo_tags').select('id,payload,revision').eq('user_id',owner).gt('id',after).order('id').limit(500);
     if(error)throw error;if(!valid())return;
     for(const row of data)didChange=this.receive(row)||didChange;
     if(data.length<500)break;after=data[data.length-1].id;
    }
   }finally{if(didChange&&valid())changed();}
  }
 }
 const api={PALETTE,DEFAULTS,validId,validateTag,validateList,restoreRecords,taskIds,context,Catalog};
 if(typeof module!=='undefined')module.exports=api;else root.SimpleDoTags=api;
})(globalThis);
