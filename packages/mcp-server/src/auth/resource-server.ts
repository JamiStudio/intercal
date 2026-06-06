/**
 * OAuth 2.1 resource-server gate for the MCP Streamable HTTP endpoint (`/api/mcp`).
 *
 * This is the request-level enforcement the MCP Authorization spec assigns to a resource server.
 * It runs BEFORE the JSON-RPC handler and decides one of three outcomes:
 *
 *   1. Auth disabled (no AS configured) → ANONYMOUS. The public-read posture: the surface stays
 *      open, exactly as it is live today. (MCP authorization is OPTIONAL per spec.)
 *   2. Auth enabled + a valid, audience-bound, in-scope bearer token → AUTHORIZED (the `AuthInfo`).
 *   3. Auth enabled + missing/invalid token or insufficient scope → a short-circuit `Response`:
 *        - 401 with `WWW-Authenticate: Bearer ... resource_metadata="…", scope="…"` (RFC 9728 §5.1)
 *        - 403 `error="insufficient_scope"` for a valid token lacking a required scope (RFC 6750 §3.1)
 *
 * Posture choice (enabled mode): a presented-but-bad credential is a hard 401 — it is NOT silently
 * downgraded to anonymous. This mirrors the REST surface (`docs/operations/auth-and-rate-limits.md`)
 * and the spec, which require a 401 for an invalid/expired token. When the operator wires an AS,
 * tokens are REQUIRED on the tool surface (an anonymous request gets the 401 challenge that bootstraps
 * the OAuth flow). The plan's public-read posture lives in the AUTH-DISABLED mode (no AS yet).
 *
 * The `WWW-Authenticate` value is built by hand (the SDK's `requireBearerAuth` is Express-coupled;
 * this route is Web-standard / Next.js), but its semantics match the SDK and the spec examples
 * verbatim, including the 401 `resource_metadata`/`scope` parameters and the 403 `insufficient_scope`
 * challenge.
 */
import { parseBearer } from '@intercal/core';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpAuthConfig } from './config.js';

/** The principal resolved for an MCP request once the gate has run. */
export type McpPrincipal = { kind: 'anonymous' } | { kind: 'authorized'; auth: AuthInfo };

/** Either continue (with the resolved principal) or short-circuit with an OAuth error Response. */
export type GateResult = { ok: true; principal: McpPrincipal } | { ok: false; response: Response };

/** Quote a value for an `auth-param` (RFC 7235); our values are URLs/scopes with no quotes. */
function quote(value: string): string {
  return `"${value.replace(/"/g, '')}"`;
}

/**
 * Build a `WWW-Authenticate: Bearer` challenge per RFC 6750 / RFC 9728. `resourceMetadataUrl`
 * points clients at the Protected Resource Metadata document (how they discover the AS); `scope`
 * advertises the scopes that satisfy the request (spec SHOULD); `error`/`error_description` are
 * included for invalid-token and insufficient-scope cases.
 */
export function buildWwwAuthenticate(opts: {
  resourceMetadataUrl: string;
  scope?: string;
  error?: 'invalid_token' | 'insufficient_scope';
  errorDescription?: string;
}): string {
  const params: string[] = [];
  if (opts.error) params.push(`error=${quote(opts.error)}`);
  if (opts.errorDescription) params.push(`error_description=${quote(opts.errorDescription)}`);
  if (opts.scope) params.push(`scope=${quote(opts.scope)}`);
  params.push(`resource_metadata=${quote(opts.resourceMetadataUrl)}`);
  return `Bearer ${params.join(', ')}`;
}

function errorResponse(
  status: 401 | 403,
  oauthError: 'invalid_token' | 'insufficient_scope',
  description: string,
  config: McpAuthConfig,
  resourceMetadataUrl: string,
): Response {
  const scope = config.requiredScopes.join(' ') || config.scopesSupported.join(' ');
  return new Response(JSON.stringify({ error: oauthError, error_description: description }), {
    status,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': buildWwwAuthenticate({
        resourceMetadataUrl,
        scope: scope || undefined,
        error: oauthError,
        errorDescription: description,
      }),
    },
  });
}

export interface GateDeps {
  config: McpAuthConfig | null;
  verifier: OAuthTokenVerifier | null;
  /** Absolute URL of this server's Protected Resource Metadata document (for the 401 challenge). */
  resourceMetadataUrl: string;
}

/**
 * Run the resource-server gate against an incoming MCP request.
 *
 * Returns `{ ok: true, principal }` to proceed, or `{ ok: false, response }` to short-circuit with
 * an OAuth 401/403. When auth is disabled (`config` null) the principal is always `anonymous`.
 */
export async function gateMcpRequest(request: Request, deps: GateDeps): Promise<GateResult> {
  const { config, verifier, resourceMetadataUrl } = deps;

  // Mode 1: auth disabled → anonymous public-read posture (no AS wired yet).
  if (!config || !verifier) return { ok: true, principal: { kind: 'anonymous' } };

  // Mode 2/3: auth enabled. A token is required on the tool surface.
  const raw = parseBearer(request.headers.get('authorization'));
  if (!raw) {
    return {
      ok: false,
      response: errorResponse(
        401,
        'invalid_token',
        'Authorization required: present a Bearer access token issued by the configured authorization server.',
        config,
        resourceMetadataUrl,
      ),
    };
  }

  let auth: AuthInfo;
  try {
    auth = await verifier.verifyAccessToken(raw);
  } catch (err) {
    const description = err instanceof Error ? err.message : 'Invalid access token.';
    return {
      ok: false,
      response: errorResponse(401, 'invalid_token', description, config, resourceMetadataUrl),
    };
  }

  // Scope enforcement (403 insufficient_scope): a valid token that lacks a required scope.
  if (config.requiredScopes.length > 0) {
    const has = config.requiredScopes.every((s) => auth.scopes.includes(s));
    if (!has) {
      return {
        ok: false,
        response: errorResponse(
          403,
          'insufficient_scope',
          `Token is missing a required scope: ${config.requiredScopes.join(' ')}`,
          config,
          resourceMetadataUrl,
        ),
      };
    }
  }

  return { ok: true, principal: { kind: 'authorized', auth } };
}
