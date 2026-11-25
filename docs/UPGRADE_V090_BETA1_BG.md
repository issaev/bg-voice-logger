# BG Voice Logger 0.9.0-beta.1 — тестов инсталационен кандидат

**Само тестова среда и синтетични акции. Не е приета production версия.** Това е първият общ пакет за Direct Sheets read/write + SMS. Поставянето на ZIP не включва автоматично новите режими. Няма миграция или изчистване на локалната опашка. Cloudflare STT остава непроменен.

## Обхват
- Direct Sheets READ: LOG, INFO, TECH, TEAM, централен краткосрочен кеш.
- Direct Sheets WRITE: LOG append, INFO/TEAM/TECH полета, TEAM/TECH нов ред, edit/cancel на LOG със стабилен UUID и подготвен HISTORY. Атомарни Sheets batchUpdate и immutable operation receipt; общ SQL writer и защита от повторен запис при несигурен отговор.
- SMS: директен INFO grant след кеша, live INFO проверка под същия writer lock, общ оригинален UUID/хеш, durable fragments/receipt, optional WP cron retry. Без снимки/аудио през SMS. Не е извършена реална активация или тест на Android gateway.
- CREATE/list и медийните операции остават legacy GAS за нефенсирани документи. За fenced test doc медийните записи са изрично отказани, а не пренасочени към втори writer. При voice LOG текстът се записва, аудио прикачването остава в локалната опашка. Ръчно паралелно редактиране/сортиране в fenced doc не е поддържано: Sheets API няма универсален CAS. Няма обещание за lossless concurrent manual edit. Unsupported формули/validation/legacy row IDs се отказват. Не е завършена пълната миграция на Drive.

## 1. Подготовка и WordPress/GAS
1. Архивирайте текущия plugin, wp-config и Script Properties. Запазете browser/PWA IndexedDB и оригиналните неизпратени операции. Не деинсталирайте стария plugin и не изтривайте таблици.
2. Само на отделен staging сайт и отделна Drive папка: използвайте готов тестов документ, създаден от приложението през стария GAS. В LOG трябва да има G1 BVLOG_ID, H1 BVLOG_STATUS, валидна дата D2. TEAM I2 и TECH F2 трябва да имат BVLOG_ID. Скритият __BVLOG_OPS трябва да има първи ред: op_id | kind | timestamp | author | result. За edit/cancel на LOG е необходим скрит __BVLOG_HISTORY с първи ред: operation | log_id | action | timestamp | author | before | after | row. Подгответе го преди ограждане на документа. Използвайте само синтетични записи. Изключете всички независими ръчни редактори и източете старите опашки; не сменяйте конфигурацията по време на запис.
3. Write service account: Editor само на тестовата spreadsheet, Viewer на непосредствената родителска папка. Sheets и Drive API enabled. Съществуващият read-only account остава с Viewer. Може изрично да използвате същия credential файл за staging, ако е Editor само на тестовия документ; read и write OAuth token scopes се разделят. Ключът трябва да е извън webroot. Не качвайте private keys в GitHub или WordPress Media.
4. В тестовия Apps Script заменете Code.gs с файла от същия beta.1 source commit. Save -> Manage deployments -> Edit -> New version -> Deploy. Запазете URL/shared secret. Старите deployment-и, които могат да пишат в този тестов документ, трябва да бъдат спрени. В Script Properties на този проект задайте BVLOG_DIRECT_WRITE_FENCES като JSON:
```json
{"SYNTHETIC_SHEET_ID_REPLACE":"synthetic-rollout-01"}
```
   GAS INFO backend_version остава 0.8.3 за legacy съвместимост. writer_policy проверява новата fence capability. Всички legacy операции към fenced doc се отказват под същото GAS заключване.
5. Качете **bg-voice-logger-v0.9.0-beta.1.zip**: Plugins -> Add New Plugin -> Upload Plugin -> Install Now -> Replace current with uploaded. Проверете WP 0.9.0-beta.1 и JS 0.9.0-beta.1-0b29dbb53a6c. Не пипайте STT worker.

## 2. Активиране на Direct read/write
Заменете съответните стари дефиниции, не ги дублирайте. Стойностите са placeholders, не реални credentials. Запазете съществуващите BVLOG_DIRECT_ROLLOUT, BVLOG_DIRECT_SERVICE_ACCOUNT_FILE и folder/template settings от alpha.2.
```php
define('BVLOG_DIRECT_READ_MODE', 'direct');
define('BVLOG_DIRECT_TEST_DOCS', ['SYNTHETIC_SHEET_ID_REPLACE']);
define('BVLOG_DIRECT_APPROVED_TABS', ['SYNTHETIC_SHEET_ID_REPLACE'=>['LOG','INFO','TEAM','TECH']]);
define('BVLOG_DIRECT_WRITE_FENCES', ['SYNTHETIC_SHEET_ID_REPLACE'=>'synthetic-rollout-01']);
define('BVLOG_DIRECT_WRITE_SERVICE_ACCOUNT_FILE', '/private/path/write-service-account.json');
define('BVLOG_DIRECT_WRITE_MODE', 'sheet_pilot');
define('BVLOG_DIRECT_WRITE_EXCLUSIVE', ['SYNTHETIC_SHEET_ID_REPLACE']);
```
Visit WP admin once to create SQL tables. Settings -> BG Voice Logger -> Direct LOG writer pilot (#50) -> Verify GAS fence. Must show ready, unresolved dispatches 0. Verification checks the fence rollout and actual write access/LOG schema without mutating. Valid for 24 hours; verify after config/deployment changes. If write_permission, fix Editor access; write_headers, inspect test headers; write_fence_unverified, fix GAS property/deployment; never bypass. Run Check and all-tab parity; in the application create synthetic text LOG, edit INFO/TEAM/TECH, add rows, edit and cancel LOG. Verify Sheets row and __BVLOG_OPS receipt; network REST ACK should contain write_backend direct_log_v1 or direct_sheet_v1. No duplicate when reusing the same original op_id. Test only after PHP/Node checks pass.

## 3. SMS (само след privacy и direct write test)
Configure a dedicated synthetic sender/recipient test first. The Android gateway must filter DK1 locally **before any network transmission**; do not connect a personal SMS inbox until verified. Current INFO coordinator must have exactly one matching role in latest block and one valid phone under a phone column. Google/WP authentication required. In private wp-config:
```php
define('BVLOG_SMS_PILOT', true);
define('BVLOG_SMS_TEST_DOCS', ['SYNTHETIC_SHEET_ID_REPLACE']);
define('BVLOG_SMS_GATEWAYS', [
    'REPLACE_DEVICE_ID' => [
        'phone' => '+359000000000',
        'signing_key' => 'REPLACE_WITH_REAL_DEVICE_SIGNING_KEY',
        'local_filter_verified' => false,
    ],
]);
define('BVLOG_SMS_RETRY_CRON', true);
```
Set local_filter_verified to true **only after a real privacy test**. Configure actual registered gateway device ID, phone and >=32-character signing key. Use HTTPS webhook https://YOUR-STAGING-HOST/wp-json/bvlog/v1/sms-ingest, sms:received, HMAC hex SHA256(raw body + X-Timestamp). Exact gateway version and local filtering are external prerequisites; no claim of automatic configuration. Refresh INFO on sender to provision per-operator grant, compose each DK1 SMS manually, confirm complete receipt writes one LOG. Test duplicate Internet + SMS using original ID. Optional WP cron retries one durably received complete packet per 5-minute tick; real system cron/traffic is required, not a delivery guarantee. See docs/UPGRADE_V083_BG.md for wire protocol/device checks. Disable SMS by BVLOG_SMS_PILOT=false; no database deletion.

## 4. Acceptance / rollback
- Run php -l on all plugin PHP; targeted tests test-v090-direct-log-plan.php, test-v090-direct-log-engine.php, test-v090-direct-sheet-plan.php, test-v090-direct-read.php, test-v090-scope.php, test-v083-sms.php; JS tests for fence, probe, SMS, STT nonce and regression. Automated mocks do not prove live API or MySQL correctness.
- Live testing on disposable fixtures: permissions, scope denial, all four tabs, validation, moved row, SQL lock and cache, 1/5/10 operators, exact SMS duplicates, changed coordinator, malformed/incomplete SMS, lost ACK and explicit rejection; offline device restart; 100 complete synthetic SMS without duplicate/loss under controlled conditions. The current package has not passed this live gate. Do not claim operational readiness.
- Stop submissions and disable BVLOG_DIRECT_WRITE_MODE (leave both fence maps intact). Retry the ORIGINAL operation to reconcile a positively verified receipt if unresolved dispatches >0. Absence of receipt does not prove failure. Do not clear ledger or switch writers while a dispatch might still commit. Only after confirmed drain/reconciliation, retire direct processes, then controlled removal of both fence maps. Keep all SQL receipts and local queue. Restore prior plugin and GAS only after coordinated rollback. No production deployment or main merge.
