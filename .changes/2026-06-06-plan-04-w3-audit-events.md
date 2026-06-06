# Plan 04 W3 — Append-only audit-event trust ledger

Date: 2026-06-06
Type: feat
Packages: @intercal/core, scripts/ops, db, docs/security, docs/architecture

## Summary

`audit_events` is now a working, append-only **trust ledger** — the security record of who did what
to trust-sensitive state. The first real trust-sensitive actions that exist today (API key issuance
and revocation) emit audit rows; later trust actions (feedback, review/operator decisions, source
policy changes) have a clean centralized emit seam they will call, and are NOT faked.

## Changes

- **DB append-only enforcement** (`db/migrations/0026_audit_events_append_only.sql`): a
  `BEFORE UPDATE`/`BEFORE DELETE` trigger on `audit_events` raises on any row mutation, so the
  ledger cannot be silently rewritten or erased through the data path. (Table 0022 declared
  append-only "by policy"; this enforces it in Postgres.)
- **`@intercal/core` audit module** (`src/auth/audit.ts`): `recordAuditEvent` (best-effort) and
  `recordAuditEventStrict` (throws; use inside a tx), an `AUDIT_ACTIONS` vocabulary, typed
  actor/event interfaces, `queryAuditEvents` read helper, and defensive recursive redaction of
  secret-bearing keys (raw/hash/token/password/authorization/cookie/api_key). Exported from core.
- **Audited key lifecycle** (`src/auth/admin.ts`): `issueApiKey` and `revokeApiKey` now write their
  `api_key.issue` (severity medium) / `api_key.revoke` (severity high) audit row in the **same
  transaction** as the key mutation, recording only safe identity/metadata (id, name, keyPrefix,
  scopes, owner, expiry; before/after active→revoked + reason) — never the raw key or its hash. Both
  accept an optional `actor`.
- **Kysely types** (`src/db/types.ts`): added the insert-only `audit_events` table interface.
- **Operator CLI** (`scripts/ops/keys.mjs`): threads the operator identity (`--by`, default
  `ops-cli`) as the audit actor on issue and revoke.
- **Docs**: durable `docs/security/audit-events.md` (model, append-only posture, emit functions,
  secrets posture, wired points + deferred seams, verification); `docs/architecture/data-model.md`
  updated to record DB-enforced append-only + the emit/redaction model.
- **Live-verify harness** `scripts/dev/verify-audit.mjs`.

## Verification

- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` — all clean. New tests: 5 core audit
  (row shaping, redaction nested/array, best-effort vs strict). Core suite 98 passing.
- **Contracts untouched** — `audit_events` is an internal operational table, not part of the
  TypeSpec-governed public API/MCP surface; no regeneration required.
- **LIVE** against a throwaway Neon branch (forked from prod default, deleted after): migration 0026
  applied; `scripts/dev/verify-audit.mjs` → **14/14** (issue/revoke rows with correct
  actor/action/target/severity + before/after; no raw key / hash in any row; UPDATE and DELETE both
  rejected as append-only; rows survive). `keys.mjs issue|revoke` confirmed to write both rows with
  the `cli-operator` actor and only safe metadata. No secret/key value or DSN written to any tracked
  file or output.

## Notes

- Deferred (explicit, with emit seam ready): feedback/review (Plan 04 W4), subscriptions (W5),
  source-policy changes (W2/Plan 06), entity merge/claim retraction/resolution (Plan 02/Plan 06).
- No hash-chain / cryptographic tamper-evidence: the plan calls for an append-only queryable log,
  which the DB-trigger enforcement provides; a hash chain would be over-engineering beyond W3.
