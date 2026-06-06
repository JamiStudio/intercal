# Plan 04 W3 (audit-2) — close TRUNCATE gap + broaden audit redaction

Date: 2026-06-06
Type: fix
Packages: @intercal/core, db, scripts/dev, docs/security

## Summary

Second fresh-context pass on the append-only audit trust ledger. Atomicity (the audit row is written
in the same transaction as the key mutation, so a failed audit insert rolls the action back),
attribution (the actor is set server-side by the caller, not from spoofable input; CLI threads
`--by`), and the deferred emit seams all held and were left unchanged. Two genuine
correctness/security gaps were closed.

## Changes

- **TRUNCATE could silently empty the ledger** (`db/migrations/0027_audit_events_forbid_truncate.sql`):
  the 0026 `BEFORE UPDATE`/`BEFORE DELETE` row triggers do **not** fire for `TRUNCATE`, and on a
  managed Postgres where the application role owns its tables (Neon `neondb_owner`) `TRUNCATE` is
  reachable through the normal data path — a silent whole-history erasure. Added a `BEFORE TRUNCATE`
  statement-level trigger (reusing the 0026 raise function) so all of UPDATE/DELETE/TRUNCATE are now
  rejected. A new migration (not an edit to 0026) so it actually applies on already-migrated DBs.
  Dropping the table/trigger via DDL remains a privileged, visible operator action and is
  intentionally not gated.
- **Broadened secret redaction** (`packages/core/src/auth/audit.ts`): the recursive redactor's
  secret-key matcher now also covers `dsn` / connection-string (`connectionString`, `conn_str`,
  `conn_uri`), `credential(s)`, `private_key`, `access_key`, `bearer`, `hash` (any cased/renamed
  variant, e.g. `keyHash`, `passwordHash`), `session`, `salt`, and `signature`, in addition to the
  prior set. Substring + case-insensitive, so renamed/re-cased fields are still caught at any nesting
  depth; benign fields (`ownerId`, counts, names, `keyPrefix`) pass through unchanged.
- **`sql` re-export** (`packages/core/src/db/client.ts` + index): surface Kysely's `sql` tag from
  `@intercal/core` so dev scripts can run raw statements without a direct `kysely` dependency (used
  by the live TRUNCATE check).
- **Live-verify harness**: `scripts/dev/verify-audit.mjs` now also asserts TRUNCATE is rejected.

## Verification

- `pnpm lint` · `pnpm --filter @intercal/core typecheck` · `test` · `build` — all clean. Added an
  adversarial nested/renamed-secret redaction unit test (dsn, connectionString, conn_str,
  refreshToken, db_password, xApiKey, accessKey, privateKey, sessionId, credentials.bearer,
  deep[].secretSauce/keyHash, CredentialSet — all `[redacted]`; benign fields preserved; poison value
  absent from the serialized row). Core suite 99 passing.
- **LIVE** against a throwaway Neon branch (forked from prod default, deleted after): 0027 applied;
  `scripts/dev/verify-audit.mjs` → **15/15** — issue/revoke rows correct; no raw key / hash in any
  row; UPDATE, DELETE, **and TRUNCATE** all rejected as append-only; rows survive. No secret/key value
  or DSN written to any tracked file or output.

## Notes

- No hash-chain / cryptographic tamper-evidence added — the plan calls for an append-only queryable
  log, which the DB triggers now fully provide (UPDATE/DELETE/TRUNCATE); a hash chain would be
  over-engineering beyond W3.
