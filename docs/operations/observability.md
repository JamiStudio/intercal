# Observability

Plan 04 Workstream 6 exposes operator-visible health, quality, usage, freshness, and provider
budget state from SQL-owned views plus one append-only provider usage table.

## Operator Command

```powershell
pnpm ops:health
pnpm ops:health --section sources
pnpm ops:health --section freshness
pnpm ops:health --section failures
pnpm ops:health --section usage --json
pnpm ops:health --section providers
```

The CLI reads `DATABASE_URL` from the shell first, then `.env`. It never prints the connection URL or
provider credentials. `--print-sql` shows the read-only queries it runs.

## SQL Views

Migration `db/migrations/0030_observability.sql` owns these read-side surfaces:

| View | Backing state | Purpose |
| --- | --- | --- |
| `observability_source_health` | `sources`, `ingestion_runs` | Per-source latest run, failures, new/error document counts, due/paused/degraded state. |
| `observability_failed_jobs` | `ingestion_runs`, `subscription_notifications`, `subscription_delivery_logs` | Failed ingestion and subscription delivery jobs with safe diagnostics. |
| `observability_pipeline_metrics` | core graph, extraction, resolution, digest, review, queue, audit tables | Rollups for ingestion, extraction, claims, resolution, merge/split, embeddings, digest cache, queue, review, and audit state. |
| `observability_usage_latency` | `usage_events` | API/MCP request counts, errors, average/p95 latency, and token-budget usage by hour/tool. |
| `observability_freshness` | sources plus document/claim/fact/digest timestamps | Source and aggregate freshness/age checks. |
| `observability_provider_consumption` | `provider_usage_events`, `observability_provider_budget_allowances` | Provider consumption versus `docs/operations/resource-budget.md` allowances. |

## Provider Usage

`provider_usage_events` is append-only operational telemetry. It accepts real provider measurements
from billing exports, provider APIs, or adapter-owned counters:

```sql
INSERT INTO provider_usage_events (
  provider,
  allowance_key,
  metric_name,
  metric_unit,
  quantity,
  period_start,
  period_end,
  source
) VALUES (
  'upstash',
  'commands_month',
  'commands',
  'commands',
  1234,
  date_trunc('month', now()),
  now(),
  'operator import'
);
```

Do not insert guessed provider usage. If a provider metric is not available yet, leave it absent; the
provider consumption view reports `unavailable` with a reason instead of treating missing telemetry as
zero.

Budget allowance rows are initialized from `docs/operations/resource-budget.md`. Drift-prone provider
limits must be re-verified against provider docs/consoles before changing those rows in durable docs or
shared environments.

## Current Coverage

Available from existing state:

- source health and ingestion failures from `sources` / `ingestion_runs`
- extraction volume from `source_documents` and `document_chunks`
- claim quality from claim counts, statuses, missing evidence, and contradictions
- resolution and merge/split state from entity-resolution candidates and merge events
- embedding coverage for documents, chunks, entities, and claims
- digest cache size and stale entries
- subscription outbox/backoff failures and queue depth
- REST/MCP latency/error/token telemetry from `usage_events`
- freshness across sources, documents, claims, fact versions, and digests

Explicitly unavailable until a real collector/importer writes provider observations:

- Neon CU-hours and storage
- Cloudflare R2 operations, storage, and egress
- Upstash command/bandwidth/storage readings beyond adapter/imported counters
- Vertex/Gemini provider quota and token consumption
- GitHub Actions minutes
- Vercel and Cloud Run execution/billing usage

## Verification

Use the narrow checks for touched surfaces:

```powershell
pnpm ops:health --help
pnpm ops:health --print-sql
pnpm --filter @intercal/core test -- observability
pnpm --filter @intercal/core typecheck
pnpm db:check
```

Run `pnpm db:check` only against a verified throwaway or intended database target. Do not point it at
an unknown mutable database just to satisfy a checklist.
