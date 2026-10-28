# Authentication and onboarding release

Prepared against `DTosh44/SimpleDo/main`, including production setup PR #23 and Inbox filters PR #24. Nothing in this authentication release has been merged or deployed. No DNS, billing, database schema, RLS policy, production redirect or email-confirmation setting was changed.

Screenshots with no real user data: [desktop](screenshots/auth/desktop.png), [mobile](screenshots/auth/mobile.png).

## User experience

New visitors see the branded welcome screen, with **Sign in** and **Create account** tabs and **Continue without an account**. Returning authenticated users open the planner automatically. Existing local users can keep working; **Settings → Account → Sign in or create account** opens account access. A local-mode choice is remembered without putting credentials in task storage.

Registration and login use `supabase.auth.signUp` and `signInWithPassword`. Registration instructs the user to confirm their email. The existing project requires verified email; the UI cannot bypass it. Newly created/set passwords require at least 12 characters and confirmation. Passwords go directly to the official bundled SDK over HTTPS, are cleared after submission, and are excluded from tasks, backups, logging and application persistence. Password managers use the appropriate `current-password` / `new-password` autocomplete. Supabase persists its own session tokens separately so users stay signed in.

**Forgot password** uses `resetPasswordForEmail`. Recovery uses the exact already-permitted redirect `https://simpledo.co.uk/`; the official SDK retains PKCE handling. Its `PASSWORD_RECOVERY` event opens the password form. A per-tab marker containing only the user ID keeps the form open after reload until the password is saved or the user chooses to continue. Initial-session and refresh events do not dismiss it. Expired/invalid callbacks offer a new link or password login, and callback parameters are removed from history. Callback URLs remain excluded from service-worker caching.

**Settings → Account → Set or change password** calls `updateUser({password})` on the authenticated account. It does not register a new account, copy identities or change task ownership. Existing passwordless users should sign in with **Email me a sign-in link**, then set their first password in Settings. Magic-link requests use `shouldCreateUser: false`; new users use Create account. Every emailed link must be opened in the browser/profile that requested it, because of PKCE. Do not forward links to another device.

Signed-in users on a genuinely empty, unbound device are bound automatically and download their tasks. Any task records (including deletions), custom tag records, or another account's binding require explicit consent. The merge screen offers **Merge safely and continue** or **Keep local for now**. Merge uses the existing recovery checkpoint and ID/revision safeguards. It cannot replace the local task list. A previously approved binding to the same account resumes automatically; logout retains local tasks and pending changes. Use separate browser profiles for different people/accounts.

## Project and email settings

The project remains `ffmcowwuyqmclssnvree`. Read-back confirmed:

- Site URL and sole permitted redirect: `https://simpledo.co.uk/`.
- Email enabled and signup allowed.
- Automatic email confirmation and unverified-email sign-in disabled.
- Custom SMTP absent; built-in sender limit two emails/hour, restricted to organisation team addresses.
- Existing server minimum password length is six; this release's UI requires twelve for signup/set/change. After release approval, align **Authentication → Sign In / Providers → Email → Minimum password length** to twelve. This does not require changing existing passwords or user IDs. No provider security policy was relaxed.

For dependable signup, confirmation, recovery and magic-link delivery, configure a verified SMTP sender directly in **Authentication → Emails → SMTP Settings**. Resend's free tier is sufficient for initial personal use. Keep credentials in that dashboard. Any new sending-domain DNS verification records require separate approval; leave the working GitHub Pages records intact. Keep the confirmation, magic-link and recovery templates using `{{ .ConfirmationURL }}`. Do not change production redirects to local/test hosts or disable confirmation to make a test pass. Review rate limits after configuring SMTP. [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).

## Verification evidence

| Check | Evidence and limits |
| --- | --- |
| Signup, confirmation UI, login errors, recovery UI, local/merge choices | Real desktop/mobile Chrome with an explicitly simulated Auth provider; email delivery is not simulated as a successful real send. |
| Automatic binding, preservation of tasks/tags/tombstones/account history | Unit checks plus real hosted sync using separate browser contexts. |
| Verified-email requirement | Real Supabase password login rejected an unconfirmed synthetic account. |
| Confirmation verification | Real provider-generated signup token verified through the actual SDK; this creates the verified session and automatically binds the empty device. Email transport and emailed PKCE callback were not exercised. |
| Password login and remembered sessions | Real password login in an independent browser context; reload preserves session and cloud task, and opens planner automatically. |
| Cross-device sync | Real Supabase RPCs/reconciliation between isolated browser contexts: creation, reload, offline edit/reconnect, concurrent offline conflict recovery, deletion propagation and no resurrection on reload. These are genuine independent client sessions on one computer, not two physical devices. |
| Password change and recovery | Real `updateUser`; real recovery token verified through the SDK emits `PASSWORD_RECOVERY`, opens the form, survives reload, updates the password and allows password login to the same ID/tasks. Email transport and emailed PKCE callback remain unverified. |
| Existing passwordless account | A separate real passwordless synthetic account signed in by token verification, created a cloud task, set its first password through the UI, signed out and signed in with that password; original user ID and task were retained. |
| Data protection | 95 Node tests and the existing in-memory PostgreSQL migration/RLS suite passed. No SQL source or RLS changes are part of this release. |
| Existing product behavior | Five Chrome suites cover welcome/account flows, desktop/mobile tasks, offline reopening, backup merge/repeated import/recovery, capture with simulated speech/OCR, Today, manifest/icons and query-cache exclusion. |

Real-provider checks loaded branch files through request interception in fresh, isolated browser profiles at the production origin. They did **not** deploy the branch. Administrative access was used only to create/verify isolated synthetic identities without sending emails; temporary administrative credentials/action tokens stayed in memory and were not committed or printed. Test accounts and their synthetic records were removed afterward. Existing user data was untouched. There is no administrative credential in the client, tests or PR.

Full normal signup/confirmation email, reset email, emailed PKCE callback and physical iPhone/Android installation-context behavior remain acceptance gates. Do not describe these as end-to-end verified until they pass with a real mailbox. Refresh-token renewal after actual token expiry is also a manual acceptance check; ordinary reload/session persistence passed.

## Tests

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm test:database
pnpm test:browser
```

The browser suites use ephemeral profiles and synthetic data. Ordinary UI tests serve empty cloud configuration; `auth-browser.cjs` supplies a clearly labelled provider fixture. `production-browser.cjs` loads only the public project configuration and never signs in or sends email. CI requires no Supabase secret or real user credentials. Live administrative acceptance checks are deliberately excluded from CI.

## Acceptance after approval

1. Review/approve the PR, merge/deploy only when authorised, and verify `https://simpledo.co.uk/` serves the updated welcome screen. Retain HTTPS enforcement and the exact redirect above. Refresh once online for the new service-worker shell. Never clear existing task storage to force a welcome screen; use a fresh profile instead.
2. In a fresh browser, confirm both tabs, keyboard tab/arrow navigation, show/hide password, form validation and the local-only route. Test desktop, 375px and 390px phones and a physical iPhone. Verify the form scrolls above the on-screen keyboard and local work survives offline reload.
3. With working SMTP, create a test account using a mailbox you own. Confirm passwords are cleared, password login is rejected before verification, and the confirmation email arrives. Open its link in the same browser, confirm the welcome screen closes, and reload. Check session persistence.
4. Create a uniquely named test task. Sign in with the same email/password in a fresh second browser/device. It must download the task without a Merge step. Edit from both devices and reload. Check **Saved** and no account error.
5. Sign out on one device. Use **Forgot password**. Check both known/unknown-email messaging remains neutral, open the actual recovery email in the requesting browser, reload before submitting, then set a password and sign in with it. Check the old password no longer works, the user ID is unchanged and tasks remain. Test expired/reused links and a link opened in another browser without a PKCE verifier: it must fail safely.
6. For an existing passwordless account, use its current email and a new magic link, then **Set or change password**. Sign out/in using the new password; verify the exact same account and cloud tasks. Do not create a second account or change the email to set a password.
7. On a device with a local-only task, sign in. Confirm the merge choice appears; choose Keep local and check nothing is uploaded/replaced. Reopen Settings and merge deliberately. Check recovery export and duplicate-ID handling. Repeat with another account's binding and with deletion/tag history but no live tasks.
8. Test offline edits, online reconnection, concurrent conflicting edits, completion and deletes with disposable test tasks. A conflict must preserve both different task versions; deletion must not resurrect after reload. Test logout/relogin and idle past token expiry. Download a backup before manipulating meaningful tasks.

No paid service, DNS change or deployment is required merely to review this PR. SMTP sender authorisation and the actual mailbox/device checks above are the remaining external gates.
