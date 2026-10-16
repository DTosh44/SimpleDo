import {SCOPES,providerConfig,exchange,listCalendars,readBusy,mergeBusy} from './providers.mjs';
import {random,hash,cipher,decipher} from './crypto.mjs';
export function createHandler(env,fetcher=fetch) {
 return async request=>{
  const frontend=env('SIMPLEDO_APP_URL'),project=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY'),key=env('CALENDAR_TOKEN_KEY');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try {
   if(!frontend||!project||!secret||!key)return reply({error:'Calendar backend has not been configured.'},503);
   const app=new URL(frontend),url=new URL(request.url),origin=request.headers.get('Origin');
   if(app.protocol!=='https:' && app.hostname!=='localhost')return reply({error:'Invalid app URL configuration.'},503);
   if(origin && origin!==app.origin)return reply({error:'Origin not allowed.'},403);
   headers['Access-Control-Allow-Origin']=app.origin;headers.Vary='Origin';
   headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='POST, OPTIONS';
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   const db=async (table,method='GET',filters={},body)=>{
    const endpoint=new URL(project+'/rest/v1/'+table);
    for(const [k,v] of Object.entries(filters))endpoint.searchParams.set(k,v);
    const response=await fetcher(endpoint,{method,headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Calendar storage unavailable.');
    return response.status===204?[]:response.json();
   };
   const connection=async(user,provider)=> (await db('simpledo_calendar_connections','GET',{user_id:'eq.'+user,provider:'eq.'+provider}))[0];
   const access=async(user,provider)=>{
    let row=await connection(user,provider);if(!row)throw Error('Connect this calendar in Settings.');
    let tokens=await decipher(key,row.token_cipher,user+':'+provider);
    if(tokens.expires<Date.now()+60000) {
     if(!tokens.refresh)throw Error('Reconnect this calendar in Settings.');
     const next=await exchange(provider,{grant_type:'refresh_token',refresh_token:tokens.refresh},env,fetcher);
     next.refresh=next.refresh||tokens.refresh;
     const encrypted=await cipher(key,next,user+':'+provider);
     const updated=await db('simpledo_calendar_connections','PATCH',{user_id:'eq.'+user,provider:'eq.'+provider,token_cipher:'eq.'+row.token_cipher},{token_cipher:encrypted,updated_at:new Date().toISOString()});
     if(updated.length){tokens=next;row=updated[0];}else{row=await connection(user,provider);if(!row)throw Error('Calendar disconnected.');tokens=await decipher(key,row.token_cipher,user+':'+provider);}
    }
    return {row,token:tokens.access};
   };
   const callback=project+'/functions/v1/calendars/callback';
   if(request.method==='GET'&&url.pathname.endsWith('/callback')) {
    const redirect=new URL(frontend);redirect.searchParams.set('calendar','failed');
    try {
     const state=url.searchParams.get('state');if(!state||state.length!==43)throw Error('Invalid OAuth state.');
     // DELETE ... RETURNING makes a state single-use even for simultaneous callbacks.
     const states=await db('simpledo_calendar_oauth','DELETE',{state_hash:'eq.'+await hash(state),expires_at:'gt.'+new Date().toISOString()});
     const stateRow=states[0];if(!stateRow||url.searchParams.has('error'))throw Error('Calendar consent expired or declined.');
     const code=url.searchParams.get('code');if(!code||code.length>4096)throw Error('Invalid OAuth response.');
     const verifier=await decipher(key,stateRow.verifier_cipher,stateRow.user_id+':'+stateRow.provider+':oauth');
     const tokens=await exchange(stateRow.provider,{grant_type:'authorization_code',code,redirect_uri:callback,code_verifier:verifier},env,fetcher);
     const old=await connection(stateRow.user_id,stateRow.provider);
     if(!tokens.refresh&&old)tokens.refresh=(await decipher(key,old.token_cipher,stateRow.user_id+':'+stateRow.provider)).refresh;
     if(!tokens.refresh)throw Error('Offline calendar access was not granted.');
     const record={user_id:stateRow.user_id,provider:stateRow.provider,token_cipher:await cipher(key,tokens,stateRow.user_id+':'+stateRow.provider),updated_at:new Date().toISOString()};
     if(old)await db('simpledo_calendar_connections','PATCH',{user_id:'eq.'+stateRow.user_id,provider:'eq.'+stateRow.provider},record);
     else await db('simpledo_calendar_connections','POST',{},record);
     redirect.searchParams.set('calendar','connected');
    }catch(_){/* Never return provider messages, authorization codes or tokens. */}
    return new Response(null,{status:303,headers:{Location:redirect.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
   }
   if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
   const authorization=request.headers.get('Authorization')||'';
   if(!authorization.startsWith('Bearer '))return reply({error:'Sign in to connect calendars.'},401);
   const auth=await fetcher(project+'/auth/v1/user',{headers:{apikey:secret,Authorization:authorization},signal:AbortSignal.timeout(15000)});
   if(!auth.ok)return reply({error:'Sign in again to manage calendars.'},401);
   const user=(await auth.json()).id;if(typeof user!=='string')return reply({error:'Invalid session.'},401);
   const raw=await request.text();if(raw.length>10000)return reply({error:'Request too large.'},413);
   let body;try{body=JSON.parse(raw);}catch(_){return reply({error:'Invalid request.'},400);}
   if(body.action==='status') {
    const rows=await db('simpledo_calendar_connections','GET',{user_id:'eq.'+user,select:'provider,selected'});
    return reply({providers:['outlook','google'].map(provider=>({provider,configured:Boolean(env((provider==='outlook'?'OUTLOOK':'GOOGLE')+'_CLIENT_ID')&&env((provider==='outlook'?'OUTLOOK':'GOOGLE')+'_CLIENT_SECRET')),connected:rows.some(r=>r.provider===provider),selected:rows.find(r=>r.provider===provider)?.selected||[]}))});
   }
   const provider=body.provider;if(!['outlook','google'].includes(provider))return reply({error:'Unsupported calendar provider.'},400);
   if(body.action==='connect') {
    const state=random(),verifier=random(),config=providerConfig(provider,env);
    await db('simpledo_calendar_oauth','DELETE',{expires_at:'lt.'+new Date().toISOString()});
    await db('simpledo_calendar_oauth','DELETE',{user_id:'eq.'+user,provider:'eq.'+provider});
    await db('simpledo_calendar_oauth','POST',{}, {state_hash:await hash(state),user_id:user,provider,verifier_cipher:await cipher(key,verifier,user+':'+provider+':oauth'),expires_at:new Date(Date.now()+600000).toISOString()});
    const target=new URL(config.authorize);
    Object.entries({client_id:config.clientId,redirect_uri:callback,response_type:'code',scope:SCOPES[provider],state,code_challenge:await hash(verifier),code_challenge_method:'S256',...(provider==='google'?{access_type:'offline',prompt:'consent'}:{response_mode:'query',prompt:'select_account'})}).forEach(([k,v])=>target.searchParams.set(k,v));
    return reply({url:target.href});
   }
   if(body.action==='disconnect') {
    const row=await connection(user,provider);
    await db('simpledo_calendar_connections','DELETE',{user_id:'eq.'+user,provider:'eq.'+provider});
    await db('simpledo_calendar_oauth','DELETE',{user_id:'eq.'+user,provider:'eq.'+provider});
    if(provider==='google'&&row)try {
     const tokens=await decipher(key,row.token_cipher,user+':'+provider);
     await fetcher('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens.refresh||tokens.access}),signal:AbortSignal.timeout(10000)});
    }catch(_){/* Local token deletion is authoritative; user can revoke provider consent too. */}
    return reply({disconnected:true});
   }
   const {row,token}=await access(user,provider);
   if(body.action==='calendars')return reply({calendars:await listCalendars(provider,token,fetcher),selected:row.selected});
   if(body.action==='select') {
    if(!Array.isArray(body.selected)||body.selected.length>20||!body.selected.every(x=>typeof x==='string'))return reply({error:'Choose up to 20 calendars.'},400);
    const available=await listCalendars(provider,token,fetcher),ids=new Set(available.map(c=>c.id));
    if(!body.selected.every(id=>ids.has(id)))return reply({error:'Some calendars are no longer available.'},400);
    await db('simpledo_calendar_connections','PATCH',{user_id:'eq.'+user,provider:'eq.'+provider},{selected:[...new Set(body.selected)]});
    return reply({saved:true});
   }
   if(body.action==='busy') {
    const start=Date.parse(body.start),end=Date.parse(body.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>62*86400000||start<Date.now()-4*86400000||end>Date.now()+400*86400000)return reply({error:'Choose a planning range of up to 62 days within the next year.'},400);
    return reply({busy:mergeBusy(await readBusy(provider,token,row.selected,new Date(start).toISOString(),new Date(end).toISOString(),fetcher))});
   }
   return reply({error:'Unknown calendar action.'},400);
  }catch(error){return reply({error:error instanceof Error?error.message:'Calendar unavailable.'},400);}
 };
}
