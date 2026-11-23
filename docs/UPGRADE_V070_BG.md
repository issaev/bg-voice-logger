# BG Voice Logger v0.7.0 - new template and adaptive INFO

## What is new

- The configured default Google Sheets template is `YOUR_TEMPLATE_SPREADSHEET_ID`.
- Both action-type cells INFO!B3 and INFO!B29 in the live template now permit the correctly spelled Bulgarian value `Наводнение`.
- Action types are read from the actual template dropdown rather than a hardcoded list.
- INFO sections, field labels, extra roles and column titles are read dynamically from each document.
- New INFO roles or arbitrary fields can be added from the app; manual changes in Google Sheets are reflected after refresh.
- Writing to a moved INFO field looks up its label and header again; ambiguous or missing targets return a conflict instead of writing to a guessed cell.
- INFO fields with existing strict dropdown validation can be changed only to currently permitted options. The app never recreates the dropdown rule and therefore does not remove its per-option chip styling.
- New actions are created with the proper action type in the new template, with no validation redefinition.
- A link to the active Google Sheet appears below the current action name and opens in another tab.
- Missing unrelated tabs do not prevent reading existing tabs. A missing tab is explicitly reported.
- Existing offline queue, media records, Google authentication and Cloudflare STT are unchanged.

## Important - dropdown option colours

The Google Sheets API used to repair the spelling had to replace the two validation rules and this removed their **custom per-option colours** in the original template. The API does not provide a supported field to recover or set those chip colours. To restore their **original** colours, open the source template in the native Google Sheets editor and edit the option colours in Data > Data validation for INFO!B3 and INFO!B29. Do NOT reset the validation with Apps Script or the API. The spelling is already correct; do not change the option text further.

Source template: https://docs.google.com/spreadsheets/d/YOUR_TEMPLATE_SPREADSHEET_ID/edit

## Upgrade order

1. Back up the current WordPress plugin and record the existing Apps Script deployment version and URL.
2. In the existing Google Apps Script project, replace Code.gs with the bundled v0.7.0 Code.gs; Save. Use Deploy > Manage deployments > Edit > New version > Deploy (do not create a new deployment).
3. Upload the WordPress ZIP v0.7.0 and replace the existing plugin; confirm version and that its `Template spreadsheet ID` is the new source above.
4. Keep all existing API keys, signing secrets, OAuth settings, Drive folder IDs and Google login allowlist. The Cloudflare Worker stays v0.6.0.
5. Load /dka/ and confirm the JS running build matches the expected build in the WordPress diagnostics. This prevents stale Cloudflare JS from invalidating test results.
6. Test **only in a separate test action** before use in a live rescue operation.

## Acceptance tests

1. Create a test incident of type `Наводнение`; verify that the copied INFO!B3 contains the selected value and its validation remains intact.
2. From INFO add a row `Координатор 3` and fill the role and comment. Verify that the role appears on the correct day block in Sheets without overwriting the next date separator.
3. Add another role manually in the Google Sheet and refresh the app; verify that it appears and is editable.
4. Insert a blank INFO row and move a role to another position. Refresh, edit it in the app, and verify that only the intended cell changed.
5. Move the INFO value column and role-label column (on a disposable copy) and verify that the app reads the changed structure.
6. Confirm that an invalid action type is rejected without rewriting the Google Sheets dropdown validation (and without removing chip colours).
7. Open the `Отвори таблицата` link from the active incident; confirm the correct document opens separately.
8. Test access from an existing older incident and a normal voice entry, photo and offline queue on a supported device.

## Limits and safety

- The original custom dropdown chip colours need manual restoration in the native Google Sheets UI as described above. No code claims to restore colours it cannot access.
- Dynamic INFO handling depends on recognizable headers/labels. If there are duplicate matching field labels or deleted required headers, the app blocks ambiguous writes; it does not guess.
- LOG, TECH and TEAM continue to use their established operational/technical columns. Moving or deleting technical ID columns is **not supported**; the app should refuse writes rather than silently overwrite unrelated data. Do not treat arbitrary destructive restructuring of LOG as compatible.
- Cloudflare Worker, STT, authentication and browser IndexedDB logic are unchanged.
- A real integration test on the production hosting plus Safari/iPhone is needed. BUG-008 remains pending until verified with the correct JS build.

## Rollback

WordPress: restore the previous plugin backup. Google Apps Script: republish the previous deployment revision via Manage deployments (same URL). No IndexedDB schema migration is performed by v0.7.0. Existing test documents and data in the folder remain intact.
