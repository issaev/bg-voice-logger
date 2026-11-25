## v0.8.3 — SMS fallback pilot + STT replay fix candidate (not deployed)

Based on v0.8.2.2 candidate (PR #45) and the v0.8.2.1 production working baseline. WordPress 0.8.3; JS `0.8.3-5e7cf749a0ac`; GAS 0.8.3. Optional separately deployable STT Worker 0.6.2 (sar-bg-v1 prompt unchanged); existing STT deployment does not change when installing WordPress/GAS.

- #44 carried forward: all-tab background refresh, warm navigation, quiet spinner.
- #47 **experimental synthetic-incident pilot, disabled by default**. One PWA; sender Android/iPhone, coordinator Android with registered, locally filtered SMS Gateway for Android. INFO latest block requires one exact coordinator role and one phone in its phone column. No dedicated gateway. No encryption. Per-operator/incident/gateway grant, signed readable DK1 SMS protocol, 22-character reversible UUID, 8-character combined scoped alias, original UTC seconds and source, 96-bit HMAC. Each piece is independent; first header 61 characters including newline, later 38. Each part is measured by GSM-7 septets or UTF-16 units; max 96 parts; no silent truncation. User opens each SMS composer manually (copy fallback); no false delivered/synced indicator. Only local original text/transcribed operations with canonical UUID are supported; remote-only legacy records and manual import/monitoring/self-service gateway registration are deferred.
- WordPress pilot requires explicit wp-config constants, synthetic doc allowlist, authenticated session, registered per-device gateway signing key and verified local prefix filter. The endpoint is not registered when disabled. The actual gateway app's local filtering and permissions remain a go/no-go blocker. Credentials are provisioned from successful INFO reads and cached per operator, not embedded in public JS. Durable SQL fragments/receipt, strict gateway webhook signature over raw body + timestamp, complete-message HMAC, scope/actor validation, current INFO recheck before writing, review and admin retry. The locked GAS operation path is shared with Internet; original payload hash stored in operation receipt. Same op_id with different verified original or unverified legacy SMS receipt => review. Never overwrite/delete a manually edited row. Normal sync retains its queue and original ID. Timeout/retry and durable database behavior need real testing. Pilot retention/cleanup is manual and bounded by grant quota; production registration and retention tooling pending.
- #48 optional STT Worker candidate: SQLite-backed Durable Object per jti, synchronous transaction for check+reserve, cleanup alarm, fail closed. Existing KV is only read as migration guard. New binding/migration required; no Worker deployment or config change performed. Cross-isolate/real Workers and provider acceptance still required.
- #43 full photo quality/original/large media and #46 direct Google API/cache architecture remain backlog. No change to photo limits, queue schema, existing Google credentials, or deployed infrastructure.
- Verification: 7 SMS protocol/GAS-receipt isolated checks, 6 nonce reservation mock checks (20 concurrent calls accept one), 10 v0.8.2.2, 12 v0.8.2, 9 v0.8.1 targeted checks = 44 checks. JS/GAS/SW and Worker syntax parsed in V8; PHP cross-language fixture committed but not executed here; full PHP/Node suite and inherited failures, real gateway devices, WordPress/MySQL, Sheets/Drive, Cloudflare deployment, 100-message acceptance and benchmarks pending. No assertion of production readiness or measured network speedup.

## v0.8.2.2 — all-tab background refresh and quiet indicator (candidate; not deployed)

Issue #44. WordPress-only update, based on the production working baseline v0.8.2.1 in main. WordPress 0.8.2.2, JS `0.8.2.2-3e65539c2fb5`; GAS 0.8.2 and Cloudflare STT unchanged.

- Initial priority LOG, INFO, TECH, TEAM (visible navigation order). One speculative read at a time. All tabs refresh independently about 120 seconds after their last successful response, rather than only the active tab. Dirty tabs prioritized; oldest due tab first so slow requests cannot starve another. Refresh intervals are best effort, not guaranteed deadlines.
- Warm tab switches render the per-incident/per-operator memory snapshot immediately without an extra request when fresh. Missing tab requested explicitly takes priority; an existing identical in-flight read is adopted, not duplicated. Preserve IndexedDB per-tab and legacy fallback; no schema or queue change. Inactive responses update cache, not the visible tab. If a visible edit is in progress, defer repaint until safe.
- Pause new speculative requests while recording, processing media/transcription, saving, syncing, hidden or offline. Failures back off per tab; visible errors and retry behavior remain. Confirmed writes invalidate the affected tab(s) immediately; SW sync and reconnect invalidate all. A pre-ACK response cannot overwrite newer data; refresh occurs after the foreground write lease is released.
- Remove routine inline “Обновяване на данните...” and recurring freshness text. Small reserved-space spinner beside “Отвори таблицата”; only visible while a read is running, with accessible status. Real errors, offline/stale-copy labels, and skeleton placeholders for genuinely empty initial views remain.
- Verification: 10 new focused simulated checks, 12 v0.8.2 and 9 v0.8.1 targeted checks passed; JS syntax parsed. Full PHP/Node suite, real browser UI, Google Drive/Sheets acceptance, network load and timing tests pending. More read requests than active-tab-only polling by design; measure latency and GAS quotas under concurrent users. No guaranteed locked-screen background work. Issue #43 photo quality is separate backlog and is not part of this patch.
- No deployment, merge, changes to credentials, media, existing queue, or GAS/SW protocol.

## Production status — 2026-11-24

Operator confirmed deployment of the latest **WordPress v0.8.2.1** to production on 2026-11-24. This is an operator-reported installation, not completed acceptance or an independently verified live build.

| Component | Version / status |
|---|---|
| WordPress | 0.8.2.1 — operator-reported production |
| JavaScript | `0.8.2.1-188c8b66fb21` — expected build; verify on real devices |
| Google Apps Script | 0.8.2 — required/expected backend, live revision not independently verified |
| Cloudflare STT | `sar-bg-v1` — unchanged code, live health not independently verified |

Source release commit: `3c59f38752c4b7f5b4b3fb5722b20ee8b8ee30ce` ([PR #42](https://github.com/issaev/bg-voice-logger/pull/42), stacked on [PR #41](https://github.com/issaev/bg-voice-logger/pull/41)). [WordPress ZIP](https://github.com/issaev/bg-voice-logger/raw/e23558ac9e99fb268b366e1b927efbb42c8bf4d5/bg-voice-logger-v0.8.2.1.zip) · [GAS/Worker ZIP](https://github.com/issaev/bg-voice-logger/raw/ffd65622ff037ad65531dbc10119357edce23c8d/bg-voice-logger-v0.8.2-code.zip).

**Next gate: acceptance testing.** Freeze feature work; run the full Node/PHP regression suite (investigate the ten inherited failing tests; no claim they are resolved), real Android/iPhone/PWA, Google Sheets/Drive, authentication and identity isolation, offline/retry/duplicate and media integrity, and paired performance tests. Verify actual GAS version and Range behavior. Background sync remains best effort, not guaranteed while locked. The original transient network failure root cause remains unconfirmed. Keep issues open until their acceptance criteria pass. The operator explicitly approved promotion of v0.8.2.1 to `main` as the working baseline on 2026-11-24. [PR #42](https://github.com/issaev/bg-voice-logger/pull/42) records the integration. This approval is not acceptance, certification, or a new deployment action; the status update changes documentation only.

Historical release notes below describe their status at authoring time, not the current production state.

## v0.8.2.1 — WordPress-only icon refinement (operator-reported production; acceptance pending)

Replaces the custom install glyph from v0.8.2 (#40) with the official Google Material Icons Rounded `install_mobile` SVG (Apache-2.0); original geometry, navy/white/red colors, visible “Инсталирай”, existing compact bottom position. No external assets or changes to the install mechanism or IndexedDB. WordPress 0.8.2.1, JS `0.8.2.1-188c8b66fb21`; GAS remains 0.8.2, Cloudflare STT unchanged. If upgrading directly from an older backend, install GAS 0.8.2 first. Deployment has been reported by the operator; source promotion to main is approved. Actual mobile acceptance remains pending.

## v0.8.2 — integrated acceptance candidate (not deployed)

Source branch `feature/v0.8.2-test-candidate`, based on v0.8.1; WordPress and Apps Script `0.8.2`, JS `0.8.2-39896a2667b4`. Cloudflare STT Worker unchanged (sar-bg-v1). No production changes or merge.

- #40: compact SKB-inspired blue/red/white install tile with visible “Инсталирай” label, at the bottom; native prompt/manual instructions and standalone guard retained.
- #16/#36: optional tab-scoped GAS reads, actual LOG bootstrap from a newly created document after releasing the global write lock (only when within time and size budgets); fallback to normal read on failure. No blocking LIST. Separate per-operator/tab snapshots with cached/fresh label, legacy full-document fallback, abort/scope/request generation protection. Sparse private index lookups use exact keys and bounded range groups; dense/unsupported search falls back to complete index scan. INFO schema and legacy projection share a read. Only chooser action types use a 60s version-keyed cache; CREATE and writes validate live sheets.
- #36 and #15: batch technical header checks; retain formula protection and idempotency; global write lock wait bounded to 8s, ordinary operation POST 30s, CREATE 45s; normal media budgets retained. CREATE remains duplicate-safe via durable reservation from v0.8.1.
- Media: sequential 256 KiB audio protocol keeps the existing IDs, part names, sizes, checkpoints and old-client behavior; new clients avoid scanning all parts on intermediate acknowledgments and rewind to the first missing part after an incomplete final ACK. Finalization still checks all parts. New photo preview bytes reused instead of re-downloading them; retry uses stored preview. Existing authenticated Range playback retained.
- Prior v0.8.1 changes and v0.8.0.1 login fix carried forward. No IndexedDB schema change or credential change. Background Sync remains best effort (#27); guaranteed locked-screen transfer on iOS would require a different architecture.

Verification: JavaScript, service worker and Apps Script parsed in V8; 12 new targeted mocked checks and 9 prior v0.8.1 checks passed. No full PHP/Node suite, physical browser, live Sheets/Drive or production latency benchmark performed here. No speedup percentage claimed. Native background SLA, the original transient-network root cause (#22), actual Drive Range support, inherited test failures and any measurement-driven follow-on work remain acceptance/investigation items. Do not close issues until verified. The operator subsequently approved main integration of v0.8.2.1 as the working baseline before acceptance; historical release notes do not establish current production status.

## v0.8.1 — next candidate (not deployed)

Source branch `feature/v0.8.1-next`, based on operator-reported production v0.8.0.1. WordPress `0.8.1`, JS `0.8.1-dcfac367badc`, Apps Script `0.8.1`; STT Worker unchanged (sar-bg-v1). This is a candidate for acceptance, not an accepted production release.

- #35: bottom icon instead of large install card; native Android prompt/manual iOS instructions/installed gating retained.
- #37: mobile journal actions occupy the full card width below timestamp and body, both local and confirmed entries; desktop alignment retained.
- #38: one Add photo button in new/existing LOG entries with explicit camera/gallery choice, native picker gesture, original handlers retained.
- #36: eliminate blocking folder LIST after confirmed CREATE; pin new incident and load the LOG shell immediately while the existing full read populates data. Persist pending request ID/payload per operator across reload; block concurrent submits and editing uncertain requests. Apps Script reserves the ID before copying; incomplete copies have a unique reserved name and are hidden from incident list; recover the same copy and finish initialization, never recreate an ambiguous/missing confirmed copy blindly. CREATE POST 45s, GAS CREATE lock wait 8s; normal write budgets unchanged. Add sanitized per-phase Google and bridge timings to admin history. No measured speedup yet. Full lazy per-tab reads, caching and backend bootstrap snapshot remain future optimizations pending measurement.
- No IndexedDB schema change, no new STT Worker logic, no credential changes. No merge or deployment.

Verification: JS and GAS syntax parsed; nine targeted isolated create/picker/layout checks and actual frontend timeout/retry mock passed. ZIP structure/CRC will be checked during packaging. Full Node/PHP suite, real Drive fault/parallel creates, physical Android/iPhone and production performance tests not executed. Do not close issues before acceptance.

# Current release status

**Historical production report (superseded): WordPress v0.8.0.1**, expected JS `0.8.0.1-b9391cb399e3`. Source commit `4a7054f10ed1b50817505de8e673f648d7939b83` ([PR #32](https://github.com/issaev/bg-voice-logger/pull/32)); [WordPress package](https://github.com/issaev/bg-voice-logger/raw/efce55ecc83084864e01e23c83d9a2268aaa158a/bg-voice-logger-v0.8.0.1.zip). Expected backend configuration: Apps Script v0.8.0 and Cloudflare STT `sar-bg-v1` ([backend package](https://github.com/issaev/bg-voice-logger/raw/b96a0f3f5cdb815f887056e48f9af60da79caa67/bg-voice-logger-v0.8.0-code.zip)); the report does not independently establish the live backend versions or JS marker. Installation is reported, not acceptance. Full combined Node/PHP, physical mobile login, Sheets/Drive integrity, media and performance verification remain pending. No issues closed and no source merge or deployment performed in this documentation update. Main still holds v0.7.2.1 pending explicit merge approval. #35 is deferred.

## v0.8.0.1 — mobile Google sign-in hotfix (operator-reported production 2026-11-24; acceptance pending)
- #34: foreground challenge reused; background session checks no longer rotate login cookie; fresh challenge immediately before credential exchange, one bounded retry for explicit login CSRF rejection, no retry on allowlist failure. Existing token validation and queues retained.
- JS and service worker parsed, isolated credential exchange retry and non-CSRF rejection passed, distribution ZIP CRC verified. No full combined Node/PHP execution or real device acceptance yet.

## v0.8.0 — integrated release (operator-reported superseded by v0.8.0.1)
- #11, #22–#28, #33: stable incident choice, bounded retries, best-effort background sync, camera, title, arbitrary filenames and removed 250-item listing cap, hidden legacy import control, phone installation.
- #16: integrated GAS read profiling and bounded scans from PR #21; no measured improvement claimed. Additional optimization remains open.
- #7: authenticated Range audio playback, full-download fallback, Drive range read with full-blob fallback, fewer rereads during upload; real media and security verification pending.
- PR #1: 34-term SAR glossary and anti-echo/no-speech STT guards integrated; real audio acceptance pending.
- #35 deferred: replace install card with bottom icon in next release.

The release notes below record historical development snapshots and their test results, not the current production status.

## v0.8.0-A — GAS read profiling and bounded scans (DRAFT, NOT DEPLOYED)
- Staging-only guarded Apps Script runner and Node comparator; both refuse to print document IDs/cell content. Test workbook must be named `BVLOG_BENCHMARK_*` and explicitly enabled via staging Script Properties.
- Staging execution not performed; Google Drive connector returned HTTP 429 on a subsequent metadata request. Local suite now 27/37 vs 23/33 baseline; same ten historical failures.
- [Staging instructions](STAGING_TEST_V080A_BG.md).
- Replace unbounded last-operational-row scans with backward windows, starting at 256 and growing to at most 4096 rows per Google Sheets read.
- Reuse existing Drive file name and Sheet tab handles in `bvlRead_` without weakening folder checks, data shape or old media mappings.
- Emit safe request correlation plus separate `phase_ms` and `elapsed_ms` for read/list/write stages and serialized responses. Trace lock wait separately from Sheets work.
- Add `tools/analyze-gas-traces.mjs` for aggregate redacted log analysis and synthetic golden equivalence test fixtures.
- **25/35 isolated test files PASS** vs **23/33** v0.7.2.1; the same ten historical failures, no new failing file names. No production speed measurement.
- Google Apps Script draft identifies itself as `0.8.0-a1`. WordPress, STT, IndexedDB and private configuration are unchanged. Audio streaming #7 remains future work.
- [Staging, instrumentation and rollback instructions](PLAN_V080A_BG.md).

## v0.7.2.1 — Reliability & continuous voice LOG hotfix (operator-reported production 2026-11-24; acceptance pending)
- #18: render each dictated LOG event continuously through audio/STT/review/pending/sending/synced/server echo with one stable op_id and no duplicate/flicker.
- #17: distinct incident-list, document-read, sync and local persistence errors; a successful read cannot mask unrelated unsaved audio. Keep last confirmed data on read failure.
- #15: read POST timeout 35s (previously 15s), redirect GET 15s, other operation budgets unchanged. Bound 120s polling with backoff and prevent overlapping reads for an incident.
- WordPress: a 30-entry sanitized history for read/list/create/operation terminal results; safe request correlation to Apps Script.
- GAS: privacy-safe action and read-phase timings. Still does **not** solve 115s execution outliers; investigate with trace data for #16.
- WordPress/Google Apps Script must be upgraded in coordination; no Cloudflare STT, IndexedDB or Sheets schema migration.
- Isolated test suite 22/32 PASS vs 20/30 on the previous voice continuity candidate; same ten inherited failures; real iPhone and Sheets acceptance pending.
- [Hotfix upgrade and rollback guide](UPGRADE_V0721_BG.md).

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
