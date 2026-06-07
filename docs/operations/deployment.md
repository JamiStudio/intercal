# Deployment Paths

Intercal is deployed by contract, not by provider-specific code paths. The primary hosted topology
is the accepted shape from `docs/decisions/0002-final-hosting-topology.md`: dashboard, REST, and MCP
on one Vercel project/domain; Neon Postgres + pgvector as the canonical store; GitHub Actions as the
routine batch runner; Cloud Run Jobs for heavy/on-demand pipeline runs; Upstash Redis and Cloudflare
R2 behind adapter ports.

This runbook is secret-safe by design. It names required environment variables and commands, but it
does not include any credential values. Keep values in `.env` or the provider secret stores described
in `docs/operations/secrets.md`.

## Primary Hosted Path

| Layer | Live surface | Source-truth files |
| --- | --- | --- |
| Dashboard, REST, OpenAPI | Vercel Next.js app; UI `/`, REST `/api/v1/*`, OpenAPI `/api/openapi.json` | `packages/dashboard/app/api/[[...route]]/route.ts`, `packages/api`, `packages/dashboard/vercel.json` |
| MCP | Vercel route `/api/mcp`, Node runtime, stateless Streamable HTTP | `packages/dashboard/app/api/mcp/route.ts`, `packages/mcp-server` |
| Database | Neon Postgres + pgvector; migrations are SQL-first | `db/migrations`, `db/seeds`, `scripts/dev/migrate.mjs` |
| Routine pipeline | GitHub Actions schedule and manual dispatch | `.github/workflows/pipeline.yml`, `services/pipeline` |
| Heavy/on-demand pipeline | Cloud Run Job `intercal-pipeline` built through Cloud Build and Artifact Registry | `.github/workflows/deploy-cloud-run.yml`, `scripts/ops/deploy-cloud-run.mjs`, `docker/workers.Dockerfile` |
| Queue/cache | Upstash Redis through `QueuePort` and rate-limit store ports | `services/shared/.../queue_redis.py`, `packages/core/src/ratelimit` |
| Object storage | Cloudflare R2 through the S3 adapter | `services/shared/.../storage_s3.py` |
| Backups | Neon branch/PITR plus portable `pg_dump` custom-format archives, optional R2 upload | `docs/operations/backups.md`, `scripts/ops/backup-restore.mjs` |

## Release Audit Posture

Workstream 9 pass 1 keeps the public launch on `https://intercal.jami.studio` through Vercel.
Cloudflare compute is not current scope. Treat it as a future provider-swap proof that must validate
the Hono mount, MCP Streamable HTTP behavior, trusted client-IP headers for rate limiting,
Next.js/static routing, Node/Postgres compatibility, and rollback.

The Vercel-specific behavior currently found in code is acceptable for this launch:

- `packages/dashboard/app/api/[[...route]]/route.ts` uses `hono/vercel` to mount the shared Hono app
  into the Next.js/Vercel route.
- `packages/dashboard/lib/client.ts` uses `VERCEL_URL` as a same-deployment fallback when
  `PUBLIC_API_BASE_URL` is not set.
- `packages/dashboard/app/api/*` routes force the Node runtime because `pg` needs TCP sockets.
- `packages/dashboard/app/api/mcp/route.ts` sets the current Vercel function duration for MCP.
- `packages/api/src/auth/middleware.ts` trusts Vercel-managed client-IP headers for anonymous
  per-IP rate limits.

Current R2 proof status: the storage adapter is S3-compatible and supports Cloudflare R2 through
`S3_*` environment variables, but this pass could not prove the live bucket from the shell. No
`S3_*`, `CLOUDFLARE_API_TOKEN`, or `CLOUDFLARE_ACCOUNT_ID` variables were present, `wrangler` was
not on `PATH`, and `aws` was not on `PATH`. To verify live R2, provide Cloudflare account access
with `wrangler r2 bucket list` / `wrangler r2 bucket info <bucket> --json`, or provide R2 S3
credentials plus an S3 client and run a metadata/list or backup upload proof without printing
credential values.

## DNS And TLS

The official Intercal public domain is `https://intercal.jami.studio`. Cloudflare owns DNS for the
parent `jami.studio` zone and Vercel owns TLS termination plus the app deployment for the Intercal
subdomain.

Verified status on 2026-06-07:

- Vercel account scope `studio-jami` has project `intercal`; `vercel project inspect intercal`
  reports owner `jami-studio`, Root Directory `packages/dashboard`, and Node.js `24.x`.
- `vercel inspect https://intercal.jami.studio` reports a Ready production deployment for project
  `intercal`, with aliases `intercal.jami.studio`, `intercal-studio-jami.vercel.app`,
  `intercal-git-main-studio-jami.vercel.app`, and legacy `lntercal.vercel.app`.
- `jami.studio` nameservers are `elliott.ns.cloudflare.com` and `irena.ns.cloudflare.com`.
- Both Cloudflare authoritative nameservers answer `intercal.jami.studio CNAME
  25b8236304cda166.vercel-dns-017.com` with TTL `600`; the CNAME target resolves to Vercel edge
  addresses. Because the authoritative answer exposes the Vercel target, the record is DNS-only, not
  Cloudflare-proxied.
- TLS for `intercal.jami.studio` is issued by Let's Encrypt and was valid for the live smoke check
  (`NotBefore` 2026-06-06, `NotAfter` 2026-09-04).
- `vercel domains inspect jami.studio` still warns that the parent apex is not configured for Vercel.
  That warning is about `jami.studio`/future `www.jami.studio` site routing and does not block the
  Intercal subdomain, which Vercel lists under the `intercal` project.

The setup flow for a future domain or DNS repair is:

1. Add the domain to the Vercel project.
2. Add the DNS records Vercel reports at the DNS provider. Use the apex/`www` records Vercel
   provides for the chosen domain; do not hard-code provider-specific records into this repo.
3. Wait for Vercel to mark the domain verified and issue TLS.
4. Set the public base URL env names in the secret source and fan out. `VERCEL_DOMAIN` is an
   operator-lane convenience name; runtime public URLs should be represented by the app-runtime
   names already tracked in `.env.example` and `scripts/ops/secrets.manifest.json`.
5. Smoke check:

```powershell
Invoke-WebRequest https://intercal.jami.studio/ -UseBasicParsing
Invoke-WebRequest https://intercal.jami.studio/docs -UseBasicParsing
Invoke-WebRequest https://intercal.jami.studio/api/openapi.json -UseBasicParsing
Invoke-WebRequest https://intercal.jami.studio/api/v1/freshness?topic_or_entity=MCP%20protocol -UseBasicParsing
```

MCP clients use `https://<domain>/api/mcp`. When MCP OAuth is enabled, the Protected Resource
Metadata document is served from the same domain; see `docs/operations/mcp-auth.md`.

For an HTTP-only MCP smoke without the SDK client, initialize with the Streamable HTTP headers:

```powershell
$body = @{
  jsonrpc = "2.0"
  id = 1
  method = "initialize"
  params = @{
    protocolVersion = "2025-06-18"
    capabilities = @{}
    clientInfo = @{ name = "intercal-iwr-smoke"; version = "0.0.0" }
  }
} | ConvertTo-Json -Depth 8 -Compress
Invoke-WebRequest https://intercal.jami.studio/api/mcp `
  -Method Post `
  -Headers @{
    Accept = "application/json, text/event-stream"
    "Content-Type" = "application/json"
    "MCP-Protocol-Version" = "2025-06-18"
  } `
  -Body $body `
  -UseBasicParsing
```

## Environment And Secret Fan-Out

Values live in gitignored `.env`; names and target mapping live in
`scripts/ops/secrets.manifest.json`. Fan-out is the only supported way to push values to hosted
targets:

```powershell
pnpm ops:secrets-fanout -- --dry-run
pnpm ops:secrets-fanout -- --target vercel
pnpm ops:secrets-fanout -- --target github
```

Cloud Run Job sensitive values are stored as Secret Manager versions by the Cloud Run deploy script,
not as plaintext job env:

```powershell
pnpm ops:deploy-cloud-run -- --dry-run
pnpm ops:deploy-cloud-run
```

Required hosted runtime groups:

- Neon: `DATABASE_URL`; use `DATABASE_URL_UNPOOLED` for dump/restore operations when available.
- R2/S3: `STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`.
- Upstash/Redis: `QUEUE_PROVIDER=redis`, `REDIS_URL` and/or `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN`.
- LLM/embeddings: `EMBEDDINGS_*`, `LLM_*`, `GEMINI_API_KEY` or Vertex/GCloud ADC configuration.
- Auth: REST API keys are rows in Postgres; MCP OAuth is enabled by `MCP_OAUTH_*` env.

Operator-only values such as `VERCEL_TOKEN`, `NEON_API_KEY`, `GCLOUD_*` control-plane credentials,
Cloudflare control-plane tokens, backup target overrides, and restore DSNs must not be fanned into
the app runtime unless a future script explicitly owns that target.

## Migrations

Migrations are SQL-first and run against the target `DATABASE_URL`.

Pre-deploy check against the target branch:

```powershell
pnpm db:check
```

Apply pending migrations and seeds:

```powershell
node scripts/dev/migrate.mjs --seed
```

For production, run migrations before promoting a deployment that depends on new schema. Use a Neon
branch for rehearsal when the migration is risky:

1. Create a throwaway Neon branch from the production branch.
2. Set only the current shell's `DATABASE_URL` to that branch.
3. Run `node scripts/dev/migrate.mjs --seed` and the focused verification for the touched surface.
4. Delete the branch after proof.

Do not run `--fresh` against any persistent hosted branch.

## Vercel App, REST, And MCP

Set the Vercel project **Root Directory** to `packages/dashboard`. That makes Vercel read
`packages/dashboard/vercel.json`, while the build command intentionally steps back to the monorepo
root for contracts and workspace package builds:

```text
cd ../.. && pnpm contracts:build && pnpm -r --filter "./packages/**" --filter "!@intercal/dashboard" exec tsc -b --force && pnpm --filter @intercal/dashboard build
```

Deploy flow:

1. Connect the GitHub repo to the Vercel project with Root Directory `packages/dashboard`.
2. Fan app-runtime env to Vercel.
3. Open a PR and let Vercel create a preview deployment.
4. Smoke preview with the commands below.
5. Merge to `main`; Vercel promotes the production deployment.

Smoke checks:

```powershell
$base = "https://intercal.jami.studio"
Invoke-WebRequest "$base/" -UseBasicParsing
Invoke-WebRequest "$base/docs" -UseBasicParsing
Invoke-WebRequest "$base/api/openapi.json" -UseBasicParsing
Invoke-WebRequest "$base/api/v1/freshness?topic_or_entity=MCP%20protocol" -UseBasicParsing
node scripts/dev/verify-mcp.mjs "$base/api/mcp"
```

The root `node scripts/dev/verify-mcp.mjs` command expects the MCP SDK dependency to be resolvable
from the script location. If the root workspace has not installed that dependency, run an equivalent
SDK smoke from `packages/mcp-server`, or add the dependency to the root tooling manifest before
making the root command mandatory.

Rollback is a Vercel deployment rollback or alias promotion to the last known-good deployment. If a
rollback crosses a database migration boundary, prefer a forward-fix migration or a Neon branch/PITR
recovery drill; do not silently point the app at an unverified older schema.

## Pipeline Runners

Routine batch runs use GitHub Actions:

```powershell
gh workflow run pipeline.yml -f mode=run-all -f max_documents=5
```

Safe test runs should use `database_url_override` pointed at a throwaway Neon branch. The workflow
is serialized by concurrency and exits non-zero on failed pipeline health.

Heavy/on-demand runs use Cloud Run Jobs:

```powershell
gcloud run jobs execute intercal-pipeline --region us-central1 --args="run-all,--max-documents,5" --wait
```

The Cloud Run path runs the same `intercal-pipeline` CLI as Actions. See
`docs/operations/pipeline-cd.md` for the detailed Actions-vs-Cloud-Run split and the Secret Manager
binding rules.

## Health Checks

Hosted read surface:

```powershell
Invoke-WebRequest https://<domain>/api/openapi.json -UseBasicParsing
Invoke-WebRequest https://<domain>/api/v1/freshness?topic_or_entity=rust -UseBasicParsing
node scripts/dev/verify-mcp.mjs https://<domain>/api/mcp
```

Database and operational health:

```powershell
pnpm db:check
pnpm ops:health
pnpm ops:health -- --json
```

Backup/restore heartbeat:

```powershell
pnpm ops:backup -- --dry-run
pnpm ops:restore-proof -- --dump .backups\intercal-YYYY-MM-DDTHH-MM-SS-sssZ.dump --skip-restore
```

Real restore proof requires `pg_dump`, `pg_restore`, a source DB URL, and a separate
`RESTORE_DATABASE_URL` for a fresh throwaway branch. If those are unavailable, record the exact
missing tool/access instead of claiming recovery was proven.

## Backups And Restore

`docs/operations/backups.md` is the source of truth for backup and restore. This deployment runbook
only calls that path at release boundaries:

1. Before risky schema/operator work, run `pnpm ops:backup` and optionally `--upload-r2`.
2. Restore into a fresh throwaway Neon branch with `pnpm ops:restore-proof -- --dump <dump>`.
3. Promote or recover only after the restored-store heartbeat passes.

Current proof status from Plan 07 W7: the script, help, dry-run, secret-handling checks, and
missing-tool paths were verified. Real dump/restore/upload remains operator-gated until PostgreSQL
client tools, AWS CLI for R2 upload, and a throwaway restore DSN are available.

## Upgrade Runbook

1. Read `.changes/` and the relevant roadmap/doc updates for operational impact.
2. Rebuild contracts if TypeSpec changed: `pnpm contracts:check`.
3. Run focused tests for touched packages, then the full gate when appropriate: `pnpm verify`.
4. Run `pnpm db:check` against the target branch; apply migrations when required.
5. Create a portable backup before risky schema or pipeline changes.
6. Deploy Vercel via PR preview to production-on-main.
7. Let Cloud Run CD roll the worker image if worker paths changed, or run
   `pnpm ops:deploy-cloud-run` for config/secret changes.
8. Run the smoke checks and `pnpm ops:health`.
9. Record any unavailable operator-gated proof explicitly.

## Optional Self-Host With Docker Compose

This path is for other users and offline/self-host testing. Maintainers develop directly against
Neon branches.

```powershell
docker compose -f docker/compose.yaml up -d
$env:DATABASE_URL = "postgres://intercal:intercal@localhost:5432/intercal"
$env:QUEUE_PROVIDER = "redis"
$env:REDIS_URL = "redis://localhost:6379"
$env:STORAGE_PROVIDER = "s3"
$env:S3_ENDPOINT = "http://localhost:9000"
$env:S3_REGION = "auto"
$env:S3_BUCKET = "intercal"
$env:S3_ACCESS_KEY_ID = "intercal"
$env:S3_SECRET_ACCESS_KEY = "intercal-secret"
$env:S3_FORCE_PATH_STYLE = "true"
node scripts/dev/migrate.mjs --seed
pnpm dev
```

The compose file supplies Postgres + pgvector, Valkey, and MinIO. It does not run the dashboard,
MCP server, or Python workers as services; run those from the repo so they use the same source code
and adapter ports as hosted deployments.

## Single-VPS Alternative

The paid single-VPS path keeps the same contracts and ports while replacing managed providers with
local services:

- Reverse proxy: Caddy or nginx terminates TLS and routes `/` plus `/api/*` to the Next.js Node
  process. Use Let's Encrypt certificates through the proxy.
- App: run `pnpm --filter @intercal/dashboard build` and serve the Next.js app with a process
  manager such as systemd.
- DB: Postgres with pgvector on the VPS or a managed Postgres outside the VPS.
- Queue/cache: Valkey/Redis on the VPS.
- Storage: MinIO on the VPS or any S3-compatible bucket.
- Pipeline: systemd timers or cron invoking `uv run intercal-pipeline run-all`; keep the same
  budget env names and serialization discipline as the hosted Actions workflow.
- Backups: `pg_dump` custom-format archives copied off-box to an S3-compatible bucket; restore proof
  into a separate database before trusting the archive.

Do not make VPS-only assumptions in code. Provider swaps remain env changes behind the existing
adapter ports.
