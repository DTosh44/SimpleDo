import {linesFromVision,jpegDimensions,limitedText} from './vision.mjs';
export function createHandler(env,fetcher=fetch){return async request=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 try{
  const frontend=env('SIMPLEDO_APP_URL'),project=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!frontend||!project||!secret)return reply({error:'Photo recognition has not been configured.'},503);
  const app=new URL(frontend);if(app.protocol!=='https:'&&app.hostname!=='localhost')return reply({error:'Invalid configuration.'},503);
  const origin=request.headers.get('Origin');if(origin&&origin!==app.origin)return reply({error:'Origin not allowed.'},403);
  Object.assign(headers,{'Access-Control-Allow-Origin':app.origin,Vary:'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  const authorization=request.headers.get('Authorization')||'';if(!authorization.startsWith('Bearer '))return reply({error:'Sign in to scan a list.'},401);
  const auth=await fetcher(project+'/auth/v1/user',{headers:{apikey:secret,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return reply({error:'Sign in again to scan a list.'},401);
  const user=(await auth.json()).id;if(typeof user!=='string'||!/^[a-f0-9-]{36}$/i.test(user))return reply({error:'Invalid session.'},401);
  const raw=await limitedText(request,2810000);let body;try{body=JSON.parse(raw);}catch(_){return reply({error:'Invalid request.'},400);}
  const enabled=env('SIMPLEDO_OCR_ENABLED')==='true'&&Boolean(env('GOOGLE_VISION_API_KEY'));
  if(body?.action==='status')return reply({available:enabled});
  if(!enabled)return reply({error:'Photo recognition has not been enabled. You can paste text instead.'},503);
  if(body?.action!=='scan'||typeof body.image!=='string'||body.image.length>2800000||body.image.length<16||!/^\/[a-zA-Z0-9+/]*={0,2}$/.test(body.image)||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId||''))return reply({error:'Invalid photo request.'},400);
  let binary;try{binary=Uint8Array.from(atob(body.image),c=>c.charCodeAt(0));jpegDimensions(binary);}catch(_){return reply({error:'Choose a valid JPEG resized to at most 2400 pixels per side.'},400);}
  // Include owner in hash so the same public image cannot identify other users.
  const input=new Uint8Array(36+binary.length);input.set(new TextEncoder().encode(user));input.set(binary,36);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',input)),b=>b.toString(16).padStart(2,'0')).join('');
  // Fail closed on missing migration/database errors. No automatic provider retry.
  const reserved=await fetcher(project+'/rest/v1/rpc/reserve_simpledo_scan',{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({p_user:user,p_request:body.requestId,p_hash:hash}),signal:AbortSignal.timeout(10000)});
  if(!reserved.ok)return reply({error:'Scan limits are unavailable. Try again later or paste text.'},503);
  const result=await reserved.json();if(result!=='reserved')return reply({error:result==='duplicate'?'This photo or request has already been processed. Use the existing review, or paste text.':'The scan allowance has been reached. Try later or paste text.'},result==='duplicate'?409:429);
  const response=await fetcher('https://vision.googleapis.com/v1/images:annotate',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env('GOOGLE_VISION_API_KEY')},body:JSON.stringify({requests:[{image:{content:body.image},features:[{type:'DOCUMENT_TEXT_DETECTION'}]}]}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)return reply({error:'Recognition is unavailable. Your text has been kept. Paste text or try a different photo later.'},502);
  const output=JSON.parse(await limitedText(response,2000000));return reply({lines:linesFromVision(output)});
 }catch(_){return reply({error:'Recognition could not finish. Your text has been kept. Paste text or try again later.'},503);}
};}
