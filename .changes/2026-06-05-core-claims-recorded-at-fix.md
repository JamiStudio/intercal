# core query layer — claims recordedAt reconciliation

Date: 2026-06-05
Type: fix
Packages: @intercal/core

## Summary

Plan-00-era scaffold bug in the deferred TS query layer. `packages/core` declared a
`claims.recorded_at` column that the claims SQL schema never had: migration
`0013_claims.sql` gives `claims` a `created_at`/`updated_at` pair, while the dedicated
bitemporal transaction-time column (`recorded_at`) only exists on `relationships`
(`0014`) and `fact_versions` (`0015`). `getEntity()`'s claims query did
`.orderBy('recorded_at', 'desc')`, which throws `column claims.recorded_at does not exist`
at runtime against the real Neon DB. Confirmed live: `claims` has no `recorded_at`.

## Decision

Reconciled the TS layer to the actual schema (steering option **a**) rather than adding a
column. The contract's required `Claim.recordedAt` ("when Intercal recorded the claim —
bitemporal transaction time") is the row's transaction time, and `claims.created_at`
(`timestamptz NOT NULL DEFAULT now()`, set at insert) already *is* that axis — the analog
of `relationships.recorded_at` / `fact_versions.recorded_at`. Adding a fourth `recorded_at`
timestamp alongside `created_at`/`updated_at` (both defaulting to `now()`) would be genuine
redundancy and a write-path footgun. World (valid) time stays on `valid_from`/`valid_until`,
independent of transaction time — the substrate's bitemporal model is preserved, the
contract is unchanged, and no migration is needed.

## Changes

- `packages/core/src/db/types.ts` — `ClaimsTable`: dropped phantom `recorded_at: Date`;
  added `created_at`/`updated_at` to mirror the real schema, with a comment naming
  `created_at` as the claim transaction-time axis.
- `packages/core/src/queries.ts` — `getEntity()` claims query orders by `created_at desc`.
- `packages/core/src/mappers.ts` — `mapClaim` sources `recordedAt` from `created_at`.
- `db/migrations/0013_claims.sql` — `COMMENT ON COLUMN claims.created_at` documenting it as
  the transaction-time source for `Claim.recordedAt` (comment-only; functional fix is in TS).
- `packages/core/src/mappers.test.ts` — new mapper unit tests; regression guard that
  `recordedAt` comes from `created_at` and that the two time axes map independently.

## Verification

`pnpm lint`, `pnpm --filter @intercal/core typecheck`, `pnpm --filter @intercal/core test`
(3 pass), `pnpm --filter @intercal/core build` — all clean. Live proof: on a throwaway Neon
branch (forked from the production default, deleted after) seeded with one entity + one
active claim, the compiled `getEntity()` ran with no missing-column error and returned the
fact with `recordedAt` (insert time) and `validFrom` (30 days prior) as independent axes.
