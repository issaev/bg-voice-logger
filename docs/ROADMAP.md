# BG Voice Logger — Development & Performance Roadmap

> **Current production (operator report, 2026-11-24): WordPress v0.8.2.1.** Expected JS `0.8.2.1-188c8b66fb21`, GAS 0.8.2, STT sar-bg-v1. See production status below. Acceptance pending; historical v0.8.0.1 report superseded.
> **Performance baseline B0:** WordPress plugin v0.7.0; JS build `0.7.0-5cabd2394a0e`; audit 2026-11-23.
> **Reported production deployment (2026-11-24):** WordPress v0.7.1, JS build `0.7.1-3d2b0c59217f`; 8/8 isolated verification tests passed, end-to-end acceptance still pending.
> **Last reviewed:** 2026-11-24.
> **Source of truth for issues:** [GitHub Issues](https://github.com/issaev/bg-voice-logger/issues).
> **Deployment rule:** no WordPress, Google Apps Script, or Cloudflare production deployment without explicit approval.

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

## v0.8.1 — historical candidate (superseded)

Source branch `feature/v0.8.1-next`, based on operator-reported production v0.8.0.1. WordPress `0.8.1`, JS `0.8.1-dcfac367badc`, Apps Script `0.8.1`; STT Worker unchanged (sar-bg-v1). This is a candidate for acceptance, not an accepted production release.

- #35: bottom icon instead of large install card; native Android prompt/manual iOS instructions/installed gating retained.
- #37: mobile journal actions occupy the full card width below timestamp and body, both local and confirmed entries; desktop alignment retained.
- #38: one Add photo button in new/existing LOG entries with explicit camera/gallery choice, native picker gesture, original handlers retained.
- #36: eliminate blocking folder LIST after confirmed CREATE; pin new incident and load the LOG shell immediately while the existing full read populates data. Persist pending request ID/payload per operator across reload; block concurrent submits and editing uncertain requests. Apps Script reserves the ID before copying; incomplete copies have a unique reserved name and are hidden from incident list; recover the same copy and finish initialization, never recreate an ambiguous/missing confirmed copy blindly. CREATE POST 45s, GAS CREATE lock wait 8s; normal write budgets unchanged. Add sanitized per-phase Google and bridge timings to admin history. No measured speedup yet. Full lazy per-tab reads, caching and backend bootstrap snapshot remain future optimizations pending measurement.
- No IndexedDB schema change, no new STT Worker logic, no credential changes. No merge or deployment.

Verification: JS and GAS syntax parsed; nine targeted isolated create/picker/layout checks and actual frontend timeout/retry mock passed. ZIP structure/CRC will be checked during packaging. Full Node/PHP suite, real Drive fault/parallel creates, physical Android/iPhone and production performance tests not executed. Do not close issues before acceptance.

## 1. Goal and non-negotiable priorities

The app maintains the operational record of search-and-rescue incidents. **Correctness and durability outrank speed.** Sequence of work:

1. Preserve audio, photos, LOG, INFO, TEAM and TECH locally without losing content or presenting false success.
2. Fix P1 issues and confirm replay/idempotency/conflict handling on an isolated incident.
3. Measure end-to-end user experience with controlled fixtures.
4. Optimize avoidable requests, rendering, Sheets reads and media transport without weakening data safety.
5. Release incrementally with rollback that retains pending IndexedDB data.

**Do not clear, migrate destructively, or silently discard the IndexedDB queue.** Never cache private media/auth responses across users, publish real incident data, or overwrite manual edits in Sheets.

## 2. Proposed release sequence

The operator reports **v0.7.1 → v0.7.2 → v0.7.2.1** successively deployed in production on 2026-11-24. GitHub `main` **has been reconciled to the v0.7.2.1 public source** via merged [PR #14](https://github.com/issaev/bg-voice-logger/pull/14) and [PR #20](https://github.com/issaev/bg-voice-logger/pull/20); these merges did not deploy the website. A deployment report is not full end-to-end acceptance. The subsequent integrated v0.8.0 and WordPress-only v0.8.0.1 login hotfix are now operator-reported in production; see current status above.

| Proposed release | Objective | Required work / tickets | Exit criteria |
| --- | --- | --- | --- |
| **v0.7.1 — Reliability Hotfix (production; acceptance pending)** | Protect locally entered and recorded operational data | P1 [#2](https://github.com/issaev/bg-voice-logger/issues/2), [#3](https://github.com/issaev/bg-voice-logger/issues/3), [#4](https://github.com/issaev/bg-voice-logger/issues/4), [#5](https://github.com/issaev/bg-voice-logger/issues/5), [#8](https://github.com/issaev/bg-voice-logger/issues/8), [#11](https://github.com/issaev/bg-voice-logger/issues/11); retain Safari/IndexedDB regression checks | No known reproducible data-loss/false-sync paths in isolation; safe retry and stable op IDs; INFO text editor works; Safari verification recorded |
| **v0.7.2 — Performance & Usability** | Reduce redundant operations and improve speed and long-incident usability | [#6](https://github.com/issaev/bg-voice-logger/issues/6), [#9](https://github.com/issaev/bg-voice-logger/issues/9), [#10](https://github.com/issaev/bg-voice-logger/issues/10), [#12](https://github.com/issaev/bg-voice-logger/issues/12); assess unused `/dka/` assets; guarded snapshot-first and measured UI-ready/fresh-Google timings | One refresh per LOG batch; top queue/review access without scrolling; user-selectable incident date; no stale/cross-user data; comparable before/after evidence |
| **v0.7.2.1 — Production hotfix (acceptance pending)** | Continuous voice LOG, scoped errors and Google read resilience | [#15](https://github.com/issaev/bg-voice-logger/issues/15), [#17](https://github.com/issaev/bg-voice-logger/issues/17), [#18](https://github.com/issaev/bg-voice-logger/issues/18); [merged PR #20](https://github.com/issaev/bg-voice-logger/pull/20) | Operator-reported deployment; independently verify JS build/GAS revision, iPhone STT→confirmation→upload→Sheets echo, timeouts and safe error history before closing issues |
| **v0.8.0 — Sheets & Media Architecture** | Scale long incident logs and speed up private media | [#7](https://github.com/issaev/bg-voice-logger/issues/7), [#16](https://github.com/issaev/bg-voice-logger/issues/16) GAS read latency profiling; bounded/batched Sheets reads; template metadata caching with invalidation; authenticated binary/resumable media and Range playback; review WP↔GAS lock/timeout contract | Same media bytes, MIME and access control; resumable/idempotent uploads; manual Sheets edit conflicts preserved; measured first-play, full download, read and sync results |

### v0.8.0.1 — current acceptance stage

**Historical production report (superseded): WordPress v0.8.0.1**, expected JS `0.8.0.1-b9391cb399e3`. Source commit `4a7054f10ed1b50817505de8e673f648d7939b83` ([PR #32](https://github.com/issaev/bg-voice-logger/pull/32)); [WordPress package](https://github.com/issaev/bg-voice-logger/raw/efce55ecc83084864e01e23c83d9a2268aaa158a/bg-voice-logger-v0.8.0.1.zip). Expected backend configuration: Apps Script v0.8.0 and Cloudflare STT `sar-bg-v1` ([backend package](https://github.com/issaev/bg-voice-logger/raw/b96a0f3f5cdb815f887056e48f9af60da79caa67/bg-voice-logger-v0.8.0-code.zip)); the report does not independently establish the live backend versions or JS marker. Installation is reported, not acceptance. Full combined Node/PHP, physical mobile login, Sheets/Drive integrity, media and performance verification remain pending. No issues closed and no source merge or deployment performed in this documentation update. Main still holds v0.7.2.1 pending explicit merge approval. #35 is deferred.

| Issues | Status |
| --- | --- |
| #2, #3, #5, #6, #8, #9, #10, #12, #15, #17, #18 | Earlier fixes carried forward; verify real end-to-end behavior |
| #11, #22–#28, #33 | Integrated frontend changes; device and Sheets acceptance pending |
| #7 | Authenticated native Range playback and fallback implemented; byte identity, access checks and measured first-play remain pending |
| #16 | PR #21 bounded reads and phase tracing integrated; no measured speedup; caching and tab-level optimizations not complete |
| #34 | Login challenge hotfix implemented; successful physical mobile sign-in not yet reported |
| #35 | Deferred to next version; no implementation |

**Next:** comprehensive Work Mode test run on synthetic incidents only; retain the ten historical failing test files as an investigation baseline, not a passing result. No issue closure before evidence.

### Production status update — 2026-11-24 (historical v0.7.1 report)

The operator reports **v0.7.1 deployed in production**, supported by a read-only check of the installed JS and public `/dka/` response:

- WordPress plugin version **0.7.1**; embedded JS build **`0.7.1-3d2b0c59217f`**.
- Public `app.js?ver=0.7.1-a6771689c8e5` matched the installed JS SHA256 **`a6771689c8e5d3f61cac2cabe5434399a6d0536e0bd71e6dccf49e3b78493022`** (one public response, CF cache MISS; not proof that every iPhone has refreshed its cache).
- **8 of 8 isolated Node tests passed** using extracted installed functions and mocked storage/UI, including atomic orphan cleanup, durable-save status, TEAM/TECH form preservation, footer unsaved-audio warning, stable retry ID, and a Blob conversion control.
- **Not yet verified end to end:** real Safari/IndexedDB, Google OAuth, deployed Apps Script version, Google Sheets/Drive data writes, cross-device media playback, conflict/retry/parallel-tab behavior. The 8 tests do **not** establish acceptance for INFO comments [#8](https://github.com/issaev/bg-voice-logger/issues/8) or the incident chooser [#11](https://github.com/issaev/bg-voice-logger/issues/11) on production.
- Remaining known performance problems: [#6](https://github.com/issaev/bg-voice-logger/issues/6) duplicate LOG refresh reads and [#7](https://github.com/issaev/bg-voice-logger/issues/7) complete audio download before playback. These belong to later work.
- **Source control synchronized:** [PR #13](https://github.com/issaev/bg-voice-logger/pull/13) was merged into `main` on 2026-11-24 (merge commit `ab04e1db5f351db5edc7feb8fc8c7b28ccdd7e55`). This did not deploy code. New feature branches can now start from `main`. All P1 issues remain open until end-to-end acceptance.

The report was obtained without modifying production code, data, caches or queues. Do not claim full production validation or invent missing benchmark values.

### v0.7.1 — P1 reliability checklist

- [ ] **[#2 / AUDIT-01] Orphan media cleanup.** Rework referential integrity check and orphan deletion as a single safe IndexedDB readwrite transaction over queue/media. Two tabs and overlapping commits must never delete referenced media.
- [ ] **[#3 / AUDIT-02] Durable commit vs refresh failure.** Only IndexedDB transaction completion determines local-save success. A UI refresh exception cannot turn an already persisted recording into “unsaved”; retries must reuse the original operation identity.
- [ ] **[#4 / AUDIT-03] TEAM/TECH add form.** Preserve all values and keep the form open when local enqueue fails; clear only after a confirmed durable save.
- [ ] **[#5 / AUDIT-04] False “Everything synced” message.** An in-memory unsaved recording or save failure takes precedence over an empty queue. Distinguish **not saved locally**, **saved locally / pending upload**, and **confirmed on server**.
- [ ] **[#8 / AUDIT-07] INFO / “Акция” editing.** The action-type cell alone uses its allowed dropdown choices; adjacent “Коментар” and “Допълнителна информация” accept free multiline text. Test dynamic INFO sections and manual Sheets edits.
- [ ] **[#11 / BUG-NEW-01] Stable selected incident.** Async `loadDocs()` completion must not replace an operator's existing selection with the newest incident. Preserve the chosen document while it remains available; handle out-of-order requests and removed documents explicitly. Wrong-incident opening has operational safety implications.
- [ ] **Safari BUG-008 investigation.** Reproduce or rule out the original Safari/iOS IndexedDB/media persistence problem with real devices, version, transaction errors, quota and restart tests. A passing Node Blob conversion test is insufficient.
- [ ] **Conflict/idempotency tests.** No duplicate LOG/voice/media after server commit but lost acknowledgment. Preserve `row_key`, `conflict` and `row_moved`; never overwrite a concurrent manual Sheets edit.
- [ ] **UI/queue regression.** Tests for no-speech STT, denied local storage, offline/resume and preserved audio original.

**Evidence level:** #2–#5 were reproduced using isolated Node functions/mocked dependencies; #8 and #11 have user reports with identifiable problematic UI code paths. User feedback says iPhone v0.7.0 works well in practice; preserve that behavior and keep Safari/IndexedDB **regression** testing rather than assuming active failure. This is **not** evidence that production data was already lost. See the issue descriptions for reproduction and acceptance criteria.

### v0.7.2.1 — operator-deployed reliability hotfix (acceptance pending)

Merged [PR #20](https://github.com/issaev/bg-voice-logger/pull/20) synchronizes the public GitHub source with the operator-reported deployed release. **This was a GitHub-only change**, not a production deployment. The installed JS build and Apps Script revision still need independent runtime verification. Main source contains the 35-second `read` POST budget (separate 15-second redirect GET), bounded request history, scoped error states and continuous voice LOG entries by `op_id`. The previously observed 115-second Apps Script execution remains unexplained; follow-up profiling is tracked in [#16](https://github.com/issaev/bg-voice-logger/issues/16) for v0.8.0.

Acceptance remains open for real iPhone Safari recording/review and refresh behavior, Google Sheets writes and manual edits, 20–35 second host/proxy budgets, and private media. The isolated test suite passed **22/32** files with ten historical failing files, not end-to-end acceptance. Leave P1 issues [#15](https://github.com/issaev/bg-voice-logger/issues/15), [#17](https://github.com/issaev/bg-voice-logger/issues/17) and [#18](https://github.com/issaev/bg-voice-logger/issues/18) open until those checks are complete.

### v0.7.2 — performance and usability work (some changes require coordinated GAS deployment)

- [ ] **[#6 / AUDIT-05] Deduplicate LOG refreshes.** Existing flow calls refresh for every successful LOG and once more after a touched batch (N+1 full reads). Coalesce to **one** final refresh for the active incident while retaining per-operation ack/conflict and stale-response guards.
- [ ] **[#9 / UX-01] One-click queue and review from the header.** Make an always discoverable top/sticky queue button, prioritize failed/conflicted/voice-review items, and keep local-only access consistent in supported auth modes. Avoid forcing users to scroll through hundreds of LOG events. Coordinate unsaved-audio warning with #5.
- [ ] **[#10 / FEATURE-01] Date picker on incident creation.** Default to today's date in Europe/Sofia; allow past/future incident date; update preview/name/INFO/LOG via validated WordPress + Apps Script create payload. Keep real creation and event timestamps unchanged and correctly handle a LOG entry on a different day.
- [ ] **[#12 / UX-02] Visibility of external Google Sheets edits.** Keep an explicit refresh action and show when the active document was last refreshed. Investigate safe background revalidation without resetting local drafts, increasing unnecessary full reads or breaking `conflict` / `row_moved`. Verify deployed GAS read has no write side effects before any periodic polling; measure refresh cost and freshness.
- [ ] **Browser-first benchmarks.** Measure navigation → usable shell separately from navigation → confirmed fresh Google data; measure selected incident and each tab as specified in `protocol.txt`. Do not compare HTML-only curl time against UI-ready time.
- [ ] **Assets.** Confirm which WordPress theme/plugins scripts and styles are unnecessary specifically on `/dka/`. Remove/dequeue only if mobile/desktop visual and functional checks pass; static assets were Cloudflare HIT in the baseline, so avoid a blind global purge.
- [ ] **Cache policy.** If snapshot-first is implemented, bind cached data to the same authenticated identity and incident; clearly display “cached / refreshing / fresh”. Revalidate. No private HTML/auth/REST caching at Cloudflare and no stale data presented as current.
- [ ] **Observability.** With approval, add sanitized tracing for action/build, request counts/bytes, retries and timing spans (browser, WP forward/redirect, GAS and Sheets/Drive). Never log bearer tokens, incident text, audio, private document IDs or signed URLs.

**Performance outcome:** count eliminated document requests and report comparable p50/error-rate changes. Do not promise a fixed percentage before measuring.

### v0.8.0 — selected action and best-effort background queue (historical draft; integrated)

Follow-on branch `feature/v0.8.0-stable-selection-background-sync` stacked on retry PR #29, tracks [#11](https://github.com/issaev/bg-voice-logger/issues/11) and [#27](https://github.com/issaev/bg-voice-logger/issues/27).

- **Selection safety:** pinned manual `selectedDocRef` survives stale and overlapping `loadDocs` responses. If the selected Google Sheet disappears, show a visible error and require new explicit selection; do not silently open the newest. Assert exact ID at Open time.
- **Background Sync:** existing PWA Service Worker processes bounded, individually authenticated, idempotent `log`, `field`, `add_row`, `log_change`, private photo and chunked `audio_upload` operations in the current operator's IndexedDB queue, when browser Background Sync allows. Fetch a fresh session/CSRF/nonce; never persist tokens, media URLs or user IDs in CacheStorage.
- **Safety/rollback:** per-user atomic lock in a **separate** IndexedDB `bg-voice-logger-sync-leases-v1`, shared with foreground `syncAll`; the existing operational queue schema stays **DB_SCHEMA=2**, compatible with v0.7.2.1 rollback. Reuse `op_id`, `doc_id`, and acknowledged media chunk checkpoints. Skip voice STT in service worker. Notify open clients with a non-sensitive refresh-only message.
- **Platform reality:** PWA service workers do not guarantee ongoing transfer while screen is locked; iOS Safari lacks the same one-shot Background Sync and uses auto resume on foreground/online. For guaranteed locked-screen transfer a native OS foreground/background service requires separate design.
- **Verification:** isolated `test-v080-stable-selection.js` and `test-v080-background-sw.js` pass; local test-file suite **27/37 PASS** vs PR #29 baseline **25/35**, with same ten historical failures and no new failing files. No physical Android/iOS or real Google Sheets staging acceptance yet. See [test plan](PLAN_V080_SELECTION_BACKGROUND_BG.md).

Do not deploy or merge automatically; this is a dependent Draft PR on PR #29. PR #21 (GAS profiling) and PR #30 (mobile UI) remain independent.

### v0.8.0 reliability increment — retry/recovery (historical draft; integrated)

A separate frontend retry candidate in `feature/v0.8.0-retry-recovery` addresses [#22](https://github.com/issaev/bg-voice-logger/issues/22) and [#25](https://github.com/issaev/bg-voice-logger/issues/25): three automatic 5/15/30-second retry attempts for transient document reads, bounded and jittered retry for IndexedDB-queued writes with the original `op_id`, capped attempts, visible pending retry state, and safe resume on foreground/online. No new Google Apps Script, PHP or IndexedDB schema. **Actual locked-screen continuous transfer is not guaranteed and remains #27.** This is separate from [Draft PR #21](https://github.com/issaev/bg-voice-logger/pull/21) (GAS profiling).

Local fault injection and regression: **25/35 test files PASS** versus **24/34** main v0.7.2.1, same ten inherited FAIL names, no new failing tests. Browser/Android/iPhone and Google Sheets integration acceptance pending. See [retry/recovery test plan](PLAN_V080_RETRY_BG.md). At the time of that isolated test, production remained v0.7.2.1. The integrated release is now operator-reported deployed; acceptance is still pending.

### v0.8.0 — backend and media changes (integrated initial implementation; benchmarks and further optimization pending)

- [ ] Confirm deployed Apps Script version before changing behavior. The **bundled** `bvlRead` can call `bvlRepairPhotoAnchors_` and potentially change embedded image anchors during a read; verify and remove read-side effects before authenticated read-only benchmark tests.
- [ ] Reduce unnecessary full-sheet/index/legacy reads; investigate bounded/paginated history and bulk range access. Keep dynamic INFO discovery and write preconditions correct.
- [ ] Cache template type options only with versioning/invalidation; never use a stale cache as permission to overwrite a field.
- [ ] **[#7 / AUDIT-06] Playback.** Current bundled GAS reads the entire Drive blob before returning each 512 KiB slice. Plan a private, authorized binary/Range path with time-to-first-audio independent of whole-file download. Do not parallelize current whole-blob chunk reads blindly.
- [ ] **Upload.** Benchmark current sequential 256 KiB audio chunks and photo original+preview by fixed sizes, then design resumable transfer and sensible chunk sizing. Preserve upload checkpoints, duplicate protection and checksums.
- [ ] **Lock/timeout.** Reconcile the bundled GAS global lock wait (up to 25 s) and WordPress forward POST timeout (15 s); use clear retryable busy handling and idempotent replay, not timeouts alone.
- [ ] Test private media authorization/caching for different identities and device changes.

## 3. Independent STT Worker track

[Draft PR #1 — Bulgarian SAR vocabulary + anti-echo / no-speech guards](https://github.com/issaev/bg-voice-logger/pull/1) is **separate from the WordPress release train**. Its 34-term Groq `prompt` and anti-echo logic affect only the Cloudflare STT Worker. At roadmap creation time the PR is open/draft in GitHub; do **not** infer production deployment from that state.

Before independent activation or declaring it resolved: run Worker regression tests, try silent/noisy/clear Bulgarian recordings, inspect `no_speech`, verify retained originals, and verify the Worker `/health` build. Do not auto-save suspected hallucinations. No guarantee exists that heuristics eliminate all invented speech.

## 4. Measurement plan — baseline B0 and next comparable runs

Canonical evidence: [Benchmark report](../benchmarks/2026-11-23/report.html), [repeatable protocol](../benchmarks/2026-11-23/protocol.txt), [scenario matrix](../benchmarks/2026-11-23/baseline-scenarios.csv), [HTTP baseline](../benchmarks/2026-11-23/http-baseline.json), [after template](../benchmarks/2026-11-23/after-template.json).

### B0 — verified values from 2026-11-23

| Measured operation (not interchangeable) | n | p50 | Mean | Max | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| `PERF-01-http` anonymous `/dka/` HTML GET only | 10 | 468.767 ms | 580.1064 ms | 1556.54 ms | 0 |
| Anonymous `auth/session` GET only (not OAuth/login flow) | 10 | 475.15 ms | 470.6504 ms | 522.954 ms | 0 |
| Historical `audio_read` bridge / **one chunk** | 4 | 4998 ms | 5261.25 ms | 6313 ms | Not a full playback benchmark |
| Historical `audio_write` bridge / operation | 3 | 9402 ms | 8872.33 ms | 12712 ms | Not a full upload benchmark |
| Historical `photo_write` bridge / operation | 3 | 13283 ms | 12959.33 ms | 13287 ms | Not a full upload benchmark |

The first observed HTML request was 1556.54 ms, but a guaranteed cold browser/CDN cache was **not** established. All sampled HTML and anonymous auth requests were HTTP 200/CF DYNAMIC; measured same-origin static assets were CF HIT. B0 does **not** contain browser UI-ready, authenticated fresh-Google or complete end-to-end playback/upload timings.

### Scenario definitions and ownership

| IDs | Timing endpoint | Release most concerned |
| --- | --- | --- |
| PERF-01 | Navigate → **UI-ready**, separately → fresh Google when applicable; HTML-only metric stays separate | v0.7.2 |
| PERF-02, PERF-03 | Login → fresh incident list; incident click → visible vs fresh data | v0.7.2 / v0.8.0 |
| PERF-04–07 | LOG, INFO, TECH, TEAM visible/fresh; identify shared full-document fetch | v0.7.2 / v0.8.0 |
| PERF-08, PERF-09 | Local tab switch → next frame and REST count; refresh → fresh response committed | v0.7.2 |
| PERF-10, PERF-11 | Local durable LOG/INFO save separately from server acknowledgment; conflicts tracked | v0.7.1 / v0.7.2 |
| PERF-12, PERF-13 | Audio first audible vs full download; photo preview vs original, fixed-size fixtures | v0.8.0 |
| PERF-14, PERF-15 | Create incident; drain a fixed mixed queue to final fresh data, including retries | v0.7.1 / v0.8.0 |

**Current measurement completeness:** only a partial `PERF-01-http` public GET baseline and anonymous auth measurements exist; `PERF-02`–`PERF-15` lack comparable end-to-end B0 timings. Their improvement percentage must remain **unreported** until a valid baseline exists.

### Reproducibility and quality bar

- Record version, JS build hash, GAS and Worker versions, user/test identity, device/browser, network, incident size, queue composition, media size/MIME, cache conditions and error/retry counts.
- Use a fresh **dedicated** client profile for cold-client observation; warm-client samples must share a controlled fixture. Never delete an existing profile/queue to manufacture a cold run.
- Take ≥10 comparable sequential measurements as a basic set. For p95 use ≥40, preferably 100; **do not report p95 from n=10**.
- Report p50, min, mean, max, request count/bytes, errors and retries; do not mix cold and warm or different media sizes.
- Only compare the same metric and conditions: `absolute_ms = before - after`; `improvement_% = 100 * (before - after) / before`. Positive values mean faster.
- Measure the same side of each workflow: **locally durable**, **remote ack**, and **fresh UI** are different endpoints. Full bridge time must not be labeled as GAS-only time.
- Run tests on a separate, non-sensitive test incident with an empty dedicated queue and explicit write permission. Authentication/online/visibility can trigger autosync; an unvetted real profile is unsafe for a read-only test.

## 5. Release, security and rollback gates

A proposed version is ready to ship only if **all** checks relevant to its scope pass:

1. [ ] Code change in a feature branch; reviewed diff and automated tests; unresolved P1 issues documented and explicitly adjudicated.
2. [ ] Real-device smoke tests, including iOS/Safari and desktop; no lost audio, photos or typed fields under offline/reconnect/quota/restart.
3. [ ] No duplicate operation IDs or remote records after server commit + lost response, retries, parallel edits or two tabs.
4. [ ] INFO/LOG/TECH/TEAM edit and dynamic INFO compatibility; no unannounced manual Sheets overwrite; `conflict` / `row_moved` remain visible.
5. [ ] Auth isolation verified for private documents, media, cached data and STT tickets. No exposed credentials or real incident content in GitHub/performance logs.
6. [ ] Benchmarks capture **before and after** comparable measurements and errors; no performance win is accepted at the cost of reliability.
7. [ ] Deployment instructions specify exactly what changes: WordPress plugin, Apps Script and/or Cloudflare Worker; never assume they are updated together.
8. [ ] Back up configuration, deployed code versions and test evidence; **rollback must keep the existing IndexedDB queue and media** and preserve schema compatibility/idempotent replay.
9. [ ] **Explicit user approval** before merging release code to `main` or deploying to any live service; validate a test incident before production rollout.

## 6. Tracking and update convention

- A new bug gets an individual GitHub Issue with: symptom, environment, reproduction, expected/actual, data-loss risk, evidence level (user report, isolated reproduction, production reproduction), acceptance tests, and target release **proposed**.
- Prefix new issues with a stable audit/bug identifier; **GitHub issue numbers are authoritative** if historical BUG IDs were reused across chats or reports.
- Progress is tracked by issues and PRs. Update this roadmap as scope/measurements change; do not mark items done based only on a planned fix or an unmerged PR.
- No source snapshot from GitHub alone proves production deployment or parity with locally configured Google resources.

---

*Production v0.7.2.1 is operator-reported; GitHub main now contains the corresponding sanitized release source. Runtime acceptance and private site/Google configuration remain outside source control.*
