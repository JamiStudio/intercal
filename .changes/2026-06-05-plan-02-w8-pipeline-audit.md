# Plan 02 W8 Pipeline Orchestration — drain-loop audit fix

Date: 2026-06-05
Type: fix
Services: intercal-pipeline, intercal-resolve

## Summary

Second fresh-context audit of W8 (pipeline orchestration) — the final Plan 02
workstream. Pass 1 landed `services/pipeline` (`run_pipeline` + `PipelineRunHealth`,
`intercal-pipeline run`/`run-all`), the `verify_w8_pipeline.py` heartbeat, the
resolve/link draining loops, and predicate-vocab additions. This pass closes one
latent correctness defect in the link drain and re-proves idempotency on real data.
Stays in the W8 lane; the port/adapter seams and the contract boundary are untouched;
later-plan synthesis steps remain `NotImplementedError` ("Plan 03"/"Plan 04").

## Change

- **Link drain could terminate early at scale (paging fix).** The orchestrator's
  link-claim-entities drain stopped on no-progress (`claims_updated == 0`).
  Unlinkable claim ends are left NULL by design and re-load in the same
  stable-ordered position every batch, so a full batch of unlinkable claims sorted
  ahead of linkable ones would end the drain before reaching the linkable claims —
  leaving them for a *later* whole-pipeline run, which would then create *new*
  relationships (an idempotency break at scale). Did not bite at current production
  scale (114 claims < the 200-claim batch). Fixed by paging:
  `link_claim_entities` gained an `offset` parameter (stable order extended to
  `extraction_confidence DESC, created_at, id`), and `run_pipeline` advances the
  offset past the claims that *stayed* unlinked each batch
  (`claims_loaded - claims_updated`), stopping on the first partial batch — visiting
  every NULL-end claim exactly once. Resolve was already correct (it self-consumes
  its load set; an empty load is the true end), so it is unchanged. `offset` defaults
  to `0`, so existing direct callers (resolve CLI, W6 tests, verify scripts) are
  unaffected.

## Verified correct — no change

- **Health counters read the right keys.** All per-stage counters
  (`mentions_loaded`, `entities_created`, `merges_performed`, `candidates_created`,
  `claims_loaded`, `claims_updated`, `relationships_written`, `versions_written`,
  and the ingest/extract/embed keys) match the real job return dicts.
- **Stage ordering & budget.** ingest → normalize → extract → embed → resolve →
  link → derive → write-fact-versions; `INGEST_MAX_DOCS_PER_RUN` and the
  per-document chunk cap respected; synthesis steps not invoked.
- **Predicate vocab.** `contributed`/`contributor`/`committed`/`submitted` →
  `person_authored_artifact` is a semantic match to the seeded type and FK-valid.

## Tests

The existing resolve/link drain regression test was rewritten to assert the paging
contract (3 calls across a partial-final batch; exact advancing offsets `[0, 3, 13]`;
links accumulated from the final batch — the old no-progress stop would have missed
them). 373 service tests pass; `pnpm py:lint` + `pnpm py:typecheck` clean (0 errors).

## Live verification

Throwaway Neon branch (copy-on-write fork of `production`, deleted after) — real
data, no mocks:

- **Link paging proof:** with `batch_size=5` the paged drain visited the full
  102-claim NULL-end set across 21 iterations (offsets 0→100, last page partial),
  terminated, and produced **zero new links** (idempotent; the 102 are legitimately
  unlinkable). The old no-progress stop would have visited only the first 5.
- **Full-pipeline heartbeat (`verify_w8_pipeline.py`):** acceptance gate PASS
  (≥1 resolved + ≥1 review + ≥1 relationship + ≥1 fact version); idempotent re-run
  held **155 entities / 6 relationships / 155 fact versions** across both passes —
  zero duplicate canonical records.
- **Production-data legitimacy (read-only, production branch):** the 155 entities /
  6 relationships / 155 fact versions are real LLM extractions from 3 real GitHub
  release documents (Node.js v26.3.0, Rust 1.96.0, Kubernetes v1.36.1) — genuine
  facts (e.g. *Antoine du Hamel → nodejs/node PR #63055*, Rust stabilized APIs),
  each with claim_evidence provenance. The live API (`lntercal.vercel.app`)
  `GET /v1/entity` and `GET /v1/evidence` return this real data.
