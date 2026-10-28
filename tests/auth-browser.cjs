/* Real UI with a deliberately simulated Auth provider. No real emails or credentials. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const provider=`window.supabase={createClient(){
 const user={id:'fixture-owner',email:'person@example.com'},key='auth.fixture.session';let callback=()=>{};
 const read=()=>JSON.parse(localStorage.getItem(key)||'null');
 const send=(event='SIGNED_IN')=>{localStorage.setItem(key,JSON.stringify({user}));callback(event,{user});};
 window.authFixture={confirm:()=>send(),recover:()=>send('PASSWORD_RECOVERY'),calls:[]};
 const record=(name,args)=>authFixture.calls.push({name,email:args.email});
 return {auth:{onAuthStateChange(fn){callback=fn;},async getSession(){return location.search.includes('code=expired')?{error:Error('Expired link')}:{data:{session:read()}};},
 async signInWithPassword(args){record('signin',args);if(args.password==='wrong')return {error:{code:'invalid_credentials'}};send();return {data:{session:{user}}};},
 async signUp(args){record('signup',args);return {data:{session:null}};},async signInWithOtp(args){record('magic',args);return {};},
 async resetPasswordForEmail(email){record('forgot',{email});return {};},async updateUser(){record('password',{});callback('USER_UPDATED',{user});return {data:{user}};},
 async signOut(){localStorage.removeItem(key);callback('SIGNED_OUT',null);return {};}},
 rpc:async()=>({error:Error('Simulated provider has no task writes')}),from(){return {select(){return this;},eq(){return this;},gt(){return this;},order(){return this;},async limit(){return {data:[]};}};}};}};`;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/vendor/supabase.js'){res.setHeader('Content-Type','text/javascript');return res.end(provider);}
 const file=path.resolve(root,'.'+decodeURIComponent(pathname)+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};res.setHeader('Content-Type',mime[path.extname(file)]||'text/html');res.end(data);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#authTabsignin').waitFor({state:'visible'});
  await page.screenshot({path:'/tmp/simpledo-auth-desktop.png'});
  await page.getByRole('tab',{name:'Create account',exact:true}).click();await page.locator('#authEmail').fill('person@example.com');await page.locator('#authPassword').fill('unique-fixture-password');await page.locator('#authConfirm').fill('mismatched-password');await page.locator('#authSubmit').click();assert.match(await page.locator('#authMessage').innerText(),/don’t match/);
  await page.locator('#authConfirm').fill('unique-fixture-password');await page.locator('#authSubmit').click();await page.getByText(/Check your email to confirm/).waitFor();assert.equal(await page.locator('#authPassword').inputValue(),'');
  assert.ok(!await page.evaluate(()=>JSON.stringify(localStorage).includes('unique-fixture-password')));
  await page.evaluate(()=>authFixture.confirm());await page.locator('#authDialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('simpledo.data.v2')).owner),'fixture-owner');
  await page.reload();await page.locator('#quickTaskInput').waitFor();assert.equal(await page.locator('#authDialog').isVisible(),false,'returning session opens planner');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Set or change password'}).click();await page.locator('#authPassword').fill('replacement-fixture-password');await page.locator('#authConfirm').fill('replacement-fixture-password');await page.locator('#authSubmit').click();await page.locator('#authDialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('simpledo.data.v2')).owner),'fixture-owner');
  await page.evaluate(()=>authFixture.recover());await page.getByRole('heading',{name:'Set your password.'}).waitFor();await page.reload();await page.getByRole('heading',{name:'Set your password.'}).waitFor();
  await page.locator('#authPassword').fill('recovery-fixture-password');await page.locator('#authConfirm').fill('recovery-fixture-password');await page.locator('#authSubmit').click();await page.locator('#authDialog').waitFor({state:'hidden'});
  const mobile=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),phone=await mobile.newPage();await phone.goto(base);await phone.locator('#authTabsignin').waitFor({state:'visible'});await phone.screenshot({path:'/tmp/simpledo-auth-mobile.png'});
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await phone.setViewportSize({width:375,height:667});await phone.locator('#authTabsignup').click();assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await phone.locator('#authTabsignup').press('ArrowLeft');await phone.locator('#authEmail').waitFor({state:'visible'});
  await phone.locator('#authEmail').fill('person@example.com');await phone.locator('#authPassword').fill('wrong');await phone.locator('#authSubmit').click();await phone.getByText(/Email or password isn’t correct/).waitFor();assert.equal(await phone.locator('#authPassword').inputValue(),'');
  await phone.locator('#authForgot').click();await phone.locator('#authSubmit').click();await phone.getByText(/If this email can receive/).waitFor();
  await phone.locator('#authBack').click();await phone.locator('#authMagic').click();await phone.locator('#authSubmit').click();await phone.getByText(/If this email can receive/).waitFor();
  await phone.locator('#authLocal').click();await phone.reload();assert.equal(await phone.locator('#authDialog').isVisible(),false);
  await phone.goto(base+'?code=expired');await phone.getByText(/could not be opened/).waitFor();assert.equal(new URL(phone.url()).search,'');
  await phone.locator('#authLocal').click();
  await phone.locator('#quickTaskInput').fill('Keep my local task');await phone.locator('#quickAddForm button[type=submit]').click();
  await phone.getByRole('button',{name:'Settings',exact:true}).click();await phone.locator('#openAccount').click();await phone.locator('#authEmail').fill('person@example.com');await phone.locator('#authPassword').fill('unique-fixture-password');await phone.locator('#authSubmit').click();await phone.getByRole('heading',{name:'Keep everything.'}).waitFor();
  assert.equal(await phone.evaluate(()=>JSON.parse(localStorage.getItem('simpledo.data.v2')).owner),null);
  await phone.locator('#authLocal').click();assert.equal(await phone.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('simpledo.data.v2')).records).filter(r=>!r.deleted)[0].task.title),'Keep my local task');
  await phone.getByRole('button',{name:'Settings',exact:true}).click();await phone.locator('#enableSync').click();assert.equal(await phone.evaluate(()=>JSON.parse(localStorage.getItem('simpledo.data.v2')).owner),'fixture-owner');
  assert.deepEqual(errors,[]);await mobile.close();await context.close();
  console.log('PASS: welcome desktop/mobile, tabs, signup/confirmation fixtures, password login/errors/setup/recovery, refresh persistence, neutral emails, explicit merge/local consent and password clearing. Auth provider simulated.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
