# Plan 07 W3 — Pipeline CD audit-2 (SA-key lifetime hardening)

Date: 2026-06-05
Type: fix (ops/ci)
Packages: .github/workflows, docs/operations

## Summary

Second fresh-context audit of W3 (scheduled pipeline CD on GitHub Actions). Pass 1
rewrote `.github/workflows/pipeline.yml` to drive the portable `intercal-pipeline`
CLI on a 6-hourly schedule with a `workflow_dispatch` safe-test seam. This pass
audited the workflow for secret safety, schedule reliability, least privilege /
pinning, failure semantics, and cohesion with the portable CLI — and closes one
defense-in-depth gap. Everything else audited clean and was left unchanged (no
empty churn).

## Change

- **Vertex SA-key file is now shredded on `if: always()`.** The "Configure Vertex
  ADC" step writes the fanned `GOOGLE_SERVICE_ACCOUNT_KEY` to a `chmod 600`
  `$RUNNER_TEMP/gcp-sa.json` and points `GOOGLE_APPLICATION_CREDENTIALS` at it, but
  pass 1 never removed the file. GitHub-hosted runners are ephemeral (the workspace
  is destroyed after the job), so there was no leak on the live runner — but an
  explicit always-run cleanup step (`rm -f "$RUNNER_TEMP/gcp-sa.json"`) bounds the
  credential's lifetime regardless of how the run ends (success / failure / timeout)
  and removes the risk entirely for any self-hosted or reused runner. `rm -f` is a
  no-op on Gemini-only runs where the key was never written. No value is printed.

## Verified correct — no change

- **Secret safety.** No `set -x` on any secret-bearing step; the SA key is written
  with `printf '%s' … > file` (never to stdout); `database_url_override` lands only
  in the job's `DATABASE_URL` env for the run and is never echoed (the only DB notice
  is a generic `::notice::` gated on a boolean, not the DSN). The step-summary health
  JSON is pure counters + timestamps + status (`PipelineRunHealth.to_dict()` — no DSN
  or credential field), teed from the CLI's stderr which never prints secrets.
- **Schedule reliability.** `cron: "17 */6 * * *"` is correct (6-hourly, offset off
  `:00`); the 60-day inactivity auto-disable and default-branch-only firing are
  documented in `pipeline-cd.md`. `concurrency {cancel-in-progress: false}` over an
  idempotent pipeline serializes runs without deadlock (each run is bounded by the
  30-minute timeout, sane against the `INGEST_MAX_DOCS_PER_RUN=200` per-run cap).
- **Least privilege + pinning.** `permissions: {contents: read}` is minimal;
  `astral-sh/setup-uv@v8.2.0` is pinned to an exact version; `uv sync --frozen`
  guarantees reproducible installs. `actions/checkout@v4` stays on the first-party
  moving major tag to match the repo convention in `ci.yml` (intentional, not drift).
- **Failure semantics.** The CLI exits non-zero on a `failed` run or any per-source
  exception (`run-all` aggregates `any_failed`); the workflow runs under
  `set -euo pipefail`, captures `status=$?`, writes the summary, then `exit $status`
  — real errors fail the job loudly and partial failures surface in the summary.
- **Cohesion.** The workflow invokes the same `uv run intercal-pipeline run-all|run`
  that the Cloud Run path (W4) will use as its container command — no Actions-only
  divergence in pipeline behavior.

## Verification

- **actionlint 1.7.7** (embedded shellcheck): `pipeline.yml` clean (exit 0) after the
  cleanup step was added.
- No `gh` dispatch re-run was needed: the change is an additive `if: always()` cleanup
  step that cannot alter pipeline behavior or output, and pass 1 already proved a green
  branch-targeted run + idempotent prod re-run. No secret value appears in any tracked
  file, log, or step summary.
