# Regression suite

Run `node tools/test-all.mjs` from a checkout with Node and PHP (OpenSSL enabled).
The runner executes every file independently, fails on nonzero exit or a 60-second timeout, and continues after a failure.
Set `PHP_BINARY` if PHP is not on PATH. Portable Windows PHP may also need `PHP_EXTENSION_DIR` and `OPENSSL_CONF`.

The default run includes `known-bugs/repro-issue-48.mjs`: the unresolved concurrent STT ticket race must remain red until the product is fixed. It asserts the desired single-provider-call behavior, not the buggy result. It uses only synthetic tokens and mocked KV/Groq, with no network requests.
`node tools/test-all.mjs --regressions-only` explicitly excludes that reproduction, with a visible warning. A green regression-only run is not full release acceptance.

## Maintenance for 0.8.2.2

- Release/hash assertions now derive the release from the plugin header; canonical SHA-256 checks still detect stale assets. Test filenames indicate the origin of a regression, not a frozen required app version.
- Old numeric hook offsets were replaced with named App state lookup. The helper fails if a state is removed, instead of silently exercising the login screen.
- Sheets mocks now implement current schema/validation/technical-header contracts; Drive mocks expose real byte counts.
- Photo read tests assert stable-ID association after sorting and no mutation of spreadsheet image anchors. Two uploaded photos must still be returned.
- SAR prompt is required; prompt echo/silence must be rejected with nonretryable 422 and no fallback, rather than returned as usable transcription.
- LOG bridge timeout is bounded at 30 seconds; long-media timeout checks remain.
- Retry extraction stops before tab-cache helpers, so fixture dependencies cannot be overwritten by unrelated functions.
- `test-v063-ui.js` was an obsolete duplicate of `test-v070-ui.js` and was removed. The latter retains INFO numeric cells/audio controls, visible build, mismatch warning and boundary assertions.
- Old 120-second polling assertions in `test-v072-release.js`/`test-v0721-ui-errors.js` are superseded by `test-v0822-tab-prefetch.js`, `test-prefetch-scheduler.js` and `test-v080-retry.js`. They test per-tab cadence, deferral during editing, one in-flight read, identity isolation, scheduler guards and bounded retries. Date, queue visibility, read-error retention and dedup assertions remain.
- Pending deletion covers both field-audio cards and the journal queue modal. The IDB mock signals transaction completion; a watchdog prevents Node from reporting success while the test is suspended on an unresolved promise. Confirmation-time STT races must preserve the record.

No application code, build, plugin ZIP or production settings are changed. Unit/mock tests do not replace real Safari/Android acceptance.
