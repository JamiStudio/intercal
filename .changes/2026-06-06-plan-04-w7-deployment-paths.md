# Plan 04 W7 deployment paths

- Added the deployment-path runbook for the hosted Vercel + Neon + GitHub Actions + Cloud Run +
  Upstash + R2 topology, including DNS/TLS, env fan-out, migrations, health checks, upgrade,
  rollback, backup/restore handoff, Docker Compose self-host, and single-VPS alternative.
- Linked the deployment topology architecture doc to the new operator runbook.
- Made the Cloud Run deploy CLI tolerate pnpm's `--` argument separator so the documented dry-run
  package command works.
- Clarified that the Vercel project Root Directory must be `packages/dashboard` so the package-local
  `vercel.json` build contract is used.
- Recorded that backup/restore proof remains sourced from Plan 07 W7 and is still operator-gated
  for live dump/restore/upload until PostgreSQL client tools, AWS CLI, and a throwaway restore DSN
  are available.
