# Plan 07 W6 + Plan 04 W1 (MCP) — MCP OAuth 2.1 resource server

Date: 2026-06-06
Type: feat
Packages: @intercal/mcp-server, @intercal/dashboard, scripts/dev, docs/operations, .env.example

## Summary

The MCP surface (`/api/mcp`, stateless Streamable HTTP) is now an OAuth 2.1 **resource server** per
the MCP Authorization spec. It validates audience-bound bearer access tokens, publishes RFC 9728
Protected Resource Metadata, and challenges unauthenticated requests with a spec-correct `401` +
`WWW-Authenticate`. The Authorization Server is an external, env-configured integration seam (the
spec puts the AS out of scope). When no AS is configured, the surface keeps its public-read posture
(anonymous reads — MCP auth is OPTIONAL per spec), which is the live default today. No secrets are
held by the resource server (signatures verified against the AS's public JWKS).

> Spec verified (2026-06-05) against the official MCP Authorization spec for `2025-06-18` and
> `2025-11-25`, plus RFC 9728 / 8707 / 8414 / 9068 / OAuth 2.1.

## Changes

- **`@intercal/mcp-server` auth module** (`src/auth/`):
  - `config.ts` — the AS seam. `loadMcpAuthConfig(env)` returns `null` (auth disabled) when
    `MCP_OAUTH_ISSUER` is unset, else a resolved config (canonical resource/audience, issuer(s),
    optional JWKS URI, scopes). Throws on a half-config (issuer set, no determinable audience).
  - `verifier.ts` — `JwksTokenVerifier` implements the SDK's `OAuthTokenVerifier` using `jose`
    (the JOSE lib the MCP SDK already depends on; no hand-rolled crypto): JWS verified against the
    AS's remote JWKS, `iss` + `aud` (RFC 8707 audience binding) + `exp` enforced; failures collapse
    to an opaque `InvalidTokenError`. Optional injected key resolver for offline tests.
  - `metadata.ts` — `buildProtectedResourceMetadata` (RFC 9728: `resource`, `authorization_servers`,
    `scopes_supported`, `bearer_methods_supported: ["header"]`).
  - `resource-server.ts` — `gateMcpRequest` (anonymous when disabled; 401 + `WWW-Authenticate`
    [`resource_metadata`, `scope`] on missing/invalid token; 403 `insufficient_scope` for a valid
    token lacking a scope; authorized otherwise) + `buildWwwAuthenticate`.
  - `index.ts` — `resolveGateDeps(requestUrl, env)` resolves config + a process-cached verifier and
    derives the absolute resource-metadata URL from the request origin.
- **`handleMcpRequest` wiring** (`src/web.ts`): runs the gate first; short-circuits 401/403,
  otherwise proceeds. Gate deps are injectable (tests); production resolves from env + request URL.
- **Well-known PRM routes** (`@intercal/dashboard`):
  `app/.well-known/oauth-protected-resource/route.ts` (root) and `.../api/mcp/route.ts`
  (path-suffixed, 2025-11-25). Serve the document when auth is enabled; `404` (public-read) otherwise.
- **Dependency**: `jose` added to the pnpm catalog (`^6.1.0`, same major as the MCP SDK's copy) and to
  `@intercal/mcp-server`; `@intercal/mcp-server` + `jose` added to root devDeps for the verify script.
- **Live-verify harness** `scripts/dev/verify-mcp-auth.mjs`: drives the real `handleMcpRequest` path
  against a real DB in both modes (local key set stands in for the AS; no secrets printed).
- **Docs** `docs/operations/mcp-auth.md` (durable runbook) + `.env.example` MCP-OAuth seam block.

## Verification

- `pnpm lint` · `pnpm typecheck` (6 pkgs) · `pnpm test` (88 tests; +14 auth unit + 3 web gate) ·
  `pnpm build` (both well-known routes registered) — all clean.
- **Contracts untouched** — MCP auth is transport-level; no TypeSpec change, no regeneration.
- **LIVE** (real Neon DB): `node scripts/dev/verify-mcp-auth.mjs` → **7/7**. Auth-disabled:
  initialize / tools-list / tools-call(get_entity) succeed anonymously. Auth-enabled: PRM resolves,
  no-token → 401 + `WWW-Authenticate(resource_metadata)`, wrong-audience token → 401 (RFC 8707),
  valid token → tools/call authorized. **LIVE HTTP**: both `/.well-known/oauth-protected-resource`
  and `.../api/mcp` return the PRM document. No token/secret value written to any tracked file/output.

## Notes

- Posture mirrors REST (`docs/operations/auth-and-rate-limits.md`): public-read by default, OAuth
  raises identity/scope; a presented-but-bad credential is a hard 401, never a silent anonymous
  downgrade. "Disabled" is the absence of a wired AS, not a bypass — no path accepts an invalid token.
- Statelessness preserved: JWKS verifier cached per cold start; serverless-safe Streamable HTTP mount.
- The SDK's `requireBearerAuth` is Express-coupled; the Web-standard gate here matches its semantics
  and the spec examples verbatim while fitting the Next.js/Web-standard route.
- Deferred (explicit seam, not faked): the external Authorization Server itself (token issuance,
  RFC 7591/CIMD client registration, RFC 8414 AS metadata) — wired via `MCP_OAUTH_*` env when an AS
  is provisioned; per-principal MCP rate limiting/usage events can attach at the resolved-principal seam.
