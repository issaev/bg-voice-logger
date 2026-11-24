# BG Voice Logger v0.8.0-A — Google Sheets read profiling and safe bounded scans

**Status:** developer candidate, **NOT deployed**, no release package and no WordPress version bump. Base: operator-reported production v0.7.2.1, JavaScript `0.7.2.1-613947b7e695`. This is the **first part of v0.8.0**, not a completed v0.8.0 release.

## What changed

1. `bvlEnd_` now finds the last nonempty operational row by scanning backwards in windows of 256, 512, 1024, 2048, then up to 4096 rows per `getDisplayValues` call. Previously a single full range from `firstRow` to `getLastRow` was fetched, even when only the most recent 120 LOG rows were needed for display. The field columns and matching semantics are unchanged; sparse trailing cells outside that range are handled.
2. `bvlRead_` reuses `getSheetByName` handles for `MISSING_TABS` and reuses the already-validated Drive file's name instead of fetching the same file again. Authorization, membership validation, payload schema, dynamic INFO sections, LOG keys, media associations and conflict detection are unchanged.
3. Apps Script logs privacy-safe `elapsed_ms` and new `phase_ms` timestamps with a 12-character request correlation ID. Markers distinguish Drive authorization/open, INFO schema and values, locating LOG end, reading recent LOG values, reading rich text, photos/audio/history indexes, response preparation/serialization, and TEAM/TECH. `list` and write requests have separate markers; the 25-second Apps Script write-lock wait can be distinguished from slow write work.
4. `tools/analyze-gas-traces.mjs` accepts **sanitized JSONL trace lines** and reports only aggregated counts, median/max latency and phase timing; it never prints request IDs or payloads. It only reports p95 with at least 40 completed samples.
5. Apps Script `ping` now identifies the experimental code as `0.8.0-a1`. WordPress v0.7.2.1, Cloudflare STT Worker, IndexedDB v2, the queue and Google Sheets layout remain unchanged.

## Evidence from isolated tests

- **25/35 test files pass** versus **23/33** for v0.7.2.1. The same **10 historical test files** fail; there are **no new failing test-file names**.
- `node tests/test-v080a-sheets.js`: a synthetic LOG with 10,000 rows returns the exact v0.7.2.1 JSON fixture, with one Drive file lookup rather than two and seven sheet-handle lookups. The bounded end scan reads at most 256 rows in the common case instead of 9,999 rows; measured **read-call sizes, not actual Google latency**.
- Synthetic sparse/trailing cases, dynamic `getLastRow`, whitespace, hidden technical cells and empty operations are covered. The maximum individual backwards scan is 4096 rows; this is **not** a proof of improvement in heavily sparse cases with very long empty tails.
- `node tests/test-v080a-analyze.js`: synthetic log aggregation, incomplete/failed requests, output redaction and no p95 from n=2.
- Existing v0.7.2.1 GAS, bridge, media/voice, calendar and WordPress tests remain available. Real Google API and iPhone/Sheets acceptance still missing.

## Ready-to-run staging-only benchmark — no deployment

A dedicated, opt-in runner is available in [`apps-script/STAGING_READ_BENCHMARK.gs`](../apps-script/STAGING_READ_BENCHMARK.gs), with [`tools/compare-staging-reads.mjs`](../tools/compare-staging-reads.mjs) for comparing versions. Both have isolated regression tests. The driver blocks any document whose name does not start with `BVLOG_BENCHMARK_`, validates strict staging Script Properties, and invokes only the read path after the folder membership check. Run it from the Apps Script editor in separate staging projects, not against the production deployment. It measures GAS+serialization only; WordPress/redirect times require independent staging checks. See [full Bulgarian protocol](STAGING_TEST_V080A_BG.md).

**Real measurement remains outstanding:** a test Sheet was located through Drive metadata, but the next Drive request returned HTTP 429. No real Apps Script staging execution has occurred, and the synthetic 97.4% reduction in scanned rows is **not** an observed latency gain. Test suite now **27/37 PASS vs 23/33 baseline**, with unchanged ten historical failures.

## How to measure on an approved, dedicated test incident

1. **Do not deploy to production before explicit approval.** Keep the current published Apps Script deployment ID/URL and WordPress 0.7.2.1 untouched. If approved, use a separate Google Apps Script staging deployment with test folder/template and **non-sensitive test incident**; never connect a real SAR incident without authorization.
2. Record baseline for deployed v0.7.2.1 using the existing WordPress bridge history and GAS trace IDs, including POST and redirect GET stages; do not equate whole-bridge time with GAS-only time. For a true before/after comparison, repeat with the same synthetic Sheet fixture and same test network/device.
3. Capture at least ten sequential successful reads, including small, medium and long LOG, a trailing-empty operational range, with and without media/history. For p95, use 40 or more comparable completed requests.
4. Export only **the safe `bvlTrace_` JSON objects** from Google executions to a local `.jsonl` file, one JSON object per line; no raw full incident execution logs. Run:

   ```bash
   node tools/analyze-gas-traces.mjs /path/to/sanitized-traces.jsonl
   ```

   The report groups `read`, `list`, `create` and `operation` and shows `phase_ms` and `elapsed_ms`. Diagnose the previously observed 115-second `doPost` outlier by its actual action. This candidate's instrumentation cannot retrospectively reveal the action of an older execution.
5. Compare median, max, failure rate, number and size of Sheets reads, PHP POST vs Google redirect GET, first fresh data in the UI, and any conflict or media issues. Do not claim a percentage speedup without equivalent real measurements.

## Architecture and safeguards

- `bvlEnd_` is also used for writes: verify append behavior and date separators with manually edited, sparse and long LOG rows. **Do not** change operation UUIDs, audio/photo contents or INFO validations.
- A long empty tail can require several bounded reads; new tracing must show if this regresses performance. Do not introduce caching that may ignore external manual edits.
- Metadata indexes (`__BVLOG_PHOTOS`, `__BVLOG_AUDIO`, `__BVLOG_HISTORY`) are still read in full. Split/paginate them only after data shows they dominate time, while keeping media mapping and old records correct.
- The current audio playback still retrieves full Drive blobs per chunk and waits for all chunks before playing. Streaming/Range and resumable uploads remain in the **later v0.8.0 media phase** ([#7](https://github.com/issaev/bg-voice-logger/issues/7)).
- The current 35-second WordPress `read` POST timeout and independent 15-second Google redirect GET budget are unchanged. A 115-second GAS execution is **not** fixed by these limits.
- The test-harness baseline remains synthetic; do not touch IndexedDB queues or production data during performance experiments.

## Next development gates

- Review this branch and validate staging results for Google read performance and append correctness before advancing to v0.8.0-B.
- If bottlenecks are confirmed, design data-shape changes separately: active-tab vs metadata responses, paginated old LOG, bounded media history, versioned cache with invalidation on manual Sheets edits.
- After v0.8.0-B, design authenticated, Range-capable audio playback and resumable uploads without exposing public Google Drive URLs.

**Rollback:** the candidate has no database/schema change. Revert the GAS staging deployment to the previous version and preserve the same test folder, user sessions and all local queue contents. Do not reset caches or IndexedDB as a workaround.
