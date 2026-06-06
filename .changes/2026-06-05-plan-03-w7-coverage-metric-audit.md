# Plan 03 W7 — coverage metric audit (redefined to evidence depth)

Date: 2026-06-05
Type: fix
Packages: @intercal/core (consumed by @intercal/api, @intercal/mcp-server)

## Summary

Audit pass 2 over the W7 freshness/coverage report. **The `coverage` metric was redefined** from
pass-1's "distinct backing source docs / total corpus docs" to **evidence depth**: the fraction of
the entity's active claims that are backed by at least one source document
(`coverage = evidenced active claims / total active claims`, ∈ [0,1]). Recency, the unknown/claim-less
gap reporting, and the contract are unchanged (`FreshnessReport.coverage` already existed — **no
TypeSpec/contract change**).

## Why the old metric was misleading (the defect)

Pass 1 read the contract's `coverage` ("fraction of expected sources currently covered") as
(distinct docs backing the entity) / (TOTAL corpus docs). That is not an honest per-entity coverage
signal:

1. **It degrades with corpus growth.** At 10k docs with 1 about the entity, coverage → ~0.0001 even
   if every one of the entity's claims is perfectly sourced — the number tells an agent the entity is
   barely covered when it is fully covered.
2. **It carries no per-entity signal at small scale.** Proven on production Neon (3-doc corpus): ALL
   52 claim-bearing entities scored an identical `0.333` (each drawn from 1 of 3 docs), regardless of
   how many well-evidenced claims they had. A 6-claim entity and a 2-claim entity read the same. It
   measured the corpus, not the entity.

## The new semantic (defensible + honest)

Evidence depth is bounded [0,1] by construction (evidenced ≤ total claims — **cannot over-state**),
**invariant to corpus growth** (no corpus denominator), and answers the agent's real question: "how
much of what Intercal asserts about this target is source-backed?" A claim without evidence is the
genuine coverage gap, and that is exactly what this measures — the AGENTS.md provenance invariant
("every public fact must trace to evidence") expressed as a ratio. 0 active claims ⇒ coverage 0.

Corroboration breadth (the "thin" warning) is now a **separate, also-non-degrading** signal: a raw
DISTINCT-SOURCE COUNT (`THIN_SOURCE_COUNT = 1`), not the old `≤ 0.34` coverage fraction (which was
tuned to the replaced metric and meaningless under evidence depth). A fully-evidenced but
single-sourced entity is flagged `thin coverage (1 source)`; this stays meaningful at any corpus scale.

Verified-against-cadence thresholds: `STALE_AFTER_DAYS = 30` is justified against the resource-budget
ingestion cadence (`INGEST_CRON=0 */6 * * *`, every 6h ≈ 120 missed windows in 30 days) — a
conservative "no longer actively maintained" floor, documented as a named constant.

## Changes

- **`packages/core/src/freshness.ts`.** `assembleFreshness` coverage is now evidence depth; signal
  type carries `evidencedClaimCount` (replacing `corpusSourceCount`). Staleness adds an explicit
  evidence-depth gap `N of M claims unsourced` (shown first, the real "where is coverage weak"
  channel); the single-source breadth warning is shown only when depth is full. `THIN_COVERAGE`
  fraction replaced by `THIN_SOURCE_COUNT`. Header documents the full metric rationale.
- **`packages/core/src/queries.ts`.** `getFreshness` now counts evidenced active claims (claims with
  ≥1 backing source) for the coverage numerator and drops the corpus-size fetch (no longer needed).
  Verified on prod that the denormalized `source_document_ids` agrees exactly with canonical
  `claim_evidence` across all 114 active claims (0 mismatches), so the count is honest.

## Tests

- `packages/core/src/freshness.test.ts` (12 → 14) — evidence-depth coverage math, corpus-growth
  INVARIANCE, the `unsourced` evidence-depth gap, depth-gap-over-breadth precedence, plus the existing
  unknown/claim-less/recency/stale/thin cases retargeted to the new signals.

## Verification

- `pnpm lint` — clean (1 info = pre-existing biome.json schema-version drift).
- `pnpm typecheck` / `pnpm build` — all 6 TS packages incl. the Next.js dashboard.
- `pnpm test` — `@intercal/core` 71 (14 freshness, 25 delta, 20 verify, 12 mappers).
- Contracts untouched, so no `pnpm contracts:build`.
- **Live (production Neon, project `fancy-boat-93020425`) via the real `getFreshness` DB-signal path
  — before/after:** pass-1's corpus-ratio gave EVERY covered entity a flat `0.333`; evidence depth now
  reads the entity:
  - `Antoine du Hamel` (6 claims, all sourced) → `coverage 1.0`, `thin coverage (1 source)`;
  - `rust` / `Rustdoc` (claims all sourced) → `coverage 1.0; thin coverage (1 source)`;
  - claim-less `kubernetes` → `coverage 0; no recorded knowledge`;
  - unknown topic → `coverage 0; no entity known`. No fabricated coverage in any case. (All 114 prod
    active claims are evidenced, so the `N of M claims unsourced` path is exercised by unit test.)
