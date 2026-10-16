const {test}=require('node:test'),assert=require('node:assert/strict');
const uuid='00000000-0000-4000-8000-000000000001';
const jpeg=Buffer.from([255,216,255,192,0,11,8,0,100,0,100,1,1,17,0,255,217]).toString('base64');
const envData={SIMPLEDO_APP_URL:'https://simpledo.example/app/',SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SIMPLEDO_OCR_ENABLED:'true',GOOGLE_VISION_API_KEY:'private-vision-key'};
async function setup(override={},reserve='reserved',vision){const {createHandler}=await import('../supabase/functions/capture-scan/handler.mjs');const calls=[];const fetcher=async(url,options={})=>{url=String(url);calls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json({id:uuid});if(url.includes('/rpc/'))return Response.json(reserve);if(vision instanceof Error)throw vision;return Response.json(vision||{responses:[{fullTextAnnotation:{pages:[]}}]});};return {calls,handler:createHandler(name=>({...envData,...override})[name],fetcher)};}
function req(body,auth=true,origin='https://simpledo.example'){return new Request('https://db.example/functions/v1/capture-scan',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer user-jwt'}:{})},body:JSON.stringify(body)});}
test('scan disabled by default and needs verified session/origin; status never contacts provider',async()=>{
 const {handler,calls}=await setup({SIMPLEDO_OCR_ENABLED:''});assert.equal((await handler(req({action:'scan',requestId:uuid,image:jpeg}))).status,503);assert.equal(calls.length,1);
 assert.equal((await handler(req({action:'status'},false))).status,401);assert.equal((await handler(req({action:'status'},true,'https://bad.example'))).status,403);
 const response=await handler(req({action:'status'}));assert.deepEqual(await response.json(),{available:false});assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('validation and limits fail closed before any paid request; duplicates never retry Google',async()=>{
 for(const image of ['bad',Buffer.from('<svg>bad</svg>').toString('base64')]){const {handler,calls}=await setup();assert.equal((await handler(req({action:'scan',requestId:uuid,image}))).status,400);assert.equal(calls.length,1);}
 for(const [reserve,status] of [['global',429],['user',429],['duplicate',409]]){const {handler,calls}=await setup({},reserve);const response=await handler(req({action:'scan',requestId:uuid,image:jpeg}));assert.equal(response.status,status);assert.equal(calls.length,2);}
});
test('scan makes exactly one authenticated server-only Vision call and returns structured confidence',async()=>{
 const vision={responses:[{fullTextAnnotation:{pages:[{blocks:[{paragraphs:[{words:[{confidence:.62,symbols:[{text:'Mow'},{text:' ',property:{detectedBreak:{type:'SPACE'}}},{text:'lawn',property:{detectedBreak:{type:'LINE_BREAK'}}}]}]}]}]}]}}]};
 const {handler,calls}=await setup({},'reserved',vision),response=await handler(req({action:'scan',requestId:uuid,image:jpeg}));assert.equal(response.status,200);assert.equal(calls.length,3);
 assert.equal(calls[2].options.headers['x-goog-api-key'],'private-vision-key');assert.equal(calls[2].url,'https://vision.googleapis.com/v1/images:annotate');const body=JSON.parse(calls[2].options.body);assert.equal(body.requests.length,1);assert.deepEqual(body.requests[0].features,[{type:'DOCUMENT_TEXT_DETECTION'}]);const result=await response.json();assert.equal(result.lines[0].confidence,.62);assert.equal(JSON.stringify(result).includes('private-vision-key'),false);
});
test('network/provider errors are private and never retried, even with request contents in exception',async()=>{
 const {handler,calls}=await setup({},'reserved',Error('private-vision-key image content'));const response=await handler(req({action:'scan',requestId:uuid,image:jpeg}));assert.equal(response.status,503);assert.equal(calls.length,3);assert.doesNotMatch(await response.text(),/private-vision-key|image content/);
 const {linesFromVision}=await import('../supabase/functions/capture-scan/vision.mjs');assert.throws(()=>linesFromVision({responses:[{error:{message:'secret'}}]}),/Recognition failed/);assert.deepEqual(linesFromVision({responses:[{}]}),[]);
});
test('JPEG dimensions and bounded streamed bodies reject oversized or malformed uploads',async()=>{
 const {jpegDimensions,limitedText}=await import('../supabase/functions/capture-scan/vision.mjs');assert.deepEqual(jpegDimensions(Buffer.from(jpeg,'base64')),{width:100,height:100});assert.throws(()=>jpegDimensions(Buffer.from('bad')),/JPEG/);const large=Buffer.from(jpeg,'base64');large[7]=12;assert.throws(()=>jpegDimensions(large),/Resize/);await assert.rejects(limitedText(new Request('https://example.com',{method:'POST',body:'12345'}),4),/too large/);
});
