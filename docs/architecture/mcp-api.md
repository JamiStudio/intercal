# MCP & API Surface

The agent-facing contract. MCP and REST expose the **same V1 query semantics** through one
shared query layer (`@intercal/core`); they never diverge.

## Contract source

**TypeSpec (`packages/shared/typespec/main.tsp`) is the single source of truth.** It compiles
to OpenAPI 3.1 + per-model JSON Schema, from which TypeScript types and Pydantic models are
generated (`pnpm contracts:build`; drift-guarded by `pnpm contracts:check`). The REST API
validates requests against the JSON Schema; the MCP server uses the **same** JSON Schemas as
tool input schemas. No hand-written, drift-prone duplicate.

## V1 tools / endpoints

| Tool (MCP) | REST | Input schema | Status |
| --- | --- | --- | --- |
| `get_entity` | `GET /v1/entity` | `EntityQuery` | implemented (read) |
| `get_sources` | `GET /v1/sources` | `SourcesQuery` | implemented (read) |
| `get_freshness` | `GET /v1/freshness` | `FreshnessQuery` | implemented (read) |
| `search_evidence` | `GET /v1/evidence` | `EvidenceQuery` | implemented (read) |
| `get_delta` | `GET /v1/delta` | `DeltaQuery` | implemented (token-budgeted cited digest, Plan 03 W5) |
| `verify_claim` | `GET /v1/claims/verify` | `VerifyClaimQuery` | implemented (deterministic cited verdict, Plan 03 W6) |

`verify_claim` returns a deterministic, fully-cited verdict for a free-text claim: a `verdict`
(`supported` / `partially_supported` / `contradicted` / `unverified`), a `confidence`, and
`supportingEvidence` + `contradictingEvidence` citation lists. Candidates are retrieved by lexical
FTS over `claims.normalized_text` (the same leg `get_delta` uses) and classified by the substrate's
own recorded contradictions (`claim_contradictions` / `contradiction_status`) plus deterministic
polarity over overlapping content. `as_of_date` evaluates the bitemporal state at that date
(transaction + valid time); the response is token-budgeted. No on-topic evidence → `unverified`
with confidence 0 (never invented support). No LLM is in the path (same `LlmPort` prose-polish seam
as `get_delta`, which may only rephrase already-cited content).

`get_delta` returns a deterministic, fully-cited, token-bounded digest of what changed about a
topic since a cutoff: changes are found by **transaction time** (claims `created_at`, relationships
`recorded_at`, entities `last_updated_at`) in `(since, until]`, scoped by resolved entity or claim
text, ranked most-recent/most-confident first, and trimmed to `token_budget` with an
included/omitted + coverage report. Every digest line traces to a source document; no LLM is in the
path (a provider-backed prose-polish seam behind `LlmPort` is deferred and may only rephrase
already-cited content).

Later tools (`get_relationships`, `get_timeline`, `get_briefing`, `subscribe`, `submit_source`,
`submit_correction`, `propose_merge`, `export_subgraph`) are added in later plans against the
same contract.

## Transports & auth

- **MCP:** Streamable HTTP is the transport. On the deployment it is **mounted at `/api/mcp`** on
  the one Vercel domain (Next.js App Router route `packages/dashboard/app/api/mcp/route.ts`, Node
  runtime) via `handleMcpRequest` (`packages/mcp-server/src/web.ts`), built on the SDK's
  `WebStandardStreamableHTTPServerTransport` — **stateless** (`sessionIdGenerator: undefined`,
  `enableJsonResponse: true`): a fresh server + transport per request, no per-session state, safe
  on serverless. A standalone Node server (`http.ts`) and stdio (`stdio.ts`) remain for local /
  Cloud Run / embedded use. (HTTP+SSE is deprecated upstream and not used.) Spec baseline
  **2025-11-25**, official `@modelcontextprotocol/sdk`. OAuth 2.1 resource-server auth is added
  for the public deployment in the operations plan (Plan 07 W6) — currently a clean, open seam.
- **REST:** Hono app (`packages/api`), `/openapi.json` served from the generated document,
  `/health` for probes. API-key auth (hashed, scoped — `api_keys` table) is wired in Plan 04.

## Error shape

All errors use the contract `ApiError` (`code`, `message`, `details?`). `@intercal/core` maps
domain errors to codes: `not_found` → 404, `invalid_request` → 400, `not_implemented` → 501.
MCP has no HTTP status, so the same codes are surfaced on the tool result: `isError: true` with
`structuredContent.code` (and the `code: message` text), keeping structured failures (`not_found`,
`invalid_request`) clearly distinguishable from a real internal error. (No V1 tool returns
`not_implemented` any more — both synthesis bodies, `get_delta` and `verify_claim`, are live.)
