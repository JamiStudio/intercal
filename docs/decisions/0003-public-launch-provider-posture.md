# 0003 - Public Launch Provider Posture

Status: **Accepted** - 2026-06-07

Refines: 0002 with the Workstream 9 release audit result.

## Decision

Intercal launches publicly at `https://intercal.jami.studio` on the existing Vercel project. The
repository keeps Vercel as the velocity host for the dashboard, REST, OpenAPI, and MCP surfaces
while Cloudflare remains DNS/R2/control-plane infrastructure.

An Intercal-owned apex domain is future work. It should be purchased and cut over only after the
current subdomain proves product value and the cutover has its own DNS/TLS/redirect checklist.

Cloudflare Workers or Pages compute is a later provider-swap proof, not a launch prerequisite. That
proof needs its own decision record because it must validate runtime behavior, trusted client-IP
headers for rate limiting, Next.js/static asset routing, Hono mount shape, MCP Streamable HTTP
behavior, Node/Postgres compatibility, and deployment rollback.

## Release audit findings

- The REST app remains a Hono app factory in `packages/api` and is mounted in the Next.js route with
  `hono/vercel`. That import is the current Vercel mount adapter, not duplicated API semantics.
- MCP remains a shared query-layer server over standard Streamable HTTP. The Next.js route is the
  current same-origin mount; `packages/mcp-server/src/http.ts` keeps a standalone Node path.
- The dashboard server-side SDK client uses `VERCEL_URL` as an implicit same-deployment fallback
  when `PUBLIC_API_BASE_URL` is not set. This is acceptable for Vercel previews and production, and
  a future host can set `PUBLIC_API_BASE_URL` explicitly.
- REST anonymous rate limiting currently trusts Vercel-managed `x-real-ip` /
  `x-forwarded-for` semantics. This is acceptable for the current Vercel launch, but any Cloudflare
  compute move must re-prove the trusted-header model before production traffic uses it.
- Object storage is still provider-swappable behind `StoragePort` and the S3-compatible adapter.
  Workstream 9 pass 3 verified Cloudflare R2 bucket proof through Wrangler: account `jami-studio`
  (`c294df364db8742bc02db57c046043ef`) contains bucket `intercal`, created
  `2026-06-05T01:59:17.083Z`, in location `ENAM`, default storage class `Standard`, with 78 objects
  and 90.3 kB. That proves live bucket presence and control-plane access; it does not claim a fresh
  source-document object write/read smoke through the S3 adapter.
- Public pages and docs use citation metadata, coverage states, and policy-allowed snippets. They do
  not add a dashboard-only raw source body route.
- Public marketing language remains bounded to the reviewed broad AI-history proof slice and the
  implemented REST/MCP V1 query surface; it does not claim continuous full-web saturation.

## Consequences

- Launch closeout should not block on buying an Intercal-owned domain.
- Launch closeout should not block on moving compute to Cloudflare.
- Provider portability claims should distinguish adapter-backed dependencies from front-door compute
  proof work. Storage, queue/cache, LLM, embeddings, and database swaps are port/config changes;
  compute swaps are deploy-target proofs with host-specific headers and routing to validate.
- Future Cloudflare compute work should supersede or extend this record only after live proof, not
  by editing release-audit prose into a migration plan.
