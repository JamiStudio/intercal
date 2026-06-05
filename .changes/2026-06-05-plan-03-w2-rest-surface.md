# Plan 03 W2 — REST API surface hardened

Date: 2026-06-05
Type: feature
Packages: @intercal/api

## Summary

Workstream 2 of Plan 03 (Agent Surface): hardens the Hono REST surface
(`packages/api`, live at `/api/v1/*`) to completeness and cohesion. All six V1 routes
were already wired against the shared `@intercal/core` query layer (W1); this loop adds
input validation against the TypeSpec contract, a consistent error taxonomy, unknown-param
rejection, a UUID boundary guard, CORS for browser clients, and JSON 404/500 handling.
`get_delta` / `verify_claim` continue to return `501 not_implemented` via the core
`NotImplementedError` seams — those bodies are the W5/W6 deliverables, honestly deferred.

## Changes

### @intercal/api

- `src/validation.ts` — `validatorFor` now compiles each generated query schema with
  `additionalProperties: false` injected onto a **clone** (the shared generated artifact is
  never mutated; `$id` is stripped to avoid Ajv double-registration). Off-contract query
  params are now a hard `400 invalid_request`. `formatErrors` renders the
  `additionalProperties` violation as `unknown query parameter: <name>`.
- `src/app.ts` — central error taxonomy via `app.onError`: every thrown error becomes a
  JSON `ApiError` with a mapped status (400 invalid_request · 404 not_found ·
  501 not_implemented · 500 internal_error), so the surface never leaks a stack trace or
  Hono's default `text/plain`. Route handlers now throw instead of catching — one error
  path for both the query layer and per-route guards.
- `src/app.ts` — `route()` gained an optional post-validation `Guard`. The `entity_or_claim_id`
  UUID guard (previously a duplicated `sourcesRoute` with its own try/catch) is now a
  `sourcesGuard` on the shared `route`, removing the duplicate error-handling path. A
  non-UUID id returns `400` instead of leaking the DB-level
  `500 invalid input syntax for type uuid`.
- `src/app.ts` — CORS (`hono/cors`) on the read-only `/v1/*` surface (`origin: *`,
  GET/OPTIONS) for browser-based SDK/agent clients. Auth + rate limits are Plan 04 — left
  as clean seams, not implemented here.
- `src/app.ts` — JSON 404 for unmatched routes (carried over from WIP); `/health` and
  `/openapi.json` unchanged.

## Tests

`src/app.test.ts` — 37 HTTP-layer tests (request-validation only; null DB since every
covered path fails validation, throws `NotImplementedError`, or is served without a DB
call). Added coverage for unknown-param rejection (400) and CORS (allow-origin header +
OPTIONS preflight 204). Existing date-time / limit-bound / required-param / 501 / 404 /
UUID-guard coverage retained.

## Verification

`pnpm lint` (clean), `pnpm typecheck` (6 packages), `pnpm test` (api 37 + core 12),
`pnpm build` (incl. dashboard) — all pass. No contract/generated changes, so
`contracts:check` is not required.

### Live verification

Probed the deployed surface (`lntercal.vercel.app/api/v1/*`) and a local run on the Neon
branch with valid + invalid inputs. The deployed (pre-W2) API confirmed the two real
defects this loop fixes: `sources` with a non-UUID id returned
`500 invalid input syntax for type uuid`, and unknown query params were silently accepted
(`freshness?...&bogus=1` → 200). The hardened local build returns `400` for both, `200`
for valid `entity`/`sources`(UUID), `501` for `delta`/`claims/verify`, `404` JSON for
unknown routes, and a `204` CORS preflight with `access-control-allow-*` headers — all
against real production data on Neon.
