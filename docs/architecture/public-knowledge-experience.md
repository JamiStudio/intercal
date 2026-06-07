# Public Knowledge Experience

The dashboard is the read-only human product surface for Intercal. It does not own a separate
knowledge model: public pages read through the SDK, the generated V1 contracts, or the same
`@intercal/core` read-side functions used by REST and MCP.

## Route Ownership

The first public product slice in `packages/dashboard/app` includes:

| Route | Data owner | Behavior |
| --- | --- | --- |
| `/` | Dashboard shell plus SDK links | Public application overview and entry points. |
| `/entity`, `/entity/[name]` | SDK `getEntity` | Entity facts, relationships, freshness, and claim evidence links. |
| `/claim/[id]` | SDK `getSources` | Claim-level source-document citation path. |
| `/topic`, `/topic/[name]` | SDK `getFreshness`, `getDelta`, `searchEvidence` | Topic freshness, timeline-style changed claims, and evidence search. |
| `/search` | SDK `searchEvidence` | Policy-gated evidence search by query and date window. |
| `/delta` | SDK `getDelta` | Token-bounded cited briefing for changes since a cutoff. |
| `/verify` | SDK `verifyClaim` | Cited claim verification with explicit unsupported/contradicted states. |
| `/freshness` | SDK `getFreshness` | Recency, coverage, and unknown-topic states. |
| `/coverage` | `@intercal/core` corpus quality report | Public coverage gate snapshot and failed-check gaps. |
| `/feedback` | SDK `submitFeedback` | Creates audited review records; no canonical graph mutation. |
| `/operator` | `@intercal/core` observability/audit/read tables | Auth-gated read-only operations console. |

`/api/v1/*`, `/api/openapi.json`, and `/api/mcp` remain the contracted REST/OpenAPI/MCP surfaces
mounted by the Next app. The dashboard must not hand-edit generated contracts or invent UI-only
data to fill a missing route.

## Evidence And Source Policy

Public pages may display:

- structured claims returned by the query layer;
- citation metadata (`sourceDocumentId`, URL, published date);
- derived snippets only when `searchEvidence` returns them after source-policy gating;
- explicit unknown, unavailable, stale, thin, or gap states.

Public pages must not display raw source bodies. Source-policy enforcement remains in ingestion and
`@intercal/core`; dashboard code should consume the served shape rather than reimplementing policy.

## Operator Boundary

The operator route is read-only and locked unless an operator credential is configured and supplied.
It reads existing observability views, review records, and audit events. It does not issue keys,
transition reviews, mutate source policy, or write graph data. Those actions remain owned by the
ops CLI, audited API paths, or later operator-console work.

## Remaining Workstream 5 Gaps

The current slice materially replaces the thin dashboard shell, but it is not the complete
interactive experience. The next Workstream 5 pass should add:

- dedicated source and evidence detail routes once the public contract exposes direct lookup by
  source-document id;
- richer graph/timeline controls for point-in-time comparison, confidence overlays, contradictions,
  and source-origin grouping;
- subscription management UI using the existing authenticated subscription endpoints;
- operator review transitions and source-policy actions behind the audited operator boundary;
- deeper accessibility/browser coverage for data-heavy states.
