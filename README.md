# SimpleDo

**Plan it. Forget it. Do it.** A quiet, minimal task planner, with local backups, optional Supabase account sync and calendar-aware capacity planning.

[Open SimpleDo](https://simpledo.co.uk/)

Production setup, verification limits, release approvals and the first-device restore checklist: [production runbook](docs/production-setup.md).

Plain HTML, CSS and JavaScript, with a locally bundled official Supabase client. No production build step, trackers or required account. Black and white with restrained, purposeful colour accents.

## Product principles and future direction

**Intent:** **Plan it. Forget it. Do it.** SimpleDo should remain a quiet, immediately understandable personal planner: capture a task, choose when it belongs, focus on what matters and see your workload without a complicated project-management workflow. Simple, usable and **not neon** are design principles, not just implementation details. All essential task management must work without an account or paid backend.

**Approved appearance and interaction direction:** white, minimal canvas with restrained colourful accents and black/neutral structure. Use **pink with white text/icons** for the New task and capture/confirmation CTAs; **orange** for Today, the active day and progress; **blue** for Planner/work scheduling; **purple** for Main Thing/focus; **muted neutral grey** for Snapshot controls. Keep the coloured full-stop and tag devices, simple day **+** buttons and clear contrast. Avoid a row of visually identical heavy black buttons or loud neon blocks. The detailed current style, tag behaviour and range-picker interactions are documented below.

**Next direction:** prioritise dependable sync/backup and real calendar-connected capacity verification, while retaining local/offline use and clear personal-versus-working-hour treatment. Future scope should improve the day-to-day task experience rather than turning SimpleDo into an enterprise PM suite. Unverified OAuth/Supabase connections must be labelled as such; do not claim they are tested live simply because integration code exists.

## Everyday use

- Inbox Type / Speak / Scan capture with editable review and optional batch tags; bulk `.json`, `.md` and `.txt` import
- 30-day planner, extending to 365 days; desktop drag-and-drop scheduling
- Today, One task, Snapshot, Main Thing, search, editing and completion
- Unfinished past tasks return to Inbox
- Per-task focus duration and a browser-local Pomodoro timer, including the browser-tab countdown (paused/finished states and normal-title restoration)
- Optional task duration estimates, working hours, quiet daily capacity bars and scheduling suggestions
- Multiple optional tags: combine Work or Home with custom colour-labelled areas, with a discreet filter
- Optional read-only Outlook/Microsoft 365 and Google Calendar connections
- Discreet Settings with backup export/restore, account controls, working hours and calendars

Tasks are saved on this device first. After one successful online load over HTTPS (or localhost), a service worker caches the app shell for offline reopening. Local tasks, backups, restoring and focus timers work offline. Running timers never sync between devices. Browser storage is not permanent archival storage: keep downloaded backups somewhere safe, especially before clearing browser data or switching devices.

## Appearance and custom tags

SimpleDo keeps its white canvas, understated typography and mostly neutral controls. Colour has a clear purpose: **pink for capturing and adding tasks (including New task, Inbox, voice/scan, Save task and list confirmation); orange for Today, the current day's marker and progress; blue for Planner, scheduled tasks and planned capacity; purple for Main Thing and One Task/deep focus; and charcoal/grey for Snapshot controls and completed task status.** The small pink dot in the wordmark remains part of the brand; page-title full stops use the active view's accent (blue Planner, dark pink Inbox, orange Today, purple One Task and neutral Snapshot). A regular Up next task uses the orange Today marker, while a designated Main Thing uses a discreet purple marker.

The global **New task** button, Inbox add and task/capture confirmation actions use a slightly deeper solid pink with **white text and icons** for readable contrast. The smaller **+** buttons within days are white, with neutral grey borders and dark-pink plus signs, rather than filled or orange-outlined. Snapshot's active Today/Week/Month/Year/Custom range remains **light grey with dark text**. Its labelled status distribution uses pink for undated/Inbox tasks, blue for scheduled tasks and grey for completed tasks. Returned tasks remain a subset of Inbox. The thin Today and focus timer progress bars are orange. Decorative multicolour stripes, extra dots beside headings and coloured page-title punctuation have been removed to give tasks more visual breathing room.

These UI changes do **not** alter saved tag colours: Work stays blue, Home stays orange, and all custom blue/orange/pink/purple/mustard/grey tags remain available.

Inbox's header now lines up with **Your days**; the Inbox no longer has an outer card, and tasks continue scrolling independently in their own column.

**Work** and **Home** are built in. To create a custom tag while editing a task, choose **+ New tag** next to the tag chips, enter a name, choose from the existing blue/orange/pink/purple/mustard/grey colour swatches and save. The unfinished task form is retained and your new tag is selected when you return. You can also create, rename, recolour and remove custom tags under **Settings → Tags**. Tasks can have multiple tags (for example Work and Marketing); Work and Home are mutually exclusive. Existing single-tag data, backups and sync remain compatible.

## Completed tasks: Inbox visibility and Today's wins

- **Settings → Completed tasks** offers **End of the day**, **48 hours**, **3 days**, **5 days**, or **Indefinitely** (the existing default). The timer starts when a task is actually checked off. End of day means midnight in the current device's local time; other options are elapsed hours.
- After the chosen period, a completed *unscheduled Inbox* task is **hidden from the active Inbox only**. The task isn't deleted: its ID, notes, tags and history are preserved in cloud sync, backups and Snapshot. Scheduled-day task display is unchanged. The Inbox badge still counts only unfinished items.
- Each new completion records `completedAt` in the ordinary task payload, preserving the timestamp across devices and backup/restore. Unticking a task clears `completedAt`; completing it again starts a new period. **Previously completed Inbox tasks without a timestamp are automatically archived from Inbox on every setting, including Indefinitely**, because no accurate finish date is available. No timestamp, artificial archived flag, tombstone or extra data migration is written.
- **Inbox → Completed history** opens a searchable list. `Hidden from Inbox` shows expired and older undated completions, `Older tasks (date unknown)` isolates pre-timestamp completions, and `All completed tasks` also includes completions still visible in Inbox and scheduled-day history. Dates are shown only when known; notes and tags remain accessible. **Reopen** marks a task incomplete using its original ID, bringing unscheduled tasks back into the Inbox; it does not create a new task. Opening, searching and viewing history never modifies task data.
- **The preference belongs to the signed-in user** and syncs across devices through `simpledo_preferences`. As soon as you sign in, changes save locally first (including while offline), then update the account on reconnect. Preference sync does not require the task-merge step; task uploads still need consent. A fresh device loads the account's existing choice instead of overwriting it with a default. Changing accounts does not copy one user's choice into another's. The preference is not in task backups, but is retained in the Supabase account. A stale offline edit cannot silently overwrite a newer cloud choice; the app displays a conflict message and retains the existing cloud setting. Migration `supabase/005_preferences.sql` is applied and verified on the hosted project as `20261028130226`. See the [release verification record](docs/preference-sync-verification.md). The frontend still requires release approval. There are no automatic task deletions or changes to task RLS.
- **Today → Today's wins** shows a small, factual summary of tasks completed on the current local calendar day, with up to three recent task names. This includes tasks checked off from Inbox or other scheduled dates, whether or not they are still visible in Inbox. It is not affected by search/tag filters and does not double count unchecked tasks. Legacy completions without dates are not assigned an invented day. Today's existing scheduled-day progress and collapsible completed tasks remain unchanged.

## Planner · Today · One task

**Planner** is the organising view: today opens expanded on a white card with a restrained orange edge; **future days with scheduled tasks also open expanded by default**, while empty days stay compact. Every scheduled task is visible without opening its day first. Use the day heading to expand/collapse it with a click, Enter or Space. Add buttons and drag destinations remain available while collapsed. The 30-day scroll and extensions to 365 days are unchanged. Open/closed choices stay in memory during the session; a reload restores the defaults. Search and tag filters initially expand days to reveal matching tasks, while retaining explicitly chosen disclosure states.

**Today** is a dedicated daily workspace, with a clear day/date heading, completed/remaining counts and a thin solid orange progress bar. The first unfinished Main Thing gets the prominent feature; otherwise the first unfinished task is honestly labelled **Up next**. Its estimate and tag remain visible, with **Start focus** and **Done** actions. Other unfinished tasks use compact rows. **Completed (n)** starts collapsed, opens on request, and lets you uncheck tasks. An expanded section stays expanded through task updates; a new day or reload resets it. Empty and all-complete days have separate quiet states. Inbox remains available in its own view and beside Planner, with its independent scrolling preserved.

Today keeps the existing tag/search filters. Progress always describes **all tasks scheduled for today**; a short note gives the displayed count when filtering. A filtered-out unfinished task never produces a false all-done message. The discreet capacity estimate reuses existing manual/calendar availability, including stale/unavailable labels and the separation of Home/personal estimates from work hours. It does not require an account or calendar connection.

**One task** remains the separate, single-unfinished-task focus view. All focus actions reuse the same Pomodoro timer, saved duration, pause/resume, completion controls and browser-tab countdown. Timer expiry never completes a task automatically. Both timer and Today progress bars use solid orange.

Click a task title to edit or reschedule it. Drag tasks to Planner days (including collapsed days) or Inbox as before; dropping before another task on the same day reorders within its completion/Main Thing group. The editor's **Earlier / Later** controls provide a keyboard/touch alternative and save the order immediately, independently of other draft edits. Main Thing retains priority. Explicit ordering adds only an optional `dayOrder` value to ordinary task payloads; the existing local store, backups and Supabase revision sync carry it without a database migration. Older tasks retain their creation order until explicitly reordered, and changing a task's date clears its old day-specific rank. Opening views and expanding/collapsing sections do not rewrite tasks.

Manually collapsed future-day task rows and completed Today rows are created only when opened. Planner groups tasks by date once per render. Keyboard controls, visible focus states, 44px daily action targets, responsive layouts and reduced-motion scroll behavior are included. The date refreshes across midnight, retaining the existing unfinished-task return-to-Inbox behavior.

## Quick Capture — Type · Speak · Scan

The Inbox field accepts a single task or an entire pasted plain-text list. Each non-empty line becomes a separate Inbox task (up to 100 per submission; 180 characters per task), saved together through the existing local-first capture and optional sync. **Enter** adds tasks, **Shift+Enter** adds a new line, and the plus button adds the whole list. The field expands and displays the pending task count. Failed saves or validation preserve the typed list; identical unfinished tasks are skipped. The optional file importer accepts **.txt, .md and .json**.

**Duplicate checks:** Matching ignores case, repeated spaces and punctuation. An unfinished task with the same title is not added again, and the existing title is shown. Very similar unfinished titles trigger a review showing the proposed task beside the matching existing task. Only items explicitly checked **Add anyway** bypass the similarity warning; new non-matching lines are included without individual review. The same protection applies to the New task editor, list and speech capture, and optional task-file imports. Completed tasks can be entered again; editing an existing task without changing its title does not trigger a warning. All duplicate matching takes place in the browser, without AI or a network call. Matching is deliberately conservative and may not detect paraphrases with substantially different words.

The Inbox field stays ready to type into. The microphone opens browser dictation with Stop, an editable transcript and confirmation; unsupported or denied browsers offer keyboard dictation. Scan accepts a camera/library image when configured, or pasted text from your phone’s text scanner immediately. Review/select/edit individual rows and optionally apply one existing tag to the whole capture. Captures create ordinary Inbox tasks; repeated unfinished names are skipped. Draft text stays in this tab until added or discarded, including after a network failure or reload.

**Available now:** offline typing/paste, review, tags and native speech where the browser/device supports it. Chrome can require its online recognition service. Safari's documented support depends on Siri/settings; physical iPhone/PWA dictation is not verified. SimpleDo saves no audio.

**Needs external setup and activation approval:** Google Vision handwriting/print recognition through the authenticated `capture-scan` Supabase Edge Function and migration `004_capture.sql`. It is disabled by default. Current Vision pricing includes 1,000 free units/month, but does **not** provide a guaranteed £0 cap. The server enforces account limits and a shared 800-reservation rolling 32-day ceiling before contacting Google. No chargeable service has been activated. [Setup, verified pricing sources, privacy, browser limits and manual launch checks](docs/quick-capture.md) explain the cost boundary and the immediate on-device copy/paste alternative.

## Snapshot

Choose **Snapshot** in the navigation for a read-only overview of **Today**, **This week**, **This month**, **This year**, or **Custom**. Custom opens native **From** and **To** date pickers; choose any valid range, including across years (for example **25 April 2026 to 18 September 2027**). Both boundary dates are included. Results update when both dates are valid, and invalid/reversed dates show an explanation without silently replacing the last valid figures. Switching to another shortcut leaves your chosen custom dates ready when you return. It shows current Inbox tasks, unfinished scheduled tasks, completed tasks and tasks marked returned to Inbox. A slim status bar, a labelled tag breakdown and a small distribution strip show the shape of the work. Custom ranges automatically group the distribution by day, week, month or year according to the period length (the example above shows **18 monthly groups**). Counts remain visible beside every colour; nothing is scored and chart elements do not edit tasks.

Snapshot uses the existing task model and needs no migration or extra service. It updates from local changes, restores and incoming task/tag sync, and works with the cached app offline. All tasks are included independently of the Planner's search and tag filters. Existing tasks, notes and task timestamps are unchanged by opening Snapshot or switching ranges.

**Date rules:** current Inbox and other undated tasks are included in every range. Dated tasks belong to the range containing their scheduled day, including tasks currently marked complete. Weeks run Monday–Sunday; months and years use calendar boundaries in the browser's local date. Completed counts describe current task status rather than completion-date history, which the existing app does not record. Returned is a subset of the current unfinished Inbox, based on the existing `rolled` flag, and is not a history of past returns. The in-view **What’s included** note explains these rules.

Tag breakdowns include Work, Home, used custom tags and No tag; a multi-tagged task is counted once in each selected tag (the colour strip shows the share of tag assignments). Removed tags count under No tag and unsynchronised definitions are labelled Tag unavailable. Distribution counts dated tasks, including completed tasks, by day for a week, seven-day blocks for a month and calendar months for a year. Undated tasks are not plotted. These are task counts, independent of work/personal capacity rules and estimated hours.

## Simple tags

Each task can have **multiple optional tags**. Work uses a blue dot and Home an orange dot, always with a visible text label; select only one of Work or Home, plus any useful areas. Existing tasks remain untagged. Choose tag chips in the task editor or leave them all unticked; the type-and-add field remains immediate. Voice and list review also offer an optional tag. The **Show** filter applies to Inbox, Planner, Today and One task, together with search.

**Inbox-specific discovery:** On the Planner page and the standalone Inbox view, the Inbox column also has its own **Search Inbox…** field (task titles and notes), **All tags** dropdown (including custom, multiple, and untagged tasks), match count, and **Clear filters** action. These controls narrow only the unscheduled Inbox list; the adjacent scheduled days, workload indicators, and total Inbox badge are unchanged. They also work alongside the existing global search/tag controls, which continue to filter across views. Filtering never modifies a task, its tags, its schedule, or cloud data.

In **Settings → Tags**, create, rename, recolour or delete custom tags. Colours come from the existing blue, orange, pink, purple, mustard and grey palette. Work and Home are fixed defaults. Custom tags use stable IDs, so renaming updates their labels without changing task identity. Deletion removes the label and filter option while keeping every associated task. A removed tag retains its capacity classification until edited; untick its chip in the editor to clear that association. Work always uses working hours, Home always uses other time.

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

Export a fresh backup immediately after upgrading on each device. Browser storage belongs to the exact scheme, hostname and browser profile. Moving to `https://simpledo.co.uk/` requires exporting from the old origin and importing the backup on the new one; redirects cannot move browser storage. Do not clear the old browser data.

## Enable optional Supabase sync

The release configuration in `config.js` contains only the dedicated SimpleDo project URL and public publishable key. Hosted migrations and security checks passed; email delivery and real multi-device login remain acceptance checks. See the [production runbook](docs/production-setup.md). Fresh cloud-configured browsers start empty; existing storage is preserved. The setup below documents how to reproduce the configuration.

1. Create a Supabase project in your own account.
2. In **SQL Editor**, run the complete contents of [`supabase/001_tasks.sql`](supabase/001_tasks.sql). It creates the task table, enables Row Level Security, grants authenticated users access to their own rows, and exposes a revision-checked write function. Anonymous reads/writes and direct client writes are denied. Also run [`supabase/003_tags.sql`](supabase/003_tags.sql) for custom-tag metadata sync. Keep deletion tombstones; do not purge rows, reset revisions or replace this migration with unrestricted insert/update policies.
3. In **Authentication → Providers**, enable **Email** and allow new users to sign up. Keep the standard magic-link confirmation URL in the email template. The app requests a passwordless link using Supabase's official SDK and uses PKCE with persisted sessions and automatic token refresh. Open each link in the same browser/profile/device that requested it, so the stored PKCE verifier is available. Request a separate link on each device. [Supabase email sign-in documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless) and [PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
4. In **Authentication → URL Configuration**, set **Site URL** to `https://simpledo.co.uk/` and add only that exact URL to **Redirect URLs** for production. Use a separate project for local authentication tests; do not add wildcard, HTTP, old GitHub Pages or localhost redirects to production.
5. Configure a production SMTP provider in **Authentication → SMTP Settings** for dependable email delivery. Review your project's email rate limits and test signup with your own email address.
6. Find the **Project URL** and **publishable key** in the project's API settings/connect dialog. In `config.js`, set `supabaseUrl` to that URL and `supabasePublicKey` to the publishable key (`sb_publishable_…`). The legacy public `anon` key is also supported. These two values are intentionally public. **Never use a secret key (`sb_secret_…`), service-role key, database password or other private credential in browser code.** [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
7. Review and approve the release before merging or publishing to GitHub Pages. Reload the app online on both devices after the approved deployment.
8. Open **Settings → Account**, enter your email and choose **Send sign-in link**. Open the email link in the same browser. Signing in does not upload, remove or replace local tasks.
9. On first sign-in to an account on this browser, choose **Merge and enable sync**. A local recovery checkpoint is saved first. **Keep local** leaves sync paused; reopen Settings to enable it later.
10. Repeat on your other devices with the same email. When connected and the page is visible, changes reconcile automatically about every five seconds, and after local edits, reconnects and returning to the app.

Signing out leaves local tasks and queued changes on this device. Signing back into the same account resumes sync. Joining a different account requires explicit merge consent and can copy the browser's visible tasks into that account; sign-out is not a private-data wipe. Use a separate browser profile for separate accounts on shared computers.

### Conflict and offline behavior

Changes save locally before upload. The queue survives refreshes and offline reopening; reconnecting retries it. Server-assigned per-task revisions prevent stale devices from silently overwriting newer cloud versions. Requests are idempotent when a response is lost.

When edits conflict, the cloud version stays at its original ID and a different local edit is retained as a new task labelled **Recovered edit**. A stale deletion cannot erase a newer cloud edit. If an edit conflicts with a cloud deletion, the original ID stays deleted and the local edit becomes a recovered task. Review recovered copies and remove whichever version you do not need. Updates received while a task editor is open also preserve the form's version as a recovered task when necessary. Full task records are reconciled, rather than attempting to merge individual text fields.

Task data, custom tag metadata and focus **preferences** sync. Working-hours settings travel in backups but do not sync. Active countdowns, pause/resume state and break sessions stay in `simpledo.focusSession.v1` on this browser. Cloud errors leave local tasks usable and show a status/error in Settings. If local saving fails, export a backup before closing; sync pauses to protect unsaved work.

## GitHub Pages and local development

In **GitHub repository Settings → Pages**, choose **Deploy from a branch**, **main**, **/(root)**. All asset URLs are relative to support the `/SimpleDo/` project path. No server, secrets or build is required. Keep `config.js` present even when cloud is disabled. Serve the repository locally with `python3 -m http.server 8000`, then open `http://localhost:8000/`. Direct `file://` opening does not support service workers and is unsuitable for authentication testing.

The service worker caches only the local app shell; it does not cache auth callback URLs, account API responses or user backups. Browser-local task storage and Supabase account storage remain separate from the public repository. When changing asset versions, update the versioned script/style URLs and the shell cache/files in `sw.js` together. Multi-tag edits use a backwards-compatible `tagIds` array while still reading older `tagId` records without a destructive migration; refresh older clients before editing the same task on multiple devices.

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

- Automated tests cover daily selection/progress/filter semantics, explicit ordering and backup/simulated sync preservation, Quick Capture parsing, speech events/cancellation/errors, image validation, authenticated OCR limits/failures/low confidence, capture storage/backup compatibility, and capacity/DST, provider adapters, OAuth and encrypted tokens, offline calendar caching, account switches, estimate/working-hours/tag backups, tag rename/delete, offline tag sync and read-only Snapshot aggregation/range boundaries, and the existing storage/simulated sync cases: migration, corruption preservation, backup validation, duplicate merges, replacement checkpoints, storage failure, offline edits/deletions, conflict recovery, in-flight changes, stale responses, browser-tab edits and account consent
- Actual PostgreSQL migration and RLS/permission tests in PGlite: per-account isolation, denied anonymous/direct writes, revision comparisons, idempotent retries and deletion tombstones; custom tags are isolated per account and direct writes are denied; calendar token/state tables deny both anonymous and signed-in browser roles; OCR reservations enforce shared/account limits, retain the global count after account deletion and deny browser access
- Headless Chrome: Today empty/one/many-task states, Main Thing/fallback changes, completion/reopening, collapsed future-day add/drag, ordering, capacity/tags, timer expiry, mobile layout, read-only disclosures, midnight rollover and offline Today; capture review with simulated speech/OCR, optional tags, selected/uncertain rows, removal, duplicate handling, draft recovery after reload/storage failure, offline typing; JSON download/restore, repeat import, replace confirmation, recovery copy, existing Inbox importer, focus duration/timer, offline reload and capture, desktop and 390px mobile layouts, working-hour editing, optional date suggestions, dragging onto a day off, tag creation/filtering/rename/delete and tagged offline reopening, all Snapshot ranges, unchanged task storage, incoming-data refreshes and offline Snapshot navigation

**Not yet validated with live microphones, handwriting OCR, calendars or a live Supabase project:** real Outlook/Google OAuth, provider event accuracy and refresh-token renewal, physical iPhone/Safari behavior, plus real email delivery, deployed SDK authentication/token renewal, actual multi-device network behavior. PGlite and the simulated sync server do not replace these acceptance checks.

Before considering cloud setup complete:

1. On an iPhone and computer, export a local backup, sign into the same account and explicitly merge each device's tasks. Confirm both sets remain.
2. Create, edit, schedule, prioritise, complete and delete tasks; confirm the other device updates within a few seconds while visible.
3. Change focus duration; confirm the preference syncs but starting a timer does not start one elsewhere.
4. Disconnect one device, edit/create/delete, reload offline, reconnect and confirm convergence.
5. Edit the same task differently while offline on each device. Confirm the original and a labelled recovered copy retain both edits. Test edit-versus-delete in both connection orders.
6. Leave a signed-in device idle, return after token expiry, and verify sync resumes. Test logout and relogin.
7. Use a second account in a separate browser profile; confirm no rows from the first account appear. Test with anonymous API credentials and verify task access is denied.
8. Re-import a backup twice, test replacement after exporting a safety backup, and confirm mobile controls and local timers still work.
