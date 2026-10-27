const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../capture.js'),{Store,parseBackupDocument}=require('../data.js');
class Memory {constructor(){this.map=new Map();}getItem(k){return this.map.get(k)||null;}setItem(k,v){this.map.set(k,v);}}
test('list capture splits bullets and numbers, excludes explicit completed markers, never guesses text',()=>{
 const rows=C.parse('- Email Simon\n2. Book dentist\n[ ] Mow lawn\n[x] Buy present\n✓ Already done\n~~Cancelled~~\n?? unknown');
 assert.deepEqual(rows.map(r=>r.text),['Email Simon','Book dentist','Mow lawn','Buy present','Already done','Cancelled','?? unknown']);
 assert.deepEqual(rows.map(r=>r.selected),[true,true,true,false,false,false,true]);assert.equal(rows[6].text,'?? unknown');
});
test('Inbox quick paste splits each nonempty line with plain wording and limits',()=>{
 const expected=['Tape washing machine leak','Sort garage','Jo Randall','Chiltern ideation','Lucy and Nour','Board minutes','New events page live','Vicki fam trip email - meeting with objectives','Itineraries page - how to build more every day - vw','Membership brochure briefed into Mikey','Confirmation Statement - TC Group - Jo Roberts'];
 assert.deepEqual(C.quickLines('\n'+expected.join('\r\n')+'\n  \n'),expected);
 assert.deepEqual(C.selected(C.quickLines(expected.join('\n')).map(text=>({text,selected:true}))).titles,expected);
 assert.deepEqual(C.quickLines('Single task'),['Single task']);
 assert.deepEqual(C.quickLines('  First  \rSecond\n\n Third\n'),['First','Second','Third']);
 assert.throws(()=>C.quickLines('Task\n'.repeat(101)),/100 tasks/);
 assert.throws(()=>C.quickLines('x'.repeat(181)),/180 characters/);
 assert.throws(()=>C.quickLines('x'.repeat(30001)),/100 tasks/);
});
test('uncertain OCR and missing confidence start unselected; oversized titles need correction',()=>{
 const rows=C.recognized([{text:'• Read letter',confidence:.94},{text:'1. Unclear name',confidence:.7},{text:'No score'},{text:'x'.repeat(181),confidence:.99},{text:'☑ Done',confidence:.99}]);
 assert.deepEqual(rows.map(r=>r.selected),[true,false,false,false,false]);assert.equal(rows[1].check,true);rows[1].selected=true;rows[1].text='Corrected name';assert.deepEqual(C.selected(rows).titles,['Read letter','Corrected name']);
 assert.throws(()=>C.recognized([{text:5}]),/invalid/);assert.throws(()=>C.recognized(Array(101).fill({text:'a'})),/too many/);
});
test('capture ignores unchecked rows, rejects invalid selected titles, skips active duplicates and repeated import',()=>{
 const rows=C.parse('Buy milk\n buy   MILK \nFinished before');
 assert.deepEqual(C.selected(rows,[{title:'Finished before',completed:true}]),{titles:['Buy milk','Finished before'],duplicates:1});
 assert.deepEqual(C.selected(rows,[{title:'Buy milk',completed:false}]),{titles:['Finished before'],duplicates:2});
 assert.throws(()=>C.selected([{text:' ',selected:true}]),/1–180/);assert.throws(()=>C.selected([{text:'x'.repeat(181),selected:true}]),/1–180/);
 assert.throws(()=>C.parse('item\n'.repeat(101)),/100 tasks/);
});

test('duplicate assessment distinguishes exact, similar and different unfinished tasks',()=>{
 const active=(title,id='existing')=>({id,title,completed:false});
 const examples=[
  ['Sort garage','  SORT   garage! ','exact'],
  ['Tape washing machine leak','Tape washing machine leaks','similar'],
  ['Sort garage','Sort the garage','similar'],
  ['Email Vicki about fam trip','Vicki fam trip email','similar'],
  ['Membership brochure briefed into Mikey','Membership brochure briefing for Mikey','similar'],
  ['Board minutes','Board minute','similar'],
  ['Sort garage','Sort kitchen','add'],
  ['Call Jo Randall','Call Jo Roberts','add'],
  ['Buy milk','Buy silk','add'],
  ['Invoice 123','Invoice 124','add'],
  ['Review figures 2025-09','Review figures 2025-10','add'],
  ['Campaign Q1','Campaign Q2','add']
 ];
 for(const [oldTitle,newTitle,kind] of examples){
  const result=C.assess([{title:newTitle}],[active(oldTitle)]);
  assert.equal(result[kind].length,1,newTitle+' should be '+kind);
  assert.equal(result.add.length+result.exact.length+result.similar.length,1);
 }
 assert.equal(C.key(' Jo-Randall! '),C.key('jo randall'));
 assert.equal(C.key('R&D'),C.key('R and D'));
});
test('completed titles can recur, same-batch duplicates are skipped, edits can exclude themselves',()=>{
 const active=[{id:'1',title:'Sort garage',completed:false},{id:'2',title:'Board minutes',completed:true}];
 let result=C.assess([{title:'Sort garage'},{title:'Sort the garage'},{title:'Board minutes'},{title:'Email Vicki'},{title:'email vicki!'}],active);
 assert.deepEqual(result.exact.map(x=>x.index),[0,4]);
 assert.deepEqual(result.similar.map(x=>x.index),[1]);
 assert.deepEqual(result.add.map(x=>x.index),[2,3]);
 assert.equal(result.similar[0].match.title,'Sort garage');
 assert.equal(C.assess([{title:'Sort garage'}],active,'1').add.length,1);
 assert.equal(C.assess([{title:'Board minutes'}],active).exact.length,0);
 assert.throws(()=>C.assess([{title:'x'.repeat(181)}],active),/180 characters/);
});

test('capture tasks round-trip ordinary store, backup and two-device revision sync, preserving old fields',()=>{
 const a=new Store(new Memory()),b=new Store(new Memory());a.load([{id:'old',title:'Existing',notes:'Keep',priority:7}]);b.load([]);
 const tasks=C.selected(C.parse('Book dentist\nMow lawn')).titles.map((title,i)=>({id:'capture-'+i,title,date:null,notes:'',tagId:'home',capacityContext:'outside',createdAt:new Date().toISOString(),completed:false,main:false,rolled:false,demo:false}));
 a.commit([...a.live(),...tasks]);const original=a.live();a.bind('owner');
 for(const [id,r] of a.pending()){const row={id,payload:r.task,deleted:false,revision:1};a.receive(row,r);b.receive(row);}
 assert.deepEqual(b.live().sort((x,y)=>x.id.localeCompare(y.id)),original.sort((x,y)=>x.id.localeCompare(y.id)));assert.equal(b.live().find(t=>t.id==='old').priority,7);assert.equal(b.pending().length,0);
 const backup=parseBackupDocument(JSON.stringify(a.backup()));assert.equal(backup.tasks.filter(t=>t.tagId==='home').length,2);
});
function voice(){const events=[],instances=[];class Recognition{constructor(){instances.push(this);}start(){this.onstart?.();}stop(){this.onend?.();}abort(){this.aborted=true;}}const speech=new C.Speech({webkitSpeechRecognition:Recognition,navigator:{language:'en-GB'}},{state:x=>events.push(['state',x]),text:x=>events.push(['text',x]),error:x=>events.push(['error',x])});return {speech,events,instances};}
test('native speech detects support and allows stop; results remain editable plain text',()=>{
 const {speech,events,instances}=voice();assert.equal(speech.supported,true);speech.start();const r=instances[0];assert.equal(r.lang,'en-GB');const results=[[{transcript:'Book the MOT'}]];results[0].isFinal=true;r.onresult({resultIndex:0,results});assert.deepEqual(events.at(-1),['text','Book the MOT']);speech.stop();assert.deepEqual(events.at(-1),['state',false]);
});
test('speech denial, unsupported browser and cancelled late events preserve drafts',()=>{
 const {speech,events,instances}=voice();speech.start();const late=instances[0].onresult;instances[0].onerror({error:'not-allowed'});assert.match(events.find(e=>e[0]==='error')[1],/permission was declined/);
 speech.cancel();const count=events.length;late({resultIndex:0,results:[]});assert.equal(events.length,count);assert.equal(instances[0].aborted,true);
 const errors=[];new C.Speech({},{state:()=>{},error:x=>errors.push(x)}).start();assert.match(errors[0],/keyboard/);
 assert.match(C.speechError('network'),/connection/);assert.match(C.speechError('audio-capture'),/microphone/);
});
test('photos accept bounded decodable input formats only; HEIC/SVG/PDF/empty and oversized rejected',()=>{
 for(const type of ['image/jpeg','image/png','image/webp'])C.validateFile({type,size:100});
 for(const type of ['image/svg+xml','image/heic','application/pdf'])assert.throws(()=>C.validateFile({type,size:100}),/JPEG/);
 assert.throws(()=>C.validateFile({type:'image/jpeg',size:0}),/12 MB/);assert.throws(()=>C.validateFile({type:'image/jpeg',size:13*1024*1024}),/12 MB/);
});
