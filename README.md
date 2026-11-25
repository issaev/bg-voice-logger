## v0.8.3 — SMS fallback pilot + STT replay fix candidate (not deployed)

Based on v0.8.2.2 candidate (PR #45) and the v0.8.2.1 production working baseline. WordPress 0.8.3; JS `0.8.3-5e7cf749a0ac`; GAS 0.8.3. Optional separately deployable STT Worker 0.6.2 (sar-bg-v1 prompt unchanged); existing STT deployment does not change when installing WordPress/GAS.

- #44 carried forward: all-tab background refresh, warm navigation, quiet spinner.
- #47 **experimental synthetic-incident pilot, disabled by default**. One PWA; sender Android/iPhone, coordinator Android with registered, locally filtered SMS Gateway for Android. INFO latest block requires one exact coordinator role and one phone in its phone column. No dedicated gateway. No encryption. Per-operator/incident/gateway grant, signed readable DK1 SMS protocol, 22-character reversible UUID, 8-character combined scoped alias, original UTC seconds and source, 96-bit HMAC. Each piece is independent; first header 61 characters including newline, later 38. Each part is measured by GSM-7 septets or UTF-16 units; max 96 parts; no silent truncation. User opens each SMS composer manually (copy fallback); no false delivered/synced indicator. Only local original text/transcribed operations with canonical UUID are supported; remote-only legacy records and manual import/monitoring/self-service gateway registration are deferred.
- WordPress pilot requires explicit wp-config constants, synthetic doc allowlist, authenticated session, registered per-device gateway signing key and verified local prefix filter. The endpoint is not registered when disabled. The actual gateway app's local filtering and permissions remain a go/no-go blocker. Credentials are provisioned from successful INFO reads and cached per operator, not embedded in public JS. Durable SQL fragments/receipt, strict gateway webhook signature over raw body + timestamp, complete-message HMAC, scope/actor validation, current INFO recheck before writing, review and admin retry. The locked GAS operation path is shared with Internet; original payload hash stored in operation receipt. Same op_id with different verified original or unverified legacy SMS receipt => review. Never overwrite/delete a manually edited row. Normal sync retains its queue and original ID. Timeout/retry and durable database behavior need real testing. Pilot retention/cleanup is manual and bounded by grant quota; production registration and retention tooling pending.
- #48 optional STT Worker candidate: SQLite-backed Durable Object per jti, synchronous transaction for check+reserve, cleanup alarm, fail closed. Existing KV is only read as migration guard. New binding/migration required; no Worker deployment or config change performed. Cross-isolate/real Workers and provider acceptance still required.
- #43 full photo quality/original/large media and #46 direct Google API/cache architecture remain backlog. No change to photo limits, queue schema, existing Google credentials, or deployed infrastructure.
- Verification: 7 SMS protocol/GAS-receipt isolated checks, 6 nonce reservation mock checks (20 concurrent calls accept one), 10 v0.8.2.2, 12 v0.8.2, 9 v0.8.1 targeted checks = 44 checks. JS/GAS/SW and Worker syntax parsed in V8; PHP cross-language fixture committed but not executed here; full PHP/Node suite and inherited failures, real gateway devices, WordPress/MySQL, Sheets/Drive, Cloudflare deployment, 100-message acceptance and benchmarks pending. No assertion of production readiness or measured network speedup.

# BG Voice Logger — v0.8.2.1 working version (production; acceptance pending)

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

Bulgarian voice-based operational log for rescue coordination. Components:
WordPress PHP plugin, browser React/PWA frontend, Google Apps Script
Sheets/Drive backend, Cloudflare Worker speech-to-text gateway, tests and docs.

## v0.8.1 — next candidate (not deployed)

Source branch `feature/v0.8.1-next`, based on operator-reported production v0.8.0.1. WordPress `0.8.1`, JS `0.8.1-dcfac367badc`, Apps Script `0.8.1`; STT Worker unchanged (sar-bg-v1). This is a candidate for acceptance, not an accepted production release.

- #35: bottom icon instead of large install card; native Android prompt/manual iOS instructions/installed gating retained.
- #37: mobile journal actions occupy the full card width below timestamp and body, both local and confirmed entries; desktop alignment retained.
- #38: one Add photo button in new/existing LOG entries with explicit camera/gallery choice, native picker gesture, original handlers retained.
- #36: eliminate blocking folder LIST after confirmed CREATE; pin new incident and load the LOG shell immediately while the existing full read populates data. Persist pending request ID/payload per operator across reload; block concurrent submits and editing uncertain requests. Apps Script reserves the ID before copying; incomplete copies have a unique reserved name and are hidden from incident list; recover the same copy and finish initialization, never recreate an ambiguous/missing confirmed copy blindly. CREATE POST 45s, GAS CREATE lock wait 8s; normal write budgets unchanged. Add sanitized per-phase Google and bridge timings to admin history. No measured speedup yet. Full lazy per-tab reads, caching and backend bootstrap snapshot remain future optimizations pending measurement.
- No IndexedDB schema change, no new STT Worker logic, no credential changes. No merge or deployment.

Verification: JS and GAS syntax parsed; nine targeted isolated create/picker/layout checks and actual frontend timeout/retry mock passed. ZIP structure/CRC will be checked during packaging. Full Node/PHP suite, real Drive fault/parallel creates, physical Android/iPhone and production performance tests not executed. Do not close issues before acceptance.

**Historical production report (superseded): WordPress v0.8.0.1**, expected JS `0.8.0.1-b9391cb399e3`. Source commit `4a7054f10ed1b50817505de8e673f648d7939b83` ([PR #32](https://github.com/issaev/bg-voice-logger/pull/32)); [WordPress package](https://github.com/issaev/bg-voice-logger/raw/efce55ecc83084864e01e23c83d9a2268aaa158a/bg-voice-logger-v0.8.0.1.zip). Expected backend configuration: Apps Script v0.8.0 and Cloudflare STT `sar-bg-v1` ([backend package](https://github.com/issaev/bg-voice-logger/raw/b96a0f3f5cdb815f887056e48f9af60da79caa67/bg-voice-logger-v0.8.0-code.zip)); the report does not independently establish the live backend versions or JS marker. Installation is reported, not acceptance. Full combined Node/PHP, physical mobile login, Sheets/Drive integrity, media and performance verification remain pending. No issues closed and no source merge or deployment performed in this documentation update. Main still holds v0.7.2.1 pending explicit merge approval. #35 is deferred.

**Public-source safety note:** No private Google folder/template identifiers, credentials, or production data are included. The public distribution packages preserve existing site configuration; do not use them as a substitute for acceptance testing.

### Configuration

Set up Google Drive/Sheets, Apps Script and the STT Worker as described in
`docs/` and the WordPress plugin settings. Google Drive folder and template
IDs must be entered through WordPress Settings or configured server-side via
`wp-config.php` constants (not committed here):

```php
define('BVLOG_DEFAULT_FOLDER_ID', 'your-private-folder-id');
define('BVLOG_DEFAULT_TEMPLATE_ID', 'your-private-template-id');
// Optional for upgrades from an older project-specific default:
define('BVLOG_LEGACY_TEMPLATE_ID', 'your-previous-template-id');
```

Do **not** commit `wp-config.php`, tokens, private service account files,
Cloudflare/Groq secrets, customer incidents, recordings or real Sheets exports.
The Google template itself is not included; only code that works with such a
template. This source distribution does not automatically reproduce the live
operational configuration or deployment.

### Reference performance baseline

`benchmarks/2026-11-23/` contains the five supplied Work-mode files. HTTP
GET and anonymous session timings are measured, but interactive UI and
end-to-end `PERF-02`–`PERF-15` timings have **not** been measured. The
historic audio/photo bridge timings must not be treated as full upload or
playback duration. The referenced `benchmark.py` runner was not supplied.

### v0.8.0-A — historical profiling branch (integrated in PR #32; live benchmarks pending)

**Staging A/B benchmark tooling:** a guarded editor-only runner (`apps-script/STAGING_READ_BENCHMARK.gs`) and a privacy-safe comparison script (`tools/compare-staging-reads.mjs`) are prepared. Use only a synthetic spreadsheet named `BVLOG_BENCHMARK_*` in an isolated staging folder; no live Google timings have been collected yet. See [Bulgarian staging instructions](docs/STAGING_TEST_V080A_BG.md).

[Feature branch](https://github.com/issaev/bg-voice-logger/tree/feature/v0.8.0a-gas-read-profiling) begins v0.8.0 with an Apps Script-only profiling and Sheets-read optimization candidate. It bounds last-row scans, reuses authorized Drive and Sheet handles, and records privacy-safe per-phase timings. **WordPress production stays at the operator-reported v0.7.2.1.** This is **not** the v0.8.0 release and has no audio streaming implementation yet. Read [measurement and rollback plan](docs/PLAN_V080A_BG.md). Synthetic tests: **25/35 PASS vs 23/33 on v0.7.2.1, same ten inherited failures**, with no real GAS speed measurements.

### Project status

**Source synchronized to operator-deployed v0.7.2.1:** WordPress v0.7.2.1; embedded JS build `0.7.2.1-613947b7e695`. This release includes [#18](https://github.com/issaev/bg-voice-logger/issues/18) voice continuity, [#15](https://github.com/issaev/bg-voice-logger/issues/15) read transport / diagnostics and [#17](https://github.com/issaev/bg-voice-logger/issues/17) scoped errors. Cloudflare STT and IndexedDB schema remain unchanged.

**Verification:** 22/32 isolated test files passed, with the same ten historical failures observed in the v0.7.2 predecessor. Real iPhone Safari, Google Sheets/Drive and 20–35s timing scenarios have **not yet been confirmed** on the operator-deployed release. Read [v0.7.2.1 upgrade/rollback notes](docs/UPGRADE_V0721_BG.md) for recovery and verification. The operator deployed v0.7.2.1 independently; merging GitHub PRs did not deploy the website or Google Apps Script.

### License

No license was provided with the original source archive. A public GitHub
repository does not, by itself, grant reuse rights; repository ownership
should choose a license separately.

---

## Previous release notes (v0.6.2)

WordPress / React PWA / Google Apps Script / private Google Drive / Groq + Cloudflare STT.


## v0.7.0 (requires Google Apps Script + WordPress)

- New default template ID, with its action-type validation typo corrected in the source sheet.
- Dynamic INFO sections, row labels and field columns from the current document, with manual edits supported.
- Add roles or other INFO fields from the app. Re-resolve labels/headers when writing to avoid wrong-cell edits.
- Strict dropdown choices are checked without rewriting validation rules or their option colours.
- Direct Google Sheets link to the active action.
- Unrelated missing tabs produce visible warnings while readable tabs remain available.
- App version and Service Worker resources remain content-hashed; indexed media, STT and Google authentication are unchanged.

See `docs/UPGRADE_V070_BG.md` for upgrade order, original dropdown-colour restoration and acceptance tests. The existing v0.6.2 notes below are retained for historical reference.

**Historical v0.6.2 was a WordPress plugin-only update** over v0.6.1. Keep the existing v0.6.1 Apps Script deployment and the v0.6.0 Cloudflare STT Worker; credentials and provider bindings remain unchanged.

## Changes

- IndexedDB per-user queue schema 2 adds a separate `media` object store for `ArrayBuffer` audio/photo bytes. Mutable queue metadata no longer contains Blob objects.
- Transactions resolve only after `oncomplete`, and reject on `onabort`. Legacy readable Blob queue entries are supported without automatically deleting them.
- Transcript-to-LOG conversion and its original-audio child operation are committed together with deterministic child UUID; upload checkpoints are reusable after disconnection.
- Original audio is preserved in local storage until confirmed uploaded to private Drive. If local persistence fails, the still-open page offers a download and retry.
- LOG, INFO, TECH and TEAM display loading and error/retry states, including skeleton rows on the first load.
- An explicitly abandoned, old `sending` audio upload can be deleted manually after confirmation; no automatic cleanup of existing user entries.

## Upgrade

See **`docs/UPGRADE_V062_BG.md`** for full Bulgarian instructions and acceptance tests.

1. Back up the existing WordPress plugin.
2. Replace it with **`bg-voice-logger-v0.6.2.zip`** and verify v0.6.2 is active.
3. Clear website/CDN caches **but not Safari site data or IndexedDB**.
4. Perform a real iPhone voice-to-audio test and check that the original plays on another device.

**Do not update Apps Script or Cloudflare for v0.6.2.** `apps-script/Code.gs` remains included only as a reference copy from v0.6.1.

## Tests

```sh
node tests/test-v062-media.js
node tests/test-v061.js
node tests/test-v060.js
node tests/test-v060-ui.js
php tests/test-v061-media.php
```

Also run the full legacy suite, PHP syntax checks, and `node --check` for JavaScript. Browser tests are still required on Safari/iOS; the provided IndexedDB test uses a controlled simulation, not real WebKit.


## v0.6.3 (WordPress-only UI/cache hotfix)
- BUG-009: INFO `col is not defined` render crash fixed; audio buttons are now inside each column's scope.
- BUG-010: JS/CSS assets use SHA-256 content-fingerprinted WordPress versions.
- Service Worker uses a versioned URL, exact query-aware cache keys and safe offline fallback.
- REQ-022: React Error Boundary with explicit user recovery, no automatic page reload.
- Actual running JS build is visible in the app header and `window.BVLOG_RUNNING_BUILD`; expected build is in WordPress settings.
- No IndexedDB, Apps Script, Cloudflare Worker, auth, STT or media workflow changes.
- After editing app.js, run `python3 tools/refresh-build-id.py` before packaging.

See `docs/UPGRADE_V063_BG.md`.

## v0.8.2 — integrated acceptance candidate (not deployed)

Source branch `feature/v0.8.2-test-candidate`, based on v0.8.1; WordPress and Apps Script `0.8.2`, JS `0.8.2-39896a2667b4`. Cloudflare STT Worker unchanged (sar-bg-v1). No production changes or merge.

- #40: compact SKB-inspired blue/red/white install tile with visible “Инсталирай” label, at the bottom; native prompt/manual instructions and standalone guard retained.
- #16/#36: optional tab-scoped GAS reads, actual LOG bootstrap from a newly created document after releasing the global write lock (only when within time and size budgets); fallback to normal read on failure. No blocking LIST. Separate per-operator/tab snapshots with cached/fresh label, legacy full-document fallback, abort/scope/request generation protection. Sparse private index lookups use exact keys and bounded range groups; dense/unsupported search falls back to complete index scan. INFO schema and legacy projection share a read. Only chooser action types use a 60s version-keyed cache; CREATE and writes validate live sheets.
- #36 and #15: batch technical header checks; retain formula protection and idempotency; global write lock wait bounded to 8s, ordinary operation POST 30s, CREATE 45s; normal media budgets retained. CREATE remains duplicate-safe via durable reservation from v0.8.1.
- Media: sequential 256 KiB audio protocol keeps the existing IDs, part names, sizes, checkpoints and old-client behavior; new clients avoid scanning all parts on intermediate acknowledgments and rewind to the first missing part after an incomplete final ACK. Finalization still checks all parts. New photo preview bytes reused instead of re-downloading them; retry uses stored preview. Existing authenticated Range playback retained.
- Prior v0.8.1 changes and v0.8.0.1 login fix carried forward. No IndexedDB schema change or credential change. Background Sync remains best effort (#27); guaranteed locked-screen transfer on iOS would require a different architecture.

Verification: JavaScript, service worker and Apps Script parsed in V8; 12 new targeted mocked checks and 9 prior v0.8.1 checks passed. No full PHP/Node suite, physical browser, live Sheets/Drive or production latency benchmark performed here. No speedup percentage claimed. Native background SLA, the original transient-network root cause (#22), actual Drive Range support, inherited test failures and any measurement-driven follow-on work remain acceptance/investigation items. Do not close issues until verified. The operator subsequently approved main integration of v0.8.2.1 as the working baseline before acceptance; historical release notes do not establish current production status.

