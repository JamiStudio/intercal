/** @intercal/mcp-server — build an MCP server bound to the shared query layer. */
export {
  buildProtectedResourceMetadata,
  type GateDeps,
  type GateResult,
  gateMcpRequest,
  JwksTokenVerifier,
  loadMcpAuthConfig,
  MCP_READ_SCOPE,
  type McpAuthConfig,
  type McpAuthEnv,
  type McpPrincipal,
  resolveGateDeps,
} from './auth/index.js';
export { buildMcpServer } from './server.js';
export { handleMcpRequest } from './web.js';
