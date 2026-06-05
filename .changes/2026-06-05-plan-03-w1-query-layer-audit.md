# Plan 03 W1 — query service layer audit

Date: 2026-06-05
Type: fix
Packages: @intercal/core

## Summary

W1 audit of the shared query-service layer (`packages/core`). Four correctness fixes
found and applied, plus 7 new unit tests. No contracts changed; no TypeSpec regeneration
needed.

## Fixes

### 1. mapRelationship status: truthy-Date bug
`mapRelationship` computed status as `!row.is_active || row.valid_until ? 'ended' : 'active'`.
`row.valid_until` is a JS `Date` object — truthy even for dates far in the future — so any
relationship with a `valid_until` set would be mis-reported as `ended`. Fixed to
`row.valid_until !== null`.

### 2. Merged-id resolution in getEntity / findEntityRow (W6 carry-forward decision)
UUID lookups returned the deprecated row directly when `is_deprecated = true` — silently
serving a stale, non-authoritative record as if it were canonical. Decision: **resolve to
survivor**. The append-only substrate should be transparent: agents holding a merged-away
UUID get the live canonical entity automatically. If the chain is broken or cyclic (corrupt
state), `NotFoundError` is thrown with a `mergedIntoId` detail for logging. Chain is
capped at 5 hops to prevent infinite loops.

### 3. Alias lookup: is_deprecated guard
The alias branch of `findEntityRow` could return a deprecated entity row if an alias was
transiently re-parented during a merge reversal. Added `is_deprecated = false` guard on the
entity join (the name-by-canonical_name branch already had this guard).

### 4. EntitiesTable: missing columns
`deprecated_at: Date | null` and `deprecation_reason: string | null` existed in the DB
schema (`0008_entities.sql`) but were absent from `EntitiesTable`. Added them so the
interface matches the actual schema.

## New tests (7)

`packages/core/src/mappers.test.ts` — `mapRelationship` suite:
- open-interval active relationship → `active`
- relationship with future valid_until → `ended` (regression for the truthy-Date bug)
- relationship with past valid_until → `ended`
- deactivated relationship (is_active=false, no valid_until) → `ended`
- confidence maps as float from numeric string
- sourceDocumentIds preserved
- recordedAt maps from recorded_at

## Live verification

All 6 live REST endpoints confirmed against production Neon (3 source documents, 155 entities,
114 claims, 6 relationships from Node/Rust/K8s GitHub releases):
- `GET /api/v1/entity?name_or_id=rust` — correct EntityResponse with fact, freshness
- `GET /api/v1/evidence?query=rust` — correct hits, snippet, citation
- `GET /api/v1/freshness?topic_or_entity=rust` — correct lastUpdated + staleness
- `GET /api/v1/sources?entity_or_claim_id=<uuid>` — correct source document
- `GET /api/v1/delta` — HTTP 501 as expected (honest NotImplementedError seam)
- `GET /api/v1/claims/verify` — HTTP 501 as expected

## Verification commands

`pnpm lint` — pass (1 info: pre-existing biome.json schema version drift, not a code error)
`pnpm typecheck` — pass (all 6 packages)
`pnpm test` — pass (10 tests in @intercal/core)
`pnpm build` — pass (all packages incl. Next.js dashboard)

## Audit pass 2 (2026-06-05, second fresh context)

Re-audited W1 for correctness/cohesion and consumer parity. One genuine contract-alignment
defect found and fixed; the rest of W1 verified correct (no change).

### Contract drift fixed: mapEntity emitted off-contract `externalIds[].url`
The TypeSpec contract's `ExternalId` is exactly `{ system, id }`. `mapEntity` was adding a
`url` via conditional spread (`...(e.url ? { url: e.url } : {})`), which slipped past
TypeScript's excess-property check and shipped a non-contract field in **both** REST and MCP
responses. `entity_external_ids.url` is real provenance but is not part of the public
contract, and W1 must not modify the contract. Removed the field from the mapper; added a
`mapEntity` test asserting `externalIds` is exactly `{ system, id }` (2 new tests, core total
10 → 12). Not currently observable in production (0 external IDs live) but active the moment
Plan 02 populates them.

### Verified correct, no change
- **Consumer parity:** REST (`packages/api/src/app.ts`) and MCP
  (`packages/mcp-server/src/server.ts`) both dispatch directly into the same `@intercal/core`
  functions. One set of semantics, no duplicated query logic.
- **`resolveIfMerged`** exercised on a throwaway Neon fork (deleted after): simple merge →
  survivor; multi-hop A→B→C → final survivor; self-cycle and self-merge → `NotFoundError`
  with `mergedIntoId`; unknown UUID → `NotFoundError`. Every id-accepting read path
  (`getEntity`, `getFreshness`) routes through `findEntityRow` → `resolveIfMerged`.
  (`getSources` looks up claims by raw id — source traversal, not canonical entity
  resolution — which is the correct boundary.)
- **Mapper/type ↔ live schema:** full `information_schema.columns` dump of the 6 read tables
  on production Neon matches `db/types.ts` exactly (names/types/nullability). GAP-B
  `recordedAt ← created_at` holds.
- **Error taxonomy:** `/v1/delta` with a bare date → 400 `invalid_request` (contract
  `since_date` is `date-time`); with a full RFC3339 timestamp → 501 `not_implemented`.
  Validation precedes deferral, as designed.
- `pnpm contracts:check` — no drift (W1 did not touch the contract).

### Pass-2 verification
`pnpm typecheck` · `pnpm test` (12 in @intercal/core) · `pnpm lint` · `pnpm build` ·
`pnpm contracts:check` — all pass. Live REST re-verified against production Neon.
