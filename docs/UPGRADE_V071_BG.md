# BG Voice Logger v0.7.1 — reliability release candidate (DRAFT)

**Status:** source-only development branch; NOT deployed. **Approval is required** before merging into main, upgrading WordPress, or publishing Google Apps Script.

## Scope

Six P1 bug fixes:

| Issue | Fix |
| --- | --- |
| [#2](https://github.com/issaev/bg-voice-logger/issues/2) | Orphan media cleanup now reads queue references, scans media keys and deletes orphans in one IndexedDB readwrite transaction spanning both stores. |
| [#3](https://github.com/issaev/bg-voice-logger/issues/3) | Durable queue commit is separate from UI refresh; retry of unsaved audio reuses the same op_id and checks whether the record is already present. |
| [#4](https://github.com/issaev/bg-voice-logger/issues/4) | TEAM/TECH new-row form remains open and preserves entered fields when local enqueue fails. |
| [#5](https://github.com/issaev/bg-voice-logger/issues/5) | Footer prioritizes unsaved in-memory audio instead of incorrectly reporting “Everything synced” with an empty queue. |
| [#8](https://github.com/issaev/bg-voice-logger/issues/8) | Only the primary “Акция” value uses action-type dropdown; comments and additional information use free text. Apps Script applies action-type canonicalization ONLY to the actual primary action cell (avoids 60-character truncation of comments). |
| [#11](https://github.com/issaev/bg-voice-logger/issues/11) | Async incident list refresh preserves the operator's selected document if it still exists. Out-of-order responses and user DB scope changes cannot override the latest list. |

**Not included:** performance work [#6](https://github.com/issaev/bg-voice-logger/issues/6), [#7](https://github.com/issaev/bg-voice-logger/issues/7), queue shortcut [#9](https://github.com/issaev/bg-voice-logger/issues/9), creation date picker [#10](https://github.com/issaev/bg-voice-logger/issues/10), auto-refresh of Sheets edits [#12](https://github.com/issaev/bg-voice-logger/issues/12). The separate Cloudflare STT PR #1 is not part of this release.

## Components and compatibility

- WordPress plugin: **0.7.1**, with versioned frontend assets and embedded JS build **0.7.1-3d2b0c59217f**.
- Google Apps Script: replace existing **Code.gs** with the v0.7.1 revision for correct INFO comment handling.
- Cloudflare Worker: **no change**.
- IndexedDB: **schema 2 unchanged**; queued operations, snapshots, binary audio/photo bytes, and retry identities are preserved. Do not clear local storage or unregister/delete queues during upgrade.
- Existing Google Sheets templates and contents: **no planned migration**. Existing dropdown formatting/validation must remain unchanged.
- This public-source repository intentionally omits live operational Google folder/template IDs. Ensure the existing private WP configuration is preserved when packaging a production plugin.

## Offline / isolated test protocol

Run from the repository root in a local environment:

```bash
node --check assets/app.js
node --check < apps-script/Code.gs
php -l bg-voice-logger.php
node tests/test-v071-reliability.js
node tests/test-v062-media.js
node tests/test-v070-adaptive.js
node tests/test-v070-ui.js
php tests/test-v070-assets.php
```

On the working source, these targeted checks pass. Full historical test suite: **17/27 pass**, **10 historical failures**, same failing test names as the v0.7.0 baseline (**16/26 pass**). Do not interpret an obsolete historical assertion as a new v0.7.1 regression. New v0.7.1 regression test does pass.

### Mandatory hands-on validation BEFORE permission to publish

1. **iPhone Safari smoke test:** preserve currently working microphone recording, original playback, cloud STT, offline queue, reconnect and manual transcript review. Collect actual iOS/browser version. No evidence currently establishes an active Safari problem.
2. **Incident choice race:** with a slow list refresh pending, select an older incident and verify selection remains there after response; open and verify the sheet name/ID before the first LOG entry.
3. **INFO comments:** for the same test incident, change the primary action type via dropdown; write 200+ characters in **Коментар** and **Допълнителна информация**, save and verify exact values in Google Sheets; check moved columns and repeated INFO date blocks.
4. **Failed local save:** in an isolated test profile, simulate IndexedDB quota/transaction failure. Verify TEAM/TECH form values persist and that unsaved audio shows an explicit warning with download/retry. Never erase an active operator's queue to simulate failure.
5. **Retry and concurrency:** duplicate prevention after simulated server commit plus lost response; interrupted media transfer and restart; 2 open tabs; no deletion of a still-referenced image/audio blob by orphan cleanup.
6. **Preservation:** pre-existing unsent operations from v0.7.0 remain in the queue and are handled safely. Manual Sheets conflicts/row-moved are not overwritten.

The isolated Node tests are NOT real-device Safari tests, and the bundled Code.gs may differ from the currently deployed Apps Script. Verify the deployed revision before upgrading.

## Deployment order (AFTER explicit approval ONLY)

1. Back up the active WordPress plugin, WordPress config values, current Apps Script deployed revision, and a safe test incident; document current JS build ID and backend version. Do **not** export real incident data into a public GitHub repo.
2. Verify the existing WordPress PHP runtime/settings and deployed Apps Script source; do not replace private defaults with the sanitized public placeholders.
3. Upgrade **Apps Script first**: Apps Script editor > replace `Code.gs` with reviewed v0.7.1 code > **Deploy > Manage deployments > Edit > New version > Deploy**. Preserve the existing Web App URL and permissions. This step is required before the new frontend can save unrestricted INFO comments safely.
4. Upgrade the **WordPress plugin second** using a verified full v0.7.1 package. Confirm the asset URLs are content-hashed and the app header shows `WP 0.7.1 / JS 0.7.1-3d2b0c59217f`; a mixed build is NOT accepted.
5. Test a dedicated non-sensitive incident end to end with consent, including actual iPhone recording and later desktop playback. Observe queue status, conflicts and Sheets writes. Only then declare the release active.

## Rollback

- Restore the previously deployed **WordPress 0.7.0** code/config; republish the previous Apps Script deployment revision under the **same deployment ID / URL**.
- Preserve IndexedDB schema 2 and all unsent queued records/media. **Never clear browser storage** as a rollback action.
- Before replaying any uncertain request, verify idempotency (`op_id`) to prevent duplicates and data loss.
- If the backend revision does not match what was tested, stop and assess compatibility rather than forcing a downgrade.

## No unrelated changes

Do not use this release to deploy the pending Cloudflare STT glossary branch, change the original Sheets template or optimize Google Sheets reads. Follow the separate roadmap for later versions.
