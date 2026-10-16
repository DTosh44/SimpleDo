# SimpleDo

**Plan it. Forget it. Do it.** A quiet, minimal task planner, with local backups, optional Supabase account sync and calendar-aware capacity planning.

[Open SimpleDo](https://dtosh44.github.io/SimpleDo/)

Plain HTML, CSS and JavaScript, with a locally bundled official Supabase client. No production build step, trackers or required account. Black and white with restrained striped colour accents.

## Everyday use

- Inbox quick capture and bulk `.json`, `.md` and `.txt` import
- 30-day planner, extending to 365 days; desktop drag-and-drop scheduling
- Today, One task, Main Thing, search, editing and completion
- Unfinished past tasks return to Inbox
- Per-task focus duration and a browser-local Pomodoro timer, including the browser-tab countdown (paused/finished states and normal-title restoration)
- Optional task duration estimates, working hours, quiet daily capacity bars and scheduling suggestions
- Single optional tags: Work, Home and custom colour-labelled tags, with a discreet filter
- Optional read-only Outlook/Microsoft 365 and Google Calendar connections
- Discreet Settings with backup export/restore, account controls, working hours and calendars

Tasks are saved on this device first. After one successful online load over HTTPS (or localhost), a service worker caches the app shell for offline reopening. Local tasks, backups, restoring and focus timers work offline. Running timers never sync between devices. Browser storage is not permanent archival storage: keep downloaded backups somewhere safe, especially before clearing browser data or switching devices.

## Simple tags

Each task can have **one optional tag**. Work uses a blue dot and Home an orange dot, always with a visible text label. Existing tasks remain untagged. Choose a tag in the task editor or leave **No tag**; quick capture stays unchanged. The **Show** filter applies to Inbox, Planner, Today and One task, together with search.

In **Settings → Tags**, create, rename, recolour or delete custom tags. Colours come from the existing blue, orange, pink, purple, mustard and grey palette. Work and Home are fixed defaults. Custom tags use stable IDs, so renaming updates their labels without changing task identity. Deletion removes the label and filter option while keeping every associated task. A removed tag retains its capacity classification; choose **No tag** explicitly in the editor to clear that association and return to the untagged working-hours rule.

Home tasks do **not** consume working-hours capacity. Custom tags default to **Separate from working hours**; choose **Use working hours** when appropriate. Untagged tasks retain the existing working-hours rule. The day indicator lists separate estimates as **other time**, without claiming that personal availability has been configured. Separate-time tasks receive no work-hours scheduling recommendation. Capacity always includes all tasks in the relevant availability group, regardless of the current display filter. Separate availability rules for Home/personal time can be added later without changing task IDs or tag identities.

Tag assignments and custom definitions are saved locally, included in backups and synchronised when configured. Run [`supabase/003_tags.sql`](supabase/003_tags.sql) in the same Supabase project's SQL editor after `001_tasks.sql` to enable custom-tag metadata sync. The new table has owner-only RLS and a revision-checked write function. If the migration is missing or tag sync fails, task sync still runs and tag edits stay queued locally. Actual live Supabase tag sync remains unverified; local simulated two-device and PostgreSQL tests cover it.

Backup **Merge** keeps existing tag definitions/deletions and adds missing IDs; **Replace** restores the backup's custom definitions when present. Re-importing does not duplicate tags. Older backups without tag metadata remain valid. Deletion history prevents an offline stale rename from resurrecting a removed tag. Simultaneous metadata edits use the current server version on conflict; associated tasks are never deleted. When a definition has not arrived yet, its task shows **Tag unavailable** until metadata sync succeeds.

## Capacity planning and calendars

Capacity works without an account. In **Settings → Working hours**, edit each weekday, its hours and optional break. Defaults are Monday–Friday, 09:00–17:00 with a 12:30–13:30 lunch. Choose an IANA time zone such as `Europe/London`; add specific dates off if needed. Hours must start and end on the same day. Settings save locally on this device and are included in backup exports.

When creating or editing a task, **Estimated time** is optional: 15m, 30m, 1h, 2h or custom (1–10,080 minutes). This is the total expected task duration, independent of the Pomodoro/focus duration. Quick capture stays unchanged. Existing tasks remain unestimated until you choose a duration.

Each planner day shows working time occupied by meetings, scheduled task estimates and estimated free time. Overlapping busy periods are counted once, only within working hours and outside breaks. Busy all-day/out-of-office events can remove a day's capacity. Completed work/untagged tasks still count toward that day's estimated working time; Home and separate-time tags are listed as other time; tasks without durations appear separately as **unestimated**. These are whole-day estimates, not a claim that all free time is one continuous slot or that today's earlier hours are still available.

When the chosen day has insufficient estimated room, the editor suggests the first later day with enough capacity, searching the following 30 days. **Use suggested day** changes the chosen date only when clicked. Saving or dragging to a full day or a day off is always allowed; guidance never automatically moves a task. Without a calendar, suggestions explicitly use working hours only. With connected calendars, recommendations avoid dates outside freshly cached availability.

**Calendar setup requires a Supabase backend and provider registrations.** See the complete [Outlook, Google Calendar and backend instructions](docs/calendar-setup.md), including SQL migration, OAuth scopes, encrypted token storage, Edge Function deployment, disconnect behavior and live acceptance tests. Frontend provider tokens and client secrets are never required. Calendar events never become SimpleDo tasks.

Availability refreshes about every 15 minutes while visible and on return/reconnect. Only busy intervals and their coverage/timestamp are cached. Offline or failed refreshes are labelled as potentially outdated; unavailable dates are identified. Calendar connections, selected calendars and cached busy intervals are excluded from task backups. Signing out clears calendar availability from the browser; working hours remain local. Working hours are **not cloud-synchronised** in this version; estimates are part of the existing synced task payload.

## Back up and restore now — no Supabase needed

1. Open **Settings → Export backup**.
2. Save `SimpleDo-Backup-YYYY-MM-DD.json` somewhere safe.
3. To restore, choose **Settings → Import backup** and select that file.
4. **Merge with existing tasks** adds missing IDs. Existing task versions, custom tags, working hours and known deletions win. Importing the same file repeatedly does not duplicate tasks.
5. **Replace existing tasks** restores the backup's task list. Working hours and custom tags from the backup are restored when present. You must check the explicit replacement warning. When sync is enabled, removals also sync to your account.

The backup includes all live tasks, IDs, names, notes, dates, completion, Main Thing, focus duration, estimated duration, timestamps and other task fields, plus working-hours settings and custom tag definitions (including deletion history). It excludes login tokens and running timer sessions. An intentionally deleted task can be restored from a backup using **Replace**; **Merge** respects deletion history. Invalid files are rejected before replacement. The separate **Inbox → Import tasks** remains an append-only list importer; it is not a full restore.

Before restoring or joining a different account, SimpleDo saves a local recovery copy. **Settings → Download recovery data** downloads that copy, the current saved data and the original pre-upgrade data, where available. To restore a recovery copy, extract the JSON object stored in `beforeRestore` and import it using **Import backup**. `preUpgrade` is the untouched original array; it can be wrapped as `{"app":"SimpleDo","version":1,"tasks":[...]}` for restore. Recovery downloads are private; do not commit or share them publicly. Only the latest pre-restore/account-merge snapshot is retained in this browser.

### Existing users upgrading

The `simpledo.tasks.v1` key is never deleted or overwritten by this upgrade. Its exact original bytes are copied to `simpledo.preUpgrade.v1` before migration to `simpledo.data.v2`. The new envelope stores task data, account binding, server revisions and durable pending edits/deletion tombstones in one atomic local-storage write. Unknown task fields are retained. If stored data cannot be read, the app preserves it, displays an error and prevents task edits instead of seeding replacement samples. Download recovery data before troubleshooting. Close old SimpleDo tabs and reload before editing after an upgrade; the old version only knows the old storage key.

Export a fresh backup immediately after upgrading on each device. Browser storage belongs to the exact site origin and browser profile: use the existing GitHub Pages URL to retain access to your current tasks.

## Enable optional Supabase sync

Cloud configuration is intentionally empty in `config.js`. Until configured, SimpleDo remains a fully local app and Settings explains that cloud is unavailable. Do not describe a deployed instance as cloud-tested until the live checks below pass.

1. Create a Supabase project in your own account.
2. In **SQL Editor**, run the complete contents of [`supabase/001_tasks.sql`](supabase/001_tasks.sql). It creates the task table, enables Row Level Security, grants authenticated users access to their own rows, and exposes a revision-checked write function. Anonymous reads/writes and direct client writes are denied. Also run [`supabase/003_tags.sql`](supabase/003_tags.sql) for custom-tag metadata sync. Keep deletion tombstones; do not purge rows, reset revisions or replace this migration with unrestricted insert/update policies.
3. In **Authentication → Providers**, enable **Email** and allow new users to sign up. Keep the standard magic-link confirmation URL in the email template. The app requests a passwordless link using Supabase's official SDK and uses PKCE with persisted sessions and automatic token refresh. Open each link in the same browser/profile/device that requested it, so the stored PKCE verifier is available. Request a separate link on each device. [Supabase email sign-in documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless) and [PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
4. In **Authentication → URL Configuration**, set **Site URL** to `https://dtosh44.github.io/SimpleDo/` and add that exact URL to **Redirect URLs**. For local testing, also allow your exact localhost URL, for example `http://localhost:8000/`. If you use a custom domain, allow its actual app URL too.
5. Configure a production SMTP provider in **Authentication → SMTP Settings** for dependable email delivery. Review your project's email rate limits and test signup with your own email address.
6. Find the **Project URL** and **publishable key** in the project's API settings/connect dialog. In `config.js`, set `supabaseUrl` to that URL and `supabasePublicKey` to the publishable key (`sb_publishable_…`). The legacy public `anon` key is also supported. These two values are intentionally public. **Never use a secret key (`sb_secret_…`), service-role key, database password or other private credential in browser code.** [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
7. Commit the public configuration and publish the files to GitHub Pages. Reload the app online on both devices.
8. Open **Settings → Account**, enter your email and choose **Send sign-in link**. Open the email link in the same browser. Signing in does not upload, remove or replace local tasks.
9. On first sign-in to an account on this browser, choose **Merge and enable sync**. A local recovery checkpoint is saved first. **Keep local** leaves sync paused; reopen Settings to enable it later.
10. Repeat on your other devices with the same email. When connected and the page is visible, changes reconcile automatically about every five seconds, and after local edits, reconnects and returning to the app.

Signing out leaves local tasks and queued changes on this device. Signing back into the same account resumes sync. Joining a different account requires explicit merge consent and can copy the browser's visible tasks into that account; sign-out is not a private-data wipe. Use a separate browser profile for separate accounts on shared computers.

### Conflict and offline behavior

Changes save locally before upload. The queue survives refreshes and offline reopening; reconnecting retries it. Server-assigned per-task revisions prevent stale devices from silently overwriting newer cloud versions. Requests are idempotent when a response is lost.

When edits conflict, the cloud version stays at its original ID and a different local edit is retained as a new task labelled **Recovered edit**. A stale deletion cannot erase a newer cloud edit. If an edit conflicts with a cloud deletion, the original ID stays deleted and the local edit becomes a recovered task. Review recovered copies and remove whichever version you do not need. Updates received while a task editor is open also preserve the form's version as a recovered task when necessary. Full task records are reconciled, rather than attempting to merge individual text fields.

Only task data and focus **preferences** sync. Active countdowns, pause/resume state and break sessions stay in `simpledo.focusSession.v1` on this browser. Cloud errors leave local tasks usable and show a status/error in Settings. If local saving fails, export a backup before closing; sync pauses to protect unsaved work.

## GitHub Pages and local development

In **GitHub repository Settings → Pages**, choose **Deploy from a branch**, **main**, **/(root)**. All asset URLs are relative to support the `/SimpleDo/` project path. No server, secrets or build is required. Keep `config.js` present even when cloud is disabled. Serve the repository locally with `python3 -m http.server 8000`, then open `http://localhost:8000/`. Direct `file://` opening does not support service workers and is unsuitable for authentication testing.

The service worker caches only the local app shell; it does not cache auth callback URLs, account API responses or user backups. Browser-local task storage and Supabase account storage remain separate from the public repository. When changing asset versions, update the versioned script/style URLs and the shell cache/files in `sw.js` together.

## Tests and verification

Node.js 20+ is required for development tests only. The checked-in `pnpm-lock.yaml` supports reproducible installs using `pnpm install --frozen-lockfile`; npm also works with the pinned direct dependencies:

```sh
npm install
npx playwright install chromium
npm test
npm run test:database
npm run test:browser
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` may select an installed Chromium/Chrome executable. Tests use synthetic tasks, ephemeral browser profiles and a temporary local server. No private tasks or credentials are checked in.

Validated in this implementation:

- 52 automated tests cover capacity/DST, provider adapters, OAuth and encrypted tokens, offline calendar caching, account switches, estimate/working-hours/tag backups, tag rename/delete and offline tag sync, and the existing storage/simulated sync cases: migration, corruption preservation, backup validation, duplicate merges, replacement checkpoints, storage failure, offline edits/deletions, conflict recovery, in-flight changes, stale responses, browser-tab edits and account consent
- Actual PostgreSQL migration and RLS/permission tests in PGlite: per-account isolation, denied anonymous/direct writes, revision comparisons, idempotent retries and deletion tombstones; custom tags are isolated per account and direct writes are denied; calendar token/state tables deny both anonymous and signed-in browser roles
- Headless Chrome: JSON download/restore, repeat import, replace confirmation, recovery copy, existing Inbox importer, focus duration/timer, offline reload and capture, desktop and 390px mobile layouts, working-hour editing, optional date suggestions, dragging onto a day off, tag creation/filtering/rename/delete and tagged offline reopening

**Not yet validated against live calendars or a live Supabase project:** real Outlook/Google OAuth, provider event accuracy and refresh-token renewal, physical iPhone/Safari behavior, plus real email delivery, deployed SDK authentication/token renewal, actual multi-device network behavior. PGlite and the simulated sync server do not replace these acceptance checks.

Before considering cloud setup complete:

1. On an iPhone and computer, export a local backup, sign into the same account and explicitly merge each device's tasks. Confirm both sets remain.
2. Create, edit, schedule, prioritise, complete and delete tasks; confirm the other device updates within a few seconds while visible.
3. Change focus duration; confirm the preference syncs but starting a timer does not start one elsewhere.
4. Disconnect one device, edit/create/delete, reload offline, reconnect and confirm convergence.
5. Edit the same task differently while offline on each device. Confirm the original and a labelled recovered copy retain both edits. Test edit-versus-delete in both connection orders.
6. Leave a signed-in device idle, return after token expiry, and verify sync resumes. Test logout and relogin.
7. Use a second account in a separate browser profile; confirm no rows from the first account appear. Test with anonymous API credentials and verify task access is denied.
8. Re-import a backup twice, test replacement after exporting a safety backup, and confirm mobile controls and local timers still work.
