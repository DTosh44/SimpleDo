/* Shared capture rules. No recordings, images or new task schema are stored. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimpleDoCapture=api;})(globalThis,()=>{
 'use strict';
 const MAX_ROWS=100,MAX_TITLE=180,MAX_FILE=12*1024*1024;
 const key=text=>text.trim().replace(/\s+/g,' ').toLocaleLowerCase();
 function row(text,confidence=null){
  text=text.trim();
  const done=/^(?:[-*•]\s*)?(?:\[[xX✓✔]\]|[☑✓✔])\s*/u.test(text)||/^~~.+~~$/.test(text);
  text=text.replace(/^(?:[-*•‣–]\s+|\d+[.)]\s+)/,'').replace(/^\[(?: |x|X|✓|✔)\]\s*/u,'').replace(/^[☐☑✓✔]\s*/u,'').replace(/^~~(.*)~~$/,'$1').trim();
  const low=confidence===null||confidence<0.85;
  return {text,selected:!done&&!low&&text.length<=MAX_TITLE,check:low||text.length>MAX_TITLE,done};
 }
 function parse(text){if(typeof text!=='string'||text.length>30000)throw Error('Paste a list of up to 100 tasks.');const rows=text.split(/\r?\n/).filter(t=>t.trim()).map(t=>row(t,1)).filter(r=>r.text);if(rows.length>MAX_ROWS)throw Error('Review up to 100 tasks at a time.');return rows;}
 function recognized(lines){if(!Array.isArray(lines)||lines.length>MAX_ROWS)throw Error('Recognition returned too many items. Try a smaller list.');return lines.map(l=>{if(!l||typeof l.text!=='string'||l.text.length>2000)throw Error('Recognition returned invalid text.');return row(l.text,Number.isFinite(l.confidence)?l.confidence:null);}).filter(r=>r.text);}
 function selected(rows,existing=[]){
  const seen=new Set(existing.filter(t=>!t.completed).map(t=>key(t.title))),titles=[];let duplicates=0;
  for(const r of rows){if(!r.selected)continue;const title=r.text.trim();if(!title||title.length>MAX_TITLE)throw Error('Each selected task needs 1–180 characters. Correct long or empty items first.');const k=key(title);if(seen.has(k)){duplicates++;continue;}seen.add(k);titles.push(title);}
  if(rows.length>MAX_ROWS)throw Error('Add up to 100 tasks at a time.');return {titles,duplicates};
 }
 function validateFile(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP photo. For HEIC, export a JPEG or use your camera.');if(!file.size||file.size>MAX_FILE)throw Error('Choose a photo smaller than 12 MB.');}
 async function image(file){
  validateFile(file);const url=URL.createObjectURL(file);let img;
  try{img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('This photo could not be opened. Choose another image.'));i.src=url;});
   if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('Choose a photo with at most 40 megapixels.');
   const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo processing is unavailable. Try a smaller photo or paste text.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const result=canvas.toDataURL('image/jpeg',0.9).split(',')[1];canvas.width=canvas.height=0;if(result.length>2800000)throw Error('Photo is too large to scan. Crop it to the list and try again.');return result;
  }finally{if(img)img.src='';URL.revokeObjectURL(url);}
 }
 const speechError=code=>({ 'not-allowed':'Microphone permission was declined. Use keyboard dictation or allow access in browser settings.', 'service-not-allowed':'Speech recognition is unavailable. Try your keyboard’s microphone.', 'audio-capture':'No microphone is available. Try keyboard dictation.', 'network':'Speech recognition needs a connection on this browser. Your text is still here.', 'no-speech':'No speech was heard. Try again or use keyboard dictation.', 'language-not-supported':'This language is unavailable for speech recognition. Try keyboard dictation.' }[code]||'Speech recognition stopped. Your text is still here; you can edit it or try keyboard dictation.');
 class Speech {
  constructor(scope,events){this.scope=scope;this.events=events;this.recognition=null;this.generation=0;}
  get supported(){return Boolean(this.scope.SpeechRecognition||this.scope.webkitSpeechRecognition);}
  start(){this.cancel();const Ctor=this.scope.SpeechRecognition||this.scope.webkitSpeechRecognition;if(!Ctor){this.events.error('This browser does not offer speech recognition. Tap the text field and use your keyboard’s microphone.');return;}
   const run=++this.generation;let r;const valid=()=>run===this.generation;
   try{r=new Ctor();this.recognition=r;r.lang=this.scope.navigator?.language||'en-GB';r.interimResults=true;r.continuous=false;let final='';
    r.onstart=()=>{if(valid())this.events.state(true);};
    r.onresult=e=>{if(!valid())return;let interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript+' ';else interim+=e.results[i][0].transcript;}this.events.text((final+interim).trim());};
    r.onerror=e=>{if(!valid())return;this.cancel();this.events.error(speechError(e.error));};
    r.onend=()=>{if(!valid())return;this.clearTimers();this.recognition=null;this.events.state(false);};
    this.events.state(true);r.start();if(valid()&&this.recognition)this.timer=this.scope.setTimeout?.(()=>{if(valid()){this.cancel();this.events.error('Listening stopped after one minute. Your text is still here.');}},60000);
   }catch(_){this.cancel();this.events.error('Speech recognition could not start. Try your keyboard’s microphone.');}
  }
  clearTimers(){this.scope.clearTimeout?.(this.timer);this.scope.clearTimeout?.(this.stopTimer);}
  stop(){try{this.recognition?.stop();if(this.recognition)this.stopTimer=this.scope.setTimeout?.(()=>this.cancel(),5000);}catch(_){this.cancel();}}
  cancel(){this.clearTimers();this.generation++;const r=this.recognition;this.recognition=null;if(r){r.onstart=r.onresult=r.onerror=r.onend=null;try{r.abort();}catch(_){}}this.events.state(false);}
 }
 return {MAX_ROWS,key,parse,recognized,selected,validateFile,image,Speech,speechError};
});
