# Audit Events (Trust Ledger)

The durable runbook for Plan 04 W3. `audit_events` is Intercal's **trust ledger**: an append-only
record of *who did what to trust-sensitive state*. It answers "who issued/revoked this key", and
(as later surfaces land) "who submitted this feedback", "who made this review/operator decision",
"who changed this source's policy".

> Distinct from `usage_events` (Plan 04 W1). `usage_events` is per-request telemetry (latency,
> status, counts) for rate limiting and observability. `audit_events` is the security ledger of
> mutations to trust-sensitive state. Different purpose, different retention posture, different
> table — see `docs/operations/auth-and-rate-limits.md` for the usage side.

## Model

Schema: `db/migrations/0022_audit_events.sql` (table) + `db/migrations/0026_audit_events_append_only.sql`
(append-only enforcement). Columns:

| Column | Meaning |
|---|---|
| `id` | uuid PK |
| `actor_type` | `api_key` \| `system` \| `pipeline` \| `human` \| `admin` |
| `actor_id` | identity id of the actor (api_keys.id, operator/user id, or job name) — **never a secret** |
| `actor_ip` | already-anonymized caller IP, or NULL (same posture as `usage_events`) |
| `action` | dot-namespaced action, e.g. `api_key.issue`, `api_key.revoke` |
| `target_type` / `target_id` | the resource acted on (polymorphic), e.g. `api_key` / a key uuid |
| `before_state` / `after_state` | JSON snapshots of the target around the action — **no secret values** |
| `rationale` | human-readable note (e.g. revocation reason) |
| `request_id` | correlation id linking the audit row to a `usage_events` row / trace |
| `severity` | `info` \| `low` \| `medium` \| `high` \| `critical` |
| `metadata` | safe, non-secret structured context |
| `created_at` | timestamptz, defaulted |

Indexed for the operational query paths: by actor, by target, by action, by time, and a partial
index on `high`/`critical` severity.

## Append-only posture

Audit rows are **never updated or deleted**. Migration 0026 enforces this in the database: a
`BEFORE UPDATE` and a `BEFORE DELETE` trigger on `audit_events` raise
`audit_events is append-only: <OP> is not permitted` for every row, regardless of caller. History
cannot be silently rewritten or erased through the normal data path. (Table-level DDL such as
`TRUNCATE`/`DROP` is a privileged operator action and is out of scope for row-level enforcement —
the guarantee is "no silent row mutation", which is the property an audit trail needs.)

## Emitting audit events

Emission is centralized in `@intercal/core` (`packages/core/src/auth/audit.ts`); never hand-write
`INSERT INTO audit_events`. Two modes:

- **`recordAuditEventStrict(db, event)`** — throws on failure. Use inside a transaction with the
  mutation it records, so the audit row and the mutation commit (or fail) together. `db` may be a
  Kysely transaction. The key lifecycle uses this.
- **`recordAuditEvent(db, event)`** — best-effort (swallows errors). Use when the action's own
  success is already the source of truth and an audit-write failure must not break it (e.g.
  after an already-committed mutation).

`queryAuditEvents(db, filter)` reads the ledger newest-first for operations (filter by
actor/action/target/severity; capped page size). Action strings live in `AUDIT_ACTIONS`.

### Secrets posture

The contract is **identity ids and safe metadata only** — never a raw key, hash, token, password,
cookie, or `Authorization` value in `beforeState`/`afterState`/`metadata`/`rationale`. As a
guardrail (not a license to pass secrets), the emit helper recursively redacts values under
secret-bearing keys (`secret`, `token`, `password`, `api_key`/`apiKey`, `key_hash`, `raw`,
`authorization`, `cookie`) to the literal `[redacted]`.

## Wired now

| Action | Where | Severity | Snapshot |
|---|---|---|---|
| `api_key.issue` | `issueApiKey` (`packages/core/src/auth/admin.ts`), in the insert transaction | `medium` | `after_state`: name, keyPrefix, scopes, ownerType, ownerId, expiresAt |
| `api_key.revoke` | `revokeApiKey`, in the update transaction | `high` | `before/after`: active→revoked transition; `rationale`: reason |

The operator CLI `scripts/ops/keys.mjs` passes the operator identity via `--by` (default
`ops-cli`) as the audit actor.

## Deferred seams (NOT faked here)

These actions have a clean emit seam (a consistent `action` string and the centralized helper) that
their owning workstream will call. They are **not** emitted yet because their surface does not exist:

- `feedback.*` — Plan 04 W4 (feedback / review records)
- `review.*` — Plan 04 W4 / Plan 06 (operator / review console decisions)
- `source.policy.*` — Plan 04 W2 / Plan 06 (source policy changes, allowlist)
- `entity.merge` / `entity.merge.reverse` / `claim.retract` / `entity_resolution.*` — Plan 02 / Plan 06
- `subscription.*` — Plan 04 W5

## Verification

- Unit: `pnpm --filter @intercal/core test` (`auth/audit.test.ts` — row shaping, redaction,
  best-effort vs strict).
- Live (throwaway Neon branch): `DATABASE_URL=<branch> node scripts/dev/verify-audit.mjs` — real
  issue/revoke write the expected append-only rows with correct actor/action/target/severity and
  before/after snapshots, **no secret material** appears in any row, and direct `UPDATE`/`DELETE`
  are both rejected. Last run: **14/14**. CLI path (`keys.mjs issue|revoke`) confirmed to write both
  rows with the operator actor. Run against a disposable branch and delete it after.
