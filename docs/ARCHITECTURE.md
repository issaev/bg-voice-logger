# Architecture - v0.5.0

Canonical design and acceptance criteria are in `../README.md`.

## Services

- React UI (WordPress `wp-element`) for LOG, INFO, TECH and TEAM; default screen LOG.
- Browser SpeechRecognition (`bg-BG`, online availability depends on user agent); MediaRecorder audio fallback.
- IndexedDB per operator with queued text/field/photo/audio operations and preserved document IDs.
- WordPress REST with separate Google app sessions; Google identity RS256 verified via JWKS; authenticated CSRF for writes; optional WordPress/public modes explicitly selected in admin.
- WordPress HTTP relay to Apps Script, with safe Google ContentService 302 redirect handling and sanitized bridge diagnostics.
- Apps Script `DriveApp` for list/copy/image storage; `SpreadsheetApp` for cell edits and LOG append; script lock, hidden UUIDs and operation ledger for deduplication.

## Critical invariants

1. Never silently overwrite an edited INFO/TECH/TEAM cell after an offline operation. Check current value and row key, then surface conflict.
2. Never delete an unsent operation because its network request failed. Store it with stable UUID and retry idempotently.
3. Do not expose the Apps Script shared secret or Drive credentials in browser JavaScript.
4. LOG!E distinguishes speech input (`Глас през приложението`) and typed entry (`През приложението`).
5. New action name contains place, but INFO!B4 remains empty pending GPS/manual entry.
6. Photo associations use a persistent LOG UUID (assigned on first photo for manually-created rows), recorded in `__BVLOG_PHOTOS`; LOG!F shows an over-grid Blob thumbnail, while legacy rich links remain readable. Private previews load via permission-checked WordPress/Apps Script.
7. Google login identity sessions are per account and cannot access other accounts' local queue by default.
8. Google sign-in is free, but Google Drive file permissions are a separate authorization domain.

## Non-goals / not yet guaranteed

- Universal offline Bulgarian voice transcription.
- A transactional lock against direct human Google Sheets editing.
- Server-side asynchronous photo uploads independent of origin timeout (Cloudflare 502 must be field-tested).
- Production readiness without real-world testing on the target hosting and devices.
