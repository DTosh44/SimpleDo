# SimpleDo production setup

Audit and provider checks: 28 October 2026. Release base: `932a58f` on `DTosh44/SimpleDo/main`.

## Configured backend

- Dedicated project: **SimpleDo**, reference `ffmcowwuyqmclssnvree`, London (`eu-west-2`), in the **Better Here** free organisation. No paid plan, compute upgrade, add-on, calendar provider or OCR service was activated.
- Management API access was verified using an existing local credential. No Supabase CLI installation was present. No private credential belongs in this repository or chat.
- `config.js` contains only `https://ffmcowwuyqmclssnvree.supabase.co` and its public `sb_publishable_…` key. Public keys identify the project; RLS and the signed-in identity protect data.
- Applied the existing files unchanged through the Supabase migration API:

| SQL file | Hosted migration version |
| --- | --- |
| `supabase/001_tasks.sql` | `20261028113401` |
| `supabase/002_calendars.sql` | `20261028113424` |
| `supabase/003_tags.sql` | `20261028113425` |
| `supabase/004_capture.sql` | `20261028113427` |

Do not blindly replay these as CLI migrations: the source files use their existing names and the hosted API assigned the history versions above. Inspect history and schema before any future migration. No rows or revision histories were reset. Calendar/OCR schema is present but its Edge Functions and external services have not been deployed or activated.

All five application tables have RLS. Browser roles cannot write tables directly. Authenticated users can read only their own task/tag rows and write through owner-scoped, revision-checked RPCs. The functions use an empty search path, authenticate with `auth.uid()`, and serialize changes per owner. Anonymous users cannot call these RPCs. Keep permanent task/tag tombstones and monotonically increasing revisions.

## Authentication and email

Already applied and read back in **Authentication → URL Configuration**:

- **Site URL:** `https://simpledo.co.uk/`
- **Redirect URLs:** only `https://simpledo.co.uk/`

Email is enabled; signup is allowed; automatic email confirmation and unverified-email sign-in remain disabled. Keep the standard confirmation/magic-link template using `{{ .ConfirmationURL }}`. Do not replace it with a direct application URL or enable unverified sign-in to bypass delivery problems. No wildcard, HTTP, localhost, www or old Pages redirect is permitted in this production project.

The official bundled SDK uses PKCE, stored sessions and automatic renewal. Request a separate link on each device and open it in the same browser/profile that requested it. An installed mobile app and Safari may have separate storage: request and open the link in a consistent context. Physical iPhone behavior still requires testing. Authentication is refused on public HTTP in this release; local work remains available and an explanation tells the user to export before switching origins.

**One-person initial use:** the built-in sender can email the address registered as an organisation team member, with a project-wide limit of two emails per hour. It has no delivery guarantee and is not a production sender. No email is needed for each task change; a valid session is reused. No live email has been sent or sign-in verified in this audit.

**Dependable production email:** configure an authorised SMTP sender. Resend's free plan currently allows 3,000 emails/month and 100/day; no paid plan is needed for initial personal use. Minimum setup:

1. Create/sign into a free Resend account and add a sending domain or subdomain.
2. Complete sender verification using only its exact required DNS records, **after approving those additional DNS changes**. Leave the working Pages A/AAAA/CNAME records alone. No DNS changes were made in this task.
3. In [SimpleDo Authentication](https://supabase.com/dashboard/project/ffmcowwuyqmclssnvree/auth/overview), open **Emails → SMTP Settings**, enable custom SMTP and enter the provider's host, port, SMTP username/password and a verified From address directly in the dashboard. Use the provider's displayed settings. Never put SMTP credentials in `config.js`, commits, issues or chat.
4. Keep email confirmation enabled and the production URL configuration above. Review **Authentication → Rate Limits** without raising limits unnecessarily.
5. Request one sign-in from the deployed app and check delivery, same-browser link consumption, reload, logout and relogin. Request a new link rather than forwarding one between devices.

Sources: [Supabase SMTP limits/setup](https://supabase.com/docs/guides/auth/auth-smtp), [Resend pricing](https://resend.com/pricing?product=transactional), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Code and data audit

- Local tasks and queued changes stay in `simpledo.data.v2`. Existing legacy bytes remain in `simpledo.tasks.v1` and the pre-upgrade recovery copy. This release does not change the storage format or rewrite existing tasks.
- Fresh cloud-configured browsers now start empty, preventing separate devices from generating/uploading separate sample task IDs. Previously saved sample tasks are preserved; use **Remove samples** deliberately before enabling sync if appropriate.
- Signing in alone does not upload local tasks. **Merge and enable sync** makes a recovery checkpoint and binds the browser to the account. Switching accounts requires another explicit merge. Sign-out preserves local tasks and account binding; use separate browser profiles for different people/accounts.
- Task/tag changes persist before upload. Pending writes survive reload/offline use. Reconciliation is paginated, includes tombstones, and uses server revisions rather than device clocks. Visible clients poll about every five seconds and on edits/reconnect/visibility changes.
- Task conflicts preserve the cloud version at its ID and recover different local edits under a separate ID. Stale deletes cannot erase newer edits. Tag conflicts retain server metadata; tag deletion wins stale renames without deleting tasks. Tag failures do not block task sync.
- Backup **Merge** adds unknown IDs and respects existing edits/deletions. Repeating the same restore does not duplicate tasks. **Replace** requires confirmation and can propagate removals to the account; avoid it during migration. Recovery checkpoint failure prevents replacement. Unknown task fields survive backup/sync.
- Backup identity safeguards are based on stable IDs. Separate backups containing the same title under different IDs can still produce separate tasks. Restore one authoritative backup on one device first.
- Working hours travel in backups but do not sync. Task focus duration syncs; running timers remain local. Calendar availability remains separate from task data.
- No runtime `innerHTML`, `eval` or third-party script loading was found in application modules. Auth/session storage is controlled by the official SDK. Avoid adding untrusted scripts because browser-based sessions are accessible to same-origin JavaScript.
- The service worker caches only explicitly listed shell assets. Query variants, including auth callbacks, cannot enter Cache Storage. Shell version and changed asset URLs are updated together. Local backup files and provider requests are never cached by the worker.

## Hosting and installation

GitHub Pages uses **main → /(root)**, legacy branch deployment. `CNAME` remains `simpledo.co.uk`; `.nojekyll` is present. All 17 currently deployed relative assets returned HTTP 200. HTTPS on the apex domain validates. GitHub reports its certificate **approved**, expiring 26 January 2027, but **Enforce HTTPS is off**. HTTP still serves the site and the old Pages address redirects to HTTP. The www hostname currently fails certificate hostname validation; it is not an approved auth origin.

After approval, in **Repository → Settings → Pages**, check **Enforce HTTPS** and verify HTTP and the old Pages URL end at `https://simpledo.co.uk/`. Keep the existing domain and DNS records. Do not remove/re-add the domain while the apex certificate is working. If www is required later, separately verify its DNS and certificate before advertising or allowing it.

The release adds canonical metadata, no-referrer policy, a relative manifest, standalone launch mode, 192/512px PNG icons rendered from the existing vector logo, and an Apple touch icon. Headless mobile Chrome validates the manifest and icon dimensions. After approved deployment: Android Chrome → **Install app/Add to Home screen**; iPhone Safari → **Share → Add to Home Screen**. Open once online before testing offline. Real install prompts, physical iPhone behavior and OS storage retention are not proven by desktop emulation.

GitHub Pages cannot provide application-defined HTTP headers from a `_headers` file. No ineffective header file was added. Referrer policy is declared in HTML; actual HTTPS redirect enforcement remains a Pages setting.

## Verification and release gates

Passed locally:

- **89 Node tests:** storage migration, backup validation/duplicate merges, failed writes, task/tag queues, simulated two-device conflicts, offline deletes, account changes and optional provider fixtures.
- **PGlite PostgreSQL suite:** all four migrations, RLS, anonymous denial, owner isolation, direct-write denial, retries/revisions/conflicts/tombstones and scan quotas.
- **Four headless Chrome suites:** desktop/mobile task flows, merge/repeated restore/replacement recovery, capture with simulated speech/OCR, Today, tags, offline reopening, production-configured empty first use, manifest/icons, query cache exclusion and exact task preservation across offline reload.

Passed against real providers:

- Hosted migration history, auth settings and table permissions read back from Supabase.
- Real hosted PostgreSQL RPC/revision/idempotency/conflict/tombstone and cross-owner RLS assertions using synthetic SQL identities. All fixture rows rolled back; this exercises the database, **not actual user authentication**.
- Real public Supabase Auth settings respond; anonymous REST task and tag reads return HTTP 401.
- GitHub Pages deployment/source/certificate state and live HTTPS/asset requests checked without changing hosting or DNS.

Still required after the approved release: actual email delivery and PKCE login on each device, refresh-token renewal, real two-device edits/reloads/deletes, offline reconnection and simultaneous conflicting edits. Local simulated devices and SQL role fixtures do not replace these checks. Use a clearly named disposable task, confirm both devices reach **Saved**, and retain a downloaded backup before testing. Do not use production user data in automated tests.

No merge, deployment, HTTPS-setting change, DNS change, paid activation or destructive database change is authorised by this release preparation. Review the draft PR, then explicitly approve merging/deployment and HTTPS enforcement. SMTP and physical-device acceptance remain separate requirements for claiming full production verification.

The Supabase free project can pause after inactivity; this is a reliability limitation, not a sync-data deletion policy. Local tasks continue working offline. Keep JSON exports somewhere safe: sync and browser recovery copies are not independent backups. No paid availability/backup upgrade was activated. [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## First use without duplicates

1. Keep your existing JSON backup and old browser data. After the approved deployment, open **https://simpledo.co.uk/**. Check the HTTPS address; HTTP and old-host browser storage do not transfer automatically.
2. On **one primary device**, choose **Settings → Import backup → Merge with existing tasks**. Use the full backup importer, not Inbox's list importer. Verify tasks/notes/tags and export a fresh backup. Remove only unwanted sample tasks deliberately if any already exist.
3. In **Settings → Account**, request a sign-in link using the same email you will use everywhere. Open it in that browser. Choose **Merge and enable sync** once and wait for **Saved**, with no account error or tag warning.
4. On the second device, open the HTTPS address, sign in using a **new link requested on that device**, then choose **Merge and enable sync** and wait for the cloud tasks. Start from an empty browser; do not import the backup again on each device.
5. Check one small edit in each direction and a reload. Export another backup. If the second device already has unique local work, export it first and merge deliberately; different IDs can represent duplicate titles. Review **Recovered edit** copies rather than repeatedly restoring or replacing data.

## Follow-up release gate — account-synchronised Inbox completion visibility (PR #25)

This section documents the proposed **subsequent release**, not the state of the live system at the time of the original setup record above.

- New file: `supabase/005_preferences.sql`, **prepared but not applied to the hosted project**. Existing hosted versions 001–004 should remain untouched.
- The migration creates `public.simpledo_preferences` with a single `inbox_completed_visibility` preference per user, owner-only SELECT RLS, no direct browser writes, and an authenticated revision-checked `sync_simpledo_preference` RPC. It derives identity using `auth.uid()`; anonymous reads/writes and unauthorised values are rejected.
- **Before merging PR #25:** independently review the migration against the live schema/history, apply it to the dedicated SimpleDo Supabase project with authorised provider credentials, verify RLS/RPC behaviour, and only then deploy the frontend. Never place database secrets in code, issues or chat.
- The browser keeps a separate local pending preference per account for offline edits. At first sync it reads the cloud choice before writing; an existing user choice wins over a device's legacy/anonymous default. Only a one-time existing anonymous choice can seed a user with **no** cloud preference. Switching accounts does not import the last account's preference.
- Last accepted server revision is checked on writes. If an older offline change conflicts with a newer server value, the server wins and a visible conflict notice explains how to reselect; changes aren't silently overwritten. Normal task/tag sync continues even if preference sync fails.
- Manual acceptance after approved deployment: choose **48 hours** on the Mac and confirm phone updates without changing it there, switch to **3 days** on the phone and confirm Mac updates, repeat with an offline change and reconnection, reload both browsers, sign out and into a different account and verify user isolation. Inspect the saved task records, confirm that Inbox visibility never deletes tasks, and take a fresh JSON backup. A mocked two-device suite and local PGlite SQL tests do **not** prove hosted provider acceptance.
