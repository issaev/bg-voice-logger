# BG Voice Logger v0.7.2.1 — hotfix deployment and verification

**Deployment update (operator report, 2026-11-24): v0.7.2.1 is now running in production.** The expected build is `WP 0.7.2.1 / JS 0.7.2.1-613947b7e695`. This chat update is not an independent HTTP/build or GAS verification. The following acceptance, backup and rollback steps remain applicable. GitHub PR #20 was merged into `main` during source synchronization; that merge did not deploy code.

**Starting point:** operator-reported production v0.7.2 (`WP 0.7.2 / JS 0.7.2-c6f4de4c832a`), Google Apps Script deployment Version 13. This branch contains the v0.7.2 source and #18 voice continuity fix. The exact deployed Apps Script source is not independently verified.

## Scope

- **[#18](https://github.com/issaev/bg-voice-logger/issues/18):** voice LOG remains in the **same journal row** throughout local audio capture, STT, optional voice-review/edit, pending/sending, confirmed server ACK, and subsequent Google Sheet refresh. The same `op_id` is used to deduplicate local and server events. Read timeout after successful write no longer hides the acknowledged entry.
- **[#17](https://github.com/issaev/bg-voice-logger/issues/17):** errors split by source — incident list, active incident read, sync, local IndexedDB, and other media/action errors. Successful refresh clears only the matching read error, never unsaved-audio or failed-write alerts. Previous successful data remains available during failed refresh.
- **[#15](https://github.com/issaev/bg-voice-logger/issues/15):** **read POST** timeout is **35 seconds** instead of 15; controlled Google ContentService redirect GET has a **separate 15-second budget**. Other request types keep their previous limits. This protects against 15–35s executions but **does not solve a 115s Apps Script call**.
- WordPress keeps a **30-entry safe request history** for list/read/create/operation, including past failures, instead of only the last result. The backend receives a short opaque `request_id` and logs only action, fixed stage and elapsed milliseconds. `bvlRead_` now logs cumulative phases (open, INFO, LOG, photo/audio/history indexes, TEAM/TECH). No secrets, sheet IDs/names, incident text or media are logged.
- The existing 120s background read only runs when the session is safe to refresh; after failures it applies a bounded exponential cooldown up to 15 min. In-flight same-incident reads are coalesced; manually pressing Refresh can retry sooner.
- Cloudflare STT, WordPress authentication, Google sheet schema, IndexedDB v2, existing queued `op_id` and media bytes remain unchanged.

## Verification

On the isolated test harness (no production writes): **22/32 test files PASS** versus **20/30** on the previous voice-continuity candidate; **the same 10 historical test files fail**. New targeted tests:
- `php tests/test-v0721-bridge.php` — 35s read vs 15s list/write, redirection and 30-entry sanitized history.
- `node tests/test-v0721-ui-errors.js` — list failure then successful document read; unsaved/local/sync alerts remain independent; failed read retains last confirmed snapshot; backoff and in-flight deduplication.
- `node tests/test-v0721-gas-trace.js` — correlated, redacted GAS stages with no secret/text/ID leaks.
- `node tests/test-v072-voice-log-continuity.js` — one stable visual LOG event across voice/audio/review/upload/remote confirmation.

Syntax checks: `node --check assets/app.js`, Apps Script via `node --check < apps-script/Code.gs`, `php -l` on plugin and both changed includes.

## Mandatory acceptance before production

1. Back up the active v0.7.2 WordPress plugin, settings and Apps Script deployed revision/URL. **Never delete IndexedDB, service queues or media to upgrade or roll back.** Private site config and folder/template IDs must not be committed to public GitHub.
2. Apply the updated **Apps Script Code.gs first** as **New version of the existing deployment** (same URL/permissions), then upgrade the WordPress ZIP. Verify the header **WP 0.7.2.1 / JS 0.7.2.1-613947b7e695** and the new WordPress Settings request-history panel.
3. With a dedicated, non-sensitive **test incident**: dictate, review/correct transcription, and observe one visible LOG row from `audio` to `synced` to a confirmed Sheets row. Reproduce an artificially failed/delayed `read` after a successful write. No duplicate, disappearance or extra write.
4. Test 20–25s backend read vs the 35s POST budget and check redirect GET/hosting/proxy total time constraints. Confirm that a 40s or 115s GAS operation fails **safely**, without unbounded retries or misleading “write failed” messages.
5. Test on actual iPhone Safari and desktop: offline/reconnect, queued media, existing draft edit, Google manual changes, photo attachment, original audio playback and simultaneous operators. The isolated tests are NOT those acceptance tests.
6. Inspect Apps Script Version 13/next execution history to discover whether the 115s outlier was `read`, `operation`, `create`, or media. A longer WordPress timeout does not optimize it.

**Rollback:** Restore WordPress v0.7.2 and the prior **Apps Script revision using the existing deployment ID/URL**. Preserve IndexedDB v2 and all queued and unsent records. Check `op_id` before any write retry following ambiguous acknowledgment.

The operator reports production deployment; **GitHub PR creation alone did not deploy code**. Real-device and Google Sheets acceptance is still pending.
