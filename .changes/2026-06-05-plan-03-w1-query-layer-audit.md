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
