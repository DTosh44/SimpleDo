# Calendar backend setup

Calendar connections are optional. Working hours, task estimates, capacity indicators and suggestions work on GitHub Pages without a backend or account. Provider credentials are not included in this repository. Live Outlook/Google connectivity has **not** been verified with a real calendar.

The backend runs as a Supabase Edge Function named `calendars`. Use the Supabase project already configured for SimpleDo account authentication. A user signs into SimpleDo first and then explicitly connects Outlook or Google. Calendar consent is separate from task-sync consent.

## 1. Database and authentication

Complete the main README's Supabase setup, including email sign-in and the public frontend configuration. Run `supabase/002_calendars.sql` in the SQL editor after `001_tasks.sql`. Estimated duration is an optional field in the existing task JSON payload, so no task-table rewrite or task-data migration is needed.

The new tables contain encrypted OAuth material and selected calendar IDs. RLS is enabled with **no** browser-access policies; `anon` and `authenticated` have no table privileges. Only the Edge Function's server-side service-role client can access them. Do not add public read policies. Calendar busy data is not stored in these tables or written as tasks.

## 2. Outlook / Microsoft 365 (priority provider)

1. Open [Microsoft Entra app registrations](https://entra.microsoft.com/) and register an application. For both Outlook.com and Microsoft 365, select **Accounts in any organizational directory and personal Microsoft accounts**.
2. Add a **Web** platform redirect URI (not SPA):
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/calendars/callback`
3. In **API permissions**, add Microsoft Graph **Delegated** `Calendars.ReadBasic`. The code also requests `offline_access` so the server can refresh consented access. It does not request mail, write, contacts, profile or application-wide calendar access. Remove the default `User.Read` permission if this registration is dedicated to this integration. Some organisations require administrator approval even for delegated consent.
4. Under **Certificates & secrets**, create a client secret. Store its **value**, not the secret ID, in Supabase secrets as `OUTLOOK_CLIENT_SECRET`; use the Application (client) ID as `OUTLOOK_CLIENT_ID`. Set a reminder to rotate the secret before expiration.

The adapter reads the user's own calendar list and each selected calendar's `calendarView`. This endpoint expands recurring instances and exceptions. Only `start`, `end`, `showAs` and cancellation state are selected. Busy, tentative and out-of-office periods reduce capacity; free and working-elsewhere periods do not. Busy all-day events block the relevant working hours. Shared/delegated calendars requiring broader permissions are outside this first version.

Primary references: [calendarView and least-privilege permissions](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0), [Microsoft authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).

## 3. Google Calendar

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/) and enable **Google Calendar API**.
2. Configure the OAuth consent screen and audience. While the app is in Testing, add your own Google accounts as test users. Google's testing and verification rules can restrict refresh-token lifetime and who can connect; complete the applicable production verification before opening this to other users.
3. Request only these scopes:
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `https://www.googleapis.com/auth/calendar.events.freebusy`
4. Create an OAuth client of type **Web application** and add this authorised redirect URI:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/calendars/callback`
5. Store its ID and secret in Supabase as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The calendar list supplies selection labels; availability comes from `freeBusy`, which expands recurring and all-day busy periods without returning event titles, descriptions, attendees or locations. A free all-day event does not block work. Individual calendar access failures invalidate the refresh rather than showing an incomplete response as fully free.

Primary references: [calendar list scopes](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), [free/busy API and scopes](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## 4. Deploy the Edge Function

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), log in and link this repository to your project:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Create a private environment file **outside this repository**, readable only by you. Add these values with your real project settings:

```text
SIMPLEDO_APP_URL=https://dtosh44.github.io/SimpleDo/
CALENDAR_TOKEN_KEY=<a base64-encoded random 32-byte key>
OUTLOOK_CLIENT_ID=<your Entra application ID>
OUTLOOK_CLIENT_SECRET=<your Entra secret value>
GOOGLE_CLIENT_ID=<your Google web client ID>
GOOGLE_CLIENT_SECRET=<your Google client secret>
```

`openssl rand -base64 32` generates an encryption key. Keep it in your secure secrets store. Never put it, provider secrets or a service-role key into frontend files, backups or GitHub. The function receives `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Supabase runtime. You may omit a provider's two credentials to leave that provider unconfigured.

```sh
supabase secrets set --env-file /absolute/private/path/simpledo-calendar.env
supabase functions deploy calendars
```

The checked-in `supabase/config.toml` sets `verify_jwt = false` for **this function only**, because the provider's GET callback cannot include a SimpleDo JWT. Every POST action independently verifies the user's bearer token against Supabase Auth before accessing their data. The GET callback requires single-use, hashed, expiring OAuth state and a server-held PKCE verifier. Do not remove either check. [Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth).

`SIMPLEDO_APP_URL` is the fixed return URL and the sole allowed browser origin. For local testing, use a separate development Supabase project or temporarily set this to your actual `http://localhost:PORT/` URL; localhost is the only HTTP exception. Register that development project's callback with the providers too. Do not use wildcard origins or accept a client-supplied return URL. The frontend uses its existing Supabase client to call `calendars`; no separate public calendar URL or secret is needed.

The function encrypts access/refresh tokens with AES-256-GCM using per-record random IVs and account/provider-bound authenticated data. Refresh happens on demand, server-side, before expiry, with a comparison check to prevent a stale refresh response overwriting a newer token. Losing or rotating `CALENDAR_TOKEN_KEY` makes existing connections unreadable: disconnect/revoke those connections and reconnect with the new key. Keep the key available when restoring server backups.

## 5. Connect and select calendars

1. Open SimpleDo, sign into your account, then open **Settings → Calendars**.
2. Choose **Connect** under Outlook or Google and approve the read-only request.
3. On return, reopen Settings and select the calendars that should count toward your availability. Nothing is selected automatically.
4. Choose **Use selected … calendars**. The planner will include busy time alongside task estimates.
5. Use **Refresh availability** to refresh immediately. Otherwise refresh runs approximately every 15 minutes while the app is visible, on return to the app, on reconnect and when expanding the planner's date range.

Availability requests are paginated and bounded to 60-day chunks, covering the visible planner range plus a small boundary buffer. Overlaps are merged across calendars/providers and intersected with working hours, so meetings outside work or during lunch do not consume extra capacity.

Only the union of UTC busy intervals, coverage bounds, owner ID, selection-presence flag and fetch timestamp is cached locally. Calendar names are held in memory only while selecting calendars. No event details or provider tokens enter browser storage, logs, the task database or exported task backups. Signing out or changing accounts clears the availability cache and selection labels. Disconnect removes the server-held tokens and invalidates the cache. Google token revocation is attempted too; for Microsoft, users can additionally remove app consent from their Microsoft account's app-permissions page. The app does not request broader account permissions just to revoke consent programmatically.

Offline, the last known availability remains usable and is labelled **calendar may be outdated**. An uncovered date says **calendar unavailable**. Suggestions avoid recommending days using unavailable or stale connected-calendar information. Manual hours remain usable even when calendar authentication or the backend fails.

## 6. Required live acceptance tests

Local tests use synthetic events and mocked providers; they do **not** prove live OAuth or provider refresh is working. Before merging/enabling calendar support for everyday use:

- Sign in on desktop and iPhone/Safari. Connect Outlook, select two calendars, then repeat with Google. Confirm nothing is selected without consent and only the selected calendars count.
- Add overlapping meetings, a recurring series with an exception, free and busy all-day events, and out-of-office periods. Refresh and compare the planner with the provider.
- Include a meeting spanning a working-hours/break boundary and a time-zone/DST transition. Confirm overlap is counted once and outside-work time is excluded.
- Wait past access-token expiry and confirm the server refreshes without browser-held provider tokens. Revoke consent at the provider and confirm reconnect guidance appears without losing tasks.
- Disconnect one provider, change selection on the other and switch SimpleDo accounts. Verify cached data and calendar labels from the previous connection/account disappear.
- Go offline, reopen the cached app, change estimates and dates and check the stale indicator. Reconnect and confirm availability refreshes while the task sync queue still converges.
- Use Supabase browser credentials to attempt direct access to both calendar tables; access must be denied. Inspect network responses and backups for absence of provider tokens and event details.
- Test provider consent denial, expired/replayed callback state and backend outage. Check the UI remains usable for local tasks and manual availability.
