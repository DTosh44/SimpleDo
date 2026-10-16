/* Official Supabase auth; durable local queue; server revisions, no device clocks. */
(function (root) {
  'use strict';
  class Controller {
    constructor(store, hooks) {
      this.store = store; this.hooks = hooks; this.user = null; this.allowed = false;
      this.busy = false; this.generation = 0; this.timer = null;
      this.$ = id => document.getElementById(id);
      this.$('signInForm').onsubmit = e => { e.preventDefault(); this.signIn(); };
      this.$('signOut').onclick = () => this.signOut();
      this.$('enableSync').onclick = () => this.enable();
      this.$('keepLocal').onclick = () => {
        this.$('mergeAccount').hidden = true; this.status('Saved locally');
        this.$('accountMessage').textContent = 'Sync paused. Reopen Settings to choose Merge and enable sync.';
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
        this.$('signInForm').hidden = false;
        this.client.auth.onAuthStateChange((_event, session) => {
          // Do not await Supabase calls inside the auth callback's lock.
          setTimeout(() => this.session(session), 0);
        });
        this.client.auth.getSession().then(({data, error}) => {
          if (error) this.error(error); else this.session(data.session);
        }).catch(error => this.error(error));
        window.addEventListener('online', () => this.schedule());
        window.addEventListener('offline', () => this.status(this.allowed ? 'Offline' : 'Saved locally'));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.schedule(); });
        window.addEventListener('storage', e => { if (e.key === SimpleDoData.KEY) this.schedule(); });
        this.interval = setInterval(() => { if (!document.hidden) this.schedule(); }, 5000);
      } catch (error) { this.error(error); }
    }
    status(text) { this.$('syncStatus').textContent = text; }
    error(error) {
      this.$('accountError').textContent = error.message || 'Cloud unavailable. Tasks remain on this device.';
      this.status(navigator.onLine ? 'Sync needs attention' : 'Offline');
    }
    session(session) {
      const user = session?.user || null;
      if (this.user?.id !== user?.id) this.generation++;
      this.user = user;
      this.hooks.accountChanged?.(this.client, user);
      this.allowed = Boolean(user && this.store.state.owner === user.id);
      this.$('signInForm').hidden = Boolean(user);
      this.$('signOut').hidden = !user;
      this.$('mergeAccount').hidden = !user || this.allowed;
      this.$('accountMessage').textContent = user ? 'Signed in as ' + user.email : 'Use SimpleDo locally, or sign in with an email link.';
      if (this.allowed) this.schedule(); else this.status('Saved locally');
      // Remove auth callback parameters after the SDK has exchanged the code.
      if (session && new URL(location.href).searchParams.has('code')) {
        const url = new URL(location.href); url.searchParams.delete('code'); history.replaceState({}, '', url);
      }
    }
    async signIn() {
      const button = this.$('signInForm').querySelector('button'); button.disabled = true;
      this.$('accountError').textContent = '';
      try {
        const redirect = new URL(location.href); redirect.search = ''; redirect.hash = '';
        const {error} = await this.client.auth.signInWithOtp({ email: this.$('accountEmail').value.trim(),
          options: { emailRedirectTo: redirect.href, shouldCreateUser: true } });
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
      } catch (error) { this.error(error); }
    }
    enable() {
      if (!this.user || this.hooks.canSync?.() === false) return;
      try {
        this.hooks.changed(this.store.bind(this.user.id)); this.allowed = true;
        this.$('mergeAccount').hidden = true; this.schedule();
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
          this.$('accountError').textContent = '';
          const pending = this.store.pending().length;
          this.status(pending ? 'Syncing' : 'Saved');
          if (pending) this.schedule();
        }
      } catch (error) { if (valid()) this.error(error); }
      finally { this.busy = false; }
    }
  }
  root.SimpleDoCloud = { Controller };
})(globalThis);
