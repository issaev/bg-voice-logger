# Security and privacy

- The repository must not contain production API tokens, shared secrets, OAuth
  refresh tokens, service-account credentials or operational Sheets/Drive IDs.
- This snapshot removed project-specific Google folder/template identifiers.
  Never infer that those resource IDs constitute authentication: access must be
  independently controlled in Google Drive and WordPress.
- Use site-local settings or server environment for credentials. The Cloudflare
  Worker requires its own provider keys and HMAC signing secret.
- Do not upload rescue action records, names, locations, photos or audio to
  public GitHub issues or the repo, including raw HAR traces or browser queues.
- Never test data-changing operations against an active incident; use isolated
  test resources and verify the Apps Script version before making requests.
- The bundled source may have unresolved bugs and security considerations.
  Treat the release as a development snapshot, not a security certification.
