# BG Voice Logger v0.8.3 — test candidate / installation

**Not an operationally accepted release.** Production/main is still v0.8.2.1 (operator report). v0.8.3 includes the v0.8.2.2 background-refresh candidate. Install only in a controlled test environment until acceptance; no destructive queue reset.

## 1. Install the regular application

1. Keep a backup of the currently installed WordPress ZIP and GAS revision. Keep all current Script Properties, OAuth configuration, folder/template IDs and shared secret.
2. Replace Code.gs in the existing Google Apps Script project with the v0.8.3 file. Save -> Manage deployments -> Edit -> New version -> Deploy to the same /exec URL. The health version must be 0.8.3. No new Google project is required.
3. Replace the WordPress plugin with bg-voice-logger-v0.8.3.zip. Do not uninstall the previous plugin or clear browser/IndexedDB data.
4. Verify header WP 0.8.3 / JS 0.8.3-5e7cf749a0ac. Existing login, media, offline queue and Sheets write behavior must be tested. SMS is OFF by default. Worker remains the existing deployment unless separately upgraded.

## 2. SMS pilot — default OFF

Use only a disposable/synthetic incident in an isolated testing environment. The following examples show placeholder values, never real credentials. **Do not configure an unfiltered gateway on a personal phone**. The upstream webhook documentation (https://docs.sms-gate.app/features/webhooks/) describes sms:received and signing, not proof of local filtering; verify that the selected version/fork filters the DK1 prefix locally before any webhook or cloud transmission. If no suitable local filter is available, stop; leave the pilot disabled. This is a blocker, not an instruction to assert filter verification falsely.

In wp-config.php, outside this repository, after the real test fixture and gateway are prepared:

```php
define('BVLOG_SMS_PILOT', true);
define('BVLOG_SMS_TEST_DOCS', ['SYNTHETIC_SHEET_ID_REPLACE']);
define('BVLOG_SMS_COORDINATOR_LABELS', ['Координатор', 'Координатор на акцията']);
define('BVLOG_SMS_GATEWAYS', [
  'REPLACE_DEVICE_ID' => [
    'phone' => '+359000000000',
    'signing_key' => 'REPLACE_WITH_REAL_DEVICE_SIGNING_KEY',
    'local_filter_verified' => true, // ONLY after a real privacy test
  ],
]);
```

Do not use these placeholders as live credentials. Google/WP login is required; public mode is disabled for SMS. Gateway secrets are separate from each operator's signing key and must not be copied to JavaScript, repository, screenshots, logs, or the SMS text. Keep WordPress SAVEQUERIES and verbose request logging off for the pilot. An administrator visits WP admin once to install the new private table (no modification to existing queue or Sheets data); Settings > BG Voice Logger shows pilot status and recent complete/review groups with Retry for RECEIVED.

Configure the Android gateway in local mode if supported, event sms:received only, URL https://YOUR-HOST/wp-json/bvlog/v1/sms-ingest. The actual registered device ID and phone must match the private gateway configuration. Per-device key in the gateway app must match its server setting. Use HTTPS; verify raw-body HMAC (hex SHA256 over body followed by X-Timestamp) and delivery queue. The timestamp policy allows up to seven days of delayed signed retry for this pilot, with deduplication; verify actual retry behavior. A gateway may receive for several test incidents; the current INFO role determines phone per incident. Any registered eligible Android operator can coordinate; no separate PWA build. Current pilot registration is administrator-managed, not self-service. Validate RECEIVE_SMS permission and lock-screen/reboot/reconnect behavior on the actual phone. Never use real personal/medical text.

Open the test incident online; the latest INFO block must contain exactly one configured coordinator role with a single valid phone in a column whose header identifies phone. Refresh INFO. The readiness panel must show the expected coordinator and credential expiry. The backend issues an operator+incident+gateway scoped grant (valid up to seven days, new daily alias; revocation via allowlist/gateway or disabling pilot). The private snapshot permits offline preparation. Check number before leaving; old offline INFO can be stale. After coordinator change, refresh INFO and do not send a previously prepared package to the old phone. At complete receipt the backend rechecks current INFO.

## 3. SMS wire / manual sender

DK1 + 8-char alias + 22-char original UUID + 2-char part index + 2-char total (base36) + first-part-only 6-char UTC seconds, source T/V and 16-char signature + newline + original text fragment. No encryption or transliteration. Alias combines routing and operator scope, no long Sheets ID/name. First header 61 characters including newline; continuation 38; counts are exact for the specified ASCII header. Actual SMS encoding depends on content. Example with Unicode may require many independent SMS; max 96 parts. PWA computes single-SMS fit per piece, including GSM extension characters and UTF-16 units. User sends each separately; Android/iOS sms: body behavior is not guaranteed. Copy/paste fallback is available. On the receiver, incomplete messages remain readable in Messages but no incomplete record is written. A full group is reconstructed and authenticated; only Sheets confirmation marks synchronization. The normal local queue is not removed by SMS composer handoff. No automatic ACK SMS. Already-confirmed remote-only/legacy entries without the local original UUID/timestamp are not re-sent through this pilot. No images/audio via SMS.

## 4. Required acceptance before operational use

- First run PHP syntax check on all plugin PHP files, php tests/test-v083-sms.php, node tests/test-v083-sms.js, node tests/test-v083-stt-nonce.js, prior targeted tests and full suite. Investigate inherited failures; do not equate mocks with acceptance.
- On real isolated WordPress/MySQL + GAS test fixture: verify grant provisioning, signed webhook, partial/duplicate/out-of-order/conflicting/tampered parts, durable storage failures, recipient changes, revocation, simultaneous Internet/SMS, pre-existing legacy rows, retry after lost ACK, exact Unicode, date/source/author and manual edits. Verify no private messages/OTP leave phone. At least 100 synthetic delivered complete events, no loss or duplicates in controlled test. Test 12h offline gateway, restart, force-stop, lock screen, actual Android and iPhone PWA composer behavior, multipart independent visibility. Test absence of first/middle/last pieces; no false confirmed state.
- Gateway HTTP timeout may be shorter than INFO recheck + GAS operation. Return 5xx on transient failures; gateway retries and admin Retry for RECEIVED. This is not a guaranteed background worker; if latency/retries fail the acceptance gate, add a reliable server-side worker. No real benchmark or actual device test has been done.
- Pilot is limited to synthetic incidents. Production permission onboarding, local filtering implementation/selection, operational privacy policy, retention/cleanup UI, self-service registration, manual paste import, remote-only entries, heartbeat and completed acceptance are outstanding. Disable by setting BVLOG_SMS_PILOT=false. Do not delete the pilot table or browser queue when disabling/rolling back.

## 5. Optional STT security candidate (#48)

Worker 0.6.2 replaces eventual KV get/put with a per-jti SQLite-backed Durable Object. Use the supplied stt-worker.mjs and merge the STT_NONCE_GUARD binding and unique new_sqlite_classes migration from wrangler.toml.example into your actual private Wrangler configuration. Preserve existing AI, KV migration guard, rate-limit binding, issuer, origin and secrets. **Do not replace your actual config with placeholder namespace IDs.** The code fails closed without the DO binding. Test a staging Worker first, including 20 concurrent identical tickets, valid distinct tickets, invalid signatures, and unavailable storage. For transition, stop issuing old tickets and allow the prior ticket lifetime/in-flight requests to drain before switching; KV is only a best-effort old-ticket guard, not a cross-version atomic lock. Verify /health version 0.6.2 / nonce_mode durable-object and normal STT. Old Worker stays unchanged until explicit approval. Do not deploy the Worker simply to install this WordPress package.

#43 and #46 remain separate. See docs/ROADMAP.md and GitHub issue #47 for the full architecture.
