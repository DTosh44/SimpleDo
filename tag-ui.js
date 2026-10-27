/* Multiple tag chips; legacy single-tag assignments continue to render. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id),T=root.SimpleDoTags;
 class Controller {
  constructor(catalog,hooks) {
   this.catalog=catalog;this.hooks=hooks;this.filter='';this.selected=new Set();
   this.fillColors();this.refresh();
   $('tagFilter').onchange=()=>{this.filter=$('tagFilter').value;this.hooks.changed();};
   $('customTagChoice').onchange=()=>this.editChoice();
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
   $('tagColor').onchange=()=>this.updateColourSelection();this.updateColourSelection();
  }
  updateColourSelection() {
   const selected=$('tagColor').value;
   $('tagColorDot').style.backgroundColor=T.PALETTE[selected]||T.PALETTE.purple;
   for(const button of $('tagPaletteSwatches').querySelectorAll('button')){
    button.setAttribute('aria-pressed',String(button.dataset.color===selected));
   }
  }
  saved(message){$('tagError').textContent=message;this.hooks.saved();this.hooks.changed();}
  options(select,tags,first) {
   select.replaceChildren();const option=document.createElement('option');option.value='';option.textContent=first;select.append(option);
   for(const tag of tags){const option=document.createElement('option');option.value=tag.id;option.textContent=tag.name;select.append(option);}
  }
  tagsInUse() {
   const known=this.catalog.list(),knownIds=new Set(known.map(t=>t.id));
   const missing=[...new Set([...this.hooks.tasks().flatMap(t=>T.taskIds(t)),...this.selected])]
    .filter(id=>!knownIds.has(id))
    .map(id=>this.catalog.resolve(id)||{id,name:'Removed tag',color:'grey',unavailable:true});
   return [...known,...missing];
  }
  refresh() {
   const editing=$('customTagChoice').value,tags=this.catalog.list(),available=this.tagsInUse();
   this.options($('tagFilter'),available,'All tags');
   if(![...$('tagFilter').options].some(o=>o.value===this.filter))this.filter='';
   $('tagFilter').value=this.filter;
   const choices=$('taskTags');choices.replaceChildren();
   for(const tag of available) {
    const label=document.createElement('label');label.className='task-tag-choice';
    const input=document.createElement('input');
    input.type='checkbox';input.dataset.tagId=tag.id;input.checked=this.selected.has(tag.id);
    input.disabled=Boolean(tag.unavailable&&!input.checked);
    input.setAttribute('aria-label',tag.name);
    const dot=document.createElement('span');dot.className='tag-dot';dot.style.backgroundColor=T.PALETTE[tag.color]||T.PALETTE.grey;dot.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.textContent=tag.name;
    label.append(input,dot,name);label.classList.toggle('is-selected',input.checked);
    input.onchange=()=>{
     if(input.checked) {
      if(tag.id==='work')this.selected.delete('home');
      if(tag.id==='home')this.selected.delete('work');
      this.selected.add(tag.id);
     } else this.selected.delete(tag.id);
     this.paintChoices();this.hooks.selectionChanged?.();
    };
    choices.append(label);
   }
   this.options($('customTagChoice'),tags.filter(t=>T.validId(t.id)),'Create a tag');
   $('customTagChoice').value=[...$('customTagChoice').options].some(o=>o.value===editing)?editing:'';
   if(!document.activeElement?.closest('#tagForm'))this.editChoice();
  }
  paintChoices(){
   for(const input of $('taskTags').querySelectorAll('input[type=checkbox]')){
    input.checked=this.selected.has(input.dataset.tagId);
    input.closest('label').classList.toggle('is-selected',input.checked);
   }
  }
  open(task){this.selected=new Set(T.taskIds(task||{}));this.refresh();}
  selection(){return [...this.selected];}
  selectTag(id){if(!id)return;this.selected.add(id);this.refresh();this.hooks.selectionChanged?.();}
  focus(){($('taskTags').querySelector('input:not([disabled])')||$('createTagFromTask')).focus();}
  editChoice() {
   const tag=this.catalog.resolve($('customTagChoice').value);
   $('tagName').value=tag?.name||'';$('tagColor').value=tag?.color||'purple';$('tagContext').value=tag?.context||'outside';
   $('deleteCustomTag').hidden=!tag;this.updateColourSelection();
  }
  matches(task){return !this.filter||T.taskIds(task).includes(this.filter);}
  context(ids){return this.catalog.context({tagIds:ids||[]});}
  badge(task){
   const visible=T.taskIds(task).map(id=>this.catalog.resolve(id)).filter(Boolean);
   if(!visible.length)return null;
   const wrap=document.createElement('span');wrap.className='task-tags';
   for(const tag of visible){
    const badge=document.createElement('span');badge.className='task-tag';
    const dot=document.createElement('span');dot.className='tag-dot';dot.style.backgroundColor=T.PALETTE[tag.color]||T.PALETTE.grey;
    dot.setAttribute('aria-hidden','true');badge.append(dot,document.createTextNode(tag.name));wrap.append(badge);
   }
   return wrap;
  }
 }
 root.SimpleDoTagUI={Controller};
})(globalThis);
