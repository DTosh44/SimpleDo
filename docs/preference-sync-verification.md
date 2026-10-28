# PR #25: preference migration and release verification

Verified 28 October 2026 against Supabase project **`ffmcowwuyqmclssnvree`**, London. The frontend has not been merged or deployed by this work. Release still needs explicit approval.

## Applied migration

- Applied **only** the reviewed `supabase/005_preferences.sql`, unchanged from PR head `afb40a7`.
- Hosted version: **`20261028130226`**, name `005_preferences`.
- Source SHA-256: `1c4a993596709896387cd079f71365122ad57e66700ad1444e1bdcf08b735091`.
- Confirmed existing versions `20261028113401` / `001_tasks`, `20261028113424` / `002_calendars`, `20261028113425` / `003_tags`, and `20261028113427` / `004_capture`. None was replayed.
- Added only `simpledo_preferences`, its ownership policy and `sync_simpledo_preference(text,text,bigint)`; no existing tasks, tags, users or their schemas were updated or deleted.

The hosted table has RLS enabled and authenticated SELECT limited to `auth.uid() = user_id`. Anonymous reads are denied. Both browser roles lack direct writes. The SECURITY DEFINER RPC uses an empty search path, derives its owner from `auth.uid()`, validates the sole supported name and five values, and serializes revision-checked changes per user. Anonymous execution is denied; missing identities and invalid values are rejected. Identical retries do not increment revisions; stale different values return the current value and a conflict flag.

Full-row fingerprints and row counts for `auth.users`, `simpledo_tasks` and `simpledo_tags` were computed inside PostgreSQL immediately before and after migration and matched exactly. They also matched the original baseline after all synthetic provider tests and cleanup. Raw user/task data and credentials were not printed or committed. Synthetic test users and their test records were removed; original accounts were not used for testing.

## Client issues fixed during review

1. **New-device retrieval:** preference sync previously waited for task merge consent. Preferences now bind and sync immediately after sign-in, even when local tasks remain unbound or task networking fails. Task/tag upload consent is unchanged. A fresh device reads the cloud preference before writing a default.
2. **Stale browser tabs:** a tab could overwrite another tab's queued preference with its older in-memory state. The preference store now reads persisted account state before selection and around network operations, preserves changes made during upload, and rejects responses older than an acknowledged revision. Account-preference storage events schedule reconciliation.
3. **Corrupt preference storage:** unreadable account preference bytes are retained, the previous account's choice is cleared from the UI, and task sync continues with a visible preference warning.

The updated service-worker shell is `simpledo-shell-v37`, with `completion.js?v=3`, `cloud.js?v=16` and `app.js?v=27`. Normal app, offline, backup, revision and tombstone behavior is retained. No authentication setting, DNS record, paid service, RLS policy on existing tables, or task/tag RPC was changed.

## Automated and genuine-provider evidence

| Verification | Result and scope |
| --- | --- |
| Node tests | **105 passed**, covering all expiry boundaries, midnight, legacy timestamps, Today wins, per-user storage, cloud precedence, offline queues, conflicts, tab races and preference sync before task consent. |
| Local PostgreSQL | PGlite suite passed all five migrations, existing task/tag security, preference ownership, allowed values, anonymous/direct-write denial, idempotency and conflicts. |
| Browser suite | All four suites passed: desktop/mobile tasks, all five retention choices, Today wins, Snapshot, backup/repeated restore/recovery, offline shell/reload, capture with simulated speech/OCR, installation metadata and callback cache exclusion. |
| Hosted PostgreSQL | Real rollback-only SQL assertions passed for all five values, owner isolation, authenticated writes, invalid input, anonymous reads/RPC, missing identity, direct-write denial and stale conflicts. This uses SQL identities, not a real user login. |
| Genuine signed-in browsers | Separate desktop and 390px mobile-sized browser profiles authenticated to the real Supabase Auth service using synthetic confirmed accounts. Real PostgREST reads/RPCs propagated every choice in both directions. These are independent client sessions on one computer, not physical Mac/phone hardware. |
| Fresh device and refresh | A third fresh profile retrieved `48-hours` automatically after sign-in without task merge consent; browser refresh retained the account choice. |
| Offline/reconnect | A selection made offline remained pending through reload and propagated on reconnect. The intercepted branch supplied the offline shell in this provider test; separate browser tests verify the actual service worker. |
| Conflicts | A stale offline selection adopted the newer server value and displayed the conflict notice. |
| Logout/login and isolation | Logout/subsequent login restored the user's choice. Another real synthetic account retained its own different setting. Cross-owner reads returned no rows, direct updates were denied, and anonymous REST SELECT/RPC calls returned denial. |
| Existing task/tag preservation | Synthetic cloud tasks/tags were identical before/after all five preference choices, while an unbound local task stayed local. Original production fingerprints also matched throughout. |
| Completion behavior | Real provider task payloads carried identical completion timestamps to the other profile; reopening cleared `completedAt` on both. Today wins counted Inbox and scheduled completions; Snapshot retained completed tasks. All five choices hid aged Inbox completions as expected without deleting any task. |

The provider tests loaded PR files through request interception in isolated profiles at the production origin. **No frontend deployment occurred.** Administrative credentials were used transiently only to create and clean up test identities; browser synchronization used ordinary authenticated user sessions and the public project configuration. No administrative credential was added to the app, CI or repository. No emails or auth-configuration changes were needed.

The original PR-branch CI history was reviewed: 14 runs before this follow-up, five successful and nine older failed runs. Eight failed on obsolete preference-message assertions; one failed a strict browser assertion. They were superseded by the passing original head `afb40a7`. The final updated head must also pass the full CI job before being marked ready for review.

## Remaining approval and physical-device acceptance

There is no outstanding migration or provider-sync blocker. **Do not merge or deploy without explicit approval.** Mark ready for review after the updated CI completes. The separate authentication PR #26 is not part of this release; rebase/integrate it separately if it is approved later.

After approved release:

1. Refresh SimpleDo online on both devices to load the new shell. Sign into the same account on Mac and phone. Do not restore or replace task data to test this preference.
2. On Mac, choose **Settings → Completed tasks → 48 hours**. Open the phone app; its setting must become **48 hours** automatically, normally within one visible-page polling interval (about five seconds).
3. On the phone, select **3 days**. Confirm the Mac changes. Repeat the remaining choices, refresh both, sign out/in, and confirm the account choice returns. Preference sync needs no task-merge step.
4. Change the choice offline on one device, reload it, reconnect and confirm convergence. For a conflict, edit on the other online device first: the stale choice must retain the newer cloud value with a visible notice; reselect deliberately to override.
5. Complete disposable tasks from Inbox and a scheduled day; check Today wins on both devices. Reopen one and confirm its finish timestamp is cleared. Check Snapshot/history and export a backup: hiding must never delete tasks. Legacy completed tasks without a trustworthy timestamp remain visible rather than inventing a completion date.

Physical phone/installed-PWA behavior remains a manual acceptance check after approved deployment. Mail delivery, SMTP setup and broader authentication acceptance are separate from this preference release. No paid service or DNS/auth setting change is required for this release.
