import { buildProtectedResourceMetadata, loadMcpAuthConfig } from '@intercal/mcp-server';

// OAuth 2.0 Protected Resource Metadata (RFC 9728) at the PATH-SUFFIXED well-known location for the
// MCP endpoint, i.e. `/.well-known/oauth-protected-resource/api/mcp` for an MCP server at
// `/api/mcp`. The MCP Authorization spec (2025-11-25) directs clients to probe this path-suffixed
// URI before the root, so a server hosting multiple protected resources can disambiguate per-path.
// We serve the same document at both locations (Intercal exposes a single MCP resource).
//
// Returns 404 when no Authorization Server is configured (public-read posture; nothing to discover).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const config = loadMcpAuthConfig();
  if (!config) {
    return new Response(
      JSON.stringify({ error: 'not_found', message: 'No OAuth-protected resource configured.' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    );
  }
  return Response.json(buildProtectedResourceMetadata(config), {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
