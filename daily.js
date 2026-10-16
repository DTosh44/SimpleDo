/* Read-only daily projections and explicit ordering; no automatic data migration. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimpleDoDaily=api;})(globalThis,()=>{
 'use strict';
 const rank=t=>Number.isSafeInteger(t.dayOrder)?t.dayOrder:Infinity;
 const ordered=list=>[...list].sort((a,b)=>Number(a.completed)-Number(b.completed)||Number(b.main)-Number(a.main)||rank(a)-rank(b)||String(a.createdAt).localeCompare(String(b.createdAt)));
 function summarize(all,visible=all){
  const sorted=ordered(visible),unfinished=sorted.filter(t=>!t.completed),completed=sorted.filter(t=>t.completed),done=all.filter(t=>t.completed).length;
  return {total:all.length,done,remaining:all.length-done,percent:all.length?done/all.length*100:0,featured:unfinished[0]||null,label:unfinished[0]?.main?'The Main Thing':'Up next',others:unfinished.slice(1),completed,visible:visible.length};
 }
 function group(tasks,task){return ordered(tasks.filter(t=>t.date===task.date&&Boolean(t.completed)===Boolean(task.completed)&&Boolean(t.main)===Boolean(task.main)));}
 function reorder(tasks,id,beforeId){
  const task=tasks.find(t=>t.id===id),target=tasks.find(t=>t.id===beforeId);
  if(!task||!target||!task.date||task.id===target.id||task.date!==target.date||Boolean(task.completed)!==Boolean(target.completed)||Boolean(task.main)!==Boolean(target.main))return tasks;
  const list=group(tasks,task).filter(t=>t.id!==id);list.splice(list.findIndex(t=>t.id===beforeId),0,task);const positions=new Map(list.map((t,i)=>[t.id,i]));
  return tasks.map(t=>positions.has(t.id)?{...t,dayOrder:positions.get(t.id)}:t);
 }
 function shift(tasks,id,direction){
  const task=tasks.find(t=>t.id===id);if(!task||!task.date)return tasks;const list=group(tasks,task),index=list.findIndex(t=>t.id===id),next=index+direction;
  if(![-1,1].includes(direction)||next<0||next>=list.length)return tasks;
  [list[index],list[next]]=[list[next],list[index]];const positions=new Map(list.map((t,i)=>[t.id,i]));return tasks.map(t=>positions.has(t.id)?{...t,dayOrder:positions.get(t.id)}:t);
 }
 return {ordered,summarize,group,reorder,shift};
});
