/**
 * MCP OAuth 2.1 resource-server auth (Plan 07 W6).
 *
 * The MCP server is an OAuth 2.1 RESOURCE SERVER: it publishes Protected Resource Metadata
 * (RFC 9728), challenges unauthenticated requests with `WWW-Authenticate`, and validates
 * audience-bound bearer access tokens (RFC 8707 / RFC 9068) issued by an external Authorization
 * Server. The AS is the configurable integration seam ({@link loadMcpAuthConfig}); when unset, the
 * surface keeps its public-read posture (anonymous reads allowed — MCP auth is OPTIONAL per spec).
 */
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import {
  loadMcpAuthConfig,
  MCP_READ_SCOPE,
  type McpAuthConfig,
  type McpAuthEnv,
} from './config.js';
import { buildProtectedResourceMetadata } from './metadata.js';
import { type GateDeps, gateMcpRequest } from './resource-server.js';
import { JwksTokenVerifier } from './verifier.js';

export {
  buildWwwAuthenticate,
  type GateResult,
  type McpPrincipal,
} from './resource-server.js';
export { JwksTokenVerifier } from './verifier.js';
export type { GateDeps, McpAuthConfig, McpAuthEnv };
export { buildProtectedResourceMetadata, gateMcpRequest, loadMcpAuthConfig, MCP_READ_SCOPE };

/**
 * Resolve the resource-server gate dependencies for a request, from the environment.
 *
 * - Reads {@link loadMcpAuthConfig} (the AS seam). When no AS is configured, returns a disabled gate
 *   (`config`/`verifier` null → anonymous). When configured, builds a {@link JwksTokenVerifier}.
 * - `requestUrl` is the incoming request URL, used to derive the absolute Protected Resource Metadata
 *   URL placed in the 401 `WWW-Authenticate` challenge (same origin, well-known path).
 *
 * The verifier is cached per process (keyed by the resolved resource) so the JWKS set is created
 * once per cold start, not per request — serverless-safe.
 */
let cached: { resource: string; verifier: OAuthTokenVerifier } | null = null;

export function resolveGateDeps(requestUrl: string, env?: McpAuthEnv): GateDeps {
  const config = loadMcpAuthConfig(env);
  const origin = new URL(requestUrl).origin;
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;
  if (!config) return { config: null, verifier: null, resourceMetadataUrl };

  if (!cached || cached.resource !== config.resource) {
    cached = { resource: config.resource, verifier: new JwksTokenVerifier(config) };
  }
  return { config, verifier: cached.verifier, resourceMetadataUrl };
}
