# Knowledge Pipeline

How source documents become provenance-backed, bitemporal knowledge. The pipeline is the
Python side (`services/*`); it writes canonical data to Postgres through repositories. Deep
algorithm bodies are implemented in Plan 02 — the foundation provides the structure, ports, and
job entrypoints.

## Stages

```
source → ingest → normalize → extract (mentions, claims) → resolve (entities, relationships)
       → fact versions → embeddings → synthesis (digests, freshness, notifications)
```

| Stage | Service | Jobs | Writes |
| --- | --- | --- | --- |
| Ingest | `intercal-ingest` | `ingest_source`, `normalize_document`, `score_source_health`, `cleanup_expired_cache` | `sources`, `ingestion_runs`, `source_documents`, `document_chunks` |
| Extract | `intercal-extract` | `extract_mentions`, `extract_claims` | `mentions`, `claims`, `claim_evidence` |
| Resolve | `intercal-resolve` | `resolve_entities`, `derive_relationships`, `write_fact_versions` | `entities`, `entity_resolution_candidates`, `entity_merge_events`, `relationships`, `fact_versions` |
| Embed | `intercal-extract` (via `EmbeddingsPort`) | `embed_chunks`, `embed_claims` | `document_embeddings`, `chunk_embeddings`, `entity_embeddings`, `claim_embeddings` |
| Resolve (link) | `intercal-resolve` | `link_claim_entities` | `claims.subject_entity_id` / `object_entity_id` (bridges claims → resolved entities → relationships) |
| Synthesize | `intercal-synthesize` | `build_digest`, `recompute_freshness`, `notify_subscribers` | `digests`, freshness state, subscription deliveries (Plan 03/04) |

## Orchestration

`intercal-pipeline` (`services/pipeline`) is the single orchestration entrypoint. `run_pipeline`
chains the per-service jobs in stage order — ingest → normalize → extract (mentions+claims) →
embed (chunks+claims) → resolve entities → link claim entities → derive relationships → write fact
versions — and returns a `PipelineRunHealth` summary (per-stage counters, error counts, run id,
timing, and a `succeeded | partial | failed` status). It composes the real jobs (no duplicated
logic) and terminates at fact versions; synthesis (`compute_freshness`, `synthesize_digest`,
Plan 03; `dispatch_subscriptions`, Plan 04) is explicitly not invoked here.

Idempotence/resumability is a composition property: each stage is individually idempotent, the
orchestrator skips extraction for already-extracted documents (LLM output is non-deterministic),
and it **drains** the batch-oriented resolve/link stages so a re-run produces no duplicate
canonical records. Resolve drains by re-loading until a pass returns no unresolved mentions (every
loaded mention is consumed). Link **pages** with an advancing offset: unlinkable claim ends are
left NULL by design, so they would re-load forever under a bare `LIMIT`, and stopping on
no-progress would skip linkable claims sorted behind a full batch of unlinkable ones — paging
advances past the claims that stayed unlinked each batch and stops on the first partial batch,
visiting every NULL-end claim exactly once. Per-document stage failures are
non-fatal (logged + counted); a fatal ingest failure ends the run as `failed`. CLI:
`intercal-pipeline run --source-id <uuid>` / `run-all` (`python -m intercal_pipeline <cmd>`).

## Invariants (enforced in schema; see [`data-model.md`](data-model.md))

- **Idempotency:** re-running a job must not duplicate documents, claims, relationships, or fact
  versions. `source_documents.content_hash` is globally unique.
- **Provenance:** every claim used in a public answer traces to `claim_evidence` →
  `source_documents`. Relationships and fact versions are *derived from claims*, not free-floating.
- **Conservative resolution:** false non-merges are acceptable; false merges are corruption.
  Merges go through `entity_resolution_candidates` and are reversible via `entity_merge_events`.
- **Roles/offices are separate entities**, not aliases for their occupants (historical correctness).
- **Bitemporal facts:** `valid_from`/`valid_until` (world time) vs `recorded_at` (transaction
  time); fact history is append-only.
- **Source policy:** `redistribution_allowed` / `citation_only` on sources and documents gate
  what may be stored or exposed, before broad ingestion.

## Execution / scheduling

Jobs run as portable CLI entrypoints (`python -m intercal_<service> <job>`), invoked locally,
by a GitHub Actions scheduled workflow (zero-cost on the public repo), by Modal, or by cron —
all behind the `SchedulerPort`. See [`../../scripts/workers/README.md`](../../scripts/workers/README.md).
