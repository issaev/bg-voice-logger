# BG Voice Logger — v0.7.2 source candidate (not deployed)

Bulgarian voice-based operational log for rescue coordination. Components:
WordPress PHP plugin, browser React/PWA frontend, Google Apps Script
Sheets/Drive backend, Cloudflare Worker speech-to-text gateway, tests and docs.

**Public-source safety note:** This branch develops v0.7.2 on top of the v0.7.1 source merged by [PR #13](https://github.com/issaev/bg-voice-logger/pull/13). **The operator-reported production site remains v0.7.1; v0.7.2 has not been deployed.** The public source is **not byte-for-byte identical to the privately configured WordPress production package**.
Operational Google Drive folder IDs and template spreadsheet IDs have been
removed from source code and historical docs. No real secrets are included.
The operator reports WordPress v0.7.1 deployed in production. Merging PR #13 updated GitHub only and did not deploy or modify the website or deployed Apps Script.
This public snapshot is **not a production upgrade package** without separate
configuration and end-to-end validation.

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

### Project status

**Development candidate:** v0.7.2 / JS build `0.7.2-c6f4de4c832a`. The operator-reported live installation is v0.7.1; there is no v0.7.2 deployment. New features: #6 coalesced LOG refresh, #9 sticky queue, #10 incident date picker, #12 conservative 120-second external Google Sheets revalidation plus manual refresh on all tabs. Google Apps Script reads no longer mutate photo anchors. Cloudflare STT and IndexedDB schema 2 remain unchanged.

**Tests:** 19/29 test files pass versus 17/27 in v0.7.1, with the same 10 historical failures; test-incident, real iPhone and Google Sheets/Drive acceptance are pending. See [v0.7.2 upgrade / rollback guide](docs/UPGRADE_V072_BG.md). Do not merge or deploy without review and explicit release approval.

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
