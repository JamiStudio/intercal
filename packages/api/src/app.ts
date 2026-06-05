import {
  type Db,
  getDelta,
  getEntity,
  getFreshness,
  getSources,
  IntercalError,
  InvalidRequestError,
  searchEvidence,
  verifyClaim,
} from '@intercal/core';
import { getOpenApiDocument } from '@intercal/shared';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { formatErrors, validatorFor } from './validation.js';

/** Error code → HTTP status. Unmapped codes fall back to 500 (see `statusFor`). */
const STATUS: Record<string, number> = {
  invalid_request: 400,
  not_found: 404,
  not_implemented: 501,
  internal_error: 500,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorBody(code: string, message: string, details?: Record<string, unknown>) {
  return { code, message, ...(details ? { details } : {}) };
}

function statusFor(code: string): number {
  return STATUS[code] ?? 500;
}

/**
 * A per-route validation guard that runs after the contract schema passes but before the query
 * layer is called. Throw an `IntercalError` (e.g. `InvalidRequestError`) to short-circuit with a
 * mapped status; the central error handler renders it. Used where the contract type is broader
 * than what the read layer can accept (e.g. a generic-string id that must be a UUID at the DB).
 */
type Guard = (params: Record<string, unknown>) => void;

/** Build a query-param-validated GET handler bound to a core query function. */
function route<P>(
  db: Db,
  inputModel: string,
  fn: (db: Db, params: P) => Promise<unknown>,
  guard?: Guard,
) {
  const validate = validatorFor(inputModel);
  return async (c: Context): Promise<Response> => {
    const params: Record<string, unknown> = { ...c.req.query() };
    if (!validate(params)) {
      return c.json(
        errorBody('invalid_request', 'Invalid query parameters', formatErrors(validate)),
        400,
      );
    }
    guard?.(params);
    const result = await fn(db, params as P);
    return c.json(result as Record<string, unknown>, 200);
  };
}

/**
 * `entity_or_claim_id` must be a UUID: the core query uses it as a Postgres UUID column value.
 * The contract declares it as a generic `string` (no `format: uuid` — the TypeSpec parameter is a
 * generic ID), so Ajv does not enforce this. A non-UUID would otherwise reach the DB and surface
 * as a 500 ("invalid input syntax for type uuid"); guard at the REST boundary with a clear 400.
 */
const sourcesGuard: Guard = (params) => {
  const id = params.entity_or_claim_id as string;
  if (!UUID_RE.test(id)) {
    throw new InvalidRequestError('entity_or_claim_id must be a UUID (entity ID or claim ID)');
  }
};

export function createApp(db: Db): Hono {
  const app = new Hono();

  // Central error taxonomy: every thrown error becomes a JSON ApiError with a mapped status,
  // so the surface never leaks a stack trace or Hono's default text/plain 500. Route handlers
  // therefore throw instead of catching — one error path for both the query layer and guards.
  app.onError((err, c) => {
    if (err instanceof IntercalError) {
      return c.json(errorBody(err.code, err.message, err.details), statusFor(err.code) as 500);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json(errorBody('internal_error', message), 500);
  });

  // The V1 surface is agent-facing and read-only; allow cross-origin GETs so browser-based
  // SDK/agent clients can call it directly. Auth + tighter origin policy are Plan 04.
  app.use('/v1/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/openapi.json', (c) => c.json(getOpenApiDocument()));

  app.get('/v1/delta', route(db, 'DeltaQuery', getDelta));
  app.get('/v1/entity', route(db, 'EntityQuery', getEntity));
  app.get('/v1/evidence', route(db, 'EvidenceQuery', searchEvidence));
  app.get('/v1/claims/verify', route(db, 'VerifyClaimQuery', verifyClaim));
  app.get('/v1/sources', route(db, 'SourcesQuery', getSources, sourcesGuard));
  app.get('/v1/freshness', route(db, 'FreshnessQuery', getFreshness));

  // Unknown route on the contract surface (`/v1/*`) → JSON ApiError 404. This is a real matched
  // route, not `app.notFound`, on purpose: in production the dashboard mounts this app under a
  // prefix via `new Hono().route('/api', createApp(db))`, and Hono lets the PARENT own the
  // `notFound` fallback — so a sub-app's `notFound` never fires for unmatched `/api/v1/*` and the
  // surface would leak Hono's default text/plain `404 Not Found`. A scoped wildcard fires
  // regardless of mount depth. It is deliberately limited to `/v1/*` so it can never intercept a
  // sibling surface mounted under the same prefix (e.g. the MCP server at `/api/mcp`).
  app.all('/v1/*', (c) => c.json(errorBody('not_found', 'Route not found'), 404));

  // When the app is the top-level router (local `server.ts`, tests), `notFound` still renders a
  // JSON ApiError for any unmatched path instead of Hono's default text/plain 404.
  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404));

  return app;
}
