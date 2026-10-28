/* Official Supabase auth; durable local queue; server revisions, no device clocks. */
(function (root) {
  'use strict';
  class Controller {
    constructor(store, hooks) {
      this.store = store; this.hooks = hooks; this.user = null; this.allowed = false;
      this.busy = false; this.generation = 0; this.timer = null;
      this.localChosen = this.preference('simpledo.localMode.v1') === 'true';
      this.$ = id => document.getElementById(id);
      this.$('signInForm').onsubmit = e => { e.preventDefault(); this.signIn(); };
      this.$('signOut').onclick = () => this.signOut();
      this.$('enableSync').onclick = () => this.enable();
      this.$('keepLocal').onclick = () => {
        this.local();
      };
      this.$('settingsButton').addEventListener('click', () => {
        if (this.user && !this.allowed) this.$('mergeAccount').hidden = false;
      });
      const config = root.SIMPLEDO_CONFIG || {};
      if (!config.supabaseUrl || !config.supabasePublicKey) {
        this.$('accountMessage').textContent = 'Cloud sync is not configured. Backups and local tasks are ready to use.';
        return;
      }
      try {
        const pageUrl = new URL(location.href);
        if (pageUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(pageUrl.hostname)) {
          throw new Error('Open https://simpledo.co.uk/ to sign in securely. Tasks remain on this device; export a backup before switching addresses.');
        }
        const url = new URL(config.supabaseUrl);
        if (url.protocol !== 'https:' || !root.supabase) throw new Error('Cloud configuration is unavailable.');
        if (config.supabasePublicKey.startsWith('sb_secret_')) throw new Error('A public Supabase key is required.');
        if (config.supabasePublicKey.split('.').length === 3) {
          const claims = JSON.parse(atob(config.supabasePublicKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
          if (claims.role !== 'anon') throw new Error('Only the public anon key may be used.');
        }
        this.client = root.supabase.createClient(url.href.replace(/\/$/, ''), config.supabasePublicKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
        });
        this.view = root.SimpleDoAuth ? new root.SimpleDoAuth.Welcome(this) : null;
        this.$('openAccount')?.addEventListener('click', () => this.view?.open('signin'));
        this.$('setPassword')?.addEventListener('click', () => this.view?.open('password'));
        this.welcome = !this.localChosen && this.store.live().length === 0;
        if (this.welcome) this.view?.open('loading');
        this.$('signInForm').hidden = false;
        if (this.$('openAccount')) this.$('openAccount').hidden = false;
        let authEvents = 0;
        this.client.auth.onAuthStateChange((event, session) => {
          authEvents++;
          // Do not await Supabase calls inside the auth callback's lock.
          setTimeout(() => { try { this.session(session, event); } catch (error) { this.initialError(error); } }, 0);
        });
        this.client.auth.getSession().then(({data, error}) => {
          if (error) this.initialError(error); else if (!authEvents) this.session(data.session);
        }).catch(error => this.initialError(error));
        window.addEventListener('online', () => this.schedule());
        window.addEventListener('offline', () => this.status(this.allowed ? 'Offline' : 'Saved locally'));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.schedule(); });
        window.addEventListener('storage', e => { if (e.key === SimpleDoData.KEY) this.schedule(); });
        this.interval = setInterval(() => { if (!document.hidden) this.schedule(); }, 5000);
      } catch (error) { this.error(error); }
    }
    status(text) { this.$('syncStatus').textContent = text; }
    preference(key, value, storage = root.localStorage) {
      try { if (value === undefined) return storage?.getItem(key); storage?.setItem(key, value); } catch (_) { /* Local use remains available. */ }
    }
    local() {
      this.localChosen = true; this.welcome = false;
      this.preference('simpledo.localMode.v1', 'true');
      this.recovering = false; this.preference('simpledo.passwordRecovery.v1', '', root.sessionStorage);
      this.view?.close(); this.$('mergeAccount').hidden = true;
      this.status(this.allowed ? (navigator.onLine ? 'Saved' : 'Offline') : 'Saved locally');
      if (this.user && !this.allowed) this.$('accountMessage').textContent = 'Sync paused. Reopen Settings to merge this device safely.';
    }
    authError(error) {
      if (error?.code === 'invalid_credentials') return 'Email or password isn’t correct. Try again, use a sign-in link, or reset your password.';
      if (error?.code === 'email_not_confirmed') return 'Confirm your email before signing in. Check the email sent when you created your account.';
      if (error?.code === 'email_address_not_authorized') return 'Email delivery isn’t configured for this address yet. Use your password or continue locally while the email sender is set up.';
      if (['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code) || error?.status === 429) return 'Too many requests. Please wait before trying again. Email delivery may be limited until the sender is configured.';
      return error?.message || 'Couldn’t connect. Your tasks are safe on this device. Please try again.';
    }
    initialError(error) {
      this.error(error);
      if (this.welcome || new URL(location.href).searchParams.has('code')) { this.view?.open('signin'); this.view?.message('This sign-in or recovery link could not be opened. Request a fresh link in this browser, or sign in with your password.', true); }
      this.cleanCallback();
    }
    cleanCallback() {
      const url = new URL(location.href);
      for (const name of ['code','error','error_code','error_description']) url.searchParams.delete(name);
      if (/access_token=|refresh_token=|error_description=/.test(url.hash)) url.hash = '';
      if (url.href !== location.href) history.replaceState({}, '', url);
    }
    redirect() { const url = new URL(location.href); url.search = ''; url.hash = ''; return url.href; }
    async authenticate(mode, email, password) {
      if (!this.client) throw Error('Cloud sign-in is unavailable. Continue locally and try again later.');
      if (['signup','password'].includes(mode) && password.length < 12) throw Error('Choose a password with at least 12 characters.');
      let result;
      if (mode === 'signin') result = await this.client.auth.signInWithPassword({email,password});
      else if (mode === 'signup') result = await this.client.auth.signUp({email,password,options:{emailRedirectTo:this.redirect()}});
      else if (mode === 'forgot') result = await this.client.auth.resetPasswordForEmail(email,{redirectTo:this.redirect()});
      else if (mode === 'magic') result = await this.client.auth.signInWithOtp({email,options:{emailRedirectTo:this.redirect(),shouldCreateUser:false}});
      else if (mode === 'password') {
        if (!this.user) throw Error('Open a fresh recovery link or sign in before setting a password.');
        const owner = this.user.id;
        result = await this.client.auth.updateUser({password});
        if (result.error) throw result.error;
        if (this.user?.id !== owner) throw Error('The account changed. Sign in again before continuing.');
        this.recovering = false; this.preference('simpledo.passwordRecovery.v1', '', root.sessionStorage);
        this.view?.close(); this.hooks.notify('Password saved. Your account and tasks are unchanged.');
        this.session({user:this.user}); return;
      } else throw Error('Choose a sign-in method.');
      if (result.error) throw result.error;
      if (mode === 'signin') this.session(result.data.session);
      else if (mode === 'signup') this.view?.message('Check your email to confirm your account. Open the link in this browser. If you already have an account, sign in or reset your password.');
      else this.view?.message('If this email can receive a link, it’s on its way. Open it in this browser on this device. Check spam too.');
    }
    error(error) {
      this.$('accountError').textContent = error.message || 'Cloud unavailable. Tasks remain on this device.';
      this.status(navigator.onLine ? 'Sync needs attention' : 'Offline');
    }
    session(session, event) {
      const user = session?.user || null;
      const changed = this.user?.id !== user?.id;
      if (changed) this.generation++;
      this.user = user;
      this.store.refresh();
      if (event === 'PASSWORD_RECOVERY' && user) this.preference('simpledo.passwordRecovery.v1', user.id, root.sessionStorage);
      this.recovering = Boolean(user && (event === 'PASSWORD_RECOVERY' || (!changed && this.recovering) || this.preference('simpledo.passwordRecovery.v1', undefined, root.sessionStorage) === user.id));
      this.hooks.accountChanged?.(this.client, user);
      this.allowed = Boolean(user && this.store.state.owner === user.id);
      this.$('signInForm').hidden = Boolean(user);
      if (this.$('accountMagicDetails')) this.$('accountMagicDetails').hidden = Boolean(user);
      this.$('signOut').hidden = !user;
      if (this.$('openAccount')) this.$('openAccount').hidden = Boolean(user);
      if (this.$('setPassword')) this.$('setPassword').hidden = !user;
      this.$('mergeAccount').hidden = !user || this.allowed;
      this.$('accountMessage').textContent = user ? 'Signed in as ' + user.email : 'Sign in or create an account to keep your tasks in sync. Local use is always available.';
      if (user && !this.allowed && !this.store.state.owner && !Object.keys(this.store.state.records).length && !Object.keys(this.store.state.tagRecords || {}).length && this.hooks.canSync?.() !== false) this.enable();
      if (this.allowed) this.schedule(); else this.status('Saved locally');
      if (user) {
        this.cleanCallback(); this.welcome = false;
        if (this.recovering) { if (!this.view?.dialog.open || this.view.mode !== 'password') this.view?.open('password'); }
        else if (this.view?.dialog.open && this.view.mode === 'password' && !changed) { /* Keep a password form open across token refreshes. */ }
        else if (!this.allowed && changed) this.view?.open('merge');
        else if (this.allowed) this.view?.close();
      } else if (this.welcome && (!this.view?.dialog.open || this.view.mode === 'loading')) this.view?.open('signin');
      const callback = new URL(location.href);
      if (!user && (callback.searchParams.has('error') || callback.hash.includes('error_description='))) {
        this.view?.open('signin'); this.view?.message('This link has expired or could not be verified. Request a new link in this browser.', true); this.cleanCallback();
      }
    }
    async signIn() {
      const button = this.$('signInForm').querySelector('button'); button.disabled = true;
      this.$('accountError').textContent = '';
      try {
        const redirect = new URL(location.href); redirect.search = ''; redirect.hash = '';
        const {error} = await this.client.auth.signInWithOtp({ email: this.$('accountEmail').value.trim(),
          options: { emailRedirectTo: redirect.href, shouldCreateUser: false } });
        if (error) throw error;
        this.$('accountError').textContent = 'Check your email. Open the link in this browser on this device.';
      } catch (error) { this.error(error); } finally { button.disabled = false; }
    }
    async signOut() {
      this.generation++; this.allowed = false;
      try {
        // Local sign-out also works offline. Queued data and account binding remain durable.
        const {error} = await this.client.auth.signOut({scope:'local'});
        if (error) throw error;
        this.session(null); this.hooks.notify('Signed out. Tasks remain on this device.');
        this.preference('simpledo.passwordRecovery.v1', '', root.sessionStorage); this.view?.open('signin');
      } catch (error) { this.error(error); }
    }
    enable() {
      if (!this.user || this.hooks.canSync?.() === false) return;
      try {
        this.hooks.changed(this.store.bind(this.user.id)); this.allowed = true;
        this.$('mergeAccount').hidden = true;
        if (!this.recovering) this.view?.close(); this.schedule();
      } catch (error) { this.error(error); }
    }
    schedule() {
      clearTimeout(this.timer);
      if (!this.allowed || this.hooks.canSync?.() === false) return;
      this.status(navigator.onLine ? 'Syncing' : 'Offline');
      this.timer = setTimeout(() => this.sync(), 250);
    }
    async sync() {
      if (this.busy || !this.allowed || !this.user || !navigator.onLine || this.hooks.canSync?.() === false) return;
      this.busy = true;
      const generation = this.generation, owner = this.user.id;
      const valid = () => this.hooks.canSync?.() !== false && generation === this.generation && this.allowed && this.user?.id === owner && this.store.read()?.owner === owner;
      try {
        this.status('Syncing');
        let tagError = null;
        if (this.hooks.tags) try {
          await this.hooks.tags.sync(this.client, owner, valid, () => this.hooks.tagsChanged?.());
        } catch (error) { tagError = error; }
        if (!valid()) return;
        for (const [id, record] of this.store.pending()) {
          if (!valid()) return;
          const {data, error} = await this.client.rpc('sync_task', {
            task_id:id, task_payload:record.task, is_deleted:record.deleted, expected_revision:record.version
          });
          if (error) throw error;
          if (!valid()) return;
          if (data.conflict) this.hooks.notify('Conflicting changes found. Any different local edit was kept as a separate task.');
          this.hooks.changed(this.store.receive(data, record));
        }
        // Full paginated reconciliation includes permanent deletion tombstones.
        let after = '';
        while (valid()) {
          const {data, error} = await this.client.from('simpledo_tasks').select('id,payload,revision,deleted')
            .eq('user_id', owner).gt('id', after).order('id').limit(500);
          if (error) throw error;
          if (!valid()) return;
          const before = this.store.live();
          for (const row of data) this.store.receive(row);
          const next = this.store.accept();
          if (!SimpleDoData.same(before, next)) this.hooks.changed(next);
          if (data.length < 500) break;
          after = data[data.length - 1].id;
        }
        if (valid()) {
          this.$('accountError').textContent = tagError ? 'Task sync is available; tag sync needs attention. Run the tags migration and check your connection.' : '';
          const pending = this.store.pending().length;
          this.status(pending ? 'Syncing' : tagError ? 'Tags need attention' : 'Saved');
          if (pending) this.schedule();
        }
      } catch (error) { if (valid()) this.error(error); }
      finally { this.busy = false; }
    }
  }
  root.SimpleDoCloud = { Controller };
})(globalThis);
