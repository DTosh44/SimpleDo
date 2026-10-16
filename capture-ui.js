(function(root){
 'use strict';
 function requestId(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
 const $=id=>document.getElementById(id),C=root.SimpleDoCapture,DRAFT='simpledo.captureDraft.v1';
 class Controller {
  constructor(hooks){
   this.hooks=hooks;this.rows=[];this.mode='speak';this.run=0;this.client=null;this.user=null;this.busy=false;
   this.speech=new C.Speech(root,{state:active=>{this.recording=active;$('captureRecording').hidden=!active;$('captureStop').hidden=!active;$('captureStart').disabled=active;$('captureText').readOnly=active;$('captureReviewText').disabled=active;},text:text=>{$('captureText').value=this.speechPrefix+text;this.saveDraft();},error:message=>this.message(message)});
   $('captureSpeak').onclick=()=>this.open('speak');$('captureScan').onclick=()=>this.open('scan');
   $('captureStart').onclick=()=>{this.message('');this.speechPrefix=$('captureText').value.trim();if(this.speechPrefix)this.speechPrefix+=' ';this.speech.start();};
   $('captureStop').onclick=()=>this.speech.stop();
   $('captureReviewText').onclick=()=>{try{const rows=[...this.rows,...C.parse($('captureText').value)];if(rows.length>100)throw Error('Review up to 100 tasks at a time.');if(!rows.length)throw Error('Add some text to review first.');this.rows=rows;$('captureText').value='';this.review();}catch(e){this.message(e.message);}};
   $('captureText').oninput=()=>this.saveDraft();$('captureTag').onchange=()=>this.saveDraft();
   $('capturePhoto').onclick=()=>$('captureCameraFile').click();$('captureUpload').onclick=()=>$('captureImageFile').click();
   for(const id of ['captureCameraFile','captureImageFile'])$(id).onchange=async()=>{const file=$(id).files[0];$(id).value='';if(file)await this.scan(file);};
   $('captureAdd').onclick=()=>this.add();$('captureBack').onclick=()=>{$('captureText').value='';$('captureReview').hidden=true;$('captureInput').hidden=false;this.saveDraft();};
   $('captureClose').onclick=()=>this.close(false);$('captureCancel').onclick=()=>this.close(true);
   $('captureDialog').addEventListener('cancel',e=>{e.preventDefault();this.close(false);});
   $('captureDialog').addEventListener('close',()=>{this.run++;this.speech.cancel();this.busy=false;if(this.opener?.isConnected)this.opener.focus();});
   document.addEventListener('visibilitychange',()=>{if(document.hidden)this.speech.cancel();});
  }
  account(client,user){this.run++;this.client=client;this.user=user;if($('captureDialog').open){this.busy=false;this.message('Account changed. Your text is still here.');if(this.mode==='scan')this.scanStatus();}}
  message(text){$('captureMessage').textContent=text;}
  saveDraft(){this.draft={mode:this.mode,text:$('captureText').value,rows:this.rows.map(r=>({...r})),tag:$('captureTag').value};try{sessionStorage.setItem(DRAFT,JSON.stringify(this.draft));}catch(_){/* Keep the editable draft in memory when session storage is full. */}}
  open(mode){
   this.opener=document.activeElement;this.mode=mode;this.speech.cancel();this.run++;this.busy=false;this.message('');this.rows=[];$('captureText').value='';
   const select=$('captureTag');select.replaceChildren(new Option('No tag',''));for(const t of this.hooks.catalog()?.list()||[])select.append(new Option(t.name,t.id));
   let draft=this.draft;try{if(!draft)draft=JSON.parse(sessionStorage.getItem(DRAFT));}catch(_){}if(draft&&['speak','scan'].includes(draft.mode)&&typeof draft.text==='string'&&Array.isArray(draft.rows)&&draft.rows.length<=100){$('captureText').value=draft.text.slice(0,30000);this.rows=draft.rows.filter(r=>r&&typeof r.text==='string').map(r=>({...r,text:r.text.slice(0,2000)}));if([...select.options].some(o=>o.value===draft.tag))select.value=draft.tag;}
   $('captureHeading').textContent=this.mode==='scan'?'Scan a list':'Speak a task';$('captureVoice').hidden=this.mode!=='speak';$('captureScanInput').hidden=this.mode!=='scan';
   $('captureStart').hidden=!this.speech.supported;$('captureSpeechHint').textContent=this.speech.supported?'Your browser handles speech and may use its online service. No recording is saved by SimpleDo.':'Speech recognition is unavailable here. Tap the text field and use your keyboard’s microphone.';
   $('captureInput').hidden=false;$('captureReview').hidden=true;if(this.rows.length)this.review();
   $('captureDialog').showModal();if(this.mode==='scan')this.scanStatus();else if(!this.rows.length)$('captureText').focus();
  }
  close(discard){this.speech.cancel();this.run++;if(discard){this.draft=null;this.rows=[];$('captureText').value='';try{sessionStorage.removeItem(DRAFT);}catch(_){}}else this.saveDraft();$('captureDialog').close();}
  async scanStatus(){
   const run=++this.run;$('capturePhoto').disabled=$('captureUpload').disabled=true;
   if(!navigator.onLine){$('captureScanHint').textContent='Photo recognition needs an internet connection. You can paste text below.';return;}
   if(!this.client||!this.user){$('captureScanHint').textContent='Photo recognition needs a configured service and a signed-in account. You can paste text copied with your phone’s text scanner below.';return;}
   $('captureScanHint').textContent='Checking photo recognition…';
   try{const {data,error}=await this.client.functions.invoke('capture-scan',{body:{action:'status'}});if(run!==this.run)return;if(error||!data?.available)throw Error();$('captureScanHint').textContent='Photos are sent to Google Vision for recognition. Review every item before adding. SimpleDo does not store photos.';$('capturePhoto').disabled=$('captureUpload').disabled=false;}catch(_){if(run===this.run)$('captureScanHint').textContent='Photo recognition is unavailable or has not been configured. Paste text below, or try again later.';}
  }
  async scan(file){
   if(this.busy)return;if(!navigator.onLine){this.message('Photo recognition needs a connection. Your draft is still here.');return;}
   if(!this.client||!this.user){this.message('Sign in and configure photo recognition first.');return;}
   const run=++this.run;this.busy=true;$('capturePhoto').disabled=$('captureUpload').disabled=true;this.message('Reading your list…');
   try{const image=await C.image(file);if(run!==this.run)return;
    const {data,error}=await this.client.functions.invoke('capture-scan',{body:{action:'scan',requestId:requestId(),image}});
    if(run!==this.run)return;if(error||data?.error){let message=data?.error;try{message=message||(await error.context.json()).error;}catch(_){}throw Error(message||'Recognition failed. Your draft is still here. Choose the photo again to retry.');}
    const rows=C.recognized(data?.lines);if(!rows.length)throw Error('No readable text found. Crop the list, improve the lighting, or paste text below.');
    const all=[...this.rows,...C.parse($('captureText').value),...rows];if(all.length>100)throw Error('Review up to 100 tasks at a time. Your text is still here.');this.rows=all;$('captureText').value='';this.message('Review every line. Items marked “Check text” start unselected.');
    this.review();
   }catch(e){if(run===this.run)this.message(e.message);}finally{if(run===this.run){this.busy=false;$('capturePhoto').disabled=$('captureUpload').disabled=false;}}
  }
  review(){
   this.speech.cancel();$('captureInput').hidden=true;$('captureReview').hidden=false;const list=$('captureRows');list.replaceChildren();
   this.rows.forEach((r,index)=>{const item=document.createElement('div');item.className='capture-row';const check=document.createElement('input');check.type='checkbox';check.checked=Boolean(r.selected);check.setAttribute('aria-label','Include item '+(index+1));check.onchange=()=>{r.selected=check.checked;this.saveDraft();};
    const select=document.createElement('label');select.className='capture-select';select.append(check);
    const wrap=document.createElement('div'),text=document.createElement('textarea');text.rows=2;text.value=r.text;text.maxLength=2000;text.setAttribute('aria-label','Task '+(index+1));text.oninput=()=>{r.text=text.value;this.saveDraft();};wrap.append(text);
    if(r.check||r.done){const hint=document.createElement('small');hint.textContent=r.done?'Marked complete — excluded initially':r.text.length>180?'Shorten to 180 characters':'Check text — select after checking';wrap.append(hint);}
    const remove=document.createElement('button');remove.type='button';remove.className='icon-button';remove.textContent='×';remove.setAttribute('aria-label','Remove item '+(index+1));remove.onclick=()=>{this.rows.splice(index,1);this.review();};item.append(select,wrap,remove);list.append(item);
   });this.saveDraft();
  }
  add(){
   if(this.busy)return;this.busy=true;$('captureAdd').disabled=true;
   try{const result=this.hooks.add(this.rows,$('captureTag').value);if(result){this.close(true);this.hooks.notify(result);}}catch(e){this.message(e.message);}finally{this.busy=false;$('captureAdd').disabled=false;}
  }
 }
 root.SimpleDoCaptureUI={Controller};
})(globalThis);
