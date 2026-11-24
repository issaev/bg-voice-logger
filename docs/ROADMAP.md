# BG Voice Logger — Development & Performance Roadmap

> **Status:** operator reports v0.7.2 deployed in production (WP 0.7.2 / JS 0.7.2-c6f4de4c832a). v0.7.2.1 is a tested hotfix candidate in `fix/v0.7.2.1-hotfix`, NOT deployed. v0.8.0 remains proposed.
> **Performance baseline B0:** WordPress plugin v0.7.0; JS build `0.7.0-5cabd2394a0e`; audit 2026-11-23.
> **Reported production deployment (2026-11-24):** WordPress v0.7.1, JS build `0.7.1-3d2b0c59217f`; 8/8 isolated verification tests passed, end-to-end acceptance still pending.
> **Last reviewed:** 2026-11-24.
> **Source of truth for issues:** [GitHub Issues](https://github.com/issaev/bg-voice-logger/issues).
> **Deployment rule:** no WordPress, Google Apps Script, or Cloudflare production deployment without explicit approval.

## 1. Goal and non-negotiable priorities

The app maintains the operational record of search-and-rescue incidents. **Correctness and durability outrank speed.** Sequence of work:

1. Preserve audio, photos, LOG, INFO, TEAM and TECH locally without losing content or presenting false success.
2. Fix P1 issues and confirm replay/idempotency/conflict handling on an isolated incident.
3. Measure end-to-end user experience with controlled fixtures.
4. Optimize avoidable requests, rendering, Sheets reads and media transport without weakening data safety.
5. Release incrementally with rollback that retains pending IndexedDB data.

**Do not clear, migrate destructively, or silently discard the IndexedDB queue.** Never cache private media/auth responses across users, publish real incident data, or overwrite manual edits in Sheets.

## 2. Proposed release sequence

Operator reports **v0.7.1 and subsequently v0.7.2 deployed to production on 2026-11-24**. Existing GitHub `main` is behind the production baseline. v0.7.2.1 and v0.8.0 are proposals until accepted and deployed; a deployment report is not full end-to-end acceptance.

| Proposed release | Objective | Required work / tickets | Exit criteria |
| --- | --- | --- | --- |
| **v0.7.1 — Reliability Hotfix (production; acceptance pending)** | Protect locally entered and recorded operational data | P1 [#2](https://github.com/issaev/bg-voice-logger/issues/2), [#3](https://github.com/issaev/bg-voice-logger/issues/3), [#4](https://github.com/issaev/bg-voice-logger/issues/4), [#5](https://github.com/issaev/bg-voice-logger/issues/5), [#8](https://github.com/issaev/bg-voice-logger/issues/8), [#11](https://github.com/issaev/bg-voice-logger/issues/11); retain Safari/IndexedDB regression checks | No known reproducible data-loss/false-sync paths in isolation; safe retry and stable op IDs; INFO text editor works; Safari verification recorded |
| **v0.7.2 — Performance & Usability (operator-deployed; known #15/#17 problems)** | Reduce redundant operations and improve speed and long-incident usability | [#6](https://github.com/issaev/bg-voice-logger/issues/6), [#9](https://github.com/issaev/bg-voice-logger/issues/9), [#10](https://github.com/issaev/bg-voice-logger/issues/10), [#12](https://github.com/issaev/bg-voice-logger/issues/12), **[#15](https://github.com/issaev/bg-voice-logger/issues/15) read timeout**; assess unused `/dka/` assets; guarded snapshot-first and measured UI-ready/fresh-Google timings | One refresh per LOG batch; top queue/review access without scrolling; user-selectable incident date; no stale/cross-user data; comparable before/after evidence |
| **v0.7.2.1 — Reliability & voice-log continuity (release candidate)** | Preserve voice LOG visibility and repair timeout/error handling | P1 [#15](https://github.com/issaev/bg-voice-logger/issues/15), [#17](https://github.com/issaev/bg-voice-logger/issues/17), [#18](https://github.com/issaev/bg-voice-logger/issues/18); [hotfix guide](UPGRADE_V0721_BG.md) | 35s read-only timeout with safe stage budgets, trace without operational data, one voice event from review to ack, no stale generic errors, iPhone + Sheets regression pass before deployment |
| **v0.8.0 — Sheets & Media Architecture** | Scale long incident logs and speed up private media | [#7](https://github.com/issaev/bg-voice-logger/issues/7), **[#16](https://github.com/issaev/bg-voice-logger/issues/16) measured GAS read optimization**; bounded/batched Sheets reads; template metadata caching with invalidation; authenticated binary/resumable media and Range playback; review WP↔GAS lock/timeout contract | Same media bytes, MIME and access control; resumable/idempotent uploads; manual Sheets edit conflicts preserved; measured first-play, full download, read and sync results |

### Production status update — 2026-11-24

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

### v0.7.2.1 hotfix status (2026-11-24)

Draft hotfix `fix/v0.7.2.1-hotfix` combines the continuous LOG stream from PR #19 with #15 transport/diagnostics and #17 scoped-error fixes. Local targeted PHP/JS/GAS tests pass; the full isolated suite is **22/32 PASS** with the same 10 inherited failures. **Production remains v0.7.2** until explicit release approval and hands-on iPhone/Sheets acceptance. The 35s timeout does not resolve a 115s GAS execution; profiling for #16 remains on the v0.8.0 track.

### v0.7.2 — performance and usability work (some changes require coordinated GAS deployment)

**Candidate implementation (2026-11-24):** #6, #9, #10 and #12 have code + isolated tests on a feature branch. This is **not** production acceptance and does not close Issues. QA gates: test date creation against the real Apps Script, verify 120s refresh doesn't conflict with manual edits, test sticky queue on iPhone, and test photo anchors after manual sort because read-side auto-repair was deliberately removed. Browser before/after latency metrics and iPhone regression tests are still missing. See [v0.7.2 upgrade guide](UPGRADE_V072_BG.md).

**NEW P1 release blocker [#15](https://github.com/issaev/bg-voice-logger/issues/15):** Production v0.7.1 WordPress diagnostics showed `read` POST `curl_28_timeout:limit_15s` at 15.009s while a contemporaneous Apps Script deployment Version 12 execution lasted 19.326s. Exact request correlation remains unproven without a shared ID. The draft **v0.7.2 still has the same `read` POST 15-second limit**, despite eliminating N+1 LOG reads and removing read-side image mutations. **Do not release v0.7.2 as-is or activate its 120s auto-refresh in production** until the request budget/host timeouts are validated, ambiguous post-write refresh errors are distinguished from write failures, and staging latency/reliability evidence is collected. Proposed mitigation: conditional 35s `read`-only POST timeout with an end-to-end WP+redirect budget and safe backoff. **No implementation of #15 is included in the current PR.**



- [ ] **[#6 / AUDIT-05] Deduplicate LOG refreshes.** Existing flow calls refresh for every successful LOG and once more after a touched batch (N+1 full reads). Coalesce to **one** final refresh for the active incident while retaining per-operation ack/conflict and stale-response guards.
- [ ] **[#9 / UX-01] One-click queue and review from the header.** Make an always discoverable top/sticky queue button, prioritize failed/conflicted/voice-review items, and keep local-only access consistent in supported auth modes. Avoid forcing users to scroll through hundreds of LOG events. Coordinate unsaved-audio warning with #5.
- [ ] **[#10 / FEATURE-01] Date picker on incident creation.** Default to today's date in Europe/Sofia; allow past/future incident date; update preview/name/INFO/LOG via validated WordPress + Apps Script create payload. Keep real creation and event timestamps unchanged and correctly handle a LOG entry on a different day.
- [ ] **[#12 / UX-02] Visibility of external Google Sheets edits.** Keep an explicit refresh action and show when the active document was last refreshed. Investigate safe background revalidation without resetting local drafts, increasing unnecessary full reads or breaking `conflict` / `row_moved`. Verify deployed GAS read has no write side effects before any periodic polling; measure refresh cost and freshness.
- [ ] **[#15 / BUG-READ-TIMEOUT] Production slow-read transport failure.** Validate a `read`-only 35s POST budget with separate redirect GET/hosting/proxy limits; distinguish server ACK from failed post-write refresh; correlate safe WP/GAS request timings. Keep 120s polling disabled/gated pending safe read-only and load tests. **P1 release blocker; not yet implemented.**
- [ ] **Browser-first benchmarks.** Measure navigation → usable shell separately from navigation → confirmed fresh Google data; measure selected incident and each tab as specified in `protocol.txt`. Do not compare HTML-only curl time against UI-ready time.
- [ ] **Assets.** Confirm which WordPress theme/plugins scripts and styles are unnecessary specifically on `/dka/`. Remove/dequeue only if mobile/desktop visual and functional checks pass; static assets were Cloudflare HIT in the baseline, so avoid a blind global purge.
- [ ] **Cache policy.** If snapshot-first is implemented, bind cached data to the same authenticated identity and incident; clearly display “cached / refreshing / fresh”. Revalidate. No private HTML/auth/REST caching at Cloudflare and no stale data presented as current.
- [ ] **Observability.** With approval, add sanitized tracing for action/build, request counts/bytes, retries and timing spans (browser, WP forward/redirect, GAS and Sheets/Drive). Never log bearer tokens, incident text, audio, private document IDs or signed URLs.

**Performance outcome:** count eliminated document requests and report comparable p50/error-rate changes. Do not promise a fixed percentage before measuring.

### v0.8.0 — backend and media changes (needs separate design and approval)

- [ ] Confirm deployed Apps Script version before changing behavior. The **bundled** `bvlRead` can call `bvlRepairPhotoAnchors_` and potentially change embedded image anchors during a read; verify and remove read-side effects before authenticated read-only benchmark tests.
- [ ] Reduce unnecessary full-sheet/index/legacy reads; investigate bounded/paginated history and bulk range access. Keep dynamic INFO discovery and write preconditions correct.
- [ ] Cache template type options only with versioning/invalidation; never use a stale cache as permission to overwrite a field.
- [ ] **[#7 / AUDIT-06] Playback.** Current bundled GAS reads the entire Drive blob before returning each 512 KiB slice. Plan a private, authorized binary/Range path with time-to-first-audio independent of whole-file download. Do not parallelize current whole-blob chunk reads blindly.
- [ ] **Upload.** Benchmark current sequential 256 KiB audio chunks and photo original+preview by fixed sizes, then design resumable transfer and sensible chunk sizing. Preserve upload checkpoints, duplicate protection and checksums.
- [ ] **[#16 / PERF-READ-08] Instrument and optimize Google document `read` end-to-end.** Profile Drive membership / spreadsheet opening, dynamic INFO sections, bounded LOG and TEAM/TECH, full photo/audio/history indexes and legacy rich text with correlation IDs. Split/lazy-load expensive metadata only after measured evidence; preserve manual edits and media association.
- [ ] **Lock/timeout.** Reconcile the bundled GAS global lock wait (up to 25 s) and WordPress forward POST timeout (15 s); use clear retryable busy handling and idempotent replay, not timeouts alone. **Important distinction:** GAS script lock applies to `create`/`operation`, not `read`; measure the two cases separately.
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

*This roadmap combines the original REQ-026 audit with the subsequently reported v0.7.1 production deployment. GitHub main is synchronized to the v0.7.1 public source; private site configuration and end-to-end runtime acceptance remain outside this reconciliation.*
