# Plan 02 W2 — Normalisation audit fixes

Date: 2026-06-05
Type: fix
Services: intercal-ingest

## Summary

Second fresh-context audit of Workstream 2 (document normalisation and
chunking). Fixed three data-dependent correctness/cohesion defects the first
pass missed — none surfaced by the original small-document live run.

## Changes

### intercal-ingest (normalizer + jobs)

- `normalizer.py` — `chunk_text` no longer emits a single oversized chunk for
  boundary-free / minified text or for a single sentence longer than
  `chunk_size`. New `_hard_split_segment` splits oversized segments on
  whitespace (hard char-cut for an oversized lone token) before windowing,
  preserving absolute character offsets. No chunk can now exceed `chunk_size`
  (plus a small join slack). The dead `strategy="single"` whole-text fallback
  was removed.
- `jobs.py` — `normalize_document` now deletes stale `document_chunks` rows
  whose `chunk_index >= n_chunks` after the upsert, and clears all chunks on the
  0-chunk (empty-body / empty-normalisation) paths via `_clear_chunks`. A forced
  re-run or smaller `chunk_size` that produces fewer chunks no longer leaves
  orphan rows that corrupt `chunk_count` and the W3 extraction input.
- `jobs.py` — content-type routing made deterministic and robust:
  `ingest_source` now persists the adapter's `content_type` into
  `source_documents.metadata`; the sniff fallback (`_sniff_content_type`) parses
  the whole body (not a 4 KB prefix, which mis-parsed large valid JSON as text)
  and accepts only object/array JSON (a bare scalar body is treated as text).

## Tests

- +8 regression tests (122 service tests pass): boundary-free / giant-sentence /
  oversized-token hard-split with offset integrity, stale-chunk deletion on
  shrinking re-normalise, empty-body chunk clear, large-JSON full-body sniff,
  bare-scalar-not-JSON, and W1 `content_type` write-back into metadata.

## Live verification (Neon branch `br-still-water-ajmss6b6`)

Force re-normalised all 5 W1 documents; `chunks_in_db == sum(chunk_count)`;
idempotent re-run skipped all 5 with stable chunk rows. Shrink test (7 → 1
chunks) confirmed 6 orphan rows are deleted. Branch restored to a consistent
5/5 state.
