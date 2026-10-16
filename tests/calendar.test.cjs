const {test}=require('node:test'),assert=require('node:assert/strict');
const base='../supabase/functions/calendars/';
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('provider adapters expand calendarView pages, filter free events and discard private details',async()=>{
 const {readBusy,mergeBusy}=await import(base+'providers.mjs');const calls=[];
 const fetcher=async(url,options)=>{calls.push([String(url),options]);const value=[{start:{dateTime:'2026-10-20T09:00:00.0000000',timeZone:'UTC'},end:{dateTime:'2026-10-20T10:00:00.0000000',timeZone:'UTC'},showAs:'busy',subject:'PRIVATE'}];
  if(!String(url).includes('page=2'))return json({value:[...value,{...value[0],showAs:'free'},{...value[0],isCancelled:true}], '@odata.nextLink':'https://graph.microsoft.com/v1.0/next?page=2'});
  return json({value});};
 const busy=await readBusy('outlook','TOKEN',['calendar'],'2026-10-20T00:00:00Z','2026-10-21T00:00:00Z',fetcher);
 assert.equal(busy.length,2);assert.equal(mergeBusy(busy).length,1);assert.equal(JSON.stringify(busy).includes('PRIVATE'),false);
 assert.ok(calls[0][0].includes('calendarView'));assert.equal(calls[0][1].headers.Prefer,'outlook.timezone="UTC"');
});
test('Google requests only free/busy and fails closed on partially inaccessible calendars',async()=>{
 const {readBusy,SCOPES}=await import(base+'providers.mjs');assert.ok(SCOPES.google.includes('calendar.events.freebusy'));assert.ok(!SCOPES.google.includes('events.readonly'));
 const fetcher=async(url,options)=>{assert.equal(url,'https://www.googleapis.com/calendar/v3/freeBusy');assert.deepEqual(JSON.parse(options.body).items,[{id:'one'}]);return json({calendars:{one:{busy:[{start:'2026-10-20T09:00:00Z',end:'2026-10-20T10:00:00Z'}]}}});};
 assert.equal((await readBusy('google','TOKEN',['one'],'a','b',fetcher)).length,1);
 await assert.rejects(readBusy('google','TOKEN',['one'],'a','b',async()=>json({calendars:{one:{errors:[{reason:'notFound'}]}}})),/could not be read/);
});
test('encrypted provider tokens are authenticated and bound to account/provider',async()=>{
 const {cipher,decipher}=await import(base+'crypto.mjs');const key=Buffer.alloc(32,7).toString('base64');const encrypted=await cipher(key,{refresh:'PRIVATE'},'user:outlook');
 assert.ok(!encrypted.includes('PRIVATE'));assert.deepEqual(await decipher(key,encrypted,'user:outlook'),{refresh:'PRIVATE'});
 await assert.rejects(decipher(key,encrypted,'other:outlook'));
});
function backend() {
 const envs={SIMPLEDO_APP_URL:'https://example.com/SimpleDo/',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'SERVER_PRIVATE',CALENDAR_TOKEN_KEY:Buffer.alloc(32,9).toString('base64'),OUTLOOK_CLIENT_ID:'client',OUTLOOK_CLIENT_SECRET:'CLIENT_PRIVATE',GOOGLE_CLIENT_ID:'gclient',GOOGLE_CLIENT_SECRET:'gsecret'};
 const tables={simpledo_calendar_connections:[],simpledo_calendar_oauth:[]};const requests=[];
 const fetcher=async(input,options={})=>{
  const url=new URL(input);requests.push({url,options});
  if(url.pathname==='/auth/v1/user')return ['Bearer session','Bearer second'].includes(options.headers.Authorization)?json({id:options.headers.Authorization==='Bearer second'?'user-b':'user-a'}):new Response('',{status:401});
  if(url.pathname.startsWith('/rest/v1/')) {
   assert.equal(options.headers.apikey,'SERVER_PRIVATE');const name=url.pathname.split('/').pop();let rows=tables[name];
   const match=row=>[...url.searchParams].every(([k,v])=>k==='select'||(v.startsWith('eq.')?String(row[k])===v.slice(3):v.startsWith('gt.')?row[k]>v.slice(3):v.startsWith('lt.')?row[k]<v.slice(3):false));
   const found=rows.filter(match);const method=options.method||'GET';
   if(method==='POST'){const row=JSON.parse(options.body);rows.push(row);return json([row]);}
   if(method==='PATCH'){const patch=JSON.parse(options.body);found.forEach(row=>Object.assign(row,patch));return json(found);}
   if(method==='DELETE')tables[name]=rows.filter(row=>!match(row));
   return json(structuredClone(found));
  }
  if(url.pathname.endsWith('/token'))return json({access_token:'PROVIDER_PRIVATE',refresh_token:'REFRESH_PRIVATE',expires_in:3600});
  if(url.hostname==='graph.microsoft.com')return json({value:[{id:'cal',name:'Work'}]});
  throw Error('Unexpected request '+url.origin+url.pathname);
 };
 return {env:name=>envs[name],envs,tables,requests,fetcher};
}
const post=(action,extra={},headers={})=>new Request('https://project.supabase.co/functions/v1/calendars',{method:'POST',headers:{Authorization:'Bearer session',Origin:'https://example.com','Content-Type':'application/json',...headers},body:JSON.stringify({action,...extra})});
test('backend enforces auth/origin, PKCE, one-time state, encrypted storage and explicit selection',async()=>{
 const {createHandler}=await import(base+'handler.mjs');const b=backend(),handler=createHandler(b.env,b.fetcher);
 assert.equal((await handler(post('status',{}, {Authorization:'Bearer bad'}))).status,401);
 assert.equal((await handler(post('status',{}, {Origin:'https://evil.test'}))).status,403);
 const started=await (await handler(post('connect',{provider:'outlook'}))).json();const auth=new URL(started.url);
 assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.ok(auth.searchParams.get('scope').includes('Calendars.ReadBasic'));assert.ok(!started.url.includes('CLIENT_PRIVATE'));
 const state=auth.searchParams.get('state');assert.notEqual(b.tables.simpledo_calendar_oauth[0].state_hash,state);
 const callback=new Request('https://project.supabase.co/functions/v1/calendars/callback?state='+state+'&code=auth-code');
 const result=await handler(callback);assert.match(result.headers.get('Location'),/calendar=connected/);
 assert.equal(b.tables.simpledo_calendar_connections.length,1);
 const stored=JSON.stringify(b.tables.simpledo_calendar_connections);assert.ok(!stored.includes('REFRESH_PRIVATE'));assert.ok(!stored.includes('PROVIDER_PRIVATE'));
 assert.match((await handler(callback)).headers.get('Location'),/calendar=failed/);
 const status=await (await handler(post('status'))).json();assert.ok(!JSON.stringify(status).includes('PRIVATE'));assert.deepEqual(status.providers[0].selected,[]);
 const selected=await handler(post('select',{provider:'outlook',selected:['cal']}));assert.equal(selected.status,200);assert.deepEqual(b.tables.simpledo_calendar_connections[0].selected,['cal']);
 assert.equal((await handler(post('select',{provider:'outlook',selected:['unowned']}))).status,400);
 assert.equal((await handler(post('disconnect',{provider:'outlook'}))).status,200);assert.equal(b.tables.simpledo_calendar_connections.length,0);
});
test('expired/invalid OAuth state and provider errors never expose credentials',async()=>{
 const {createHandler}=await import(base+'handler.mjs');const b=backend(),handler=createHandler(b.env,b.fetcher);
 const reply=await handler(new Request('https://project.supabase.co/functions/v1/calendars/callback?state=invalid&code=secret'));
 assert.match(reply.headers.get('Location'),/calendar=failed/);assert.equal(await reply.text(),'');
 assert.equal((await handler(post('busy',{provider:'outlook',start:'bad',end:'bad'}))).status,400);
});
test('expired provider token refreshes server-side without exposing credentials',async()=>{
 const {createHandler}=await import(base+'handler.mjs'),{cipher,decipher}=await import(base+'crypto.mjs');const b=backend();
 b.tables.simpledo_calendar_connections.push({user_id:'user-a',provider:'outlook',selected:['cal'],token_cipher:await cipher(b.env('CALENDAR_TOKEN_KEY'),{access:'OLD_PRIVATE',refresh:'OLD_REFRESH',expires:1},'user-a:outlook')});
 const handler=createHandler(b.env,b.fetcher);const reply=await handler(post('calendars',{provider:'outlook'}));
 assert.equal(reply.status,200);assert.ok(!JSON.stringify(await reply.json()).includes('PRIVATE'));
 const tokenRequest=b.requests.find(r=>r.url.pathname.endsWith('/token'));
 assert.equal(tokenRequest.options.body.get('grant_type'),'refresh_token');assert.equal(tokenRequest.options.body.get('refresh_token'),'OLD_REFRESH');
 const stored=await decipher(b.env('CALENDAR_TOKEN_KEY'),b.tables.simpledo_calendar_connections[0].token_cipher,'user-a:outlook');assert.equal(stored.refresh,'REFRESH_PRIVATE');
});

test('authenticated calendar requests cannot inspect another account connection',async()=>{
 const {createHandler}=await import(base+'handler.mjs');const b=backend();
 b.tables.simpledo_calendar_connections.push({user_id:'user-a',provider:'outlook',selected:['private-calendar'],token_cipher:'encrypted'});
 const handler=createHandler(b.env,b.fetcher);
 const status=await (await handler(post('status',{}, {Authorization:'Bearer second'}))).json();
 assert.equal(status.providers[0].connected,false);assert.deepEqual(status.providers[0].selected,[]);
 const read=await handler(post('calendars',{provider:'outlook'},{Authorization:'Bearer second'}));assert.equal(read.status,400);
 await handler(post('disconnect',{provider:'outlook'},{Authorization:'Bearer second'}));assert.equal(b.tables.simpledo_calendar_connections.length,1);
});
test('disconnect remains available when a provider is deconfigured',async()=>{
 const {createHandler}=await import(base+'handler.mjs');const b=backend();delete b.envs.OUTLOOK_CLIENT_SECRET;
 b.tables.simpledo_calendar_connections.push({user_id:'user-a',provider:'outlook',selected:[],token_cipher:'encrypted'});
 const reply=await createHandler(b.env,b.fetcher)(post('disconnect',{provider:'outlook'}));assert.equal(reply.status,200);assert.equal(b.tables.simpledo_calendar_connections.length,0);
});
