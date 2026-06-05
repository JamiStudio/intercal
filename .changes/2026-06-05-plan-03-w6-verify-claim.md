# Plan 03 W6 — verify_claim deterministic cited verdict

Date: 2026-06-05
Type: feat
Packages: @intercal/core (consumed by @intercal/api, @intercal/mcp-server)

## Summary

Implemented the deferred `verifyClaim` query body — "is this free-text claim supported by the
substrate?" It returns a deterministic, fully-cited `ClaimVerificationResponse`: a `verdict`
(`supported` / `partially_supported` / `contradicted` / `unverified`), a `confidence` (method
`evidence_match`), and `supportingEvidence` + `contradictingEvidence` citation lists, with
optional point-in-time (`as_of_date`) bitemporal evaluation. REST `/api/v1/claims/verify` and MCP
`verify_claim` now return real verdicts instead of `501 not_implemented`. With W5+W6 done, every V1
read surface is live; Plan 03's two synthesis bodies are both shipped.

## Decision — deterministic, not LLM-synthesised (same as W5)

No LLM client exists in `packages/core`, and adding provider logic there would cross the adapter
port boundary (AGENTS.md hard rule). Per the W6 steering, a correct deterministic fully-cited
verdict is preferred over an uncited LLM blob. Every conclusion traces to a real claim row and its
backing source documents — nothing is fabricated. Optional provider-backed contradiction *prose* is
a clean later seam behind `LlmPort` that may only rephrase already-cited content and can never
change the verdict.

## Changes

- **`packages/core/src/verify.ts` (new).** `buildVerification` (DB fetch + classify) + pure,
  DB-free `assembleVerification` (verdict → confidence → citations → token-budget trim).
  - **Evidence match (retrieve):** lexical full-text retrieval over `claims.normalized_text` via
    Postgres FTS (`plainto_tsquery` + `ts_rank`, GIN index `idx_claims_normalized_fts`) — the same
    lexical leg powering W5 hybrid search and the same substrate W5 reads. Expressed with the Kysely
    `sql` tag (parameterised; no hand-built SQL). ts_rank normalised to [0,1] as `r/(r+1)`. Stays
    provider-free; a vector leg behind `EmbeddingsPort` is a later hybrid upgrade (no contract
    change).
  - **Contradiction reasoning (classify):** per candidate, `contradict` when the substrate already
    records a conflict (`contradiction_status='has_contradiction'`, or an OPEN `claim_contradictions`
    row whose both parties are on-topic candidates) OR a polarity flip over substantially-overlapping
    content (Jaccard ≥ 0.2); otherwise `support`. Authoritative substrate signal first, deterministic
    polarity second — never a model guess.
  - **Verdict / confidence:** computed over the FULL retrieved set (so trimming citations never
    changes the verdict). Support-only → `supported`; contradiction-only → `contradicted`; both →
    `partially_supported` when support mass ≥ 60 %, else `contradicted`; no on-topic evidence →
    `unverified` (score 0, never invented support). Confidence = evidence weight (relevance ×
    extraction confidence), bounded [0,1].
  - **Point-in-time (`as_of_date`):** transaction-time filter (`created_at <= as_of` — claims' txn
    axis) AND valid-time filter (`valid_from <= as_of` when set, `valid_until` open/after) so the
    verdict reflects the bitemporal state as of that date.
  - **Token budget:** honours `token_budget` (clamped [200, 8000], default 1500); ranks each side
    most-decisive-first and interleaves so neither side is starved; trims citations to fit, dedupes
    a doc cited by multiple claims per side. ~4 chars/token deterministic estimate (matches W5).
- **`packages/core/src/queries.ts`.** `verifyClaim` is now a thin dispatch to `buildVerification`
  (no more `NotImplementedError`); `VerifyClaimParams` moved to `verify.ts` and re-exported.
- **`packages/core/src/db/types.ts`.** Added the `claim_contradictions` typed read mirror (table
  already exists in `db/migrations/0013_claims.sql`; this is a read-only Kysely interface, not a
  schema source).
- **`packages/mcp-server/src/server.ts`.** Server `instructions` updated: `verify_claim` is live.

## Tests

- `packages/core/src/verify.test.ts` (13, new) — pure `classify` (support / polarity-flip
  contradict / substrate contradict / no-overlap-negation guard) and `assembleVerification`
  (every verdict branch incl. unverified-no-fabrication; as_of passthrough; budget bound without
  changing the verdict; per-side doc dedupe). DB path covered by live Neon verification.
- Updated the API verify tests (`app.test.ts`) and the two MCP deferred-seam tests
  (`server.test.ts`, `web.test.ts`): `verify_claim` is no longer a null-DB 501 seam, so its
  validation (400) cases stay and the deferred-seam assertions are replaced by the unknown-tool
  path (still DB-free); its success path is DB-backed and covered live.

## Verification

- `pnpm lint` — repo-wide clean (1 info = pre-existing biome.json schema-version drift).
- `pnpm typecheck` / `pnpm build` — all TS packages incl. the Next.js dashboard.
- `pnpm test` — core 50 (incl. 13 new verify), api 35, mcp-server 7.
- Contracts untouched (`ClaimVerificationResponse`/`VerifyClaimQuery` already sufficient), so no
  `pnpm contracts:build` needed.
- **Live (production Neon, real Plan-02 Rust release-notes data):** `verifyClaim` run via the
  compiled core. "Rust 1.96.0 was released" → `supported`, conf 0.21, cited to the rust-lang GitHub
  release doc. "Cargo fixed CVE-2026-5223" → `supported`, conf 0.39, cited. "Python 3.99 added
  native quantum teleportation support" → `unverified`, conf 0, no citations (no fabrication).
  `as_of_date=2026-01-01` (before the substrate recorded anything) → `unverified`;
  `as_of_date=2026-06-10` → `supported` — point-in-time bitemporal filter confirmed.
  `token_budget=200` → still a verdict with bounded citations. Deployed `/api/v1/claims/verify` +
  MCP `verify_claim` go live on the next Vercel deploy of main (same code path).
