# Secrets & Fan-Out

How Intercal keeps **one source of truth** for secrets and propagates it, with no manual steps,
to every environment. Names and target mapping live in the tracked manifest; values live only in
the gitignored local `.env`. **No secret value ever enters a tracked file, log, or command output.**

## Source of truth

- **Values:** the gitignored local `.env` (copy from `.env.example`, the only tracked env file).
- **Names + target mapping:** `scripts/ops/secrets.manifest.json` (validated by
  `scripts/ops/secrets.manifest.schema.json`). The manifest lists every secret/config NAME, which
  lane it belongs to, and which targets each maps to — **never values**.

To change a secret: edit it once in `.env`, then run the fan-out. Every target updates from that
single edit.

## Two lanes (do not mix)

The manifest tags each name with a `lane`:

- **`app-runtime`** — the fan-out *payload*. The application/pipeline consumes these at runtime
  (DB URL, R2/S3 keys, Upstash, LLM keys / Vertex ADC, adapter selectors, budget knobs, public base
  URL). These are pushed to the targets listed in each entry's `targets`.
- **`operator`** — the credentials the fan-out *uses* to authenticate the push itself (Vercel
  token + project/team ids, `gh` auth, GCP SA, Neon/Cloudflare control-plane tokens). These have
  `targets: []` and are **never fanned into the app env**. Leaking an operator credential into the
  runtime payload would hand deploy/control-plane power to the app — the lane split prevents that.

## Fan-out tool

`scripts/ops/secrets-fanout.mjs` (Node, no extra deps) reads the manifest + `.env` and propagates
values to each target. It is **idempotent and re-runnable**, prints only NAME + target + action,
and supports a no-write dry run.

```
node scripts/ops/secrets-fanout.mjs --dry-run            # plan only, no writes
node scripts/ops/secrets-fanout.mjs --target vercel      # one target
node scripts/ops/secrets-fanout.mjs --target github
node scripts/ops/secrets-fanout.mjs --target cloudrun
node scripts/ops/secrets-fanout.mjs                      # all targets (default)
```

After a real (non-dry) run the script **lists the NAMES present at each target** (Vercel + GitHub)
so you can confirm the push landed without ever seeing a value.

### Targets and how each is reached

| Target | Mechanism | Auth (operator lane) |
| --- | --- | --- |
| **Vercel** env | REST API `POST /v10/.../env` (new) or `PATCH /v9/.../env/{id}` (existing); stale per-target rows reconciled to one unified `production,preview,development` entry | `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (+ `VERCEL_TEAM_ID`) |
| **GitHub Actions** secrets | `gh secret set <NAME> --repo <owner/repo>` (overwrite = idempotent) | `gh` CLI keyring auth (or `GITHUB_TOKEN` override); repo from `GITHUB_REPO` |
| **Cloud Run** env | `gcloud run services update <svc> --set-env-vars` (one atomic update) | `gcloud` active account; needs `CLOUD_RUN_SERVICE` + `GCLOUD_REGION` + `GCLOUD_PROJECT_ID` |

Vercel receives only the names whose manifest `targets` include `vercel` — the dashboard is
read-only and reaches the API over HTTP via the SDK, so it needs far fewer names than the pipeline
runtime (GitHub Actions / Cloud Run), which gets the full payload.

### Idempotency notes

- **Vercel:** if a key already exists as one entry covering exactly the desired target set, the
  value is PATCHed in place; otherwise existing rows for that key are deleted and a single unified
  entry is created. Re-running never produces duplicate or conflicting rows.
- **GitHub:** `gh secret set` overwrites, so re-runs are no-ops in effect.
- **Cloud Run:** `--set-env-vars` replaces the named vars atomically.

## Cloud Run (deferred)

Cloud Run env fan-out is wired but **deferred until a Cloud Run service exists** (Plan 07 W4). With
no service, the script reports a precise deferral and lists how many app-runtime names are mapped to
`cloudrun` and ready. Once a service is deployed, set `CLOUD_RUN_SERVICE` in `.env` and re-run
`--target cloudrun`.

## Rotation runbook (credential leak / periodic)

If a credential leaks (e.g. a DSN reaches a log) or is rotated periodically, rotate at the
**source** and re-fan — never patch one target by hand. For the Neon `DATABASE_URL` /
`DATABASE_URL_UNPOOLED` pair (role `neondb_owner` on the production branch):

1. **Rotate the role password** on the production branch (Neon console *Reset password*, the
   Neon API `…/roles/{role}/reset_password`, or `ALTER ROLE neondb_owner WITH PASSWORD …` over
   the **direct/unpooled** endpoint). The old password dies immediately. Validate the **new**
   password on **both** the pooled and unpooled endpoints before proceeding.
2. **Update `.env`** in place — `DATABASE_URL` (pooled, `-pooler` host) and
   `DATABASE_URL_UNPOOLED` (direct host). Normalized `KEY=value`; never printed, never tracked.
3. **Re-fan:** `node scripts/ops/secrets-fanout.mjs --target all` → Vercel + GitHub Actions.
   Cloud Run reports DEFERRED (the pipeline is a **Job**, not a service — see below).
4. **Cloud Run Job:** the Job binds `intercal-DATABASE_URL:latest` from Secret Manager, so add a
   **new secret version** (pipe the value via stdin — `gcloud secrets versions add
   intercal-DATABASE_URL --data-file=-`; never on the command line). `…:latest` makes the next
   execution pick it up; a full re-deploy is only needed when the image/config changes. The full
   `scripts/ops/deploy-cloud-run.mjs` does this same `syncSecrets` step for all `intercal-*`.
5. **Vercel redeploy:** `DATABASE_URL` is a *runtime* env change, so a code push won't refresh a
   live deployment — trigger a redeploy/promote so the production alias serves the new DSN.
6. **Verify on the new credential:** live REST `GET /api/v1/freshness?topic_or_entity=rust` → 200
   with data; live MCP `POST /api/mcp` initialize → 200; one capped `gcloud run jobs execute
   intercal-pipeline` → success with **redacted** DSN logs (`neondb_owner:***`). Confirm the old
   password no longer authenticates.

The leaked secret value is dead the moment step 1 lands; steps 2–5 just stop every target failing
on the now-invalid credential. The old Secret Manager version can be left disabled/inert (it can no
longer authenticate) or destroyed.

## Rules

- Never write a secret value into the manifest, code, docs, fixtures, or any output.
- `.env` is gitignored (`.env`, `.env.*`, except `.env.example`). Verify with `git check-ignore .env`.
- New secret? Add the NAME to `.env.example` (names only), add a manifest entry with its lane +
  targets, set the value in `.env`, then fan out.
- Re-verify drift-prone provider facts (Vercel env API, `gh secret`, `gcloud run`) against official
  docs before changing the mechanism.
