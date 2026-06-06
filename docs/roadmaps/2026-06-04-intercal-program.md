# Intercal Program — End-to-End Build

Date: 2026-06-04
Status: [~] Active — Phases A–C complete and live (real data + cited/budgeted deltas/verify on live API/MCP); Phases D–F sequenced
Owner: Program orchestration
Source: `docs/research/2026-05-21-intercal-foundation-report.md`, `docs/research/2026-06-04-intercal-revisit-audit-and-dev-environment.md`, decisions `0001`/`0002`

The master plan tying every workstream into one compounding sequence — from the live substrate
to a fully-featured, fully-wired product. Each phase leaves Intercal shippable and builds on the
last. Detailed dated plans live alongside this file and are realigned to the live reality (Neon
direct, Vercel app, GCloud workers) as each phase begins.

## Current live state (the ground we build on)

- **Live:** `lntercal.vercel.app` — Next.js dashboard + Hono REST API on one Vercel domain,
  reading from **Neon** (Postgres 18 + pgvector 0.8.1, full schema + seed vocabularies).
- **Wired:** GitHub (`JamiStudio/intercal`, CI + Actions secrets), Vercel (jami.studio),
  Neon, Upstash (jami.studio), Gemini (postpay), GCloud `rich-wavelet-496206-h7` (yrka.io
  trial credits; SA `owner`, Cloud Run/Vertex/Build/Scheduler/Secret-Manager enabled).
- **Pending:** Cloudflare R2 enablement + S3 token (storage); needed at Phase B.
- **Implemented now:** V1 read tools `get_entity` / `get_sources` / `get_freshness` /
  `search_evidence` through one query layer; everything else is real seams awaiting bodies.

## Inference & provider posture (decided)

- **LLM:** primary = **Vertex AI** via the yrka.io SA (trial credits, ADC) behind `LlmPort`;
  fallback = **Gemini API key** (postpay daily allowance); Groq/Anthropic/OpenAI also behind
  the port. (Phase B adds a Vertex adapter mode to the existing `gemini` adapter via
  `google-genai` `vertexai=True`.)
- **Embeddings:** local **fastembed** default (zero-cost, in-worker); Vertex/hosted optional.
- **Storage:** **Cloudflare R2** (S3 API) target; **GCS** is the zero-friction fallback while
  R2 is enabled — swap is a config change behind `StoragePort`.
- **Queue/cache:** **Upstash** (TCP) behind `QueuePort`; `pgmq` fallback.
- **Compute:** app+MCP on **Vercel**; heavy Python pipeline on **GitHub Actions** (scheduled)
  → **Cloud Run Jobs** (on-demand/scale). Same portable worker CLIs on both.

## Compounding phases

```
A ✅ Foundation & live rails
      └─> B ✅ Real knowledge in (pipeline live; worker CD = Plan 07 W3/W4 pending)
              └─> C ✅ Agent surface depth (deltas, verify, digests, MCP on /api/mcp — LIVE)
                      ├─> D  Trust & operations (auth, limits, policy, subs, audit, deploy/CD)
                      │        └─> E  Interactive experience (graph/timeline/briefing/operator)
                      └────────────────┘
                                          └─> F  Saturation & release audit
```

### Phase A — Foundation & live rails ✅ COMPLETE
Plan 00 + live wiring. Repo, contracts, schema, adapters, query layer, deployed app, live DB.
**Done:** the substrate is online and the seams are real.

### Phase B — Real knowledge in ✅ PIPELINE COMPLETE (worker CD pending in Plan 07 W3/W4)
Plans: **02 (Knowledge Pipeline)** ✅ all 8 workstreams + claim-entity-linking bridge live & idempotent;
real data (Node/Rust/K8s GitHub releases → claims → entities → relationships → bitemporal fact versions)
served on the live API (`/v1/entity`, `/v1/evidence`). Worker CD (scheduled Actions + Cloud Run) = Plan 07 W3/W4.
Goal: documents flow through ingest → normalize → extract claims → resolve entities → derive
relationships → write bitemporal fact versions → embeddings, idempotently, on real sources.
Key deliverables:
- Source adapters (start: Wikidata/Wikipedia recent changes, GitHub releases) behind the source registry.
- Real bodies for the `intercal_{ingest,extract,resolve,synthesize}` jobs (replace the Plan-02 `NotImplementedError` markers).
- Vertex LLM adapter mode + structured claim extraction with schema validation + source spans.
- Local embeddings into pgvector (halfvec/HNSW), with model+dim+version per vector.
- Storage (R2/GCS) for raw archival; source license/redistribution policy enforced before store.
- **Worker CD:** GitHub Actions scheduled workflow runs the jobs; Cloud Run Job image for heavy/on-demand.
Acceptance gate: the fixture heartbeat (seed docs → claims → 1 resolved + 1 review-needed entity
→ 1 relationship → 1 fact version) is green, and **real data appears on the already-live API/dashboard**.

### Phase C — Agent surface depth ✅ COMPLETE & LIVE
Plan: **03 (Agent-Facing Surface)** ✅ all 8 workstreams + MCP-on-Vercel portion of **07** (W2) ✅.
`getDelta` (token-budgeted cited bitemporal digest) + `verifyClaim` (evidence-match + contradiction,
adversarial-safe) implemented in the shared query layer; MCP mounted at `/api/mcp` (Streamable HTTP,
stateless); typed SDK; freshness/coverage (evidence-depth). Acceptance gate proven live 23/23 across
MCP + SDK/REST against real production data.
Goal: the killer feature — "what changed since my cutoff," verifiable and token-budgeted.
Key deliverables:
- Implement `get_delta` (token-budgeted digest over changed claims/entities since a date) and
  `verify_claim` (evidence match + contradiction reasoning) — the two deferred query bodies.
- Digest/synthesis via the LLM port (Vertex primary) with citations + freshness preserved.
- **Mount MCP at `/api/mcp`** on Vercel (stateless Streamable HTTP) — agents hit one URL.
- SDK methods + fixture-backed contract tests for the full V1 surface.
Acceptance gate: an agent (MCP) and a client (SDK/REST) both get cited, confidence-scored,
budget-bounded deltas/verifications against live data.

### Phase D — Trust & operations
Plans: **04 (Operations & Trust)** + **07 (Deployment, CD, Auth, Secrets)** in full.
Goal: safe to open publicly; fully wired and reproducible.
Key deliverables:
- Auth: hashed scoped **API keys** (REST) + **OAuth 2.1** resource-server (MCP); rate limits.
- Source policy + SSRF protection for submitted URLs; audit events for trust-sensitive actions.
- Subscriptions (webhook/poll) + bounded feedback/review records (no public graph mutation).
- Observability: source/run health, usage, latency/error by tool; freshness/coverage.
- **Deployment/CD (Plan 07):** secret fan-out automation (one source → Vercel + Actions +
  Cloud Run + local), Cloud Run deploy of MCP/pipeline, env-promotion, backups + restore proof.
Acceptance gate: a third party can use the public API/MCP under quota, safely; ops can see health
and recover; every secret has one source of truth fanned out automatically.

### Phase E — Interactive experience
Plan: **06 (Interactive Knowledge Experience)**.
Goal: the full read-only human product on the live dashboard.
Key deliverables: entity/topic/claim/evidence pages; graph + timeline explorer; briefing/search/
delta-comparison; contradiction & freshness views; subscription management; feedback/reporting;
operator/review console; shareable/embeddable public surfaces. All via the SDK; no UI-only model.
Acceptance gate: every displayed fact is evidence-linked or an explicit unknown; feedback is
audited and cannot mutate canonical data; responsive + accessible.

### Phase F — Saturation & release audit
Plan: **05 (Production Saturation & Release Audit)**.
Goal: "perfect condition, ready to roll."
Key deliverables: architecture-parity audit; data-quality audit; **provider-switch proofs**
(LLM, embeddings, storage, queue, DB portability); security/abuse review; scale & cost review;
docs parity; full verification ladder green; release readiness + changelog.
Acceptance gate: no known foundational shortcuts; every adapter swap proven; full gate green in CI.

> Cost discipline runs through every phase: see
> [`../operations/resource-budget.md`](../operations/resource-budget.md) for per-service
> allowances, cadences, and throttle knobs. Repo is public → GitHub Actions are free/unlimited;
> the real budget is LLM inference (Vertex credits + Gemini daily), then Neon CU-hours / Upstash
> commands / R2 ops.

## Cross-cutting Plan 07 — Deployment, CD, Auth & Secrets (new) — [`2026-06-04-intercal-plan-07-deployment-cd-auth-secrets.md`](2026-06-04-intercal-plan-07-deployment-cd-auth-secrets.md)
The connective tissue threaded through B/C/D:
- Secret management: one source → fanned to local `.env`, Vercel env, GitHub Actions secrets,
  Cloud Run env (scriptable; partially automated already).
- App/MCP on Vercel (incl. `/api/mcp`); pipeline on Actions + Cloud Run Jobs (Artifact Registry
  images via Cloud Build); Cloud Scheduler triggers.
- Auth surfaces (API keys, MCP OAuth), custom domain cutover, preview/prod promotion, rollback.
- Backups/restore proof; runbooks.

## Definition of done (whole product)
- Real, continuously-updated, source-grounded temporal graph queryable by date/entity/claim/budget.
- Agents via MCP and clients via REST/SDK get cited, confidence-scored, token-budgeted deltas,
  entity state, evidence search, and claim verification — point-in-time correct.
- Public read-only human experience (graph/timeline/briefing/evidence/operator).
- Auth, rate limits, source policy, subscriptions, audit, observability, backups in place.
- Every external dependency swappable behind a port; provider-switch proven; full CI gate green;
  zero-cost posture holding, scale paths documented.

## Operating rules for the program
- Just-in-time detail: realign/expand each dated plan (02–07) to live reality at the start of its
  phase; don't over-specify far-future phases.
- Every phase ships through owning packages/services/contracts/migrations/tests + docs + changelog.
- Keep the live app green at every merge; the fixture heartbeat must stay passing from Phase B on.
- No mocks/placeholders; later-phase work is marked, never faked.
