/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP resource server.
 *
 * The MCP Authorization spec REQUIRES the MCP server to publish this document so clients can
 * discover the Authorization Server(s) that issue tokens for it. It is served at the well-known
 * path `/.well-known/oauth-protected-resource` (root) and, per the 2025-11-25 spec, also at the
 * path-suffixed location for the MCP endpoint (`/.well-known/oauth-protected-resource/api/mcp`).
 *
 * The document is fully public (no secrets): `resource` is this server's canonical identifier,
 * `authorization_servers` are public issuer URLs, and `scopes_supported` advertises the read scope.
 */
import type { OAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { McpAuthConfig } from './config.js';

/**
 * Build the RFC 9728 Protected Resource Metadata document from the resolved resource-server config.
 * `bearer_methods_supported: ['header']` reflects that tokens arrive in the `Authorization` header
 * only (the spec forbids tokens in the query string).
 */
export function buildProtectedResourceMetadata(
  config: McpAuthConfig,
): OAuthProtectedResourceMetadata {
  return {
    resource: config.resource,
    authorization_servers: config.authorizationServers as [string, ...string[]],
    scopes_supported: config.scopesSupported,
    bearer_methods_supported: ['header'],
    resource_name: 'Intercal MCP',
  };
}
