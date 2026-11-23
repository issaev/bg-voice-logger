# Source provenance and public export changes

- Source archive: `bg-voice-logger-v0.7.0(1).zip` supplied in chat.
- Separate `BG_Voice_Logger_v0.7.0_Code_DOWNLOAD(1).zip`: duplicate `Code.gs`;
  the canonical copy is under `apps-script/Code.gs`.
- Public export changes: replace operational Google folder, old template and
  new template IDs; replace template migration literals with optional
  site-local configuration constants; adapt one test to check configurability;
  clarify README and add `.gitignore`, `SECURITY.md`, `SOURCE_MANIFEST.md`.
- The Google Sheets document/template is NOT supplied as a file and therefore
  not part of this repository. No WordPress content database or live config
  is part of the original source archive.
- `benchmarks/2026-11-23/` is a supplied performance baseline, not a test run
  conducted during this public-export preparation.
- This source snapshot has **not** been deployed to WordPress, Apps Script or
  Cloudflare.
