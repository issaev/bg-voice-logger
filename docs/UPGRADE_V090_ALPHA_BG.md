# Direct Google read pilot — development and test instructions

This feature branch extends the synthetic-only v0.9.0-alpha.1 candidate. Production WordPress v0.8.2.2 was reported by the operator on 25 November 2026. This source change is not a release, package, deployment, or production approval. The existing GAS writer, STT worker, media and outbox remain unchanged.

## Preflight and the 403 reported on 25 November

The alpha.1 Check returned bvlog_direct_scope_denied, one Drive call and zero Sheets calls. This means the metadata scope gate rejected the selected file; the exact predicate cannot be recovered from that old report alone. It is not the same as bvlog_direct_google_access_denied from an HTTP 401/403/404.

- Use a synthetic Google spreadsheet that is an immediate child of the folder configured in the WordPress plugin. GAS bvlDoc_ uses the same immediate-parent rule. A spreadsheet inside a subfolder, a shortcut, the template, a trashed file or an unfinished create does not qualify.
- Give the private read-only service account appropriate read access to the configured test folder and fixture. In a shared drive, use the intended membership and direct parent, not an arbitrary broader scope. Never paste service-account keys or tokens into GitHub, chats, or browser logs.
- Keep BVLOG_DIRECT_READ_MODE set to shadow and only synthetic IDs in BVLOG_DIRECT_TEST_DOCS. Keep BVLOG_DIRECT_APPROVED_TABS empty until a separate acceptance decision.
- Run Check after changing fixture/configuration. The development source adds a fixed admin-only scope_reason to the otherwise unchanged 403: parent_mismatch (wrong immediate parent), parents_missing (not returned/empty), not_spreadsheet, trashed, trash_state_missing, template_document, invalid_document_id, id_mismatch, metadata_missing, name_missing, pending_create. The report contains no raw Drive metadata values or IDs. The application REST error remains generic; no denial can trigger a GAS fallback.
- If the HTTP error is google_access_denied, check the service-account access and enabled Drive/Sheets API, not the scope guard. Do not relax the guard.

## Automated comparisons (development source)

1. Select the synthetic document. Choose All-tab parity to run Check followed by sequential LOG, INFO, TECH and TEAM comparisons. The suite reports matched, mismatched, unavailable and not-run tabs. A 401/403/429 stops further tests. A mismatch is distinct from a network failure.
2. Choose a tab and Paired benchmark. The same Check and selected-tab comparison must pass before the suite runs. It measures equal numbers of GAS, uncached Direct, and Cache requests in groups using the selected concurrency. Start with 1 sample, then 10, then 40. Only 40 successful samples per backend group support p95; cache miss and hit are reported separately. The run stops on access/quota denial. No cache reset or synthetic write is performed.
3. Export the JSON. Use the same fixture, network, sample count and concurrency for comparisons; repeat for small and large documents and 1/5/10 concurrent requests. Do not claim a speedup from failed probes or from different fixtures. A completed parity suite does not enable Direct mode.
4. Continue to test manual edits, formula changes, writer epochs, concurrent operators, revocation, cache TTL, MySQL locking and cold/warm behavior. Real Google and WordPress acceptance remains required before any rollout.

## Development checks

Run `php tests/test-v090-scope.php`, `php tests/test-v090-direct-read.php`, and `node tests/test-v090-probe-suite.js`. The pure scope cases and mocked browser suite do not access real Google data. The full PHP/Node regression, live administrator probes, Android/iOS and actual performance are separate gates.
