import { buildProtectedResourceMetadata, loadMcpAuthConfig } from '@intercal/mcp-server';

// OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP resource server, served at the
// well-known ROOT path. The MCP Authorization spec REQUIRES this document when the server is a
// protected resource; clients fetch it (via the 401 `WWW-Authenticate` challenge or by probing the
// well-known path) to discover the Authorization Server(s) that issue tokens for `/api/mcp`.
//
// When no Authorization Server is configured (`MCP_OAUTH_ISSUER` unset), the MCP surface runs in its
// public-read posture (anonymous reads, no OAuth) and there is no AS to advertise — so this returns
// 404, the correct "no protected-resource metadata here" signal. Wiring an AS (env only) turns it on.
//
// Node runtime (consistent with the sibling API/MCP routes) and no caching of the metadata.
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
