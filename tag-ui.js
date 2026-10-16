(function(root){
 'use strict';
 const $=id=>document.getElementById(id),T=root.SimpleDoTags;
 class Controller {
  constructor(catalog,hooks) {
   this.catalog=catalog;this.hooks=hooks;this.filter='';
   this.fillColors();this.refresh();
   $('tagFilter').onchange=()=>{this.filter=$('tagFilter').value;this.hooks.changed();};
   $('customTagChoice').onchange=()=>this.editChoice();
   $('taskTag').onchange=()=>this.updateTaskSelection();
   $('tagForm').onsubmit=event=>{
    event.preventDefault();
    try {
     const creating=!$('customTagChoice').value;
     const tag=catalog.edit($('customTagChoice').value,{name:$('tagName').value,color:$('tagColor').value,context:$('tagContext').value});
     this.refresh();$('customTagChoice').value=tag.id;this.editChoice();this.saved('Tag saved.');
     if(creating)this.hooks.created?.(tag);
    }catch(error){$('tagError').textContent=error.message;}
   };
   $('deleteCustomTag').onclick=()=>{
    const id=$('customTagChoice').value;if(!id)return;
    try {catalog.remove(id);this.refresh();this.editChoice();this.saved('Tag removed. Its tasks are still here.');}catch(error){$('tagError').textContent=error.message;}
   };
  }
  fillColors() {
   const swatches=$('tagPaletteSwatches');
   for(const [name,color] of Object.entries(T.PALETTE)){
    const option=document.createElement('option');option.value=name;option.textContent=name[0].toUpperCase()+name.slice(1);$('tagColor').append(option);
    const swatch=document.createElement('button');
    swatch.type='button';swatch.className='tag-colour-swatch';swatch.dataset.color=name;
    swatch.style.backgroundColor=color;swatch.setAttribute('aria-label',option.textContent+' tag colour');
    swatch.setAttribute('aria-pressed','false');swatch.title=option.textContent;
    swatch.onclick=()=>{$('tagColor').value=name;this.updateColourSelection();};
    swatches.append(swatch);
   }
   $('tagColor').onchange=()=>this.updateColourSelection();
   this.updateColourSelection();
  }
  updateColourSelection() {
   const selected=$('tagColor').value;
   $('tagColorDot').style.backgroundColor=T.PALETTE[selected]||T.PALETTE.purple;
   for(const button of $('tagPaletteSwatches').querySelectorAll('button')){
    button.setAttribute('aria-pressed',String(button.dataset.color===selected));
   }
  }
  updateTaskSelection() {
   const tag=this.catalog.resolve($('taskTag').value),dot=$('taskTagDot');
   dot.hidden=!tag;dot.style.backgroundColor=tag?T.PALETTE[tag.color]||T.PALETTE.grey:'';
  }
  saved(message){$('tagError').textContent=message;this.hooks.saved();this.hooks.changed();}
  options(select,tags,first) {
   select.replaceChildren();const option=document.createElement('option');option.value='';option.textContent=first;select.append(option);
   for(const tag of tags){const option=document.createElement('option');option.value=tag.id;option.textContent=tag.name;select.append(option);}
  }
  refresh() {
   const current=$('taskTag').value,editing=$('customTagChoice').value;
   const tags=this.catalog.list(),unknown=[...new Set(this.hooks.tasks().map(t=>t.tagId).filter(id=>id&&!this.catalog.records()[id]&&!T.DEFAULTS.some(t=>t.id===id)))].map(id=>this.catalog.resolve(id));
   this.options($('tagFilter'),[...tags,...unknown],'All tags');
   if(![...$('tagFilter').options].some(o=>o.value===this.filter))this.filter='';$('tagFilter').value=this.filter;
   this.options($('taskTag'),[...tags,...unknown],'No tag');
   this.keepMissingChoice(current);$('taskTag').value=current;this.updateTaskSelection();
   this.options($('customTagChoice'),tags.filter(t=>T.validId(t.id)),'Create a tag');
   $('customTagChoice').value=[...$('customTagChoice').options].some(o=>o.value===editing)?editing:'';if(!document.activeElement?.closest('#tagForm'))this.editChoice();
  }
  keepMissingChoice(id) {
   if(!id||[...$('taskTag').options].some(o=>o.value===id))return;
   const option=document.createElement('option');option.value=id;option.textContent=this.catalog.resolve(id)?.name||'Removed tag (choose No tag to clear)';$('taskTag').append(option);
  }
  open(task) {this.keepMissingChoice(task?.tagId);$('taskTag').value=task?.tagId||'';this.updateTaskSelection();}
  editChoice() {
   const tag=this.catalog.resolve($('customTagChoice').value);
   $('tagName').value=tag?.name||'';$('tagColor').value=tag?.color||'purple';$('tagContext').value=tag?.context||'outside';
   $('deleteCustomTag').hidden=!tag;this.updateColourSelection();
  }
  matches(task){return !this.filter||(task.tagId===this.filter&&this.catalog.resolve(task.tagId)!==null);}
  context(id){return this.catalog.context({tagId:id});}
  badge(task) {
   const tag=this.catalog.resolve(task.tagId);if(!tag)return null;
   const badge=document.createElement('span');badge.className='task-tag';
   const dot=document.createElement('span');dot.className='tag-dot';dot.style.backgroundColor=T.PALETTE[tag.color];dot.setAttribute('aria-hidden','true');badge.append(dot,document.createTextNode(tag.name));return badge;
  }
 }
 root.SimpleDoTagUI={Controller};
})(globalThis);
