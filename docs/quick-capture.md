# Quick Capture setup and launch notes

Quick Capture builds on PR #4's existing tags, calendar capacity and Snapshot work. This branch is intended to be reviewed as a follow-on change; do not deploy it without those dependencies.

## What works immediately

Type in the existing Inbox field and press Enter or +. Speak opens a small editable dictation sheet; no account, key or paid transcription service is required. Scan also accepts pasted text from a phone's own text scanner, with one task per line, without sending a photo anywhere. Optional tags use the existing Work, Home and custom catalog. Untagged tasks stay untagged; Home retains its separate capacity classification.

Both review flows allow editing, selection and removal, followed by one confirmation. Each selected item becomes an ordinary unscheduled Inbox task with its own ID and timestamps, using the existing local-first store, backup and queued Supabase task sync. Repeated names within the capture or among current unfinished tasks are skipped (case and whitespace insensitive); completed tasks do not block a new capture. Intentional tasks with the same title can still be created in the regular task editor. Existing tasks are not modified.

Typed capture and pasted text work offline. Voice depends on the browser/device, and cloud photo recognition requires a network connection. No capture is automatically scheduled. There is no new task schema or competing tag system.

A future shortcut can open `?capture=type`, `?capture=speak` or `?capture=scan` on the existing app URL. These open the field/sheet; they never start the microphone or upload a photo automatically. No native widget or app is implemented.

Text drafts are kept in memory and, when available, **this tab's sessionStorage**, so a failed request or reload does not erase them. Closing the capture sheet keeps the draft; **Discard capture** clears it. Successful additions clear it. Browser session restoration may retain a tab's sessionStorage, so discard sensitive text when finished. Drafts are not backups or synchronised task data. Photos/audio never enter localStorage, sessionStorage, backups or the service-worker cache.

## Browser dictation

Feature detection checks `SpeechRecognition` and `webkitSpeechRecognition`; only **Start speaking**, tapped by the user, starts recognition and a permission request. There is a visible Listening indicator, Stop and Discard. Closing the sheet or backgrounding the page aborts listening. Recognised text remains editable and requires review/confirmation. SimpleDo does not create audio blobs, retain audio or use a separate transcription API.

| Browser | Expected behaviour, subject to settings and device |
| --- | --- |
| Chrome desktop/Android | Native speech API may be available. Its recognition service can require internet. |
| Safari macOS/iPhone/iPad | Safari introduced recognition in 14.1 / iOS and iPadOS 14.5. Siri must be enabled according to WebKit; permissions and installed/PWA behaviour need device checks. |
| Firefox, embedded browsers, restricted environments | If the API is missing or denied, use the keyboard microphone or type/paste. Constructor availability alone does not prove recognition works. |

Sources checked 16 October 2026: [WebKit's Safari speech support](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/), [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [experimental local processing](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally). SimpleDo lets the browser choose its recognition engine; it does not promise local processing or install language packs. Audio may be processed by the browser vendor's service. Offline recognition is available only when that browser/device supports it. Keyboard dictation is controlled by the operating system and its privacy settings.

## Handwriting approach and limitations

The prepared provider is [Google Vision DOCUMENT_TEXT_DETECTION](https://docs.cloud.google.com/vision/docs/handwriting), designed for printed documents and handwriting. This is a practical candidate, not a claim that an accuracy comparison or live handwriting trial has been completed. It reconstructs lines from the provider's word/symbol breaks, using the lowest word confidence in each line. Scores below 0.85 or missing scores start unselected with **Check text**. All results require review; the app uses no language model to fill gaps, infer tasks or correct words. Long lines must be shortened rather than silently truncated. Photograph one simple column/list at a time; wrapped lines and columns can need manual correction.

Explicit recognised `[x]`, checked-box/tick characters and `~~...~~` markers start excluded. The provider does not reliably report physical pen strike-throughs or all checkbox marks. Unmarked physical crossings/ticks cannot safely be inferred: users must check these in review. Nothing is imported automatically. Accuracy on actual handwriting, lighting and ticked/crossed lists remains a launch acceptance check.

[Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) processes text on-device in native apps. A portable web page cannot directly call that native framework; copying text from iOS Live Text and pasting it is the immediate zero-provider-cost alternative. Browser TextDetector is not a dependable cross-browser handwriting baseline. No heavy model or Tesseract runtime is downloaded to phones; Tesseract is not used as the sole handwriting recognizer. A native on-device adapter can be assessed when native apps are built.

## Costs and the £0 boundary

Verified against [Google Vision pricing](https://cloud.google.com/vision/pricing) on **16 October 2026**: Document Text Detection includes the first **1,000 units per month free**, then **US$1.50 per 1,000** through 5 million units. One image with this one feature is one unit. Non-USD billing follows local SKUs; other services can have separate costs. This adapter sends exactly one image and one feature per reserved request and never automatically retries Google.

**This is not a guaranteed provider-enforced £0 spending cap.** [Google alerts-only budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets) do not stop spending. The current [spend-cap service list](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) does not include Cloud Vision and warns of enforcement lag/overages even for eligible services. Billing is required for Vision. Supabase hosting/function quotas, other Vision usage on the billing account, compromised credentials or a separately deployed backend can create costs outside this adapter's control. If an absolute £0 guarantee is required, leave cloud OCR disabled and use the on-device copy/paste route.

`004_capture.sql` applies atomic, database-owned reservations before a paid provider call:

- Per account: 2 requests per rolling minute, 10 per rolling 24 hours.
- Whole app: 10 per rolling minute, 50 per rolling 24 hours, **800 per rolling 32 days**. A 32-day window covers any calendar month without relying on provider billing timezone.
- Request IDs cannot be reused. The same normalised image by the same account is blocked for 24 hours. Lost responses and provider failures still consume reservations; no refunds or automatic retries can accidentally exceed the limit.

A database advisory lock serialises checks across edge instances and accounts. Browser roles cannot read/write reservations or call the reservation RPC. Deleting an account keeps anonymised reservations so shared limits cannot reset. Metadata older than 40 days is removed on the next reservation. These limits are intentionally hardcoded; changing them requires a reviewed SQL change. Use one shared database/adapter for this beta; never restore/reset the reservation table to restart the free allowance. This safety margin is an application control, not a Google billing guarantee.

## External setup — only after explicit activation approval

No Google project, API, billing account or secret has been configured or activated by this change. Scan buttons explain the unavailable service and leave paste available. A configured service also requires a signed-in Supabase account.

1. Finish the existing Supabase account/task/tag setup in README. Apply `supabase/004_capture.sql` after migrations 001–003. Verify authenticated/anon cannot access scan reservations.
2. After approval of the cost boundary above, use a dedicated Google Cloud project, enable Vision and its required billing, and create a dedicated server API key restricted to **Cloud Vision API**. Review all other Vision use sharing the billing allowance. [Google API-key authentication](https://docs.cloud.google.com/vision/product-search/docs/auth) supports this direct image request. Never put the key or service role in `config.js`, Git, client code or public logs. Consider fixed-egress IP restrictions when supported by the hosting setup; HTTP-referrer restrictions do not protect server calls.
3. In Supabase Edge Function secrets, set `GOOGLE_VISION_API_KEY`, `SIMPLEDO_APP_URL` to the exact HTTPS app URL (e.g. `https://dtosh44.github.io/SimpleDo/`) and leave `SIMPLEDO_OCR_ENABLED` unset initially. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are server-provided secrets. Deploy `supabase/functions/capture-scan` with its checked-in `verify_jwt=false` configuration: the handler verifies the bearer token with Supabase Auth on every POST. No scan is allowed from an unverified identity.
4. Verify disabled status, CORS origin, request validation, DB quota rejection and no request-body logging in the deployed environment. Configure low provider quotas as an additional defence and billing monitoring for visibility; these do not replace the shared reservation limit. Check the project's Supabase free-plan usage and cost controls before public signups.
5. **After approval**, set `SIMPLEDO_OCR_ENABLED=true`, run a small authorised real handwriting/print acceptance set and verify quota consumption. Remove this secret or revoke the Google key to disable scanning. Do not enable production photo buttons until these checks pass.

The server accepts one bounded JPEG with dimensions at most 2400 pixels per side; browser uploads can be JPEG/PNG/WebP up to 12 MB and 40 megapixels, resized down to a 2400-pixel long edge and re-encoded as JPEG at quality 0.9. This also strips source metadata. HEIC/PDF/SVG are rejected with guidance; iPhone camera conversion/picker output must be checked on a real phone. A camera input with `capture=environment` and a separate library input provide both routes where supported. Images are never fetched from user URLs.

## Privacy and manual launch checks

Images are held in browser/edge memory only while processing and sent over HTTPS to Google's online annotation endpoint. SimpleDo creates no photo bucket or persistent image/result store. It records only request ID, owner ID (cleared on account deletion), owner-scoped image hash and reservation time for quota/idempotency. No image, recognised text, key or provider exception is logged by the handler; no sensitive provider error is returned to the client. Do not enable hosting request-body tracing. Confirm your host's operational metadata/log retention separately. [Google's data-usage FAQ](https://docs.cloud.google.com/vision/docs/data-usage) describes in-memory processing for online annotation and temporary request metadata. It is a third-party processing service, not a promise of on-device OCR.

Automated verification covers capture parsing, speech events/denial/cancellation, photo validation, provider responses/failure/low confidence, duplicate handling, tags, ordinary store/backup/two-device simulated revision sync, auth/origin checks, private errors and actual PostgreSQL quota/privilege behaviour. Real Chromium UI tests exercise desktop and a mobile-sized viewport, image compression/review, local storage failure/draft recovery and offline typing. Chrome 154.0.8037.100 exposed both recognition constructors in the native API check; no real microphone session was started. Speech and OCR responses in interaction tests are **simulated**, and viewport resizing is not a physical phone test.

Before launch, manually verify current iPhone Safari and installed PWA, Android Chrome, desktop Safari/Chrome and Firefox fallback: permissions allowed/denied, Stop/Discard/backgrounding, keyboard dictation, airplane mode, camera/library orientation/format, a noisy/unclear handwritten list, print, crossed/ticked items and duplicate submission. Sign into the same configured Supabase account on two real devices and verify capture propagation, offline retry and sign-out. Live Google recognition, live Supabase sync, real microphone/audio and physical phone compatibility have not been verified here.
