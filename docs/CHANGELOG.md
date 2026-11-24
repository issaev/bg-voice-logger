## v0.7.2 — Performance & Usability (draft candidate; NOT deployed)
- #6: coalesce successful current-action LOG/INFO/media sync into one final Google document read per batch, preserving acknowledgments and idempotency.
- #9: sticky top-bar queue button with count and attention indicator, public-mode access and pending-first modal; completed items available on demand.
- #10: choose an incident calendar date (default today in Europe/Sofia); WordPress and Apps Script validate; name, INFO and LOG date follow choice without changing actual created/event timestamps.
- #12: manual Google refresh available on all tabs; show last fresh timestamp; conservative 120s auto refresh when visible/online and not editing, recording, pending sync, or handling queue issues.
- GAS document-read path no longer repairs image anchors as a side effect. Sorting old Sheet rows with embedded images requires explicit image-anchor maintenance or further test action; validate before production.
- WordPress plugin and Apps Script update required together; Cloudflare Worker, STT, private settings and IndexedDB schema remain unchanged.
- 19/29 local test files passed vs 17/27 v0.7.1 with identical historical failures; no end-to-end performance claim is made prior to deployment and measurement.
- [Upgrade guide](UPGRADE_V072_BG.md) and [roadmap](ROADMAP.md).

## v0.7.1 — Reliability & INFO editing hotfix (operator-deployed 2026-11-24; end-to-end acceptance pending)
- #2: orphan media cleanup uses one shared readwrite IndexedDB transaction over queue + media.
- #3: local durable commit is independent of subsequent UI refresh; explicit audio retry preserves op_id.
- #4: TEAM/TECH add form retains values after failed enqueue.
- #5: unsaved local audio takes precedence over false "everything synced" status.
- #8: only the primary action-type INFO field is a dropdown; free-text comments/extra INFO are no longer action-type canonicalized/truncated by Apps Script.
- #11: async list refresh preserves a user-selected older incident and ignores stale responses.
- WordPress plugin v0.7.1 + coordinated Google Apps Script update required; Cloudflare Worker unchanged.
- IndexedDB schema remains v2; no migrations or queue resets. This is a development candidate; no production release approval.
- Targeted automated regression tests passed in isolation; production read-only verification confirmed the embedded JS build and 8/8 isolated checks passed. Real iPhone Safari and Google Sheets/Drive acceptance tests are still required. The live GAS revision is not independently verified.
- Source synchronized to GitHub `main` through merged PR #13; that merge did not perform deployment.
- See [upgrade guide](UPGRADE_V071_BG.md) and [roadmap](ROADMAP.md).

## v0.7.0 - Adaptive Google Sheets template and INFO (23 November 2026)
- Default template changes to `YOUR_TEMPLATE_SPREADSHEET_ID`.
- INFO sections and rows are discovered dynamically; new roles can be appended through the app.
- Dynamic title/column-based targets protect against wrong-cell writes after manual changes.
- The action-type dropdown is read from the template and checked without destroying custom chip colours.
- Existing legacy `Наводение` values are accepted as aliases in old documents; newer documents use `Наводнение`.
- A direct link to the current Google Sheet is available in the active session.
- Nonessential missing sheets no longer break the whole reader; unavailable tabs are identified.
- Requires Apps Script + WordPress update; Cloudflare STT worker remains unchanged.
- Limitation: existing LOG and TEAM/TECH technical identifier columns are not safe to move; blockers return clear errors instead of corrupting data.

# BG Voice Logger - Changelog

## v0.6.3 — Frontend build delivery and INFO crash hotfix (20 November 2026)
- BUG-009: fix undefined `col` when rendering INFO audio attachments; handle numeric cells defensively.
- REQ-022: React error boundary with visible recovery controls and no automatic reload.
- BUG-010: content-hashed WP enqueue versions for app.js/app.css, separately versioned service worker URL/cache.
- Expected on-disk and running JavaScript build identifiers in WP diagnostics and the app header.
- Offline cache update retains old cache when a fresh app shell cannot be obtained.
- WordPress-only; does not update IndexedDB, Apps Script, Worker, STT or media sync.
- BUG-008 cannot be closed without a fresh iPhone test that confirms the running JS build.


## v0.6.2 — Safari IndexedDB media and loading states (17 November 2026)
- BUG-008: separate binary media in IndexedDB v2 `media` store, using `ArrayBuffer` rather than mutable queue-held `Blob`; metadata status updates no longer rewrite binary data.
- IndexedDB success awaits `transaction.oncomplete`, with abort/error detection; queue child audio and parent text committed atomically.
- Stable audio-upload child IDs and resumable acknowledged chunks; repeated uploads reuse the same server identifiers.
- Local audio/photo playback and upload via shared media adapter, backwards-compatible with readable legacy Blob entries.
- User-visible download/retry if a newly recorded clip cannot be persisted locally.
- REQ-020: loading indicators/skeletons and retry on LOG, INFO, TECH and TEAM; reloading keeps existing data visible.
- WordPress package only. No Apps Script or STT Worker changes. Existing per-user queue DB is upgraded in place; no automatic deletion of pending legacy records.


## v0.6.1 — Media reliability hotfix (17 November 2026)
- BUG-007: extend `audio_read` POST/redirect deadlines to 45/25 s; photo read 35/25 s; media writes 35/20 s. Regular LOG operations keep the original budgets.
- Read-only, secret-free media timing history with safer cURL/timeout classification.
- Google Apps Script audio chunks increased to 512 KiB per read, saving remote round trips without changing private Drive access.
- Browser audio player includes native Play/Pause/seek, separate Stop, Cancel, and clear format/autoplay errors; bounded session-only blob cache.
- In-session photo previews and originals cached in memory with a bounded budget. No change to existing photo compression/quality.
- LOG refreshes after its own sync, before sequential media uploads finish; success notices stop obscuring header controls.
- Corrected Apps Script file based on the deployed syntax-fixed v0.6.0 source, not the older malformed copy. Cloudflare STT Worker unchanged.
- Remaining: true streaming/Range via authenticated Drive API and faster first-time photo transfer planned for v0.7.0.

## v0.6.0 - Reliable STT, private originals, event editing (17 November 2026)
- Microphone device selection, live input indicator and a four-second microphone test.
- Groq `verbose_json` diagnostic signals, no verbose prompt, transcript risk flags and confirmation before LOG writes for suspicious results.
- Private Drive original audio upload for voice LOG and INFO/TECH/TEAM field dictation, indexed by stable action/record identifiers, remotely playable for authorized users.
- LOG edit and soft-cancel with conflicts, stable UUIDs and immutable action history.
- Dismissible auto-expiring nonessential notifications, simpler recording UI.
- Includes manual Google sign-in PHP fatal-error fix.
- Deployment requires Apps Script, Cloudflare Worker and WordPress upgrades.

## v0.5.0 - Private incident photo gallery and marker semantics (11 November 2026)
- Square full-width header; source markers distinguish typed vs transcribed input.
- Lazy incident photo folder with the same name as the spreadsheet; same parent Drive folder.
- Private Drive originals and preview blobs, idempotent uploads, hidden `__BVLOG_PHOTOS` metadata keyed by stable LOG ID.
- Blob-based miniature over LOG column F and automatic re-anchoring after row sorting.
- In-app photo icon, counter and private gallery API; offline local previews and original resolution option.
- Existing rich-text photo links remain readable and older image folders are reused upon first new upload.
- Requires Apps Script Web App update as well as WordPress plugin replacement; Cloudflare STT Worker unchanged.


## v0.4.1 - Pending audio delete UI (11 November 2026)
- Adds visible "Изтрий записа" action to pending review cards, including audio awaiting transcription.
- Displays the target operation name and target field in the review card.
- Re-checks IndexedDB state before and after confirmation; no deletion during STT, sending, or after sync.
- Preserves existing IndexedDB and backend configuration; bumps plugin and service worker cache version.

## v0.4.0 - Cloud STT (10 November 2026)
- Introduces direct Cloudflare Worker STT gateway; Groq Whisper Large V3 primary, Cloudflare Workers AI Whisper V3 Turbo fallback.
- Audio is persisted to the existing IndexedDB queue before any STT network request; original document ID, author, time and UUID are retained.
- Short-lived HMAC STT tickets issued by authenticated WordPress REST; credentials are never shipped to the browser.
- Configurable STT mode / endpoint / signing secret in WordPress administration.
- Retryable STT failures remain in the queue with bounded exponential backoff; manual transcription stays available.
- Field dictation requires human review before updating INFO/TECH/TEAM; LOG dictation auto-submits after transcription.
- Includes Cloudflare Worker deployment template, local mock tests and comparative benchmarking utility.
- Keeps all v0.3.0 functions and Google Apps Script bridge unchanged.

## v0.3.0 - Google sign-in, photos, GPS and offline queue improvements
- Adds authenticated Google sign-in, per-user offline queues, photo uploads, geolocation, new title/logo.
- Uses browser SpeechRecognition and stores audio as a manual fallback.
