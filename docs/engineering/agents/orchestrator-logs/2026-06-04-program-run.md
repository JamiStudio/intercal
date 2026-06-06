# Orchestrator Run Log — 2026-06-04 Program (Phases B–F)

Authoritative resumable ledger for this goal run. Resume from the checkpoint table + `git log`.
Source of truth = live repo. Model policy: pass 1 = Sonnet 4.6, pass 2+ = Opus 4.8.

## Program sequence

- Phase B = Plan 02 (knowledge pipeline, W1→W8 linear) + Plan 07 W3/W4 (worker CD)
- Phase C = Plan 03 (agent surface, W1→W8) + Plan 07 W2 (MCP on Vercel `/api/mcp`)
- Phase D = Plan 04 (operations & trust, W1→W8) + Plan 07 W1/W5/W6/W7/W8
- Phase E = Plan 06 (interactive experience, W1→W10)
- Phase F = Plan 05 (production saturation & release audit, W1→W8)

Independent early unblock: Plan 07 W2 (mount `buildMcpServer()` at dashboard `/api/mcp`) — no pipeline dep.

## Baseline (start of run)

- HEAD: e4acbea — docs(agents): two-model flow. Working tree clean.
- Phase A complete and live (`lntercal.vercel.app`, Neon, REST mounted).
- Plan 02: all 11 Python job bodies = `NotImplementedError("Plan 02 …")`. Not started.
- Plan 03: query layer 4/6 done; `getDelta`/`verifyClaim` = `NotImplementedError("Plan 03")` at `packages/core/src/queries.ts:229,244`. REST+MCP wired but MCP not mounted on Vercel. SDK scaffold only.
- Plan 07: W2 partial (MCP not mounted), W3 partial (cron disabled), rest not started. `scripts/ops/` absent.
- Plans 04/05/06: not started (blocked downstream).

## Checkpoint table

| Time (UTC) | Plan/WS | Pass | Model | Agent id | Status | Commit | Files/LOC | Next action |
|------------|---------|------|-------|----------|--------|--------|-----------|-------------|
| init | — | — | — | orient (Explore) | returned: routing map | — | — | dispatch Plan02 W1 P1 |
| t1 | 02/W1 | P1 | Sonnet | aa95dc43fb7fa77dd | returned OK | 5266e40 | 16f +2006/-91 | dispatch W1 P2 (Opus) |
| t2 | 02/W1 | P2 | Opus | ad0a075bc854532d1 | returned OK; 6 correctness fixes+live verify | 9678e67 | 8f +472/-99 | between B/C → P3 confirm-quiet |
| t3 | 02/W1 | P3 | Opus | a2db3bf161d4a69c7 | QUIET, no change → **W1 CLOSED** | (none) | 0 | nit: score_source_health docstring (defer to cleanup) |
| t4 | 02/W2 | P1 | Sonnet | ad399e2c7066f6a81 | INTERRUPTED (session limit); uncommitted WIP left in tree | (none) | normalizer.py, 0023 migration, test_w2_normalize.py, jobs/cli mods | resume: fresh agent finishes+commits W2 P1 |
| t5 | 02/W2 | P1b | Sonnet | ac26922380c43fbf3 | returned OK; finished WIP, 114 tests, live verify | def4d22 | 8f +1365/-28 | dispatch W2 P2 (Opus) |
| t6 | 02/W2 | P2 | Opus | ae9376898da6376d3 | returned OK; 3 real defects fixed + regression tests + live verify | 77223d6 | 6f ~360 LOC | between B/C → P3 confirm-quiet |
| t7 | 02/W2 | P3 | Opus | aedaa87636eb8bc96 | QUIET → **W2 CLOSED** | (none) | 0 | reorder: W4 before W3 (port-first); W3 note: cleaned_text+document_chunks not normalized_text |
| t8 | 02/W4 | P1 | Sonnet | aaa65c7e07bdf7bf0 | returned OK; LIVE Vertex+fastembed calls pass; 157 tests | a2519ab | 9f +851/-47 | dispatch W4 P2 (Opus) |
| t9 | 02/W4 | P2 | Opus | ac220158f7db48ce6 | returned OK; added schema-validation/error-taxonomy/budget/retries; 181 tests; LIVE Vertex+Gemini+fastembed | 9c3286a | 16f +1346/-235 | FAILS numeric gate (>10f) → P3 re-gate |
| t10 | 02/W4 | P3 | Opus | aa78983a1727ecaaf | returned OK; core path clean; fixed OpenAI-embeddings dim forwarding; 189 tests; LIVE ok | 249443a | ~5f +229/-12 | numeric gate OK; between B/C → P4 confirm-quiet |
| t11 | 02/W4 | P4 | Opus | a491d8db74c415b52 | QUIET → **W4 CLOSED** (4 passes; live Vertex+Gemini+fastembed) | (none) | 0 | begin W3 (LLM port ready) |
| t12 | 02/W3 | P1 | Sonnet | af3b4df490b9d4648 | returned OK; LIVE extract 11 mentions+1 claim w/ spans; 237 tests | 7d146cc | 6f ~2042/-69 | dispatch W3 P2 (Opus) |
| t13 | 02/W3 | P2 | Opus | abde4314d1e327bc0 | returned OK; fixed CRITICAL span-offset corruption + claim under-extraction (thinking_budget=0); dual-provider live verify 0 span failures; 245 tests | a017ef8 | ~5f ~408 LOC | critical fix → P3 confirm-quiet |
| t14 | 02/W3 | P3 | Opus | a3c3a773aced793f5 | INTERRUPTED (session limit 6:20am); uncommitted WIP in jobs.py + test_w3_extract.py | (none) | WIP | resume: fresh agent finishes+commits |
| note | env | — | — | orchestrator | DONE: fixed dev .env SA-key path (forward slashes); Vertex loads from .env (verify_w4 PASS). .env stays uncommitted | — | — | — |
| t15 | 02/W3 | P3b | Opus | ae4784b947f40f87e | returned OK; fixed repeated-span offset defect; 247 tests; live 10/10 span_ok | b3d5bb2 | 3f +120/-8 | another real fix → P4 confirm-quiet |
| t16 | 02/W3 | P4 | Opus | ab7600707edce8104 | QUIET → **W3 CLOSED** (12 probes; invariant architectural) | (none) | 0 | begin W5 |
| t17 | 02/W5 | P1 | Sonnet | aaf2adc8ae2139394 | returned OK; LIVE 5 chunks embedded+HNSW+hybrid_search; 275 tests | 870b69f | 6f ~1191 LOC | dispatch W5 P2 (Opus) |
| t18 | 02/W5 | P2 | Opus | a212ff5cc6325a159 | returned OK; fixed hnsw.ef_search recall bug; EXPLAIN confirms index; TS searchEvidence lexical-only (no drift, vector=Plan03); 276 tests | 266d97f | 4f +211/-9 | real fix → P3 confirm-quiet |
| t19 | 02/W5 | P3 | Opus | a7c6e8c5726bb0f84 | QUIET → **W5 CLOSED** | (none) | 0 | begin W6 |
| t20 | 02/W6 | P1 | Sonnet | a3616873021bb93db | returned OK; LIVE 11 entities/3 review/0 false-merge/idempotent; gate satisfied; 309 tests | bbc5d3f | 6f ~2000 LOC | dispatch W6 P2 (Opus); check merge path |
| t21 | 02/W6 | P2 | Opus | aa682e3d5163d2101 | returned OK; found merge path was DEAD CODE + fixed mentions.updated_at bug; merge/non-merge/idempotency proven; 314 tests | cff37de | 4f +387/-36 | major fix → P3 confirm-quiet |
| t22 | 02/W6 | P3 | Opus | a18fb8e21db663cf1 | QUIET → **W6 CLOSED** (merge/non-merge/review/idempotency re-proven) | (none) | 0 | begin W7 |
| t23 | 02/W7 | P1 | Sonnet | a6c7313ba4b03ae8f | returned OK; LIVE 1 rel + 13 fact versions, append-only/bitemporal proof, idempotent; 333 tests. FLAG: directly inserted a claim "to satisfy gate" | 2c1dfa4 | 6f +1617/-45 | P2 scrutinize seeded-claim + nat. derivation |
| t24 | 02/W7 | P2 | Opus | a08d977a1d38fb52a | returned OK; CAUGHT pass-1 synthetic claim, removed it, restored honest state; proved W7 correct on REAL GitHub-releases pipeline (42 real claims→real rel, bitemporal+PIT+idempotent proof); docs honesty fix | 9dc317c | 1f +43/-14 | P3 confirm-quiet; then claim-link fix |
| t25 | 02/W7 | P3 | Opus | a9f3ad8b83664a83d | QUIET → **W7 CLOSED** (proven on 76 real claims; skips-not-fabricates confirmed) | (none) | 0 | begin GAP-A claim-link |
| t26 | 02/GAP-A | P1 | Sonnet | a33b68e5f356be65c | returned OK; `link_claim_entities` bridges claim→entity; LIVE real Vertex 5 claims→2 linked→1 rel end-to-end, idempotent; 345 tests | 16cd7df | 5f +947 | dispatch GAP-A P2 (Opus) |
| t27 | 02/GAP-A | P2 | Opus | ab90c5bc0e723aeeb | returned OK; fixed corruption-class ambiguity defect (same-name distinct entities); rust-lang/rust 151 claims→4 real rels; adversarial no-false-link proven; 346 tests | 12229fa | ~4f +20/-35 | corruption fix → P3 confirm-quiet |
| t28 | 02/GAP-A | P3 | Opus | af565c37bb53ec0bc | INTERRUPTED (Opus session limit, 3rd occurrence); no change committed (tree clean) | (none) | 0 | re-dispatch P3 on Sonnet |
| t29 | 02/GAP-A | P3 | Sonnet | abc22666e81571200 | QUIET → **GAP-A CLOSED** (match-order/floors/idempotency/provenance verified; adversarial no-false-link re-proven; 346 tests) | (none) | 0 | begin W8 |
| t30 | 02/W8 | P1 | Sonnet | — | dispatch REJECTED by user (inserted GAP-B first) | — | — | do GAP-B then resume W8 |
| t31 | GAP-B | P1 | Opus | ae86a05519f5e7334 | returned OK; recordedAt←created_at (opt a), live getEntity proof; closed | 92ad2b0 | 7f +119/-4 | **GAP-B CLOSED** |
| t32 | 02/W8 | P1 | Opus | a8719e19b12ef1556 | returned OK; fixed WIP (import/env, health keys, batch-drain idempotency); FULL PIPELINE LIVE ON PROD NEON (155 ent/260 review/6 rel/155 fv, idempotent); **REAL DATA ON LIVE API** (entity+rel+evidence+freshness) — Phase B gate MET | 2918a53 | ~2315 LOC | dispatch W8 P2 (Opus) |
| t33 | 02/W8 | P2 | Opus | af89b78d5e6cc8d89 | returned OK; fixed link-drain early-stop idempotency defect (offset paging); idempotency/paging/partial-failure/heartbeat re-proven; prod data legit (real Node/Rust/K8s LLM extraction); 373 tests | 5c8788f | 6f +160/-19 | real fix → P3 confirm-quiet |
| t34 | 02/W8 | P3 | Opus | a04669513e96f0f16 | QUIET → **W8 CLOSED; PLAN 02 / PHASE B FULLY COMPLETE** (idempotent, real data on live API) | (none) | 0 | open Phase C |

### ✅ PHASE B COMPLETE — Plan 02 (all 8 WS + claim-link bridge). HEAD 5c8788f. Real data live on `lntercal.vercel.app` `/v1/*`.
Cosmetic carry: synthesize jobs.py docstring "Raises … Plan-02 scope" lines vs correct Plan 03/04 exception strings — sweep in cleanup.
Plan 02 dated plan flagged for retirement to `docs/_legacy/roadmaps/` — do at Phase F with migration consolidation.

## Phase C — Plan 03 (agent surface) + Plan 07 W2 (MCP on Vercel)

Plan 03 workstreams: W1 query layer · W2 REST · W3 MCP · W4 SDK · W5 digest/token-budget (getDelta body) · W6 claim verification (verifyClaim body) · W7 freshness/coverage · W8 agent fixture.
Much of W1–W3 already scaffolded (4/6 query fns live; REST+MCP wired). Key new work: getDelta + verifyClaim bodies, MCP mount at `/api/mcp` (Plan 07 W2), SDK methods, fixture. GAP-B (claims recordedAt) already fixed at 92ad2b0.

| t35 | 03/W1 | P1 | Sonnet | aefac10cbd04d2708 | returned OK; merged-id→resolve-to-survivor; fixed mapRelationship status bug; live REST proof; 10 tests | d4f0567 | 6f +221/-17 | dispatch W1 P2 (Opus) |
| t36 | 03/W1 | P2 | Opus | a3a3be31eaa6bd15a | returned OK; fixed contract-divergence (mapEntity externalIds.url); consumer parity confirmed; resolveIfMerged verified; contracts:check clean; 12 tests | b31dbba | ~4f +75 | real fix → P3 confirm-quiet (Sonnet) |
| t37 | 03/W1 | P3 | Sonnet | abd648f31e00c5398 | QUIET → **W1 CLOSED** (mappers contract-exact, resolveIfMerged on all id paths, parity, contracts clean) | (none) | 0 | parallel W2+W3 |
| t38 | 03/W2 | P1 | Sonnet | a7518bbdb1d604c7b | INTERRUPTED (session limit, Sonnet — limits are account-wide throughput, not model-specific); WIP: app.ts mod + app.test.ts new | (none) | WIP | resume: finish+commit |
| t39 | 03/W3 | P1 | — | — | NOT actually dispatched (only W2 call sent); deferred until W2 lands | — | — | dispatch after W2 |
| note | GAP-B | — | — | orchestrator | chip resurfaced but STALE — already fixed at 92ad2b0 (claims created_at/updated_at, orderBy created_at). No action. | — | — | — |
| t40 | 03/W2 | P1b | Sonnet | — | REJECTED by user (model-policy change → all-Opus) | — | — | re-dispatch on Opus |
| t41 | 03/W2 | P1b | Opus | a4c6d7cb3a4f6b5a2 | returned OK; fixed 2 prod defects (sources 500, unknown-param 200), error taxonomy+CORS, 37 tests | eb7edcd | ~5f +535/-31 | dispatch W2 P2 (Opus) |
| t42 | 03/W2 | P2 | Opus | adac36f5db614154e | returned OK; fixed mounted-prefix text/plain-404 leak (scoped /v1/* JSON catch-all); 40 tests; deployed-404 fix pending Vercel redeploy | 9ae1cc7 | 4f +105/-2 | real fix → P3 confirm-quiet |
| t43 | 03/W3 | P1 | — | — | CORRECTION: NOT actually dispatched (call never sent, logged in error twice) | — | — | dispatch now |
| t44 | 03/W2 | P3 | Opus | a8455717ff14b5380 | QUIET → **W2 CLOSED** (404-fix propagated to prod; /api/mcp non-intercept confirmed) | (none) | 0 | dispatch W3 |
| t45 | 03/W3 | P1 | Opus | ad87a2ec5d07878af | returned OK; MCP hardened + MOUNTED /api/mcp (Plan07 W2 too); LIVE Streamable-HTTP init+tools/list+get_entity+search_evidence on prod Neon; SDK 1.29.0 WebStandard transport, stateless Node runtime; 9 mcp tests | 7df103a | ~505 LOC | dispatch W3 P2 (Opus); verify live Vercel |
| t46 | 03/W3 | P2 | Opus | ad1aec87c130fa62d | non-terminal return (parked on deploy wait) BUT committed deploy-determinism fix; ORCHESTRATOR-VERIFIED live: deployed /api/mcp initialize+tools/list(6)+get_entity rust real data on prod | aa5f472 | deploy fix | real fix → P3 confirm-quiet (serverless pool) |
| t47 | 03/W3 | P3 | Opus | ae91853c468a34aa6 | QUIET → **W3 CLOSED + Plan07-W2 CLOSED** (pool=safe singleton, stateless, parity, deployed live w/ real data) | (none) | 0 | parallel W4+W5 |
| t48 | 03/W4 | P1 | Opus | a9ce0cfae8f5e6559 | returned OK; full typed SDK (6 methods, error model, fixture+live tests, delta/verify→typed 501); 19 tests | 9079b55 | ~6f +778/-78 | needs P2 |
| t49 | 03/W5 | P1 | Opus | ae696af1efbcd0365 | returned OK; getDelta = deterministic fully-cited token-bounded digest; LIVE prod 12 cited/315tok≤600, clamp/trim proven, empty=no-fab; retargeted stale delta-501 tests; 22 core tests | aa93079 | ~8f +760/-83 | needs P2 |
| t50 | 03/W5 | P2 | Opus | a3cdca8b394cd7e4c | returned OK; CRITICAL: pass1 missed fact_version changes (canonical change unit); now windows fact_versions on recorded_at + supersession classification; token math hardened; live supersession-across-cutoff proof; 26 core tests | 8991793 | 5f +349/-43 | critical fix → P3 confirm-quiet |
| t51 | 03/W5 | P3 | Opus | ae90d8d9a7a5283be | returned OK; fixed supersession-vs-new MISclassification across cutoff (priorVersionSubjectIds signal); live-proven; deployed /api/v1/delta real data; 28 core tests | cd104ae | ~3f +97 | another bitemporal fix → P4 confirm-quiet |
| t52 | 03/W5 | P4 | Opus | a0f3b0b2fb971f4f5 | returned OK; fixed until-clamp wrongly constraining independent fact-version axis (bounded-case drop); live 0→1; 28 core tests | 819dfd1 | 1f ~15 LOC | 4th bitemporal fix → P5 confirm-quiet+test-matrix |
| t53 | 03/W5 | P5 | Opus | a7cb27dfe91277375 | QUIET on logic + added bitemporal test matrix (16→25); live boundary µs-verified → **W5 CLOSED** | 6adddc6 | 1f +177 (tests) | back to W4 P2 |
| t54 | 03/W4 | P2 | Opus | ad31fab6d5558c2fd | QUIET → **W4 CLOSED** (SDK contract-aligned, error model, live getDelta real data + verify 501; 19 tests) | (none) | 0 | begin W6 |
| t55 | 03/W6 | P1 | Opus | aee978196298e6be6 | returned OK; verifyClaim = deterministic cited evidence-match+contradiction, point-in-time, token-budgeted; LIVE supported/unverified/as_of cases; 50 core tests | 190a496 | ~8f +913/-96 | P2: scrutinize false-positive support |
| t56 | 03/W6 | P2 | Opus | af4e9b38cc3e68237 | returned OK; CONFIRMED false-positive-support defect (lexical overlap→false supported, proven live role-swap); fixed (strong symmetric coverage≥0.85+Jaccard≥0.5 for supported, else partially_supported); +5 adversarial tests; 55 tests | 49bf87a | 4f +256/-6 | integrity fix → P3 confirm-quiet |
| t57 | 03/W6 | P3 | Opus | a3fe78cb444234d90 | returned OK; fixed tokenizer edge-punctuation artifact (verbatim restatement → supported); citation integrity 0 dangling/114 claims; +2 tests; 57 core | fb9ac4e | ~2f +44 | minor safe-dir fix → P4 confirm-quiet |
| t58 | 03/W6 | P4 | Opus | a96a54e955535a231 | QUIET → **W6 CLOSED** (adversarial-safe, deployed fixed verify live; 57 core tests) | (none) | 0 | begin W7 |
| t59 | 03/W7 | P1 | Opus | acb6be278c2b0ef2a | returned OK; getFreshness now fills coverage field (freshness+coverage, no contract change); LIVE covered→real, unknown→no-data; 69 core tests | ec7caaf | 5f | dispatch W7 P2; assess coverage-metric soundness |
| t60 | 03/W7 | P2 | Opus | ad91b0ea5a53e6793 | returned OK; REDEFINED coverage (pass1's metric dishonest — all 52 entities=0.333; now evidence-depth, corpus-invariant); staleness justified vs cadence; live-verified; 71 core tests | b50a5a2 | 5f +274/-92 | honesty fix → P3 confirm-quiet |
| t61 | 03/W7 | P3 | Opus | a0d5a2e62d5a18303 | returned OK; fixed provenance gap (coverage read denormalized source_document_ids not canonical claim_evidence); live 114/114 identical but now authoritative; 71 core tests | 287bed4 | ~3f +20net | provenance fix → P4 confirm-quiet |
| t62 | 03/W7 | P4 | Opus | a61f99d022c0ec1e6 | QUIET → **W7 CLOSED** (evidence-depth coverage canonical, recency, honest gaps, contract-exact; 71 core tests) | (none) | 0 | begin W8 |
| t63 | 03/W8 | P1 | Opus | ae448aef15f194139 | returned OK; agent-fixture harness: 6 tools × (MCP client + SDK/REST), cited/conf/budget asserts, cross-path byte-equiv, env-gated LIVE; acceptance gate PROVEN live; 21 mcp tests | 6f7b630 | ~8f +903/-32 | dispatch W8 P2 |
| t64 | 03/W8 | P2 | Opus | ad61818be3965b912 | QUIET → **W8 CLOSED; PLAN 03 / PHASE C COMPLETE** (live acceptance gate 23/23 both paths) | (none) | 0 | open Phase D |

### ✅ PHASE C COMPLETE — Plan 03 (W1–W8) + Plan 07 W2 (MCP on Vercel). getDelta + verifyClaim live & cited/budgeted; MCP at /api/mcp; SDK; freshness/coverage. Plan 03 flagged for retirement (do at Phase F).

## Phase D — Plan 04 (operations & trust) + Plan 07 (remaining: W1 secrets, W3/W4 worker CD, W5 API keys, W6 MCP OAuth, W7 backups, W8 budget)

Plan 04 WS: W1 auth+rate-limits · W2 source policy/SSRF · W3 audit events · W4 feedback/review · W5 subscriptions · W6 observability · W7 deployment paths+backups · W8 account/CLI runbook.
Plan 07 remaining: W1 secret fan-out (prereq for W3/W4/W5/W6/W7/W8; scripts/ops/ absent) · W3 Actions scheduled CD · W4 Cloud Run Jobs · W5 REST API keys · W6 MCP OAuth 2.1 · W7 backups/restore · W8 budget enforcement.
Sequence: Plan 07 W1 (secrets) first → then auth cluster (Plan04 W1 + Plan07 W5/W6) ∥ worker CD (Plan07 W3/W4) → Plan04 W2–W8 → Plan07 W7/W8.

| t65 | 07/W1 | P1 | Opus | a33c69cfcfe1744b7 | returned OK; scripts/ops/secrets-fanout.mjs + manifest; LIVE Vercel(4)+GitHub Actions(24) confirmed; Cloud Run deferred(W4); no value leak; lane-separated | 8d94d9e | ~6f +873/-6 | dispatch W1 P2 |
| t66 | 07/W1 | P2 | Opus | ad824984942d9c766 | returned OK; leakage scan CLEAN; lane-sep hardened in schema; fixed GCLOUD_REGION mis-lane; idempotency live-verified | 121405b | 4f +30/-9 | minor fix → P3 confirm-quiet |
| t67 | 07/W1 | P3 | Opus | a8f148f4fadf8234b | QUIET → **W1 CLOSED** (zero leakage, lane-sep double-enforced, idempotent, live-verified Vercel 4 + GitHub 25) | (none) | 0 | begin REST auth stream |
| t68 | 07W5+04W1(REST) | P1 | Opus | a7d06e3b22fdc2d73 | returned OK; hashed scoped API keys + RateLimitStorePort(Upstash+fallback) + usage_events + anon policy + ops:keys CLI; LIVE 17/17 throwaway branch; 24 tests | a8916b1 | 29f +1951/-23 | gate P2: timing-safe, RL races/headers, XFF trust, anon+MCP unbroken |
| t69 | 07W5+04W1(REST) | P2 | Opus | a6ff4ffed7e3901f2 | INTERRUPTED (session limit 10:10pm, now reset); no change committed | (none) | 0 | re-dispatch P2 |
| t70 | 07W5+04W1(REST) | P2 | Opus | afb695778bf0c5897 | returned OK; fixed 3 security bugs (spoofable XFF left-most→trusted IP, RL TTL-loss lockout self-heal, IPv6 :: anonymization); timing-safe confirmed; MCP bypasses REST mw; anon ok; 140 tests | 58fb16d | 8f +273/-22 | security fixes → P3 confirm-quiet |
| t71 | 07W5+04W1(REST) | P3 | Opus | ad418d8a6629e6155 | QUIET → **REST AUTH STREAM CLOSED** (Plan07 W5 + Plan04 W1 REST). Orchestrator-confirmed LIVE on lntercal: anon 200 + RateLimit-Limit:30, invalid key→401. (P3's 404 was wrong hostname `intercal` vs `lntercal`.) | (none) | 0 | begin MCP OAuth W6 |
| t72 | 07/W6 | P1 | Opus | a7e9c8e1573aab9e5 | returned OK; MCP OAuth2.1 resource server (jose JWKS, RFC9728 PRM, WWW-Auth 401/403, RFC8707 aud binding); AS = env seam (deferred honestly); anon-read preserved when no AS; spec-verified 2025-06-18/11-25; LIVE 7/7; 88 mcp tests | ea5b8b0 | ~12f +1336 | gate P2: spec compliance + no bypass |
| t73 | 07/W6 | P2 | Opus | a38a8453f357e0b89 | returned OK; fixed JWS alg-allowlist gap (alg-substitution; PS256-vs-RSA); MCP_OAUTH_ALGORITHMS default RS256; no-bypass+PRM+aud confirmed; LIVE 8/8 | dba6b87 | 9f +169/-15 | security fix → P3 confirm-quiet |
| t74 | 07/W6 | P3 | Opus | a940b6e4ba6b30ab0 | QUIET (only trivial lint sweep) → **W6 CLOSED** (MCP OAuth RS spec-correct, no bypass); LIVE 8/8 | f04d053 | 1f | **AUTH COMPLETE** (REST keys + MCP OAuth) → worker CD |
| t75 | 07/W3 | P1 | Opus | a9afb155f58c581bc | returned OK; scheduled CD (6h cron, caps, concurrency, perms, ADC); PROVEN via gh runs GREEN on Neon branch + PROD (idempotent, 5 new docs, no dupes); flagged W4 Dockerfile extras gap | 907b1d9,3b23bf3,54a347b | 5f ~340 | dispatch W3 P2 |
| t76 | 07/W3 | P2 | Opus | ab9e09ea36d646d61 | returned OK; fixed SA-key temp-file cleanup (if:always); 5 dims re-gated clean; actionlint clean | 677219a | 4f +78/-1 | minor → P3 confirm-quiet |
| t77 | 07/W3 | P3 | Opus | a29b41dd44167988c | QUIET → **W3 CLOSED** (scheduled CD live 6h, actionlint clean, secret-safe) | (none) | 0 | begin W4 Cloud Run |
| t78 | 07/W4 | P1 | Opus | aca26e3c11db24ba6 | returned OK; Cloud Run Job LIVE+PROVEN (exec r9vgn succeeded, real data landed); image→AR, least-priv SA+WIF Vertex, Secret Manager, deploy script+CD workflow; FIXED critical secrets-in-logs (DSN/Upstash redaction across all runners) | fc3785b | 14f +827/-20 | gate P2: SA/secrets/redaction/job config |
| t79 | 07/W4 | P2 | Opus | a9e2b7d97ed63bed0 | returned OK; CRITICAL: pass1 proof ran pre-redaction image → leaked Neon DSN to Cloud Logging (shared neondb_owner pw). PURGED logs, re-verified clean, re-ran fixed image hnwdm (redacted). All else clean. Recommends pw rotation | ae56e37 | 2 docs +105/-7 | ROTATE creds → then W4 P3 |
| t80 | SEC/rotate | P1 | Opus | ae087e378a6c3263f | DONE; Neon pw rotated in place, re-fanned all targets (Vercel/Actions/SecretMgr v2), OLD CRED DEAD, LIVE REST/MCP/pipeline green on new creds; runbook doc | 1ea3120 | 1 doc | exposure CLOSED → W4 P3 |
| t81 | 07/W4 | P3 | Opus | aae4b1a34c327ff27 | QUIET → **W4 CLOSED** (Cloud Run Jobs CD secret-safe, redaction complete, SA least-priv, no double-schedule; live redacted+green) | (none) | 0 | **WORKER CD DONE** → Plan04 W2 |
| t82 | 04/W2 | P1 | Opus | a2102e62d74513a52 | returned OK; SSRF guard (hostile matrix, DNS-rebind socket-pin, redirect re-validate, body cap) + source policy (summary_allowed gate, mig 0025); 41 SSRF tests; live github 200 / metadata+private blocked; 419 py tests | cb0307a | 14f +1192/-27 | gate P2: SSRF bypass + policy e2e |
| t83 | 04/W2 | P2 | Opus | af5b0c7a2bd3e82b0 | returned OK; fixed SSRF body-cap-not-enforced-on-adapter-path (mem exhaustion); cap in transport stream+CL; 52 SSRF tests; policy e2e + live snippet-gate 5/5; no bypass found | 73ce036 | 6f +457/-15 | security fix → P3 confirm-quiet |
| t84 | 04/W2 | P3 | Opus | abfb60fe1bb26d475 | QUIET → **W2 CLOSED** (SSRF no-bypass adversarial-verified; source policy e2e; live snippet-gate) | (none) | 0 | Plan04 W3 audit |
| t85 | 04/W3 | P1 | Opus | ac9677807fb46b65a | returned OK; append-only audit_events (mig 0026 trigger-enforced), recordAuditEvent+redaction, wired key issue/revoke in-tx, deferred seams; LIVE 14/14 no-secrets+mutation-rejected; 98 core tests | 729fd53 | 13f +881/-49 | gate P2 |
| t86 | 04/W3 | P2 | Opus | a0c7fea16251bdd5f | returned OK; fixed TRUNCATE-bypass (mig 0027 BEFORE TRUNCATE) + redaction gaps (dsn/conn-string/renamed); atomicity confirmed; LIVE 15/15 (U/D/TRUNCATE rejected); 99 core tests | 433f8af | 9f +175/-22 | integrity fixes → P3 confirm-quiet |
| t87 | 04/W3 | P3 | Opus | — | stale/non-resumable checkpoint from prior Claude-side session; no agent id | — | — | replaced by Codex checkpoint t88 |
| t88 | 04/W3 | P3 | inherited | 019e9b5e-21c6-7880-82ec-ee61b34af2ef | dispatched 2026-06-06T05:18Z; replacement confirm-quiet/re-gate pass for audit events; ownership: packages/core auth/audit, db audit migrations, audit docs/tests | — | — | poll until terminal, then gate W3 |
| t88r | 04/W3 | P3 | inherited | 019e9b5e-21c6-7880-82ec-ee61b34af2ef | returned OK; docs/comment alignment only; core audit tests 99 + typecheck + diff-check passed; pushed | c4a2113 | 6f +15/-10 | numeric gate OK + class C -> **W3 CLOSED** |
| t89 | 04/W4 | P1 | inherited | 019e9b5d-9e84-7201-b48f-5ad044ec376a | dispatched 2026-06-06T05:17Z; feedback/review records; ownership: contracts/API/core/db/review docs/tests as needed | — | — | poll until terminal, then dispatch W4 P2 |
| t90 | 04/W4 | P1 | inherited | 019e9b5e-826b-7483-91c9-c061f3c2c33d | duplicate dispatch detected and closed immediately; no work should be used from this agent | — | — | ignore; keep t89 as active W4 |
| t91 | 04/W5 | P1 | inherited | 019e9b5f-191b-70c1-a1de-f1012c0a5ac1 | dispatched 2026-06-06T05:19Z; subscriptions; ownership: subscription contracts/API/core/db/docs/tests, no W4/W7 edits except tiny references | — | — | poll until terminal, then dispatch W5 P2 |
| t92 | 07/W7 | P1 | inherited | 019e9b5f-744c-75b3-b759-ef27dce507ea | dispatched 2026-06-06T05:19Z; backups/restore proof; ownership: backup docs/scripts/package scripts/env examples/change fragment | — | — | poll until terminal, then dispatch W7 P2 |
| t89r | 04/W4 | P1 | inherited | 019e9b5d-9e84-7201-b48f-5ad044ec376a | returned with implementation complete but uncommitted due W4/W5 generated-contract/API interleaving; verification broad green (`pnpm contracts:build`, lint/typecheck/test/build, py gates, diff-check); DB migration not run because shell DATABASE_URL unset | — | WIP interleaved | dispatch combined W4/W5 integration/staging worker, then W4 P2 |
| t91r | 04/W5 | P1 | inherited | 019e9b5f-191b-70c1-a1de-f1012c0a5ac1 | returned with subscription implementation complete but uncommitted due W4/W5 interleaving; verification broad green (contracts build, TS checks/tests/builds, lint, py gates); db:check blocked by unapplied migrations and unknown DB target; contracts:check expected drift pre-commit | — | WIP interleaved | dispatch combined W4/W5 integration/staging worker, then W5 P2 |
| t92r | 07/W7 | P1 | inherited | 019e9b5f-744c-75b3-b759-ef27dce507ea | returned OK; backup/restore script+runbook+aliases+env placeholders; verification help/dry-run/biome/diff-check; real dump/restore unavailable (pg_dump/pg_restore/aws not on PATH, no throwaway target DSN); pushed | 77da587 | 10f +539/-8 | numeric gate OK; implementation pass -> dispatch W7 P2 |
| t93 | 04/W4+W5 | P1 integration | inherited | 019e9bb8-e241-7221-9de5-44bf368be058 | dispatched 2026-06-06T06:09Z; integrate/stage/commit interleaved W4 feedback + W5 subscriptions P1 work without expanding scope; ownership: current W4/W5 WIP, generated contracts, tests/docs/checkpoints | — | — | poll until terminal, then dispatch W4 P2 and W5 P2 as appropriate |
| t93r | 04/W4+W5 | P1 integration | inherited | 019e9bb8-e241-7221-9de5-44bf368be058 | returned OK; combined W4 feedback/review records + W5 subscriptions committed together; contracts build/check, touched package typechecks/tests, package build, pyright 0 errors, scoped Biome, staged diff-check green; db:check unavailable because no verified throwaway DB target (process DATABASE_URL unset, docker not on PATH, .env not used) | integration commit | 47f +3883/-29 | dispatch W4 P2 and W5 P2 |
| t94 | 07/W7 | P2 | inherited | 019e9bb9-3686-78d0-950a-2509d8a1182f | dispatched 2026-06-06T06:09Z; fresh-context backup/restore audit; ownership: W7 backup script/docs/package/env/changelog only | — | — | poll until terminal, then gate W7 |
| t95 | 04/W4 | P2 | inherited | 019e9bc2-5236-71b2-892e-239f4d29269b | dispatched 2026-06-06T06:17Z; fresh-context feedback/review audit over integrated commit `e7fcd3c`; ownership: W4 feedback/review only | — | — | poll until terminal, then gate W4 |
| t96 | 04/W5 | P2 | inherited | 019e9bc2-9b37-70c1-a770-c27365a1c734 | dispatched 2026-06-06T06:17Z; fresh-context subscriptions audit over integrated commit `e7fcd3c`; ownership: W5 subscriptions only | — | — | poll until terminal, then gate W5 |
| t94r | 07/W7 | P2 | inherited | 019e9bb9-3686-78d0-950a-2509d8a1182f | returned OK; fixed backup secret handling: libpq PG* env, clear inherited PG*, reject credentialed URL args, reject same source/target DSN, package command help; verification dry-run/help/negative/missing-tool no-DSN-output; real proof still unavailable (pg_dump/pg_restore/aws missing, no target DSN) | 3a56c40 | 3f +175/-31 | meaningful security fix -> dispatch W7 P3 confirm-quiet |
| t97 | 07/W7 | P3 | inherited | 019e9bc3-d95a-7e50-a655-b6af0234bf25 | returned QUIET; no file changes; syntax, Biome, command help, dry-run/no-secret-output, negative secret/same-target/missing-tool checks passed; real proof still operator-gated (pg_dump/pg_restore/aws missing, no target DSN) | (none) | 0 | **W7 CLOSED** |
| t95r | 04/W4 | P2 | inherited | 019e9bc2-5236-71b2-892e-239f4d29269b | returned OK; fixed real SDK duplicate-risk gap by disabling automatic retries for feedback POSTs; W4 boundaries otherwise held; verification SDK/api/core/contracts/scoped Biome/diff-check green; db:check unavailable (unapplied 0026-0029 on default target, no verified throwaway DB) | 2833f76 | 5f +56/-28 | meaningful fix -> dispatch W4 P3 confirm-quiet |
| t96r | 04/W5 | P2 | inherited | 019e9bc2-9b37-70c1-a770-c27365a1c734 | returned OK; fixed subscription dispatch matching gaps: validate target kind, non-empty claim patterns, no unrelated pattern broadcast, inactive subscriptions cannot poll/deliver; verification core/api/contracts/scoped Biome/diff-check green; DB migration check not rerun (no schema changes, 0029 still lacks throwaway DB proof) | 42d008c | 3f +183/-0 | meaningful fix -> dispatch W5 P3 confirm-quiet |
| t98 | 04/W4 | P3 | inherited | 019e9bc8-a57d-79d0-b506-9df23d3677a2 | dispatched 2026-06-06T06:27Z; confirm-quiet after SDK feedback no-retry fix | — | — | poll until terminal, then gate W4 |
| t99 | 04/W5 | P3 | inherited | 019e9bc8-e10e-7d90-99b7-6d475080b6e9 | dispatched 2026-06-06T06:27Z; confirm-quiet after subscription dispatch matching hardening | — | — | poll until terminal, then gate W5 |
| t99s | 04/W5 | P3 | inherited | 019e9bc8-e10e-7d90-99b7-6d475080b6e9 | returned non-closeout status; found real dispatch ownership gap (`/v1/subscriptions/dispatch` could enqueue across all matching active subscriptions for any `manage:subscriptions` key), reported fix in progress with verification, but no commit/push | — | WIP | replace with W5 P3 completion worker |
| t98r | 04/W4 | P3 | inherited | 019e9bc8-a57d-79d0-b506-9df23d3677a2 | returned OK; fixed source feedback target validation gap: non-UUID `source` target IDs now reject before UUID-backed source lookup; verification core/api/sdk/contracts/scoped Biome/diff-check green; no schema change | 7ada730 | 4f +33/-6 | meaningful fix -> dispatch W4 P4 confirm-quiet |
| t100 | 04/W5 | P3 completion | inherited | 019e9bce-6185-7e63-8c13-83fb828dae8e | dispatched 2026-06-06T06:35Z; finish/stage/commit W5 owner-scoped dispatch WIP only | — | — | poll until terminal, then gate W5 |
| t101 | 04/W4 | P4 | inherited | 019e9bcf-7909-7500-a57e-fff9f0dbbeea | dispatched 2026-06-06T06:37Z; confirm-quiet after source feedback target validation fix | — | — | poll until terminal, then gate W4 |
| t101r | 04/W4 | P4 | inherited | 019e9bcf-7909-7500-a57e-fff9f0dbbeea | returned OK; fixed caller-controlled `x-request-id` correlation metadata bounds before review/audit rows (trim, ignore empty, reject >128/control chars); verification API/core/SDK/contracts/scoped Biome/diff-check green; no schema change | dd5fb8f | 4f +51/-2 | meaningful fix -> dispatch W4 P5 confirm-quiet |
| t102 | 04/W4 | P5 | inherited | 019e9bd5-7765-7923-8dde-59feb027b852 | dispatched 2026-06-06T06:48Z; confirm-quiet after request-id bound fix | — | — | poll until terminal, then gate W4 |
| t103 | 04/W5 | P4 | inherited | 019e9bd5-b01b-7b70-bd7f-be60d76c2a52 | dispatched 2026-06-06T06:48Z; confirm-quiet after owner-scoped dispatch fix | — | — | poll until terminal, then gate W5 |
| t103r | 04/W5 | P4 | inherited | 019e9bd5-b01b-7b70-bd7f-be60d76c2a52 | returned OK; fixed contract/docs honesty gap: TypeSpec/OpenAPI dispatch description now states REST dispatch is authenticated API-key-owned only; contracts build/check and focused tests green; Biome ignored generated/contract docs paths | 37f2b6a | 5f +9/-4 | contract-honesty fix -> dispatch W5 P5 confirm-quiet |
| t104 | 04/W5 | P5 | inherited | 019e9bda-fa18-7833-8cb9-9e21baa7f76d | dispatched 2026-06-06T07:01Z; confirm-quiet after contract owner-scope documentation fix | — | — | poll until terminal, then gate W5 |
| t104r | 04/W5 | P5 | inherited | 019e9bda-fa18-7833-8cb9-9e21baa7f76d | returned OK; fixed malformed UUID-backed subscription inputs reaching Postgres UUID columns; create/dispatch/poll/delete now stay on bounded invalid_request path; verification core/API/contracts/scoped Biome/diff-check green; db:check still reports unapplied 0026-0029 | db5ed21 | 3f +67/-2 | meaningful fix -> dispatch W5 P6 confirm-quiet |
| t105 | 04/W5 | P6 | inherited | 019e9bdf-7f55-7f02-86b5-087176db8a62 | dispatched 2026-06-06T07:09Z; confirm-quiet after UUID-backed target validation fix | — | — | poll until terminal, then gate W5 |
| t105r | 04/W5 | P6 | inherited | 019e9bdf-7f55-7f02-86b5-087176db8a62 | returned OK; fixed off-contract subscription target/dispatch fields and webhook fields on polling subscriptions; verification core/API typecheck+tests, contracts:check, scoped Biome, diff-check green; no schema change | 6848d54 | 7f +174/-5 | meaningful fix -> dispatch W5 P7 confirm-quiet |
| t106 | 04/W5 | P7 | inherited | 019e9be6-28ae-7a71-978d-3784c1ec0ca5 | dispatched 2026-06-06T07:19Z; confirm-quiet after off-contract field guard fix | — | — | poll until terminal, then gate W5 |
| t106r | 04/W5 | P7 | inherited | 019e9be6-28ae-7a71-978d-3784c1ec0ca5 | returned QUIET; no changes; core tests 113, api tests 63, core/api typecheck, contracts:check, scoped Biome, diff-check passed; db:check still blocked by configured DB unapplied 0026-0029 | (none) | 0 | **W5 CLOSED** |
| t107 | 04/W6 | P1 | inherited | 019e9be9-960c-7b81-972f-9d212280dda6 | dispatched 2026-06-06T07:27Z; observability; ownership: real health/quality/cost/freshness metrics via scripts/core/db/docs/tests, no W4/W5/W7/W8 work | — | — | poll until terminal, then dispatch W6 P2 |
| t107r | 04/W6 | P1 | inherited | 019e9be9-960c-7b81-972f-9d212280dda6 | returned OK; added observability SQL views/provider usage/budget tables, ops:health CLI, core helper/test/docs/resource-budget; help/print-sql/core test/typecheck/scoped Biome/diff-check green; db:check not run (no verified target, Docker unavailable) | e6ac885 | 11f +908/-9 | numeric gate fails (>10 files) + implementation pass -> dispatch W6 P2 |
| t108 | 04/W6 | P2 | inherited | 019e9bf4-042b-7f00-8acc-e7fc71eedb85 | dispatched 2026-06-06T07:47Z; fresh-context audit of observability over `e6ac885`; ownership: W6 observability only | — | — | poll until terminal, then gate W6 |
| t108r | 04/W6 | P2 | inherited | 019e9bf4-042b-7f00-8acc-e7fc71eedb85 | returned OK; fixed telemetry honesty: provider consumption unknown stays NULL/unavailable without real events, added missing documented budget rows, core snapshot includes usageLatency, ASCII truncation; help/print-sql/core test/typecheck/scoped Biome/diff-check green; db:check unavailable | 01e8591 | 5f +44/-7 | meaningful fix -> dispatch W6 P3 confirm-quiet |
| t109 | 04/W6 | P3 | inherited | 019e9bf9-b480-7f50-8e28-5ac04de52545 | dispatched 2026-06-06T08:01Z; confirm-quiet after telemetry honesty fix | — | — | poll until terminal, then gate W6 |
| t109r | 04/W6 | P3 | inherited | 019e9bf9-b480-7f50-8e28-5ac04de52545 | returned OK; fixed provider_usage_events append-only enforcement (update/delete/truncate guards) to match documented telemetry invariant; help/print-sql/core test/typecheck/scoped Biome/diff-check green; db:check reports unapplied 0026-0030 | c613db4 | 3f +46/-0 | meaningful fix -> dispatch W6 P4 confirm-quiet |
| t110 | 04/W6 | P4 | inherited | 019e9bfd-db73-73e1-9390-0316e45630d9 | dispatched 2026-06-06T08:08Z; confirm-quiet after provider_usage_events append-only enforcement | — | — | poll until terminal, then gate W6 |
| t110r | 04/W6 | P4 | inherited | 019e9bfd-db73-73e1-9390-0316e45630d9 | returned QUIET; no changes; ops:health help/print-sql, core observability tests 116, core typecheck, scoped Biome, diff-check passed; db:check not run due unset DATABASE_URL/unverified .env/Docker missing/migration check not safe no-op | (none) | 0 | **W6 CLOSED** |
| t111 | 04/W7 | P1 | inherited | 019e9c01-33e2-7783-a591-b811cf81dc36 | dispatched 2026-06-06T08:16Z; deployment paths/backups docs/proof alignment; ownership: Plan04 W7 only, use Plan07 W7 as source truth for backups | — | — | poll until terminal, then dispatch W7 P2 |
| t112 | 07/W8 | P1 | inherited | 019e9c01-7b62-7b73-a9b7-2ad25c69dbc3 | dispatched 2026-06-06T08:16Z; budget enforcement/cost monitoring runtime knobs; ownership: Plan07 W8 only | — | — | poll until terminal, then dispatch W8 P2 |
| t111r | 04/W7 | P1 | inherited | 019e9c01-33e2-7783-a591-b811cf81dc36 | returned OK; deployment runbook/topology/roadmap/changelog + deploy-cloud-run pnpm separator dry-run fix; verification docs readback, backup dry-run/help, deploy dry-run, scoped Biome, diff-check, staged secret scan; live provider/DNS/restore proofs operator-gated | f60fc34 | 5f +310/-13 | implementation pass -> dispatch W7 P2 |
| t113 | 04/W7 | P2 | inherited | 019e9c07-d445-7312-9db3-085ead4c568b | dispatched 2026-06-06T08:29Z; fresh-context deployment paths/backups audit over `f60fc34` | — | — | poll until terminal, then gate W7 |
| t113r | 04/W7 | P2 | inherited | 019e9c07-d445-7312-9db3-085ead4c568b | returned OK; fixed Vercel root-directory deployment doc gap for package-local dashboard vercel.json; backup/deploy dry-runs, diff-check, secret scan green; live provider/DNS/restore proofs operator-gated | 77fb198 | 3f +9/-4 | meaningful fix -> dispatch W7 P3 confirm-quiet |
| t114 | 04/W7 | P3 | inherited | 019e9c0b-bf93-7400-adc0-5ed18fc91a22 | dispatched 2026-06-06T08:39Z; confirm-quiet after Vercel root-directory docs fix | — | — | poll until terminal, then gate W7 |
| t112r | 07/W8 | P1 | inherited | 019e9c01-7b62-7b73-a9b7-2ad25c69dbc3 | returned OK; worker budget controls: throttle knobs, daily LLM request budget, Vertex->Gemini fallback, provider usage events, auto-degrade routing, CLI knobs/tests/docs; py tests/lint/typecheck, CLI help, diff-check, secret scan green; no paid/live provider calls or DB writes | 5de4fbd | 14f +643/-37 | numeric gate fails (>10 files) + implementation pass -> dispatch W8 P2 |
| t115 | 07/W8 | P2 | inherited | 019e9c0d-01f8-7590-b9e5-2e56ef4e9df9 | dispatched 2026-06-06T08:44Z; fresh-context budget enforcement audit over `5de4fbd` | — | — | poll until terminal, then gate W8 |
| t114r | 04/W7 | P3 | inherited | 019e9c0b-bf93-7400-adc0-5ed18fc91a22 | returned OK; fixed Cloud Run deploy script comment to say job/Artifact Registry region comes from CLOUD_RUN_REGION, not GCLOUD_REGION; backup/deploy dry-runs, node check, Biome, diff-check, scoped secret scan green; live provider/DNS/restore proofs operator-gated | 218b52a | 1f +4/-3 | meaningful consistency fix -> dispatch W7 P4 confirm-quiet |
| t116 | 04/W7 | P4 | inherited | 019e9c0f-992f-7f62-9909-e87dbc6a3f67 | dispatched 2026-06-06T08:51Z; confirm-quiet after Cloud Run region comment fix | — | — | poll until terminal, then gate W7 |
| t116r | 04/W7 | P4 | inherited | 019e9c0f-992f-7f62-9909-e87dbc6a3f67 | returned QUIET; no changes; deploy-cloud-run dry-run, backup dry-run, restore-proof help, node check, Biome, W7 diff-check, secret scan passed; live provider/DNS/restore proofs remain operator-gated | (none) | 0 | **W7 CLOSED** |
| t115r | 07/W8 | P2 | inherited | 019e9c0d-01f8-7590-b9e5-2e56ef4e9df9 | returned OK; fixed cross-process daily LLM budget reset by seeding guard from same-day provider_usage_events; usage writes remain success-only; focused pytest/ruff/pyright/diff-check/secret scan green; no paid provider calls/live DB writes | 5e10ef3 | 8f +160/-17 | meaningful fix -> dispatch W8 P3 confirm-quiet |
| t117 | 07/W8 | P3 | inherited | 019e9c13-708c-7100-9f05-f8faa6272438 | dispatched 2026-06-06T09:00Z; confirm-quiet after cross-process daily budget seeding fix | — | — | poll until terminal, then gate W8 |
| t117r | 07/W8 | P3 | inherited | 019e9c13-708c-7100-9f05-f8faa6272438 | returned OK; fixed provider usage budget-window bug with half-open day/month windows for LLM request seeding and provider auto-degrade; uv pytest/ruff/pyright, pnpm lint, diff-check green; no paid provider calls/live DB writes, migration not run without throwaway DB | 77dfdb5 | 5f +98/-3 | meaningful fix -> dispatch W8 P4 confirm-quiet |
| t118 | 07/W8 | P4 | inherited | 019e9c18-9798-7233-81c6-74cab10bf54f | dispatched 2026-06-06T09:17Z; confirm-quiet after budget-window fix | — | — | poll until terminal, then gate W8 |
| t118r | 07/W8 | P4 | inherited | 019e9c18-9798-7233-81c6-74cab10bf54f | returned QUIET; no changes; focused/shared/provider budget pytest, full py:test 444, py lint/typecheck, pnpm test/typecheck/lint, diff-check, secret scan passed; db:check blocked by configured DB unapplied 0026-0031; no paid/live calls/writes | (none) | 0 | **W8 CLOSED** |
| t119 | 04/W8 | P1 | inherited | 019e9c1c-fd11-7ed1-8636-3e7420534f8d | dispatched 2026-06-06T09:28Z; account and CLI setup runbook; ownership: docs/operations/account-setup, secrets references, proof-command checklist, no Plan05/06/07 implementation | — | — | poll until terminal, then dispatch W8 P2 |
| t119r | 04/W8 | P1 | inherited | 019e9c1c-fd11-7ed1-8636-3e7420534f8d | returned OK; added account setup runbook, changelog, roadmap status; docs readback, diff-check, staged secret scan, official command-shape checks; live provider proofs operator-gated | d587745 | 3f +471/-6 | first implementation pass -> dispatch W8 P2 |
| t120 | 04/W8 | P2 | inherited | 019e9c26-3745-7082-a869-b0b57f37de1a | dispatched 2026-06-06T09:39Z; fresh-context account/CLI setup runbook audit over `d587745` | — | — | poll until terminal, then gate W8 |
| t120r | 04/W8 | P2 | inherited | 019e9c26-3745-7082-a869-b0b57f37de1a | returned OK; fixed secrets-fanout pnpm `--` separator handling so documented runbook proof commands work; secrets-fanout dry-runs, backup/deploy/health/restore help, diff-check, secret scan green; live provider calls/writes operator-gated | c1a8a42 | 2f +8/-3 | meaningful command fix -> dispatch W8 P3 confirm-quiet |
| t121 | 04/W8 | P3 | inherited | 019e9c2c-f28a-7fb3-9f2a-e27f84023bfd | dispatched 2026-06-06T09:52Z; confirm-quiet after secrets-fanout pnpm separator fix; scope account/CLI setup runbook + directly referenced CLI/script surfaces only | — | — | poll until terminal, then gate W8 |
| t121r | 04/W8 | P3 | inherited | 019e9c2c-f28a-7fb3-9f2a-e27f84023bfd | returned OK; fixed ops health CLI pnpm `--` separator handling so documented `pnpm ops:health -- --section ...` proof commands work; health help/list/print-sql, node check, Biome, diff-check, secret scan green; live health sections require verified DATABASE_URL | fbcba08 | 2f +9 | meaningful command fix -> dispatch W8 P4 confirm-quiet |
| t122 | 04/W8 | P4 | inherited | 019e9c31-9ce9-7732-a027-29b4508b8820 | dispatched 2026-06-06T10:02Z; confirm-quiet after ops health pnpm separator fix; scope account/CLI setup runbook + directly referenced CLI/script surfaces only | — | — | poll until terminal, then gate W8 |
| t122r | 04/W8 | P4 | inherited | 019e9c31-9ce9-7732-a027-29b4508b8820 | returned QUIET; no changes; .env ignored, health list/print-sql, backup help, deploy dry-run, secrets-fanout target/all dry-runs, diff-check passed; live DNS/TLS/provider listings/resource checks and DB-backed health/db checks operator-gated | (none) | 0 | **W8 CLOSED**; dispatch Phase D final verification |
| t123 | Phase D | final verification A | inherited | 019e9c34-ac0f-7c43-95ca-e97ec7f1ba95 | dispatched 2026-06-06T10:10Z; TS/contracts/package verification gate | — | — | poll with B/C until terminal |
| t123r | Phase D | final verification A | inherited | 019e9c34-ac0f-7c43-95ca-e97ec7f1ba95 | returned QUIET; no changes; pnpm format:check, lint, typecheck, test, contracts:check, build, diff-check passed; TS/package scripts present; only tooling warnings were Biome schema version info + datamodel/Node deprecation warnings | (none) | 0 | close A; wait B/C |
| t124 | Phase D | final verification B | inherited | 019e9c34-eb4c-7070-8934-728697db6ecf | dispatched 2026-06-06T10:10Z; Python/services, DB availability, ops CLI verification gate | — | — | poll with A/C until terminal |
| t125 | Phase D | final verification C | inherited | 019e9c35-2f80-7a82-b9e2-90aad7526113 | dispatched 2026-06-06T10:10Z; docs/status/changelog/secret-safety consistency gate | — | — | poll with A/B until terminal |
| t124r | Phase D | final verification B | inherited | 019e9c34-eb4c-7070-8934-728697db6ecf | returned OK; fixed ops keys help/separator path so help exits 0 and ignores pnpm `--`; py lint/typecheck/test passed, py format check exposed existing 23-file format drift not in verify script, health/backup/help/dry-run paths passed; deploy:check absent, Docker/verified DB unavailable | fd82d39 | 1f +5/-4 | meaningful ops fix -> final confirm-quiet required |
| t125r | Phase D | final verification C | inherited | 019e9c35-2f80-7a82-b9e2-90aad7526113 | returned OK; fixed Phase D status drift in Plan04/Plan07 and added changelog; diff-check/secret scan/check-ignore passed; remaining limitations are restore/upload proof, live custom-domain smoke/rollback, and budget telemetry/provider writes | 5e34cdd | 3f +32/-18 | meaningful docs/status fix -> final confirm-quiet required |
| t126 | Phase D | final confirm D | inherited | 019e9ccb-627c-7e23-83ff-7c98f1087283 | dispatched 2026-06-06T10:31Z; code/ops confirm-quiet after `fd82d39`/`5e34cdd` | — | — | poll with E until terminal |
| t127 | Phase D | final confirm E | inherited | 019e9ccb-a23b-7321-a171-4e36dd3cf943 | dispatched 2026-06-06T10:31Z; docs/status/changelog confirm-quiet after `5e34cdd` | — | — | poll with D until terminal |
| t126r | Phase D | final confirm D | inherited | 019e9ccb-627c-7e23-83ff-7c98f1087283 | returned QUIET; no changes; keys/health/backup help/list/print-sql/dry-run, py lint/typecheck/test, node checks, secrets manifest parse, diff-check passed; live provider/DB-backed checks skipped as secret/DB/operator-gated | (none) | 0 | close D |
| t127r | Phase D | final confirm E | inherited | 019e9ccb-a23b-7321-a171-4e36dd3cf943 | returned QUIET; no changes; Plan04/Plan07 closeout language honest at `5e34cdd`, changelog present, tracked-doc secret scan/diff-check/check-ignore passed; remaining live restore/domain/provider/budget/DB checks operator-gated | (none) | 0 | close E; commit coordinator checkpoints |
| t102r | 04/W4 | P5 | inherited | 019e9bd5-7765-7923-8dde-59feb027b852 | returned QUIET; no changes; API feedback tests 61, SDK 16+6 skipped, core 106, typechecks, scoped Biome, diff-check passed; contracts:check blocked by W5 TypeSpec doc drift side effects; db:check blocked by configured DB unapplied 0026-0029 | (none) | 0 | **W4 CLOSED** |
| t100r | 04/W5 | P3 completion | inherited | 019e9bce-6185-7e63-8c13-83fb828dae8e | returned OK; fixed owner-scoped REST dispatch: API key passed into dispatch, core requires explicit scope (`api_key_owner` or trusted `internal_all_active` with reason); verification core/api/contracts/scoped Biome/diff-check green; db:check reports unapplied 0026-0029, lint blocked by unrelated review.ts regex findings | 33f97b0 | 5f +123/-1 | meaningful fix -> dispatch W5 P4 confirm-quiet |

**Phase D closeout:** Plan04 W1-W8 and Plan07 W1/W3/W4/W5/W6/W7/W8 are complete or honestly operator-gated where live provider/DB proof requires credentials/tools. Final confirm passes D/E returned quiet after commits `fd82d39` and `5e34cdd`; remaining action is coordinator checkpoint commit/push only.

**Phase D progress:** Plan07 W1✅,W3✅,W4✅,W5/04W1-REST✅,W6✅ · Plan04 W2✅ | remaining: Plan04 W3 audit, W4 feedback, W5 subs, W6 observability, W7 deploy-paths/backups(+Plan07 W7), W8 runbook; Plan07 W8 budget.

**Phase D progress:** Plan07 W1✅ secrets · REST-auth✅ · W6✅ MCP OAuth · W3✅ Actions CD · W4✅ Cloud Run | remaining: Plan07 W7 backups, W8 budget; Plan04 W2 source-policy/SSRF, W3 audit, W4 feedback, W5 subs, W6 observability, W7 deploy-paths/backups, W8 runbook.

**Carry-forward (cross-platform):** scripts/ops fan-out/deploy use `execFile('gcloud',…)` → ENOENT on Windows (.cmd shim) for `--target cloudrun`; fix before a Windows operator uses it (Cloud Run secrets currently via Secret Manager direct).

**Phase D progress:** Plan07 W1✅ secrets · REST-auth✅(W5+Plan04W1-REST) · W6✅ MCP OAuth | remaining: Plan07 W3 (Actions CD), W4 (Cloud Run Jobs), W7 (backups), W8 (budget); Plan04 W2 source-policy/SSRF, W3 audit, W4 feedback, W5 subs, W6 observability, W7 deploy-paths, W8 runbook.

**Phase D consolidation note:** REST auth (Plan07 W5 hashed scoped API keys) + rate limits (Plan04 W1 REST portion) done as ONE coherent middleware stack. MCP OAuth = Plan07 W6 (separate). Plan04 W1 MCP-rate-limit folded into W6.

**Carry-forward (later seam, Plan 05/enhancement):** verifyClaim role-swap calibration limit — a token-identical role-swap with a near-identical 2nd candidate can grade `supported`; closing needs semantic parsing behind `LlmPort`. Documented, not a blocker.

**Carry-forward (hardening):** MCP SDK `tools/call` doesn't validate args vs inputSchema → missing required arg = internal_error not invalid_request. Fold into a later hardening pass (W5/W6 surface or Plan 05).
**Phase C progress:** W1✅ W2✅ W3✅(+MCP live) | remaining: W4 SDK, W5 getDelta, W6 verifyClaim, W7 freshness/coverage, W8 fixture.

**Parallel note:** W2 (packages/api) and W3 (packages/mcp-server) independent, both on completed W1 query layer. W3 dispatch also covers Plan 07 W2 (mount MCP at dashboard `/api/mcp`).

**MODEL POLICY ADAPTATION:** Opus session limits hit 3× (1am/6:20am/12pm resets) = real throughput blocker. Confirm-quiet passes now on Sonnet; reserve Opus for primary defect-finding pass-2 audits, fall back to Sonnet if Opus rate-limited. Deviation logged per dispatch.

**Phase B progress:** W1✅ W2✅ W4✅ W3✅ W5✅ W6✅ W7✅ | remaining: GAP-A (claim→entity linking), W8 (orchestration/fixture heartbeat) + Plan07 W3/W4 (worker CD).

**MUST-ADDRESS gaps (do not settle):**
- **GAP-A (claim-end entity linking, W3/W6):** W3 leaves `claims.subject/object_entity_id` NULL and claim surface forms differ from mention spans → real pipeline derives ~0 relationships. Dispatch a focused W3/W6 wiring fix BEFORE W8 so relationships flow naturally end-to-end.
- **GAP-B (Plan 03 carry):** `ClaimsTable` TS type declares `recorded_at` but claims SQL lacks it → `getEntity` orderBy('recorded_at') runtime failure. Fix in Plan 03 query-layer pass.

**Carry-forward to Plan 04:** entity-merge reversal fidelity — exact-collision case leaves `moved_external_id_ids` empty (survivor already holds the ID); fine today, matters for the not-yet-built reversal path.

**Carry-forward to Plan 03 (query layer):** getEntity direct-by-UUID lookup of a merged-away id returns the deprecated row without chasing `merged_into_id` — decide redirect vs 410 in Plan 03.

**Phase B progress:** W1✅ W2✅ W4✅ W3✅ | remaining: W5, W6, W7, W8 + Plan07 W3/W4 (worker CD).

**Reorder note:** Phase B order adjusted to W1,W2,**W4**,W3,W5,W6,W7,W8 — W4 (LLM+embeddings ports) is a real dependency of W3 (extraction calls LLM); building W3 first would require a forbidden mock.

## Notes / blockers

- **MANDATORY Phase F (Plan 05) deliverable — migration consolidation (user-requested 2026-06-05):**
  `db/migrations/` has grown to 20+ incremental files and will exceed 30 by program end. Before release,
  consolidate into ONE clean canonical schema set (e.g. a squashed baseline + seeds), retiring the
  incremental history. MUST NOT be done mid-stream — live Neon branches + migration runner depend on the
  incremental files. Schedule as an explicit Plan 05 workstream task. Verify the canonical set migrates a
  fresh DB to byte-identical schema vs the incremental chain before retiring the old files.
- **Model policy (UPDATED 2026-06-05, user directive):** **ALL passes = Opus 4.8** (pass 1, audits, confirm-quiet).
  User observed Sonnet producing more failed commands/issues; Opus runs clean and catches the real defects.
  Session-limit pauses are account-wide throughput (hit both models) — resume from repo state, no work lost.
  Supersedes goal.md's Sonnet-p1/Opus-p2 default per explicit user instruction.
