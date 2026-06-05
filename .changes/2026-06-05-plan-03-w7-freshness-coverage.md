# Plan 03 W7 — freshness & coverage report

Date: 2026-06-05
Type: feat
Packages: @intercal/core (consumed by @intercal/api, @intercal/mcp-server)

## Summary

Upgraded the `getFreshness` query body from a bare last-updated stamp into a real freshness **and**
coverage report — "what does Intercal know about X, how fresh is it, and where is coverage weak?"
The `FreshnessReport` now carries a populated `coverage` ∈ [0,1] and a `staleness` label that
distinguishes strong / stale / thin coverage and makes gaps explicit. REST `/api/v1/freshness` and
MCP `get_freshness` surface it through the one shared query layer (no new wiring — both already
dispatch into `getFreshness`). The contract was already sufficient (`FreshnessReport.coverage`
existed); W7 fills the dimension, so **no TypeSpec/contract change**.

## Decision — deterministic, honesty-first; one core query (not api/mcp/synthesize)

The plan's original "Primary areas" (`packages/api` / `packages/mcp-server` / `services/synthesize`)
predates the W1 one-query-layer decision. Freshness is a single shared core query both surfaces call,
and the coverage metric is a deterministic read over real substrate state — it needs no LLM/synthesis
service. Per AGENTS.md's provenance rule, an absent signal is reported as an explicit gap
(`coverage: 0` + a "no recorded knowledge" / "no entity known" label), never as invented coverage.

## Changes

- **`packages/core/src/freshness.ts` (new).** Pure, DB-free `assembleFreshness` + the signal types.
  - **Freshness (recency):** transaction-time = newer of the entity row's `last_updated_at` and the
    newest `fact_versions.recorded_at` for that subject (the authoritative append-only change axis,
    consistent with delta.ts). Unknown topic → corpus ingest recency (`lastIngestedAt`).
  - **Coverage:** `coverage` = distinct source documents backing the entity's active claims / total
    corpus source documents, clamped to [0,1]. Grounded in the real corpus (the denominator is what
    Intercal actually has), so it is self-calibrating and **cannot over-state** (distinct ≤ corpus by
    construction). 0 active claims ⇒ coverage 0.
  - **Staleness / warnings:** a single label distinguishing the exit-criterion states — `stale` past
    a 30-day transaction-time threshold; `thin coverage (N source[s])` at/below 0.34; explicit
    `no recorded knowledge` (claim-less entity) and `no entity known` (unknown topic) gaps.
- **`packages/core/src/queries.ts`.** `getFreshness` is now the DB signal-fetch layer (active-claim
  count, distinct backing sources, newest fact version, corpus size) that delegates to
  `assembleFreshness` — same fetch/pure split as `buildDelta`/`assembleDigest`. `FreshnessParams`
  moved to `freshness.ts` and re-exported (the `@intercal/core` → mcp-server import chain is intact).
  The legacy unknown-topic fallback (bare `lastIngestedAt` + raw staleness) is replaced by the
  explicit no-data report.

## Tests

- `packages/core/src/freshness.test.ts` (12, new) — pure `assembleFreshness`: unknown-topic no-data
  (incl. natural "ingested today" phrasing and empty corpus), claim-less-entity gap, coverage math +
  clamp-to-1 + divide-by-zero guard, strong/stale/thin labels, and the transaction-time recency pick.
  The SQL fetch path is covered by the live Neon verification (same split as delta/verify tests).

## Verification

- `pnpm lint` — repo-wide clean (1 info = pre-existing biome.json schema-version drift).
- `pnpm typecheck` / `pnpm build` — all TS packages incl. the Next.js dashboard.
- `pnpm test` — core 69 (incl. 12 new freshness), api 35, mcp-server 7.
- Contracts untouched (`FreshnessReport.coverage` already existed), so no `pnpm contracts:build`.
- **Live (production Neon, project `fancy-boat-93020425`, real Plan-02 data) via the real
  `getFreshness` DB path:**
  - covered entity `rust` / `Rustdoc` → `coverage 0.33`, `"today; thin coverage (1 source)"`
    (honest: the early corpus has 3 docs, max 1 distinct source per entity — real, not inflated);
  - claim-less entity `kubernetes` → `coverage 0`,
    `"today; no recorded knowledge (entity present but no claims yet)"`;
  - unknown topic → `coverage 0`, `"no entity known; corpus last ingested today"`, with the corpus
    `lastIngestedAt`. No fabricated coverage in any case.
  Deployed `/api/v1/freshness` + MCP `get_freshness` pick up the richer report on the next Vercel
  deploy of main (same code path).
