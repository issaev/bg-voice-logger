# v0.9.0-beta.1 development slice — direct LOG writer (#50)

**Source only; not a release or production deployment.** Based on alpha.2 benchmark. This slice supports prepared synthetic LOG append only. It does not yet implement direct field/LOG edits, CREATE, media mutations, independent manual-edit CAS, direct INFO SMS grants, or SMS device acceptance. It intentionally refuses all other mutations on fenced incidents. Do not install on the operational site.

## Implementation
- New explicit Sheets write scope + Drive metadata read-only; separate server-side service account file and scope-specific OAuth token cache. Live immediate-parent/template/trash authorization; no client tokens.
- Strict full bounded LOG / __BVLOG_OPS grid snapshot, existing technical headers and date required. Formula/unsupported shapes fail closed; no initialization or formula overwrite. AppendCells with typed stringValue (including formula-like text); append date divider if needed, LOG and original hash receipt in one atomic spreadsheets.batchUpdate. ACK does not invent a row number; later reads find UUID.
- Durable SQL unique active_doc and operation id/hash, incident advisory lock, cache generation guard. DISPATCHING means unknown until verified. A lost ACK is recovered only using a matching immutable Sheets receipt. No retry of a mutating batch on absent receipt; no automatic GAS fallback. Existing receipt with a deleted row deduplicates, not restores. A mismatch or legacy row without receipt requires review.
- Both existing Internet operation() and verified SMS attempt() route through BVLOG_API::forward('operation'). Same canonical original actor/event/text hash, independent of transport. SMS INFO/read remains GAS 0.8.3-compatible for this slice; SMS pilot remains off unless separately configured and tested.

## Staging setup (once candidate is packaged and tests pass)
1. Create a disposable synthetic incident in the isolated test folder using legacy CREATE. Verify LOG G1/H1 technical headers, real date in D2, and hidden __BVLOG_OPS header. Do not manually edit/sort LOG during the write pilot; independent UI writers are not serialized by WP SQL locks. Version precheck narrows but cannot close the race; no lost-update guarantee for arbitrary concurrent edits. Use synthetic data only.
2. Provision a separate write service account with Viewer on the test parent folder and Editor on this one synthetic spreadsheet. It needs Sheets API + Drive metadata API only. Store its key outside webroot/WP, not in the repository/ZIP. Do not grant Editor on the real operations folder. Keep read-only account unchanged.
3. Stop submissions to the synthetic fixture and drain/resolve all pending legacy writes and client queues before cutover. Deploy the updated Code.gs to the test Apps Script web app; disable/retire any older write-capable deployments for that fixture and shared secret. The legacy INFO version remains 0.8.3 for compatibility; writer_policy reports the new fence capability. In test Script Properties set BVLOG_DIRECT_WRITE_FENCES to JSON {"SYNTHETIC_SHEET_ID_REPLACE":"synthetic-rollout-01"}. The same script lock checks policy and every legacy operation; other documents stay on GAS. Malformed fence config denies operation writes. Never change the fence while a direct intent could still commit.
4. Private staging wp-config.php (placeholders only; use existing alpha read flags/credential/rollout):
```php
define('BVLOG_DIRECT_READ_MODE', 'direct');
define('BVLOG_DIRECT_TEST_DOCS', ['SYNTHETIC_SHEET_ID_REPLACE']);
define('BVLOG_DIRECT_APPROVED_TABS', ['SYNTHETIC_SHEET_ID_REPLACE'=>['LOG']]);
define('BVLOG_DIRECT_WRITE_FENCES', ['SYNTHETIC_SHEET_ID_REPLACE'=>'synthetic-rollout-01']);
define('BVLOG_DIRECT_WRITE_SERVICE_ACCOUNT_FILE', '/private/path/write-service-account.json');
define('BVLOG_DIRECT_WRITE_MODE', 'log_pilot');
```
5. Admin Settings -> Direct LOG writer pilot (#50) -> Verify GAS fence. This calls the deployed writer_policy under the GAS lock, matches the rollout ID, and stores a 24h proof tied to the config and write credential. No GAS call on each write. Reverify after deployment/config changes. A failed recheck clears the old proof. Confirm legacy operation returns writer_fenced for test doc (no mutation). Proof is not continuous monitoring of GAS deployment; never re-enable old deployments or modify the fence during the pilot.
6. Send text/voice test LOG, inspect actual Sheets row, date, __BVLOG_OPS hash, response backend, cache invalidation, and repeat same op ID. Simulate lost ACK, SQL failure, 429, denied permission, moved document, legacy receipt, different hash, and parallel operators; use original queued operation only. If unresolved dispatch count is 1, retry the original ID to reconcile. No clearing ledger or replacement event after an uncertain write.
7. SMS remains a separate gated step. Follow UPGRADE_V083_BG.md for the locally filtered Android gateway; never forward personal SMS/OTP. Test Internet-first, SMS-first and simultaneous retry with same ID, exact original hash. This slice reuses verified GAS INFO recheck and common direct LOG operation; direct INFO/grant migration and actual gateway acceptance are not yet implemented.

## Rollback
Stop all new submissions, disable BVLOG_DIRECT_WRITE_MODE (keep the fence map). Resolve all DISPATCHING reservations through a positively verified original receipt. An absent receipt is not proof of no commit; keep blocked and seek administrator review. Do not switch to GAS while any unknown write exists. Only after documented drain, reconciliation, and retirement of direct processes may an administrator remove the GAS fence and WP map as a controlled change. Keep SQL ledger, original queue and Sheets receipts. No automatic rollback to GAS.

## Tests and remaining acceptance
Run PHP lint, php tests/test-v090-direct-log-plan.php, php tests/test-v090-direct-log-engine.php, node tests/test-v090-writer-fence.js and existing direct-read/SMS/full regression. The fake Google/ledger tests cover state transitions, not actual SQL locking, Sheets atomic append behavior, permissions or real devices. Test real WordPress/MySQL + Sheets/Drive before enabling. The local environment cannot fetch the repository into its PHP runtime; do not claim PHP tests passed unless executed. No performance improvement claimed for WRITE until measured.
