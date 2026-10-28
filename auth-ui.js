/* Authentication presentation only. Passwords never enter task storage or backups. */
(function(root){
 'use strict';
 class Welcome {
  constructor(controller){
   this.controller=controller;this.$=id=>document.getElementById(id);this.dialog=this.$('authDialog');this.mode='signin';this.busy=false;
   this.$('authForm').onsubmit=event=>{event.preventDefault();this.submit();};
   for(const mode of ['signin','signup'])this.$('authTab'+mode).onclick=()=>this.open(mode);
   this.$('authForgot').onclick=()=>this.open('forgot');
   this.$('authMagic').onclick=()=>this.open('magic');
   this.$('authBack').onclick=()=>this.open('signin');
   this.$('authLocal').onclick=()=>controller.local();
   this.$('authMerge').onclick=()=>controller.enable();
   this.$('authShowPassword').onclick=()=>{
    const input=this.$('authPassword'),show=input.type==='password';input.type=show?'text':'password';
    this.$('authShowPassword').textContent=show?'Hide':'Show';this.$('authShowPassword').setAttribute('aria-pressed',String(show));
   };
   this.dialog.addEventListener('cancel',event=>{event.preventDefault();if(!this.busy)controller.local();});
   this.dialog.addEventListener('close',()=>this.clearPasswords());
  }
  clearPasswords(){for(const id of ['authPassword','authConfirm'])this.$(id).value='';this.$('authPassword').type='password';this.$('authShowPassword').textContent='Show';this.$('authShowPassword').setAttribute('aria-pressed','false');}
  message(text,error=false){this.$('authMessage').textContent=text;this.$('authMessage').setAttribute('role',error?'alert':'status');this.$('authMessage').classList.toggle('is-error',error);}
  open(mode='signin'){
   this.mode=mode;this.clearPasswords();this.message('');
   const titles={signin:'Welcome back.',signup:'A little more organised.',forgot:'Forgot your password?',magic:'A link. Then you’re in.',password:'Set your password.',merge:'Keep everything.'};
   const descriptions={signin:'Sign in to pick up where you left off.',signup:'Create your account. Keep your days in sync.',forgot:'We’ll email a link to reset it safely.',magic:'Prefer no password? We’ll email a sign-in link.',password:'Use a unique password with at least 12 characters.',merge:'This device has local work. Choose how to continue.'};
   this.$('authHeading').textContent=titles[mode]||'Opening your planner…';this.$('authDescription').textContent=descriptions[mode]||'Your tasks stay safely on this device.';
   this.$('authTabs').hidden=!['signin','signup'].includes(mode);
   for(const tab of ['signin','signup']){this.$('authTab'+tab).setAttribute('aria-selected',String(mode===tab));this.$('authTab'+tab).tabIndex=mode===tab?0:-1;}
   // Arrow keys keep the tab control usable without a pointer.
   this.$('authTabs').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'signin':event.key==='End'?'signup':this.mode==='signin'?'signup':'signin';this.open(next);this.$('authTab'+next).focus();}};
   const form=!['loading','merge'].includes(mode),password=['signin','signup','password'].includes(mode),confirm=['signup','password'].includes(mode);
   this.$('authForm').hidden=!form;this.$('authEmailField').hidden=mode==='password';this.$('authEmail').required=form&&mode!=='password';
   this.$('authPasswordField').hidden=!password;this.$('authPassword').required=password;this.$('authPassword').minLength=mode==='signin'?1:12;
   this.$('authPassword').autocomplete=mode==='signin'?'current-password':'new-password';this.$('authPasswordHint').hidden=!confirm;this.$('authConfirmField').hidden=!confirm;this.$('authConfirm').required=confirm;
   this.$('authSubmit').textContent={signin:'Sign in',signup:'Create account',forgot:'Send reset link',magic:'Send sign-in link',password:'Save password'}[mode]||'Continue';
   this.$('authAlternatives').hidden=mode!=='signin';this.$('authBack').hidden=!['forgot','magic'].includes(mode);this.$('authMergePanel').hidden=mode!=='merge';
   this.$('authLocal').textContent=mode==='merge'?'Keep local for now':mode==='password'?'Continue without changing password':'Continue without an account';
   if(mode==='merge')this.$('authMergeDescription').textContent=this.controller.store.live().length+' tasks, plus any tags and local history on this device, will be kept and safely merged with '+this.controller.user.email+'. Nothing will be replaced. Switching accounts copies visible local tasks to the selected account.';
   this.$('settingsDialog').close();
   if(!this.dialog.open)this.dialog.showModal();
   if(form)this.$(mode==='password'?'authPassword':'authEmail').focus();
  }
  close(){this.dialog.close();this.clearPasswords();}
  async submit(){
   if(this.busy)return;
   const mode=this.mode,password=this.$('authPassword').value,email=this.$('authEmail').value.trim();
   if(['signup','password'].includes(mode)&&password!==this.$('authConfirm').value){this.message('Your passwords don’t match. Please try again.',true);return;}
   this.busy=true;this.dialog.setAttribute('aria-busy','true');
   for(const control of this.dialog.querySelectorAll('button,input'))control.disabled=true;
   this.message('One moment…');
   try{await this.controller.authenticate(mode,email,password);}
   catch(error){this.message(this.controller.authError(error),true);}
   finally{this.busy=false;this.dialog.removeAttribute('aria-busy');for(const control of this.dialog.querySelectorAll('button,input'))control.disabled=false;this.clearPasswords();}
  }
 }
 root.SimpleDoAuth={Welcome};
})(globalThis);
