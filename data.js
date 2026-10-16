/* Local-first persistence and backup format. No network or auth dependency. */
(function (root) {
  'use strict';
  const KEY = 'simpledo.data.v2', LEGACY = 'simpledo.tasks.v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
  };
  const id = () => crypto.randomUUID();
  const tags = typeof module !== 'undefined' ? require('./tags.js') : root.SimpleDoTags;
  const capacity = typeof module !== 'undefined' ? require('./capacity.js') : root.SimpleDoCapacity;
  function validateTask(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t) ||
        typeof t.id !== 'string' || !t.id || t.id.length > 200 || ['__proto__','constructor','prototype'].includes(t.id) ||
        typeof t.title !== 'string' || !t.title.trim() || t.title.length > 180 ||
        (t.notes !== undefined && (typeof t.notes !== 'string' || t.notes.length > 20000)) ||
        (t.date != null && (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
          !Number.isFinite(Date.parse(t.date)) || new Date(t.date).toISOString().slice(0,10) !== t.date)) ||
        ['completed','main','rolled','demo'].some(k => t[k] !== undefined && typeof t[k] !== 'boolean') ||
        (t.tagId != null && !['work','home'].includes(t.tagId) && !tags.validId(t.tagId)) ||
        (t.capacityContext != null && !['work','outside'].includes(t.capacityContext)) ||
        (t.estimateMinutes != null && (!Number.isInteger(t.estimateMinutes) || t.estimateMinutes < 1 || t.estimateMinutes > 10080)) ||
        (t.focusMinutes != null && (!Number.isInteger(t.focusMinutes) || t.focusMinutes < 1 || t.focusMinutes > 180)) ||
        ['createdAt','updatedAt'].some(k => t[k] != null && (typeof t[k] !== 'string' || !Number.isFinite(Date.parse(t[k]))))) {
      throw new Error('Invalid task data. Your current tasks have not been replaced.');
    }
    return { notes: '', date: null, completed: false, main: false, rolled: false, demo: false, ...copy(t) };
  }
  function parseBackupDocument(source) {
    let data;
    try { data = JSON.parse(source); } catch (_) { throw new Error('This file is not valid JSON.'); }
    if (!data || data.app !== 'SimpleDo' || data.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > 10000)
      throw new Error('Choose a supported SimpleDo backup exported from Settings.');
    const tasks = data.tasks.map(validateTask);
    if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('The backup has duplicate task IDs.');
    return { tasks, tags: data.tags === undefined ? undefined : tags.validateList(data.tags), planningSettings: data.planningSettings === undefined ? undefined : capacity.validateSettings(data.planningSettings) };
  }
  function parseBackup(source) { return parseBackupDocument(source).tasks; }
  class Store {
    constructor(storage) { this.storage = storage; this.state = null; this.baseline = []; }
    read() {
      const raw = this.storage.getItem(KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (state.format !== 2 || !state.records || typeof state.records !== 'object') throw new Error('Saved data could not be read. Export the original storage before continuing.');
      for (const [key, r] of Object.entries(state.records)) {
        if (!r || validateTask(r.task).id !== key || !Number.isSafeInteger(r.version) || r.version < 0 || typeof r.deleted !== 'boolean' || typeof r.dirty !== 'boolean')
          throw new Error('Saved task data is invalid. Existing storage has been preserved.');
      }
      if (state.tagRecords !== undefined) {
        if (!state.tagRecords || typeof state.tagRecords !== 'object' || Array.isArray(state.tagRecords)) throw Error('Saved tag data is invalid.');
        for (const [id, r] of Object.entries(state.tagRecords)) if (!r || tags.validateTag(r.tag).id !== id || !Number.isSafeInteger(r.version) || r.version < 0 || typeof r.dirty !== 'boolean') throw Error('Saved tag data is invalid.');
      }
      return state;
    }
    load(seed) {
      this.state = this.read();
      if (!this.state) {
        const raw = this.storage.getItem(LEGACY);
        let tasks = seed;
        if (raw !== null) {
          // Save the exact pre-upgrade bytes before any normalisation or rollover.
          if (this.storage.getItem('simpledo.preUpgrade.v1') === null) this.storage.setItem('simpledo.preUpgrade.v1', raw);
          const old = JSON.parse(raw);
          if (!Array.isArray(old)) throw new Error('Existing tasks are unreadable; original data has been preserved.');
          tasks = old.map(validateTask);
          if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('Existing tasks have duplicate IDs; original data has been preserved.');
        }
        this.state = { format: 2, owner: null, records: {} };
        for (const task of tasks.map(validateTask)) this.state.records[task.id] = { task, deleted: false, version: 0, dirty: true };
        this.write();
      }
      return this.accept();
    }
    write() { this.storage.setItem(KEY, JSON.stringify(this.state)); }
    live() { return Object.values(this.state.records).filter(r => !r.deleted).map(r => copy(r.task)); }
    accept() { const tasks = this.live(); this.baseline = copy(tasks); return tasks; }
    refresh() { this.state = this.read() || this.state; return this.accept(); }
    commit(tasks, planningSettings, tagDefinitions) {
      const before = new Map(this.baseline.map(t => [t.id, t]));
      const after = new Map(tasks.map(t => [t.id, validateTask(t)]));
      this.state = this.read() || this.state;
      const now = new Date().toISOString();
      for (const [key, task] of after) {
        if (!same(task, before.get(key))) {
          const old = this.state.records[key];
          if (before.has(key) && old && (old.deleted || !same(old.task, before.get(key))) && !same(old.task, task)) {
            const recovered = { ...task, id: id(), conflictOf: key, recoveredAt: now, updatedAt: now };
            this.state.records[recovered.id] = { task: recovered, version: 0, dirty: true, deleted: false };
            continue;
          }
          this.state.records[key] = { task: { ...task, updatedAt: now }, version: old?.version || 0, dirty: true, deleted: false };
        }
      }
      for (const [key] of before) if (!after.has(key) && this.state.records[key]) {
        if (!same(this.state.records[key].task, before.get(key))) continue;
        this.state.records[key].deleted = true; this.state.records[key].dirty = true;
        this.state.records[key].task.updatedAt = now;
      }
      if (tagDefinitions !== undefined) this.state.tagRecords = tags.restoreRecords(this.state.tagRecords, tagDefinitions, true);
      if (planningSettings !== undefined) this.state.planningSettings = capacity.validateSettings(planningSettings);
      this.write();
      return this.accept();
    }
    updatePlanningSettings(settings) {
      this.state = this.read() || this.state;
      this.state.planningSettings = capacity.validateSettings(settings); this.write();
    }
    backup() { return { app: 'SimpleDo', version: 1, exportedAt: new Date().toISOString(), tasks: this.live(), tags: Object.values(this.state.tagRecords || {}).map(r => copy(r.tag)), ...(this.state.planningSettings ? {planningSettings:copy(this.state.planningSettings)} : {}) }; }
    checkpoint() { this.storage.setItem('simpledo.beforeRestore.v1', JSON.stringify(this.backup())); }
    restore(imported, replace, planningSettings, tagDefinitions) {
      this.refresh(); this.checkpoint();
      const next = replace ? imported : [...this.live(), ...imported.filter(t => !Object.hasOwn(this.state.records, t.id))];
      const mergedTags = tagDefinitions === undefined ? undefined : Object.values(tags.restoreRecords(this.state.tagRecords, tagDefinitions, replace)).map(r => r.tag);
      return this.commit(next, planningSettings, mergedTags);
    }
    bind(owner) {
      this.refresh(); this.checkpoint();
      // A different account receives a fresh merge only after explicit consent.
      if (this.state.owner !== owner) {
        this.state.records = Object.fromEntries(this.live().map(task => [task.id, {task, version:0, deleted:false, dirty:true}]));
        this.state.tagRecords = Object.fromEntries(Object.entries(this.state.tagRecords || {}).map(([id, r]) => [id, {...r, version:0, dirty:true}]));
        this.state.owner = owner; this.write();
      }
      return this.accept();
    }
    pending() { this.refresh(); return Object.entries(this.state.records).filter(([,r]) => r.dirty).map(([key,r]) => [key,copy(r)]); }
    receive(row, sent = null) {
      this.state = this.read() || this.state;
      const old = this.state.records[row.id];
      // Preserve edits made while the request was in flight, rebasing them on its result.
      if (old && row.revision < old.version) return this.accept();
      if (sent && old && !same(old, sent) && !row.conflict) {
        old.version = row.revision; this.write(); return this.accept();
      }
      if (old?.dirty && !sent) return this.accept();
      const task = validateTask(row.payload);
      const local = old || sent;
      if (sent && row.conflict && local && !local.deleted && (row.deleted || !same(local.task, task))) {
        const recovered = { ...copy(local.task), id: id(), conflictOf: row.id, recoveredAt: new Date().toISOString() };
        this.state.records[recovered.id] = {task: recovered, deleted:false, dirty:true, version:0};
      }
      const next = {task, version:row.revision, deleted:row.deleted, dirty:false};
      if (same(old, next)) return this.accept();
      this.state.records[row.id] = next;
      this.write(); return this.accept();
    }
  }
  const api = { Store, parseBackup, parseBackupDocument, validateTask, same, KEY };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SimpleDoData = api;
})(globalThis);
