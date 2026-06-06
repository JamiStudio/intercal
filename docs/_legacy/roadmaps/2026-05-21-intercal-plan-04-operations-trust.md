# Operations, Trust, And Review Loops Implementation Plan

Date: 2026-05-21
Aligned: 2026-06-04 to live stack
Status: [x] Complete with operator-gated proof carried forward (2026-06-06)
Source reports: `docs/research/2026-05-21-intercal-foundation-report.md`, `docs/research/2026-06-04-intercal-revisit-audit-and-dev-environment.md`, `docs/architecture/deployment-topology.md`, `docs/architecture/provider-boundaries.md`; decisions `docs/decisions/0001-foundation-stack.md`, `docs/decisions/0002-final-hosting-topology.md`
Owner: Main orchestration agent
Surface: auth, rate limits, source policy, audit events, subscriptions, feedback/review records, observability, deployment, account setup

## Purpose

Build the operational and trust systems required to run Intercal as a reliable open knowledge service. This plan owns access control, source policy, auditability, subscriptions, bounded feedback/review loops, observability, deployment paths, backups, and one-time account/CLI setup runbooks.

## Live Alignment (2026-06-04)

This plan is **Phase D** of the master program (jointly with Plan 07 which owns deploy/CD/secret-fan-out; see `docs/roadmaps/2026-06-04-intercal-program.md`). The app and API are already live on Vercel reading Neon.

Concrete providers and topology (decisions `0001`/`0002`):
- **Auth:** API keys (hashed + scoped) for REST; OAuth 2.1 resource-server for MCP at `/api/mcp`. Plan 07 owns the deploy/CD/secret-fan-out automation (one source fanned to local `.env`, Vercel env, GitHub Actions secrets, Cloud Run env).
- **DB:** Neon direct. No local Docker in the maintainers' flow; `docker compose` is optional self-host. Ops DB checks run against `DATABASE_URL` (a Neon branch or prod).
- **Queue/cache:** Upstash Redis (TCP) behind `QueuePort`.
- **Storage:** Cloudflare R2 (S3 API) behind `StoragePort`.
- **Workers/scheduler:** GitHub Actions scheduled workflows (batch) + Cloud Run Jobs (on-demand). Cadence respects `docs/operations/resource-budget.md`.
- **Observability:** must include per-provider consumption vs. the free-tier budget (Neon, R2, Upstash, Vertex AI / Gemini daily cap, GitHub Actions minutes) in addition to source/run health, latency/error, and freshness metrics.

See also: `docs/decisions/0001-foundation-stack.md`, `docs/decisions/0002-final-hosting-topology.md`, `docs/operations/resource-budget.md`, `docs/roadmaps/2026-06-04-intercal-program.md`.

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked or requires decision

## Source Findings

- Plans 01-03 provide schema, pipeline, API, MCP, SDK, providers, embeddings, and query surfaces.
- The foundation report requires source storage/citation/redistribution policy.
- Public user-facing surfaces remain read-only for canonical graph data.
- Users may submit feedback or flags, but public users must not directly mutate sources, claims, entities, merges, or relationships.
- Deployment must support the decided topology: app+MCP on Vercel, pipeline on GitHub Actions + Cloud Run Jobs. VPS one-box is documented as an alternative self-host path. Plan 07 owns deploy/CD/secret-fan-out automation.
- A dedicated human/agent account setup session is expected for cloud accounts, domains, CLIs, and secrets.

## Locked Decisions

- API keys are hashed and scoped.
- Source policy is enforced before content is stored or exposed.
- Feedback creates review records; it does not mutate canonical graph data.
- Subscriptions can notify agents/users without requiring broad polling.
- Audit events are required for trust-sensitive actions.
- Deployment docs must remain provider-portable.

## Non-Goals

- [ ] Do not build the full public interactive UX in this plan.
- [ ] Do not allow public users to submit direct graph mutations.
- [ ] Do not commit provider credentials or account-specific secrets.
- [ ] Do not make a single hosting provider part of the product architecture.
- [ ] Do not skip backup/restore proof for hosted paths.

## Repo Guidance

- Security and deployment rules belong in durable docs, not dated plans.
- Provider-specific setup belongs in runbooks with substitution points.
- Operations scripts must be Windows-native friendly where local execution is expected. DB checks run against `DATABASE_URL` (a Neon branch) — not a local Docker database.
- API/MCP behavior changes require contract and snapshot updates.
- Changelog fragments are required for security, deployment, operations, package, CI, or schema changes.

## Target Product Shape

Intercal can be operated locally, on a VPS, or through managed services with auth, source policy enforcement, audit events, subscriptions, feedback review records, observability, backups, restore proof, and documented account setup.

## Cross-Stream Dependency Map

Auth/rate limits -> source policy -> audit events -> feedback/review records -> subscriptions -> observability -> deployment paths -> account setup -> final closeout.

## Workstream 1: Auth And Rate Limits

Goal: Protect REST and MCP access with scoped keys and measurable usage. REST uses hashed scoped API keys; MCP at `/api/mcp` uses OAuth 2.1 resource-server (per decision 0001 D10).

Status: [x] **Complete** (2026-06-06, jointly with Plan 07 W5 + W6). REST: hashed scoped keys, rate
limits, usage events live on `/api/v1/*`; runbook `docs/operations/auth-and-rate-limits.md`. Audit-2
(2026-06-06): rate-limit IP-trust hardened (trusted `x-real-ip` / right-most XFF, never the spoofable
left-most), TTL-less Upstash counter self-heals (no permanent-429 lockout), IPv6 `::` anonymization
fixed; re-verified live. MCP: `/api/mcp` is now an OAuth 2.1 **resource server** (Plan 07 W6) —
audience-bound bearer-token validation, RFC 9728 Protected Resource Metadata, 401 + `WWW-Authenticate`
/ 403 `insufficient_scope`, public-read posture when no AS is configured; AS is the env seam. Runbook
`docs/operations/mcp-auth.md`; live-verified 7/7. By design the REST (API-key) and MCP (OAuth) surfaces
use different mechanisms and do not share one middleware.

Depends on:

- [x] Plan 03 REST/MCP endpoints.
- [x] Plan 01 `api_keys` and `usage_events` schema.

Enables:

- [ ] Workstream 6 observability (now has `usage_events` to read).
- [ ] Plan 05 security review.

Repo guidance:

- Local bypass must be explicit and unavailable in production mode. (No bypass path exists; local
  dev simply uses the in-process rate-limit store and can issue a key for higher limits.)

Primary areas:

- `packages/api`
- `packages/mcp-server`
- `packages/shared`
- `docs/security`

Implementation tasks:

- [x] Add API key creation, hashing, validation, and scopes. (REST — `@intercal/core/src/auth/`.)
- [x] Add REST/MCP auth. (REST middleware in `packages/api/src/auth/`; MCP OAuth 2.1 resource-server
      gate in `packages/mcp-server/src/auth/`, run in `handleMcpRequest`. By design the two surfaces
      use different mechanisms — API keys vs OAuth bearer tokens — and do not share one middleware.)
- [x] Add rate-limit policy and usage event recording. (Port + Upstash/in-memory adapters; per-key
      and per-IP policy honoring `resource-budget.md`; `usage_events` row per request. REST surface;
      the MCP gate exposes a resolved-principal seam where per-principal limits/usage can attach.)
- [x] Add key rotation and local dev docs. (`docs/operations/auth-and-rate-limits.md` +
      `scripts/ops/keys.mjs` rotation flow; MCP client onboarding in `docs/operations/mcp-auth.md`.)

Exit criteria:

- [x] REST auth and rate-limit tests cover allowed, denied (401/403), exhausted (429), anonymous,
      and local-dev cases (24 unit tests + a 17/17 live Neon-branch verification). MCP OAuth: token
      validation + scope enforcement + 401/403 + audience binding + anon-posture covered (17 tests +
      a 7/7 live verification); see Plan 07 W6.

Suggested verification:

- `pnpm test` (api + core auth/rate-limit + mcp-server auth suites)
- `DATABASE_URL=<neon-branch> node scripts/dev/verify-auth.mjs` (live REST)
- `DATABASE_URL=<neon-branch> node scripts/dev/verify-mcp-auth.mjs` (live MCP OAuth)

## Workstream 2: Source Policy And Trust

Goal: Enforce storage, citation, redistribution, and reliability policy per source.

Status: [x] **Complete** (2026-06-06). Source policy is enforced end-to-end and every
externally-influenced outbound fetch is SSRF-guarded. Built on Plan 02 W1 (sources already carry
`redistribution_allowed` / `citation_only` and raw archival was already gated). This pass:
(1) added the reusable **SSRF fetch guard** `services/shared/intercal_shared/ssrf.py` (scheme
allowlist; resolve-then-validate all A/AAAA; block loopback / `0.0.0.0` / cloud-metadata
`169.254.169.254` / link-local / RFC1918 / IPv6 ULA `fc00::/7` / `fe80::/10` / multicast /
reserved; unwrap IPv4-mapped/6to4/Teredo IPv6; canonicalise decimal/octal/hex encodings; **pin the
connection to the validated IP** to defeat DNS rebinding; **re-validate every redirect hop**;
timeouts + body-size cap) and wired it into the Wikidata + GitHub source adapters (pre-validate
configured URLs; own clients built via `create_guarded_client`);
(2) closed the `summary_allowed` enforcement gap — snapshotted onto `source_documents`
(migration `0025`), written at ingest, and honored in response assembly via the pure
`bodySnippetAllowed` gate (citation_only ⇒ title-only; summary_allowed=false ⇒ title-only).
Reliability scoring + health history already exist (Plan 02 `score_source_health` +
`ingestion_runs`). Durable doc: `docs/operations/source-policy.md`. Live-verified: a real
`api.github.com` fetch succeeds through the IP-pinning client while metadata/loopback/private are
blocked at the socket boundary.

**Audit-2 (2026-06-06, second fresh-context pass):** adversarial SSRF-bypass hunt + source-policy
e2e re-audit. One genuine gap fixed — the `max_bytes` body cap lived only in the standalone
`read_capped` helper, which the adapters never call (they buffer via `client.get().json()`), so a
hostile/huge configured endpoint could exhaust worker memory. Enforcement moved into the guarded
client's pinning transport so the cap is automatic on **every** response (over-cap `Content-Length`
rejected up front + a stream wrapper that trips mid-body on a lying/absent `Content-Length`). SSRF
test matrix extended 41 → **52** (added: userinfo-in-URL validates the real host not the userinfo;
DNS→IPv4-mapped-metadata; short-form/overlong-octal IPv4; invalid port; redirect→`file://` scheme;
transport-level private block; streamed + Content-Length body caps; within-cap pass). No bypass
found in scheme/redirect/encoding/userinfo/IPv6-embedding/DNS-rebinding vectors. Source policy
confirmed honored end-to-end on both the Python store path (snapshot written at ingest) and the TS
serve path (`bodySnippetAllowed` gates `searchEvidence`; `delta.ts`/`verify.ts` never read
`cleaned_text`); **proven live** via `scripts/dev/verify-source-policy.mjs` (rolled-back txn on the
prod Neon branch: permissive ⇒ body snippet, `summary_allowed=false`/`citation_only=true` ⇒
title-only, no body leak; 0025 column live; 5/5).

Depends on:

- [x] Plan 02 source registry.

Enables:

- [ ] Workstream 3 audit events.
- [ ] Plan 06 canonical public dataset boundaries.

Repo guidance:

- Public responses must not expose source text beyond source policy.

Primary areas:

- `services/ingest`
- `services/shared` (source adapters + SSRF guard)
- `packages/core` (response-assembly policy gate)
- `db/` (source policy snapshot)
- `docs/operations/source-policy.md`

Implementation tasks:

- [x] Add source policy enforcement in ingestion and response assembly. (Raw-archival +
      citation_only gating in `ingest_source`; `summary_allowed` snapshot + `bodySnippetAllowed`
      gate in the query layer.)
- [x] Add SSRF protection for fetched (operator/future user-submitted) URLs. (`ssrf.py` guard +
      adapter wiring; user-submission endpoint left as a clean seam — Plan 04 W4 / Plan 06.)
- [x] Source reliability scoring + health history. (Already live from Plan 02 W1:
      `score_source_health` writes `sources.reliability_score`; `ingestion_runs` is the history.)
- [ ] Add source allowlist controls. (Deferred: belongs with the operator/admin surface — Plan 06.)
- [ ] Add citation-origin/citation-laundering detection foundation. (Deferred: a later trust pass
      once cross-source claim corroboration data exists; not faked here.)

Exit criteria:

- [x] Restricted sources can be cited or summarized only according to policy. (Truth table proven
      in `source-policy.test.ts`; ingestion gates raw/full-text storage.)
- [x] Externally-influenced fetches are SSRF-safe against the full hostile matrix while legitimate
      public sources still fetch.

Suggested verification:

- `uv run pytest services/shared/tests/test_ssrf.py` (SSRF hostile matrix + legit fetch + adapter)
- `pnpm --filter @intercal/core test` (`source-policy.test.ts` — body-exposure gate)
- `node --env-file=.env scripts/dev/verify-source-policy.mjs` (live snippet-gate proof against the
  real DB; inserts probe rows in a rolled-back transaction — safe on prod, persists nothing)

## Workstream 3: Audit Events

Goal: Record trust-sensitive actions in queryable audit logs.

Status: [x] **Complete** (2026-06-06). `audit_events` is now an enforced append-only **trust ledger**.
The table existed (migration 0022, "append-only by policy"); this pass (1) enforced append-only in the
DB — `0026_audit_events_append_only.sql` adds `BEFORE UPDATE`/`BEFORE DELETE` triggers that raise on any
row mutation, so history cannot be silently rewritten/erased; (2) added a centralized emit module in
`@intercal/core` (`src/auth/audit.ts`): `recordAuditEvent` (best-effort) + `recordAuditEventStrict`
(throws; used inside a tx), an `AUDIT_ACTIONS` vocabulary, `queryAuditEvents` read helper, typed
actor/event interfaces, and defensive recursive redaction of secret-bearing keys (no raw key/hash/token
ever lands); (3) wired emission at the real trust-sensitive points that exist NOW — `issueApiKey`
(`api_key.issue`, severity medium) and `revokeApiKey` (`api_key.revoke`, severity high) each write their
audit row in the **same transaction** as the key mutation, recording only safe identity/metadata
(id/name/keyPrefix/scopes/owner/expiry; before/after active→revoked + reason). The ops CLI
(`scripts/ops/keys.mjs`) threads the operator identity (`--by`) as the actor. Durable doc:
`docs/security/audit-events.md`. **Live-verified** on a throwaway Neon branch (deleted after):
`scripts/dev/verify-audit.mjs` — correct actor/action/target/severity + before/after, NO secret
material in any row, mutation attempts rejected; the CLI path writes both rows with the operator
actor.

**Audit-2 (2026-06-06, second fresh-context pass):** correctness/security re-audit + fixes. Atomicity
(audit row in the same tx as the key mutation), attribution (server-set actor, not spoofable), and the
emit seams all held. Two genuine gaps closed: (1) **TRUNCATE** bypasses row-level triggers and, on a
managed Postgres where the app role owns its tables (Neon `neondb_owner`), is reachable through the
normal data path — `0027_audit_events_forbid_truncate.sql` adds a `BEFORE TRUNCATE` statement trigger
(reusing the 0026 raise function) so the ledger cannot be silently emptied; (2) **redaction breadth** —
the secret-key matcher now also covers `dsn`/connection-string, `credential(s)`, `private_key`,
`access_key`, `bearer`, `hash` (any cased/renamed variant), `session`, `salt`, `signature`, with an
adversarial nested/renamed-field unit test. Live re-verify **15/15** (UPDATE/DELETE/**TRUNCATE** all
rejected, no secrets in any row, branch deleted after).

Deferred (explicit, emit seam ready — NOT faked): feedback/review (W4), subscriptions (W5),
source-policy changes (W2/Plan 06), entity merge / claim retraction / entity-resolution decisions
(Plan 02/Plan 06). Those surfaces will call the centralized emit helper with the reserved action
strings rather than inventing their own.

Orchestrator checkpoint (2026-06-06T05:18Z): prior P3 checkpoint had no resumable agent id from the
Claude-side run. Replacement Codex confirm-quiet pass `019e9b5e-21c6-7880-82ec-ee61b34af2ef`
returned commit `c4a2113` (6 files, +15/-10 docs/comment alignment only), with
`pnpm --filter @intercal/core test -- auth/audit.test.ts`, `pnpm --filter @intercal/core typecheck`,
and `git diff --cached --check` green. Numeric gate passed and this is class C; W3 is closed.

Depends on:

- [x] Plan 01 `audit_events` schema (migration 0022; append-only enforced by 0026 UPDATE/DELETE +
      0027 TRUNCATE).
- [x] Workstream 1 auth identities.

Enables:

- [ ] Workstream 4 feedback/review records.
- [ ] Plan 05 security audit.

Repo guidance:

- Audit logs should record actor, action, target, timestamp, and safe metadata.

Primary areas:

- `packages/core` (auth/audit emit + query, key lifecycle wiring)
- `db/` (append-only enforcement migration)
- `scripts/ops` (operator actor)
- `docs/security/audit-events.md`

Implementation tasks:

- [x] Add audit writer and shared event types. (`@intercal/core` `recordAuditEvent` /
      `recordAuditEventStrict` / `queryAuditEvents` + `AUDIT_ACTIONS`; secret-redaction guardrail.)
- [~] Record entity merges, splits/unmerges, claim corrections, source review actions, provider
      config changes, subscription changes, admin actions, and manual overrides. (Key issue/revoke
      wired now; the rest are deferred to their owning workstreams with a ready emit seam — not faked.)
- [x] Add audit query helpers for operations. (`queryAuditEvents` — filter by actor/action/target/
      severity, newest-first, capped.)

Exit criteria:

- [x] Trust-sensitive actions write expected audit events. (Real key issue/revoke → append-only
      `api_key.issue`/`api_key.revoke` rows; proven live 15/15 + the CLI path.)

Suggested verification:

- `pnpm --filter @intercal/core test` (`auth/audit.test.ts`)
- `DATABASE_URL=<neon-branch> node scripts/dev/verify-audit.mjs` (live append-only + emit proof)

## Workstream 4: Feedback And Review Records

Goal: Accept bounded feedback without public canonical mutations.

Orchestrator checkpoint (2026-06-06T05:17Z): Codex P1 dispatched as agent
`019e9b5d-9e84-7201-b48f-5ad044ec376a`. Ownership: bounded feedback/review records across
contracts/API/core/db/docs/tests as required. A duplicate W4 dispatch
`019e9b5e-826b-7483-91c9-c061f3c2c33d` was closed immediately; ignore it. Next coordinator action:
poll P1 to terminal, checkpoint result, then dispatch fresh-context P2.

Return checkpoint (2026-06-06): P1 implemented the feedback/review loop but did not commit because
W4 and W5 both legitimately touch TypeSpec, generated contracts, and API shared files. Verification
reported green for contracts build, lint/typecheck/test/build, Python gates, and diff-check; DB
migration was not run because the shell had no verified `DATABASE_URL`. Next coordinator action:
commit the combined W4/W5 contract/API state through a focused integration worker, then dispatch W4
P2.

Integration checkpoint (2026-06-06T06:09Z): combined W4/W5 integration/staging worker dispatched as
agent `019e9bb8-e241-7221-9de5-44bf368be058`. Ownership: current interleaved W4 feedback + W5
subscription WIP, generated contracts, tests/docs/checkpoints. Next coordinator action: poll to
terminal; if it commits, dispatch W4 P2 from the integrated commit.

Audit-2 checkpoint (2026-06-06): W4 P2 agent `019e9bc2-5236-71b2-892e-239f4d29269b` found and fixed
a real duplicate-risk gap in commit `2833f76`: SDK feedback POSTs are no longer automatically retried
after a possible server commit. Verification covered SDK/API/core/contracts/scoped Biome/diff-check;
DB migration proof remains unavailable without a verified throwaway DB target. W4 P3 confirm-quiet
dispatched as agent `019e9bc8-a57d-79d0-b506-9df23d3677a2`.

P3 checkpoint (2026-06-06): W4 P3 found and fixed another real gap in commit `7ada730`: malformed
non-UUID `source` feedback targets now reject before querying the UUID-backed `sources.id` column,
keeping failures on the bounded `invalid_request` path. Verification covered core/API/SDK/contracts/
scoped Biome/diff-check. Next coordinator action: W4 P4 confirm-quiet.

P4 checkpoint (2026-06-06): W4 P4 found and fixed another real gap in commit `dd5fb8f`: caller
controlled `x-request-id` correlation metadata is now trimmed, empty values are ignored, and values
over 128 chars or containing control characters are rejected before review/audit rows are stored.
Verification covered API/core/SDK/contracts/scoped Biome/diff-check. Next coordinator action: W4 P5
confirm-quiet.

P5 checkpoint (2026-06-06T06:48Z): W4 P5 confirm-quiet dispatched as agent
`019e9bd5-7765-7923-8dde-59feb027b852`. Ownership: W4 feedback/review only. Next coordinator action:
poll to terminal and gate W4.

P5 return checkpoint (2026-06-06): W4 P5 returned quiet with no changes. Verification covered API
feedback tests, SDK tests, core tests, core/API/SDK typechecks, scoped Biome, and diff-check.
`pnpm contracts:check` could not be used as a W4 closeout proof because active W5 TypeSpec doc drift
created generated side effects, and `pnpm db:check` remains blocked by unapplied migrations 0026-0029
on the configured DB. W4 is closed.

Integration return (2026-06-06): combined W4/W5 commit completed. Verification passed for
`pnpm contracts:build`, `pnpm contracts:check`, touched package typechecks/tests, full package
`pnpm build`, `pnpm py:typecheck` (0 errors, existing warnings), scoped W4/W5 Biome checks, and
`git diff --cached --check`. `pnpm db:check` was not run because there was no verified throwaway DB
target: process `DATABASE_URL` was unset, Docker was not on PATH, and `.env` was intentionally not
used as an unverified mutable database target. Next coordinator action: dispatch W4 P2.

Status: [x] **Complete** (2026-06-06). Public feedback now creates bounded `review_records`
through `POST /v1/feedback` and the SDK `submitFeedback` method. The API validates against the
TypeSpec-derived `FeedbackRequest` contract, supports entity/claim/source/digest/freshness/coverage
targets, and creates only `received` records. Entity, claim, source, and digest targets are checked
before a review row is accepted; freshness and coverage are accepted as bounded query targets. Each
accepted submission writes `feedback.submit` to `audit_events` in the same transaction as the review
record. Focused API tests prove review/audit creation and canonical entity/claim/source/digest
snapshots remain unchanged. Durable doc: `docs/operations/review-workflows.md`.

**Audit-2 (2026-06-06, fresh-context pass):** core/API/schema boundaries held: feedback inserts only
`review_records` plus transactional `feedback.submit`, validates through the generated
`FeedbackRequest` schema, rejects unknown canonical targets before insert/audit, and leaves canonical
entities/claims/sources/digests unchanged. One real SDK gap was fixed: `submitFeedback` no longer
inherits automatic transient retries, preventing duplicate review rows when a feedback POST commits
but the response fails.

Depends on:

- [x] Workstream 3 audit events.
- [x] Plan 03 claim/entity/source response IDs.

Enables:

- [ ] Plan 06 feedback/reporting UX.

Repo guidance:

- Feedback can create review records only; operator-governed systems decide later action.

Primary areas:

- `packages/api`
- `packages/shared`
- `docs/operations/review-workflows.md`

Implementation tasks:

- [x] Add feedback/report issue endpoint.
- [x] Add review record schema if not already covered by audit/review tables.
- [x] Add targets for entity, claim, source, digest, freshness, and coverage concerns.
- [x] Add status workflow for received, reviewing, resolved, rejected.
- [x] Add tests proving feedback does not mutate canonical records.

Exit criteria:

- [x] Public feedback creates audited review records and leaves canonical graph unchanged.

Suggested verification:

- `pnpm --filter @intercal/api test -- feedback`
- `pnpm --filter @intercal/sdk test`

## Workstream 5: Subscriptions

Goal: Notify interested consumers when relevant knowledge changes.

Status: [x] **Complete** (2026-06-06). Subscription registration, polling, bounded notification
outbox, webhook dispatch seam, retry/backoff state, delivery logs, and REST contract routes are
implemented. Existing `subscriptions` registration schema is extended by
`0029_subscription_notifications.sql` (`subscription_notifications` + `subscription_delivery_logs`).
REST routes require the `manage:subscriptions` scope and use the shared auth/rate-limit middleware:
`GET /v1/subscriptions`, `POST /v1/subscriptions`, `POST /v1/subscriptions/poll`,
`POST /v1/subscriptions/dispatch`, and `POST /v1/subscriptions/delete`. Notifications are built
from the shared Plan 03 delta service, copy `minImportance`/`tokenBudget` at enqueue time, store only
public-contract-shaped payloads (summary, citations, IDs/summaries, confidence, freshness), and skip
below-threshold changes. Webhook delivery is executable through `WebhookDeliveryPort` with exponential
backoff and append-only delivery attempt logs; provider-specific HTTP logic stays outside the core
query layer. Webhook secrets are accepted only at create time, stored as a hash, and never returned.
Durable doc: `docs/operations/subscriptions.md`.

Orchestrator checkpoint (2026-06-06T05:19Z): Codex P1 dispatched as agent
`019e9b5f-191b-70c1-a1de-f1012c0a5ac1`. Ownership: subscription contracts/API/core/db/docs/tests;
parallel agents are active on W3/W4 and Plan07 W7, so no same-stream overlap. Next coordinator
action: poll P1 to terminal, checkpoint result, then dispatch fresh-context P2.

Return checkpoint (2026-06-06): P1 implemented subscription registration, polling, webhook dispatch
port, retry/backoff, delivery logs, token-budgeted notifications, secret-hash storage, and audit
actions, but did not commit because W4 generated-contract/API edits are interleaved. Verification
reported green for contracts build, TS checks/tests/builds, lint, and Python gates; `pnpm db:check`
was not run to completion against an unknown DB target and `pnpm contracts:check` had expected
pre-commit drift. Next coordinator action: commit the combined W4/W5 contract/API state through a
focused integration worker, then dispatch W5 P2.

Integration checkpoint (2026-06-06T06:09Z): combined W4/W5 integration/staging worker dispatched as
agent `019e9bb8-e241-7221-9de5-44bf368be058`. Ownership: current interleaved W4 feedback + W5
subscription WIP, generated contracts, tests/docs/checkpoints. Next coordinator action: poll to
terminal; if it commits, dispatch W5 P2 from the integrated commit.

Audit-2 checkpoint (2026-06-06): W5 P2 agent `019e9bc2-9b37-70c1-a770-c27365a1c734` found and fixed
real dispatch-matching gaps in commit `42d008c`: target-kind validation, non-empty claim patterns, no
unrelated claim-pattern broadcasts, and inactive subscriptions blocked from polling/delivery.
Verification covered core/API/contracts/scoped Biome/diff-check; migration 0029 still lacks
throwaway DB proof. W5 P3 confirm-quiet dispatched as agent `019e9bc8-e10e-7d90-99b7-6d475080b6e9`.

P3 status checkpoint (2026-06-06): W5 P3 agent `019e9bc8-e10e-7d90-99b7-6d475080b6e9` found another
real gap: REST `/v1/subscriptions/dispatch` could enqueue notifications across all matching active
subscriptions for any `manage:subscriptions` key instead of scoping dispatch to the caller's
subscriptions. The agent reported a fix in progress and verification, but terminated before
committing/pushing. Next coordinator action: replace with a focused W5 P3 completion worker to finish,
stage, commit, and push only the W5 fix.

Replacement checkpoint (2026-06-06T06:35Z): W5 P3 completion worker dispatched as agent
`019e9bce-6185-7e63-8c13-83fb828dae8e`. Ownership: finish and commit the owner-scoped dispatch fix
only. Next coordinator action: poll to terminal, then gate W5.

P3 return checkpoint (2026-06-06): replacement worker returned and pushed `33f97b0`, scoping REST
subscription dispatch to the authenticated API-key owner while requiring trusted internal fan-out to
choose `internal_all_active` with a reason. Verification covered core/API/contracts/scoped
Biome/diff-check. `pnpm db:check` still reports unapplied migrations 0026-0029 on the configured DB
and full lint is blocked by unrelated `review.ts` regex findings. This was a meaningful fix; next
coordinator action is W5 P4 confirm-quiet.

P4 checkpoint (2026-06-06T06:48Z): W5 P4 confirm-quiet dispatched as agent
`019e9bd5-b01b-7b70-bd7f-be60d76c2a52`. Ownership: W5 subscriptions only. Next coordinator action:
poll to terminal and gate W5.

P4 return checkpoint (2026-06-06): W5 P4 found and fixed a contract/docs honesty gap in `37f2b6a`:
the public TypeSpec/OpenAPI description for `POST /v1/subscriptions/dispatch` now states REST
dispatch only enqueues notifications for subscriptions owned by the authenticated API key.
Verification covered contracts build/check, focused core/API tests, shared typecheck, and diff-check.
Next coordinator action: W5 P5 confirm-quiet.

P5 checkpoint (2026-06-06T07:01Z): W5 P5 confirm-quiet dispatched as agent
`019e9bda-fa18-7833-8cb9-9e21baa7f76d`. Ownership: W5 subscriptions only. Next coordinator action:
poll to terminal and gate W5.

P5 return checkpoint (2026-06-06): W5 P5 found and fixed another real validation gap in `db5ed21`:
malformed UUID-backed subscription inputs now reject before reaching Postgres UUID columns, keeping
create, dispatch, poll, and delete failures on the bounded `invalid_request` path. Verification covered
core/API/contracts/scoped Biome/diff-check. `pnpm db:check` still reports unapplied migrations
0026-0029 on the configured DB. Next coordinator action: W5 P6 confirm-quiet.

P6 checkpoint (2026-06-06T07:09Z): W5 P6 confirm-quiet dispatched as agent
`019e9bdf-7f55-7f02-86b5-087176db8a62`. Ownership: W5 subscriptions only. Next coordinator action:
poll to terminal and gate W5.

P6 return checkpoint (2026-06-06): W5 P6 found and fixed another real validation/security gap in
`6848d54`: unknown nested subscription target and dispatch fields are rejected instead of ignored,
and webhook URL/secret fields are rejected on polling subscriptions so unused secrets are not hashed
or persisted. Verification covered core/API typecheck+tests, contracts:check, scoped Biome, and
diff-check. Next coordinator action: W5 P7 confirm-quiet.

P7 checkpoint (2026-06-06T07:19Z): W5 P7 confirm-quiet dispatched as agent
`019e9be6-28ae-7a71-978d-3784c1ec0ca5`. Ownership: W5 subscriptions only. Next coordinator action:
poll to terminal and gate W5.

P7 return checkpoint (2026-06-06): W5 P7 returned quiet with no changes. Verification covered core
tests (113), API tests (63), core/API typechecks, contracts:check, scoped Biome, and diff-check.
`pnpm db:check` remains blocked by unapplied migrations 0026-0029 on the configured DB. W5 is closed.

Integration return (2026-06-06): combined W4/W5 commit completed with generated TypeSpec artifacts
checked after staging. Verification passed for `pnpm contracts:build`, `pnpm contracts:check`,
touched package typechecks/tests, full package `pnpm build`, `pnpm py:typecheck` (0 errors, existing
warnings), scoped W4/W5 Biome checks, and `git diff --cached --check`. `pnpm db:check` was not run
because there was no verified throwaway DB target: process `DATABASE_URL` was unset, Docker was not
on PATH, and `.env` was intentionally not used as an unverified mutable database target. Next
coordinator action: dispatch W5 P2.

Depends on:

- [x] Plan 03 freshness/delta query services.
- [x] Workstream 1 auth.

Enables:

- [ ] Plan 06 subscription management UI.

Repo guidance:

- Webhook delivery must avoid leaking secrets or unrestricted internal payloads.

Primary areas:

- `packages/api`
- `services/synthesize`
- `docs/operations/subscriptions.md`

Implementation tasks:

- [x] Add topic, entity, relationship, and claim-pattern subscriptions.
- [x] Add polling and webhook delivery surfaces.
- [x] Add minimum importance thresholds and token-budgeted notification payloads.
- [x] Add retry/backoff and delivery logs.

Exit criteria:

- [x] Fixture entity/topic changes produce expected subscription notifications through the
      shared delta-backed enqueue path and scoped polling surface; webhook delivery attempts are
      driven through a port and logged with retry/backoff state.

Suggested verification:

- `pnpm --filter @intercal/core typecheck`
- `pnpm --filter @intercal/api typecheck`
- `pnpm --filter @intercal/core test`
- `pnpm --filter @intercal/api test`
- `pnpm contracts:check`

## Workstream 6: Observability

Goal: Make system health, quality, cost, and freshness visible.

Orchestrator checkpoint (2026-06-06T07:27Z): W6 P1 dispatched as agent
`019e9be9-960c-7b81-972f-9d212280dda6`. Ownership: real health/quality/cost/freshness metrics via
scripts/core/db/docs/tests as needed; no W4/W5/W7/W8 work. Next coordinator action: poll to terminal,
checkpoint result, then dispatch W6 P2.

P2 checkpoint (2026-06-06T07:47Z): W6 P2 fresh-context audit dispatched as agent
`019e9bf4-042b-7f00-8acc-e7fc71eedb85`. Ownership: W6 observability only. Next coordinator action:
poll to terminal and gate W6.

P2 return checkpoint (2026-06-06): W6 P2 returned and pushed `01e8591`, fixing telemetry honesty:
provider consumption now stays `NULL`/`unavailable` when no real provider usage event exists, budget
allowance rows include documented provider signals, the core snapshot includes usage latency, and CLI
truncation uses ASCII. Verification covered CLI help/print-sql, core observability tests/typecheck,
scoped Biome, and diff-check. `pnpm db:check` remains unavailable without a verified DB target. This
was a meaningful fix; next coordinator action is W6 P3 confirm-quiet.

P3 checkpoint (2026-06-06T08:01Z): W6 P3 confirm-quiet dispatched as agent
`019e9bf9-b480-7f50-8e28-5ac04de52545`. Ownership: W6 observability only. Next coordinator action:
poll to terminal and gate W6.

P3 return checkpoint (2026-06-06): W6 P3 found and fixed another real gap in `c613db4`:
`provider_usage_events` is now schema-enforced append-only with update/delete/truncate guards, matching
the documented telemetry invariant. Verification covered CLI help/print-sql, core observability
tests/typecheck, scoped Biome, and diff-check. `pnpm db:check` reports unapplied migrations 0026-0030
on the configured DB. Next coordinator action: W6 P4 confirm-quiet.

P4 checkpoint (2026-06-06T08:08Z): W6 P4 confirm-quiet dispatched as agent
`019e9bfd-db73-73e1-9390-0316e45630d9`. Ownership: W6 observability only. Next coordinator action:
poll to terminal and gate W6.

P4 return checkpoint (2026-06-06): W6 P4 returned quiet with no changes. Verification covered
`ops:health` help/print-sql, core observability tests (116), core typecheck, scoped Biome, and
diff-check. `pnpm db:check` was not run because `DATABASE_URL` was unset, `.env` is present but
unverified, Docker is not on PATH, and the migration check creates `_migrations` if missing, so it is
not a safe no-op against an unknown mutable DB. W6 is closed.

Status: [x] **Complete** (2026-06-06). Observability now starts from SQL-owned views and a
Windows-friendly operator CLI rather than dashboard-only cards. Migration `0030_observability.sql`
adds `provider_usage_events` plus budget allowance rows linked to `docs/operations/resource-budget.md`,
then exposes `observability_source_health`, `observability_failed_jobs`,
`observability_pipeline_metrics`, `observability_usage_latency`, `observability_freshness`, and
`observability_provider_consumption`. The views cover source health, failed ingestion/subscription
jobs, extraction/document/chunk volume, claim/evidence quality, resolution candidates,
merge/split events, embedding coverage, digest cache staleness, subscription queue/backoff state,
API/MCP latency/error/token usage from `usage_events`, and freshness across sources/documents/claims/
fact versions/digests. Provider usage is explicit and append-only: real Neon/R2/Upstash/Vertex/Gemini/
GitHub Actions/Vercel/Cloud Run measurements can be imported into `provider_usage_events`; missing
provider readings surface as `unavailable`, never as fake zero usage. `pnpm ops:health` reads the
views with `summary`, `sources`, `freshness`, `failures`, `usage`, and `providers` sections plus JSON
and SQL dry-output modes. Core exports `queryObservabilitySnapshot` for future dashboard/API readers
without duplicating SQL semantics. Durable doc: `docs/operations/observability.md`; resource-budget
monitoring now points at the CLI/view path.

Verification (2026-06-06): `pnpm ops:health --help`, `pnpm ops:health --print-sql`,
`pnpm --filter @intercal/core test -- observability` (114 tests due package filter behavior),
`pnpm --filter @intercal/core typecheck`, scoped `biome check`, and `git diff --check` passed.
`pnpm db:check` was not run: process `DATABASE_URL` is unset, Docker is unavailable, and the local
`.env` target was not treated as a verified throwaway database.

Depends on:

- [x] Plans 02-03 data and API surfaces.
- [x] Workstreams 1-5 usage/audit/subscription records.

Enables:

- [ ] Plan 05 scale and cost review.

Repo guidance:

- Start with database views and CLI commands; UI cards are allowed when they read real state.

Primary areas:

- `scripts/ops`
- `packages/dashboard`
- `docs/operations/observability.md`

Implementation tasks:

- [x] Add ingestion, worker, queue, failed job, extraction, claim, resolution, merge/split, embedding, digest cache, API/MCP latency, provider usage/cost, and freshness metrics.
- [x] Add per-provider consumption tracking vs. free-tier allowances: Neon compute/storage, Cloudflare R2 operations/egress, Upstash Redis commands/bandwidth, Vertex AI / Gemini daily token cap, GitHub Actions minutes. Surface these against the limits in `docs/operations/resource-budget.md`.
- [x] Add CLI or database views for key health checks.
- [x] Add dashboard cards where useful and backed by real data. (No dashboard cards added in this pass; the useful shipped surface is CLI + SQL views. Future cards should read the same views.)

Exit criteria:

- [x] Operator can inspect source health, failed jobs, usage, freshness, and per-provider cost/consumption signals against the resource budget.

Suggested verification:

- `pnpm ops:health`
- `pnpm test -- observability`

## Workstream 7: Deployment Paths And Backups

Goal: Document and prove the live and alternative deployment paths with backup/restore.

Backup/restore overlap status (2026-06-06): Plan 07 W7 landed the hosted-backup portion in
`docs/operations/backups.md` with `scripts/ops/backup-restore.mjs` (`pnpm ops:backup`,
`pnpm ops:restore-proof`, `pnpm backup:test`). It documents Neon branching/PITR plus a portable
`pg_dump` custom-format second-copy path with optional R2/S3 upload, and restores into a fresh
operator-supplied branch/target before running the restored-store heartbeat. The broader deployment
path, VPS, self-host, DNS/TLS, and account setup surfaces remain open here.

Orchestrator checkpoint (2026-06-06T08:16Z): W7 P1 dispatched as agent
`019e9c01-33e2-7783-a591-b811cf81dc36`. Ownership: Plan04 W7 deployment paths/backups only; use
closed Plan07 W7 as backup/restore source truth and do not duplicate or contradict it. Next
coordinator action: poll to terminal, checkpoint result, then dispatch W7 P2.

P1 return checkpoint (2026-06-06): W7 P1 returned and pushed `f60fc34`, adding
`docs/operations/deployment.md`, updating deployment topology/roadmap/changelog, and fixing
`scripts/ops/deploy-cloud-run.mjs` to tolerate pnpm's `--` separator so the documented dry-run works.
Verification covered docs readback, backup dry-run/help, deploy dry-run, scoped Biome, diff-check,
and staged secret scan. Live provider/DNS checks and real restore proof remain operator-gated. Next
coordinator action: W7 P2 fresh-context audit.

P2 checkpoint (2026-06-06T08:29Z): W7 P2 fresh-context audit dispatched as agent
`019e9c07-d445-7312-9db3-085ead4c568b`. Ownership: Plan04 W7 deployment paths/backups only. Next
coordinator action: poll to terminal and gate W7.

P2 return checkpoint (2026-06-06): W7 P2 found and fixed a real deployment-doc gap in `77fb198`:
the Vercel Root Directory is now explicit so the package-local `packages/dashboard/vercel.json` build
contract is not missed. Verification covered backup/deploy dry-runs, diff-check, and secret scan.
Live provider/DNS/restore proofs remain operator-gated. Next coordinator action: W7 P3 confirm-quiet.

P3 checkpoint (2026-06-06T08:39Z): W7 P3 confirm-quiet dispatched as agent
`019e9c0b-bf93-7400-adc0-5ed18fc91a22`. Ownership: Plan04 W7 deployment paths/backups only. Next
coordinator action: poll to terminal and gate W7.

P3 return checkpoint (2026-06-06): W7 P3 found and fixed a real consistency gap in `218b52a`: the
Cloud Run deploy script comment now correctly says the Cloud Run Job/Artifact Registry region comes
from `CLOUD_RUN_REGION`, not `GCLOUD_REGION`. Verification covered backup/deploy dry-runs, node check,
Biome, diff-check, and scoped secret scan. Live provider/DNS/restore proofs remain operator-gated.
Next coordinator action: W7 P4 confirm-quiet.

P4 checkpoint (2026-06-06T08:51Z): W7 P4 confirm-quiet dispatched as agent
`019e9c0f-992f-7f62-9909-e87dbc6a3f67`. Ownership: Plan04 W7 deployment paths/backups only. Next
coordinator action: poll to terminal and gate W7.

P4 return checkpoint (2026-06-06): W7 P4 returned quiet with no changes. Verification covered
deploy-cloud-run dry-run, backup dry-run, restore-proof help, node check, Biome, W7 diff-check, and
secret scan. Live provider/DNS/restore proofs remain honestly operator-gated. W7 is closed.

P1 closeout (2026-06-06): W7 deployment-path docs landed. `docs/operations/deployment.md` now
documents the primary hosted path (Vercel app+REST+MCP, Neon, GitHub Actions scheduled pipeline,
Cloud Run Jobs on-demand, Upstash, R2), DNS/TLS, env fan-out, migrations, health checks, upgrade and
rollback flow, Plan07 W7 backup/restore handoff, optional `docker compose` self-host, and the
single-VPS paid alternative. `docs/architecture/deployment-topology.md` links to the operator
runbook. Verification covered docs readback, script syntax/help/dry-runs for the existing backup and
Cloud Run deploy tools, and diff-check. Real hosted proof remains honest: live backup/restore/upload
is still operator-gated because this environment does not have `pg_dump`, `pg_restore`, or `aws` on
PATH and no throwaway `RESTORE_DATABASE_URL` was supplied; live Vercel/GitHub/Cloud Run/DNS checks
also require authenticated provider sessions. W7 is closed for deployment documentation, with the
Plan07 W7 proof limitation carried forward unchanged.

Depends on:

- [x] Workstreams 1-6.

Enables:

- [ ] Plan 05 deployment and release audit.

Repo guidance:

- The primary deployment topology is decided (decisions `0001`/`0002`): app+MCP on Vercel, pipeline on GitHub Actions + Cloud Run Jobs, DB on Neon. Plan 07 owns the deploy/CD/secret-fan-out automation. This workstream documents and proves that path, plus the VPS and self-host alternatives.
- `docker compose` remains in the repo as a self-host/other-users path. Maintainers develop directly against Neon — no local Docker required.

Status: [x] **Complete** (2026-06-06). Deployment paths are documented against the live repo
surfaces. The primary hosted runbook is `docs/operations/deployment.md`; backup/restore remains
sourced from `docs/operations/backups.md` and `scripts/ops/backup-restore.mjs` (Plan 07 W7). The
documented proof path is runnable, but live restore/upload proof remains operator-gated until
Postgres client tools, AWS CLI, and a throwaway restore target are available.

Primary areas:

- `docs/operations/deployment.md`
- `docs/operations/backups.md`
- `scripts/ops`

Implementation tasks:

- [x] Document and prove the live deployment path: Vercel (app+MCP+REST) + Neon (DB) + GitHub Actions (batch pipeline) + Cloud Run Jobs (on-demand) + Upstash + R2. (Docs prove the repo wiring; live provider smoke requires authenticated operator sessions.)
- [x] Document optional self-host path using `docker compose` (for other users; maintainers use Neon direct).
- [x] Document single-VPS deployment as a paid-tier alternative.
- [x] Add DNS, TLS, env, health check, migration, upgrade, backup, and restore instructions.
- [x] Add backup/restore test command (Neon branch + dump). (Implemented by Plan 07 W7 and linked
      from the deployment runbook.)

Exit criteria:

- [x] Backup and restore are documented for the live Neon path and the VPS path is documented. The
      Plan 07 W7 runbook/script proof path exists; live restore execution remains operator-gated and
      is not claimed without `pg_dump`/`pg_restore`, optional `aws`, operator DB credentials, and a
      throwaway branch.

Suggested verification:

- Docs readback and `git diff --check`
- `pnpm ops:backup -- --dry-run`
- `pnpm ops:restore-proof -- --help`
- `pnpm ops:deploy-cloud-run -- --dry-run`

## Workstream 8: Account And CLI Setup Runbook

Goal: Document the dedicated account setup session so later agents can operate without repeated access friction.

Orchestrator checkpoint (2026-06-06T09:28Z): W8 P1 dispatched as agent
`019e9c1c-fd11-7ed1-8636-3e7420534f8d`. Ownership: account/CLI setup runbook and secret-safe proof
checklist only; no Plan05/06/07 implementation. Next coordinator action: poll to terminal,
checkpoint result, then dispatch W8 P2.

P1 closeout (2026-06-06): W8 account setup runbook landed in `docs/operations/account-setup.md`.
It documents the dedicated operator session prerequisites and proof commands for domain/DNS, SSH/VPS,
Neon, Cloudflare R2, Upstash, Vertex/Gemini, GCloud Cloud Run/Cloud Build, GitHub Actions, Vercel,
local CLI auth, secret handoff, and rotation. It links to the existing deployment/secrets/backups/
budget runbooks instead of duplicating lower-level provider flows or values. Live provider calls
remain operator-gated when authenticated accounts, controlled domain, throwaway Neon branch, or quota
approval are not available.

Coordinator gate (2026-06-06): P1 commit `d587745` changed 3 files (+471/-6), a large first-pass
runbook addition. Next coordinator action: W8 P2 fresh-context audit.

P2 checkpoint (2026-06-06T09:39Z): W8 P2 fresh-context audit dispatched as agent
`019e9c26-3745-7082-a869-b0b57f37de1a`. Ownership: account/CLI setup runbook only. Next coordinator
action: poll to terminal and gate W8.

P2 return checkpoint (2026-06-06): W8 P2 found and fixed a real command-accuracy gap in `c1a8a42`:
`scripts/ops/secrets-fanout.mjs` now ignores pnpm's standalone `--` separator, so documented
`pnpm ops:secrets-fanout -- --dry-run` proof commands work. Verification covered secrets-fanout
dry-runs, backup/deploy/health/restore help paths, diff-check, and secret scan. Live provider
calls/writes remain operator-gated. Next coordinator action: W8 P3 confirm-quiet.

P3 checkpoint (2026-06-06T09:52Z): W8 P3 confirm-quiet dispatched as agent
`019e9c2c-f28a-7fb3-9f2a-e27f84023bfd`. Ownership: account/CLI setup runbook and directly
referenced CLI/script surfaces only. Next coordinator action: poll to terminal and gate W8.

P3 return checkpoint (2026-06-06): W8 P3 found and fixed another real command-accuracy gap in
`fbcba08`: `scripts/ops/health.mjs` now ignores pnpm's standalone `--` separator, so documented
`pnpm ops:health -- --section ...` proof commands work. Verification covered health CLI help,
section listing, section SQL printing, node check, Biome, diff-check, and secret scan. Live health
sections still require a verified `DATABASE_URL`. This was a meaningful command fix; next
coordinator action is W8 P4 confirm-quiet.

P4 checkpoint (2026-06-06T10:02Z): W8 P4 confirm-quiet dispatched as agent
`019e9c31-9ce9-7732-a027-29b4508b8820`. Ownership: account/CLI setup runbook and directly
referenced CLI/script surfaces only. Next coordinator action: poll to terminal and gate W8.

P4 return checkpoint (2026-06-06): W8 P4 returned quiet with no changes. Verification covered
`.env` ignore status, health list/print-sql paths, backup help, deploy dry-run, secrets-fanout
target/all dry-runs, and diff-check. Live DNS/TLS, provider listings/resource checks, and DB-backed
health/db checks remain operator-gated because they require authenticated provider access and/or a
verified database target.

Depends on:

- [x] Workstream 7 deployment requirements.

Enables:

- [ ] Managed provider verification in Plans 04-05.

Repo guidance:

- Do not commit secrets; document where they live and how to verify access.

Primary areas:

- `docs/operations/account-setup.md`
- `docs/operations/secrets.md`

Status: [x] **Complete** (2026-06-06). `docs/operations/account-setup.md` is now the single setup
session runbook for future operators. It is secret-safe by construction: values remain in `.env` /
host secret stores, names remain in `.env.example` and `scripts/ops/secrets.manifest.json`, and
provider proof commands favor metadata/name listing rather than value output. The runbook covers the
managed hosted path plus the optional VPS lane, names exact operator access needed, and carries live
proof limitations honestly when provider auth or quota approval is required.

Implementation tasks:

- [x] Add prerequisites for domain/DNS, SSH keys, VPS, Neon (DB), Cloudflare R2 (storage), Upstash (queue), Vertex AI / Gemini (LLM), GCloud Cloud Run / Cloud Build, GitHub Actions, Vercel, and CLI auth.
- [x] Add proof commands for each account/tool.
- [x] Add secret handoff and rotation policy.

Exit criteria:

- [x] A single setup session can configure required accounts and leave verifiable docs for future work.

Suggested verification:

- Manual proof command checklist in `docs/operations/account-setup.md`.

## Final Verification And Closeout

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `uv run ruff check .`
- `uv run pyright`
- `uv run pytest`
- `pnpm contracts:check`
- `pnpm ops:health`
- `pnpm deploy:check`
- `pnpm backup:test`
- Update security, operations, deployment, source policy, account setup, and observability docs.
- Add changelog fragment.
- Stop local services or document why they remain running.
- Stage intentional files only, commit, and push.

## Acceptance Criteria

- [x] Auth and rate limits protect REST/MCP.
- [x] Source policy is enforced in ingestion and responses.
- [x] Audit events cover trust-sensitive actions.
- [x] Feedback creates review records without public graph mutation.
- [x] Subscriptions deliver test payloads.
- [x] Observability exposes real health and cost signals without fake provider-usage zeroes.
- [x] Deployment and backup/restore paths are documented; the runnable restore-proof path exists,
      while live restore/upload proof remains operator-gated on PostgreSQL client tools, AWS CLI/R2
      access, and a throwaway restore target.

## Implementation Order

1. Auth and rate limits.
2. Source policy and trust.
3. Audit events.
4. Feedback and review records.
5. Subscriptions.
6. Observability.
7. Deployment paths and backups.
8. Account and CLI setup runbook.
9. Final verification, docs, changelog, commit, and push.

## Future Expansion

- Add moderation workflows for trusted maintainers after feedback/review records are proven.
- Add hosted public instance operations after source and trust boundaries are fully verified.
