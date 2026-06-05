# Plan 03 W2 — JSON 404 survives prefix mounting (audit pass 2)

Date: 2026-06-05
Type: fix
Packages: @intercal/api

## Summary

Second fresh-context audit of Plan 03 Workstream 2 (`packages/api`). Pass 1 (`eb7edcd`)
landed validation, the error taxonomy, unknown-param rejection, the UUID guard, and CORS.
This pass found one real production defect and fixed it; everything else verified correct.

## Defect

The roadmap claimed (and pass-1 implemented) "JSON 404 for unmatched routes (replaces
Hono's default text/plain)". That held only when the app is the top-level router
(`server.ts`, tests). In production the dashboard mounts the app under a prefix via
`new Hono().route('/api', createApp(db))`, and Hono lets the **parent** router own the
`notFound` fallback — so a sub-app's `notFound` never fires for unmatched `/api/v1/*`.
Live probe of `lntercal.vercel.app/api/v1/notaroute` returned `text/plain 404 Not Found`,
not the JSON `ApiError` the contract declares.

## Fix

### @intercal/api

- `src/app.ts` — added a scoped catch-all `app.all('/v1/*', …)` that returns the JSON
  `ApiError` 404. A matched route fires regardless of mount depth, unlike `notFound`. It is
  deliberately limited to `/v1/*` (the contract surface) so it can never intercept a sibling
  surface mounted under the same prefix — notably the MCP server at `/api/mcp` (Plan 03 W3).
  The existing `app.notFound` JSON handler is retained for the top-level (root-mount) case.
  No change to the dashboard mount; the fix is entirely within `packages/api` and stays
  deploy-agnostic (works at root and under any prefix). No contract/generated artifact touched.

## Tests

`src/app.test.ts` — +3 tests (40 total) under a new "mounted under /api prefix" block that
reproduces the production shape: unknown `/api/v1/*` → JSON 404; a real `/api/v1/entity`
still reaches validation (400, not a swallowed 404); and `/api/mcp` is **not** intercepted
by the scoped catch-all (falls through to the parent).

## Verification

`pnpm --filter @intercal/api` lint (clean) · typecheck · test (40) · build — all pass.
No contract/generated changes, so `contracts:check` is not required.

Live re-probe of `lntercal.vercel.app/api/v1/*` (pre-fix) confirmed the rest of the W2
surface is correct: bad uuid → 400, bare date → 400, unknown param → 400, over/under limit
→ 400, valid → 200, delta/verify → 501. Only the mounted unknown-route shape was wrong;
the local build with this fix returns JSON 404 for unmatched `/api/v1/*` while leaving
`/api/mcp` untouched.
