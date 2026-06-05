import { createApp } from '@intercal/api';
import { createDb, loadConfig } from '@intercal/core';
import { Hono } from 'hono';
import { handle } from 'hono/vercel';

// Mount the Hono REST API (and OpenAPI) into the Next.js app so the dashboard, API, and MCP
// live on one Vercel domain: UI at `/`, API at `/api/v1/*`, OpenAPI at `/api/openapi.json`.
// pg needs the Node runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let app: Hono | null = null;
function getApp(): Hono {
  if (!app) {
    const db = createDb(loadConfig().databaseUrl);
    app = new Hono().route('/api', createApp(db));
  }
  return app;
}

export const GET = (req: Request) => handle(getApp())(req);
export const POST = (req: Request) => handle(getApp())(req);
