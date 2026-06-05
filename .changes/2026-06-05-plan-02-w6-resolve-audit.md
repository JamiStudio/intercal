# Plan 02 W6 — Entity resolution merge-path audit fix

Date: 2026-06-05
Type: fix
Services: intercal-resolve

## Summary

Second fresh-context audit of Workstream 6 (entity resolution). Pass 1 landed
`resolve_entities` (candidate generation, conservative scoring, needs_review
routing, external-ID registration, provenance), the `--embeddings` CLI flag, and
33 tests. Pass 1 produced 11 entities from 11 mentions (1:1) and 0 merges — which
hid a real defect: **the auto-merge path was dead code.** This pass makes merge
genuinely work for unambiguous co-reference while keeping the conservative floor,
and fixes a runtime bug on the merge re-parent path. Stays in the W6 lane;
`derive_relationships` / `write_fact_versions` remain `NotImplementedError("Plan
02 W7 …")`; port/adapter seams untouched.

## Changes (`services/resolve/src/intercal_resolve/jobs.py`)

- **Merge path was unreachable — added the principled trigger.** A
  `proposed_decision='merge'` candidate was never produced: the only candidate
  generator (embedding block) only ran for *new* entities and, for any pair close
  enough to merge, the earlier direct-assignment branch had already consumed it —
  so every emitted candidate was `needs_review`, and step 6's auto-merge (which
  requires `proposed_decision='merge'`) never fired. Added
  `find_external_id_collisions` + step 4: two non-deprecated entities sharing an
  identical `(namespace, external_id)` are unambiguous co-reference; they now emit
  a `merge` candidate at `EXACT_MATCH_CONFIDENCE` (decision_source
  `external_id_match`) which step 6 auto-merges. Name/embedding similarity alone
  still never auto-merges (stays `needs_review`) — the conservative floor holds.
  Replaced the vestigial, never-read `entity_to_spans` block that occupied step 4.
- **Runtime bug on merge re-parent.** Step 6 ran `UPDATE mentions SET entity_id,
  updated_at = now()` but `mentions` has no `updated_at` column (migration 0012) —
  the statement always threw and was swallowed, so mentions pointing at the
  deprecated (merged-away) entity silently kept dangling to a deprecated row.
  Fixed to `UPDATE mentions SET entity_id = $1 WHERE entity_id = $2` (re-parented
  onto the survivor; `resolved_at` already records link time). Also removed the
  dead `if hasattr(pool, "execute")` guard.
- **Query-layer freshness drift.** `_perform_merge` bumped only the *loser's*
  `updated_at`; the survivor's `last_updated_at` (which `packages/core`
  `getEntity` reads for its freshness signal) was never touched. Added a bump of
  the survivor's `last_updated_at` / `updated_at` so a merge is reflected in
  served freshness.

## Verified correct — no change

- **getEntity alignment**: the resolved entity shape matches what the query layer
  returns. `findEntityRow`/`getEntity` filter `is_deprecated = false` and read
  aliases/external-ids from the surviving row — exactly the resolver's post-merge
  output. The loser is correctly excluded. (Direct-by-UUID lookup of a merged-away
  ID returns the deprecated row without chasing `merged_into_id`; that is
  pre-existing query-layer behaviour, not a W6 regression.)
- Conservative floor / review routing principled: `merge` only on external-ID
  identity; `needs_review` for `COSINE_MERGE_THRESHOLD < d ≤ COSINE_REVIEW_THRESHOLD`;
  human/decided candidates never overwritten on re-run.
- Reversibility: `entity_merge_events` stores both snapshots + moved alias/ext-id
  lists; on-conflict during re-parent deletes the duplicate source ext-id (no
  unique-constraint violation, no QID duplication on the survivor).

## Tests

+5 net W6 tests (314 service tests pass; `pnpm py:lint` + `pnpm py:typecheck`
clean): `find_external_id_collisions` (shared id, none, 3-way chain), the full
end-to-end merge path (collision → merge candidate → auto-merge → source
deprecated + mention re-parented + merge event + freshness bump), and the
distinct-IDs-do-not-merge non-merge control.

## Live verification

Neon dev branch `br-still-water-ajmss6b6` plus an adversarial throwaway fork
(`w6-merge-audit-throwaway`, deleted after). Seeded a second entity
(`single-cell analysis`, distinct surface form) carrying the same
`wikidata:Q5401080` as the existing `Q5401080` entity, with a mention pointing at
it. Ran the real `resolve_entities` twice:

- **Merge**: run 1 → `candidates_created=1`, `merges_performed=1`. Loser
  `is_deprecated=true`, `merged_into_id` → survivor, reason `merged`; exactly 1
  live holder of the QID remains; fixture mention re-parented onto the survivor; 1
  `entity_merge_events` row; survivor `last_updated_at` bumped; survivor holds the
  QID exactly once.
- **Non-merge**: the 3 pre-existing `needs_review` candidates stayed open; the 10
  distinct entities untouched.
- **Idempotency**: run 2 → `merges_performed=0`, `candidates_created=0`, live
  entity count unchanged (no thrashing, no duplicate merge).
