# Baseline Knowledge Seeding Report

Date: 2026-06-06
Status: Accepted direction for Workstream 1 taxonomy; adapter/backfill implementation remains future work
Request: Propose approaches to seed Intercal with a focused baseline knowledge history (≥2 years; ideally back to the first major GPT release), using free scraping, existing LLM subscriptions, and trial cloud credits.
Source scope: Live codebase (`services/`, `db/`, `packages/`), architecture docs, foundation report, Plan 02 closeout, resource budget, seed files, Workstream 1 taxonomy pass.
Owner: Team (Jamie + collaborators)

## Executive Summary

Intercal is **live with a complete pipeline but almost no corpus**. The right next step is a phased baseline build focused on **AI/ML technical currency** — not world news or gossip — spanning roughly **November 2022 (ChatGPT launch) through today**.

Three complementary strategies are recommended:

1. **The Spine** — structured entity bootstrap from Wikidata, HuggingFace, PyPI/npm (low LLM cost).
2. **The Chronicle** — high-signal document flood from GitHub releases, arXiv, lab blogs, standards repos (LLM-heavy, rich provenance).
3. **The Archaeologist** — Wikipedia revision history as bitemporal evidence (uniquely suited to Intercal's temporal model).

**Recommended hybrid:** Spine → Chronicle → Archaeologist, with ongoing incremental ingest on the existing scheduled workers.

The main engineering gap is **historical backfill**: current adapters (Wikidata recent changes, GitHub releases) are forward-looking. New adapters and a one-shot Cloud Run backfill job unlock the full timeline.

Workstream 1 now locks the durable source-class and topic-cluster taxonomy in
`docs/architecture/corpus-taxonomy.md`. This report remains the strategy source; the taxonomy doc is
the operating contract for source rows, policy defaults, first-proof queries, and full-corpus
acceptance queries.

## Question Being Answered

> How should we seed Intercal with a solid, focused baseline knowledge history that agents can query via MCP/REST — at least two years back, ideally to the start of the GPT era — using free APIs/scraping and our current LLM/cloud credits?

## Source Scope And Method

Checked against the live repository (not roadmap claims):

- `docs/research/2026-05-21-intercal-foundation-report.md` — product thesis, ingestion strategy, non-goals
- `docs/architecture/pipeline.md` — pipeline stages and invariants
- `docs/operations/source-policy.md` — redistribution/citation rules
- `docs/operations/resource-budget.md` — LLM budget, cadence knobs
- `docs/architecture/corpus-taxonomy.md` — source classes, topic clusters, seed vocabulary needs, query gates
- `db/seeds/0001_entity_types.sql`, `0002_relationship_types.sql`, `0003_sources.sql` — current vocabularies and starter sources
- `services/shared/src/intercal_shared/source_registry.py` — only two built-in adapters today
- `docs/roadmaps/2026-05-21-intercal-plan-02-knowledge-pipeline.md` — Plan 02 marked complete

Not checked live against production DB row counts or deployed cron state (assumption: live instance matches seed + incremental runs). No new external licensing or provider-limit facts were locked in during the taxonomy pass; source-policy defaults remain conservative until verified per source row.

## Current Project State

### Built and deployed

- Full pipeline: ingest → normalize → extract → resolve → fact versions → embeddings → synthesis
- MCP + REST query surface (`get_delta`, `get_entity`, `search_evidence`, `verify_claim`, `get_freshness`, etc.)
- Bitemporal fact history with provenance (claims → evidence → source documents)
- Two live source adapters:
  - `wikidata_changes_v1` — Wikidata recent changes (incremental `rcend` cursor)
  - `github_releases_v1` — GitHub releases for 10 configured repos

### Seeded but knowledge-sparse

- Entity/relationship type vocabularies (`person`, `organization`, `technical_artifact`, `person_holds_role`, `organization_published_artifact`, …)
- Two starter sources in `db/seeds/0003_sources.sql` — configured, not yet rich in historical depth

### Constraints

| Constraint | Implication |
| --- | --- |
| LLM budget ~2,000 req/day (Vertex → Gemini fallback) | Bulk extraction must be tiered and batched |
| Embeddings local/free (fastembed) | No API cost for vector indexing |
| `content_hash` dedup | Safe to re-run ingest/extract |
| Source policy per row | Must set `redistribution_allowed`, `summary_allowed`, `citation_only` correctly per source class |
| Non-goal: news scraper | Baseline = technical currency, regulation, standards — not gossip |

### Gap

Current adapters are **forward-looking**. Wikidata uses `rcend` cursors (only new changes). GitHub re-fetches releases but dedupes by hash. **No historical backfill path** exists yet — this is the main unlock for "back to ChatGPT launch."

### Workstream 1 taxonomy lock

The final source classes are:

- `model_release`
- `model_card`
- `lab_announcement`
- `research_paper`
- `standard_spec`
- `sdk_framework_release`
- `benchmark`
- `regulation`
- `runtime_infrastructure`
- `mediawiki_revision`

Every future historical source row should set `sources.metadata.source_class` to one of these
values, while keeping `sources.source_type` as the broad storage-level category and
`sources.adapter_name` as executable adapter dispatch. Policy defaults for all classes are
conservative: `redistribution_allowed=false`, `summary_allowed=true`, `citation_only=false`, with
per-row license notes required before loosening redistribution. A row may always tighten to
`citation_only=true`.

The locked topic clusters are:

- `frontier_models`
- `open_weights`
- `model_architecture`
- `ml_research`
- `agent_protocols`
- `rag_memory`
- `developer_tooling`
- `evaluation_benchmarks`
- `regulation_safety`
- `inference_runtime_infrastructure`

No seed changes are required for this taxonomy pass. Existing entity types, relationship types,
and review-status columns cover the planned classes and clusters. Seeded topic rows should wait
until coverage gates exist, so the database does not claim implemented coverage before Workstream
4 proves it.

## What "Baseline" Should Mean

Success is **answerable temporal queries**, not document volume.

| Agent query | Baseline should support |
| --- | --- |
| `get_delta("frontier LLMs", since=2023-03-01)` | GPT-4, Claude 3, Gemini 1.5, Llama 3, … with dates and evidence |
| `get_entity("OpenAI", at_date=2024-06-01)` | Org structure, key products, leadership changes over time |
| `verify_claim("GPT-4 Turbo supports 128k context", as_of=2024-04-01)` | Cited release note or blog post |
| `get_freshness("MCP protocol")` | Recent spec changes, SDK releases |
| `search_evidence("EU AI Act high-risk", date_range=2023–2024)` | Legislation timeline with sources |

**Target horizon:** November 2022 (ChatGPT launch) → today. **Minimum floor:** June 2024 (two years).

## Implementation Options

### Option 1: The Spine — Structured backbone first, documents second

Build the entity graph from structured, low-LLM-cost sources; attach narrative evidence later.

**Sources (mostly free APIs):**

- **Wikidata SPARQL** — batch Q-IDs for OpenAI, Anthropic, DeepMind, Meta AI, Mistral, GPT-4, Claude, Llama, Gemini, key people, EU AI Act, etc.
- **Wikidata properties** — inception dates, CEOs, product launches (P577, P169, P178, …) → structured claims with minimal extraction
- **HuggingFace Hub API** — model cards with `createdAt`, pipeline tags, base model lineage
- **PyPI / npm JSON APIs** — release history for `openai`, `anthropic`, `transformers`, `langchain`, `@modelcontextprotocol/sdk`

**New adapters:** `wikidata_entity_batch_v1`, `registry_releases_v1` (PyPI/npm/HF unified)

| Pros | Cons |
| --- | --- |
| High signal-to-noise, cheap, strong external IDs for resolution | Thin on *why* things changed; needs document layer for rich deltas |
| Fast path to `get_entity` working well | |

**LLM burn:** Low (~10–20% of budget for linking/resolution).

---

### Option 2: The Chronicle — Document flood from high-signal technical sources

Ingest dated primary sources across the full timeline; pipeline extracts claims.

**Source catalog:**

| Layer | Sources | Backfill approach | Policy |
| --- | --- | --- | --- |
| Model releases | GitHub releases (expanded repo list), HF model commits | Per-repo history; HF `createdAt` filter | varies per repo |
| Research | arXiv API (`cs.CL`, `cs.AI`, `cs.LG`, `stat.ML`) | `submittedDate` filter 2022-11-01 → now | citation-friendly |
| Lab announcements | OpenAI, Anthropic, Google, Meta, Hugging Face blogs (RSS) | Archive.org Wayback or feed history | usually `summary_allowed` |
| Standards & specs | MCP spec repo, OpenAPI, W3C, IETF drafts | Git tag history | redistribution varies |
| Ecosystem | LangChain, LlamaIndex, Vercel AI SDK, Cursor, etc. | GitHub releases adapter (exists) | per-repo |
| Regulation | EUR-Lex, Federal Register, UK AI white papers | Structured feeds / PDF metadata | `citation_only` typical |

**Expanded GitHub repo seed** (add to `adapter_config.repos`):

```text
openai/openai-python, openai/openai-node, anthropics/anthropic-sdk-python,
google/generative-ai-python, meta-llama/llama, huggingface/transformers,
langchain-ai/langchain, run-llama/llama_index, pydantic/pydantic,
vercel/ai, modelcontextprotocol/specification, modelcontextprotocol/servers,
ggerganov/llama.cpp, ollama/ollama
```

**New adapters:** `arxiv_v1`, `rss_feed_v1`, `mediawiki_revisions_v1` (see Option 3)

| Pros | Cons |
| --- | --- |
| Rich provenance; real `get_delta` and `verify_claim` power | LLM-heavy; needs disciplined batching |
| Matches document-first architecture | |

**LLM burn:** High — primary use of Vertex/GCS/Azure credits.

**Smart credit usage:**

- **Gemini Flash / Groq** — bulk claim extraction
- **Claude / GPT-4** — contradiction resolution and ambiguous merges only
- **Tiered processing:** Tier 1 (release notes, model cards) → full extraction; Tier 2 (arXiv abstracts) → key claims only; Tier 3 (Wikipedia revisions) → diff-summary claims

---

### Option 3: The Archaeologist — Wikipedia revision history

Pull revision history for anchor articles. Each revision = `source_document` with `published_at` = revision timestamp. Diffs between revisions are natural temporal deltas.

**Anchor articles:**

- ChatGPT, GPT-4, Claude (language model), Gemini (language model), Large language model
- Artificial intelligence, AI safety, EU Artificial Intelligence Act
- Model Context Protocol, Retrieval-augmented generation

**API:** MediaWiki `action=query&prop=revisions` with `rvstart`/`rvend` — same family as existing Wikidata adapter.

**Policy:** Wikipedia CC BY-SA — metadata + summaries; `summary_allowed=true`, `redistribution_allowed=false` is a reasonable default.

| Pros | Cons |
| --- | --- |
| Built-in temporal structure; free; no gossip | Lagging indicator (weeks behind reality) |
| Uniquely suited to bitemporal queries | Needs careful wiki-link entity resolution |

**LLM burn:** Medium — extract from revision diffs, not full re-reads.

## Recommended Direction: Hybrid Phased Rollout

```text
Phase 1 (Spine)     → Phase 2 (Chronicle)     → Phase 3 (Archaeologist)     → Phase 4 (ongoing)
Wikidata/HF/PyPI    → GitHub/arXiv/RSS/blogs    → Wikipedia revisions/Wayback   → scheduled ingest
~200–400 LLM calls  → bulk of LLM budget        → medium LLM                  → free tier forever
```

### Phase 1 — Spine (days)

1. SPARQL-export ~500 anchor entities (orgs, models, people, legislation, concepts)
2. Ingest HF model registry + PyPI release JSON for top ~50 packages
3. Run resolve + `write_fact_versions` without full document extraction
4. **Milestone:** `get_entity("Anthropic")` returns structured state

### Phase 2 — Chronicle (2–3 weeks)

1. Add `arxiv_v1` + `rss_feed_v1` adapters
2. Expand GitHub releases to ~50 AI-ecosystem repos
3. Cloud Run **backfill job**: `INGEST_MAX_DOCS_PER_RUN=500`, date-filtered, nightly until caught up
4. Priority queue: release notes → blog posts → arXiv abstracts
5. **Milestone:** `get_delta("frontier LLMs", since=2023-01-01)` returns cited changes

### Phase 3 — Archaeologist (1–2 weeks)

1. `mediawiki_revisions_v1` for 15–20 anchor articles, `rvstart=2022-11-30`
2. Wayback CDX API for blog posts no longer in RSS
3. **Milestone:** `verify_claim(..., as_of=2023-06-01)` works against historical evidence

### Phase 4 — Ongoing

- Existing scheduled ingest (6h Wikidata, daily GitHub) keeps corpus fresh
- Subscriptions on key entities/topics fire on new facts

## Topic Clusters

### In scope — "the agent stack timeline"

| Cluster | Examples | Primary sources |
| --- | --- | --- |
| Frontier models | GPT-3.5/4/4o/o-series, Claude, Gemini, Llama, Mistral, Grok | Releases, HF, lab blogs |
| AI labs & leadership | OpenAI, Anthropic, DeepMind, xAI, Mistral; CEO/CTO changes | Wikidata, press releases |
| Agent infrastructure | MCP, function calling, tool use | Spec repos, SDK releases |
| RAG & memory | Embeddings, vector DBs, context windows | arXiv, GitHub |
| Dev tooling | LangChain, LlamaIndex, Cursor, Copilot, Vercel AI SDK | GitHub releases |
| Regulation & safety | EU AI Act, Biden EO 14110, UK AI Safety Summit | EUR-Lex, gov feeds |
| Benchmarks | MMLU, HumanEval, SWE-bench, GPQA | Papers, leaderboards |
| Open weights | Llama, Mixtral, DeepSeek | HF, GitHub |

### Out of scope

- Celebrity AI drama, startup funding gossip, general TechCrunch noise
- Crypto/NFT unless directly AI-relevant
- Geopolitics unless tied to AI regulation or export controls

## Budget & Credit Playbook

| Resource | Use for | Don't use for |
| --- | --- | --- |
| Vertex / GCS trial | Bulk claim extraction (Flash), Cloud Run backfill | Re-extracting unchanged docs |
| Gemini API | Overflow when Vertex credits thin | Primary if Flash quality insufficient |
| OpenAI / Claude subs | Contradiction adjudication, hard merges, QA spot-checks | Bulk extraction |
| Grok sub | xAI ecosystem, optional second opinion | Primary extractor |
| GitHub Actions | Scheduled incremental ingest (free, public repo) | Multi-hour backfill |
| Scraping credits | Wayback, blog archives | Twitter/X firehose |
| Local fastembed | All embeddings | — |

**Rough math (Phase 2):**

- ~5,000–10,000 unique documents over 3.5 years (after dedup)
- ~1 LLM call per doc for claims ≈ 5,000–10,000 calls total
- At 2,000/day → **5–7 days of extraction** once ingest completes

## Engineering Work

No schema changes required. New adapters behind existing `SourcePort` pattern:

| Adapter | Effort | Unlocks |
| --- | --- | --- |
| `rss_feed_v1` | ~1 day | Lab blogs, standards feeds |
| `arxiv_v1` | ~1 day | Research timeline |
| `mediawiki_revisions_v1` | ~2 days | Wikipedia time machine |
| `wikidata_sparql_batch_v1` | ~1 day | Entity spine bootstrap |
| `registry_releases_v1` (PyPI/npm/HF) | ~2 days | Package/model release history |
| Backfill mode on existing adapters | ~0.5 day | `cursor_state: {"backfill_until": "2022-11-30"}` |

Run backfill via Cloud Run Jobs with env overrides; keep GitHub Actions on 6h incremental cadence.

## Starter Pack: "GPT Era Timeline"

One cohesive narrative thread for the first backfill:

1. **Anchor entity:** `technical_artifact:chatgpt` (Wikidata Q1151600)
2. **Spine facts:** launch date, model versions, API milestones
3. **Documents:** OpenAI blog RSS archive, `openai/openai-python` releases, arXiv papers citing GPT-4
4. **Wikipedia revisions:** `ChatGPT` + `GPT-4` articles from Nov 2022
5. **Relationships:** `organization_published_artifact` (OpenAI → ChatGPT), `person_holds_role` (Altman → CEO)

Repeat for Claude, Gemini, Llama, MCP — five interlocking timeline spines.

## Query Gates

The first proof must pass these query shapes through real REST, SDK, and MCP paths using source
documents, claims, evidence, resolved entities, relationships, and fact versions:

- `get_entity("ChatGPT", at_date="2023-03-01")`
- `get_entity("Claude", at_date="2024-03-01")`
- `get_entity("Gemini", at_date="2024-02-15")`
- `get_entity("Llama", at_date="2024-04-18")`
- `get_freshness("MCP protocol")`
- `get_delta("frontier LLMs", since="2023-03-01")`
- `verify_claim("GPT-4 Turbo supports a 128k context window", as_of="2024-04-01")`
- `search_evidence("EU AI Act high-risk", date_range="2023-01-01/2024-12-31")`

Full-corpus acceptance adds query coverage across open-weight models, agent protocols, RAG and
memory, regulation, inference/runtime infrastructure, benchmarks, and a coverage report grouped by
source class, topic cluster, date range, entity coverage, citation depth, contradiction state, and
review-needed rate. The complete acceptance query set lives in
`docs/architecture/corpus-taxonomy.md`.

## Risks And Constraints

- **LLM budget exhaustion** during bulk backfill — mitigate with tiered extraction and spine-first ordering
- **Source policy violations** — set per-source booleans before ingest; snapshot travels with documents
- **False entity merges** during bootstrap — stay conservative; `needs_review` candidates are acceptable
- **Wikipedia CC BY-SA** — full-text redistribution may require `citation_only` or `summary_allowed` only
- **Adapter gap** — historical depth blocked until backfill adapters ship

## Decision Points

1. **Depth vs breadth:** Full extraction on everything, or spine-first then deepen high-value entities?
2. **Wikipedia policy:** `summary_allowed` only, or pursue full redistribution rights?
3. **arXiv scope:** Abstracts only (cheap) or PDF text (expensive, richer)?
4. **Human review:** Flag ambiguous merges during bootstrap, or stay fully automated?

## Prototype Paths (pick one to start)

| Path | Time | Outcome |
| --- | --- | --- |
| **Fast proof** | 2 days | Expand GitHub repos + run pipeline → immediate `get_delta` on AI SDK releases |
| **Historical proof** | 3–5 days | Build `arxiv_v1` + backfill cs.CL from 2023 → first "what changed since GPT-4" answers |
| **Graph proof** | 2 days | Wikidata SPARQL entity batch → populated entity graph before heavy LLM spend |

## Sources

- `docs/research/2026-05-21-intercal-foundation-report.md`
- `docs/architecture/pipeline.md`
- `docs/architecture/corpus-taxonomy.md`
- `docs/operations/source-policy.md`
- `docs/operations/resource-budget.md`
- `db/seeds/0003_sources.sql`
- `services/shared/src/intercal_shared/source_registry.py`
- `docs/roadmaps/2026-05-21-intercal-plan-02-knowledge-pipeline.md`
