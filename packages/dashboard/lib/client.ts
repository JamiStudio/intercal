import { IntercalClient } from '@intercal/sdk';

/**
 * Server-side API client. The dashboard reads through the same contract agents use.
 * Base URL resolution: explicit env → the unified `/api` mount on the current Vercel
 * deployment → local dev fallback.
 */
function resolveBaseUrl(): string {
  if (process.env.PUBLIC_API_BASE_URL) return process.env.PUBLIC_API_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api`;
  return 'http://localhost:3000/api';
}

export function apiClient(options: { apiKey?: string } = {}): IntercalClient {
  return new IntercalClient({ baseUrl: resolveBaseUrl(), apiKey: options.apiKey });
}
