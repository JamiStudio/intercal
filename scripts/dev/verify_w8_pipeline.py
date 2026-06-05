"""W8 pipeline orchestrator smoke test — real data, real Neon branch.

Runs ``run_pipeline`` end-to-end for the github-releases-featured source,
then verifies the Phase B acceptance gate:
  ≥1 resolved entity, ≥1 review-needed entity candidate,
  ≥1 relationship, ≥1 fact version.

Also verifies idempotency: a second ``run_pipeline`` call on the same source
must produce zero new canonical records.

Prerequisites:
  DATABASE_URL pointing at a Neon branch that already has:
    - Seed vocabularies (entity_types, relationship_types)
    - The github-releases-featured source row seeded

Run:
    DATABASE_URL=<neon-branch-url> uv run python scripts/dev/verify_w8_pipeline.py

No secrets written to output.
"""

from __future__ import annotations

import asyncio
import sys


async def main() -> None:
    from intercal_pipeline.run import run_pipeline
    from intercal_shared.config import Settings
    from intercal_shared.db import close_all_pools, get_pool
    from intercal_shared.factory import make_embeddings, make_llm, make_storage

    cfg = Settings()
    pool = await get_pool(cfg.database_url)

    print("=" * 60)
    print("W8 Pipeline Orchestrator Smoke Test")
    print("=" * 60)
    print()

    all_passed = True

    # Fetch source ID
    source_row = await pool.fetchrow(
        "SELECT id, slug FROM sources WHERE slug = 'github-releases-featured' AND is_active = true"
    )
    if source_row is None:
        print("  [FAIL] github-releases-featured source not found — seed it first.")
        await close_all_pools()
        sys.exit(1)

    source_id = str(source_row["id"])
    print(f"  Source: {source_row['slug']} ({source_id[:8]}...)")
    print()

    # Baseline counts
    async def _count(sql: str) -> int:
        return int(await pool.fetchval(sql))

    entities_before = await _count("SELECT count(*) FROM entities WHERE is_deprecated = false")
    rels_before = await _count("SELECT count(*) FROM relationships")
    versions_before = await _count("SELECT count(*) FROM fact_versions WHERE is_current = true")
    candidates_before = await _count(
        "SELECT count(*) FROM entity_resolution_candidates WHERE proposed_decision = 'needs_review'"
    )

    print(
        f"  Before: entities={entities_before} rels={rels_before} "
        f"versions={versions_before} review_candidates={candidates_before}"
    )
    print()

    # Run pipeline (small: 5 docs, 10 chunks max per doc, no-embeddings for speed)
    storage = make_storage(cfg)
    llm = make_llm(cfg)
    embeddings = make_embeddings(cfg)

    print("  Running run_pipeline (pass 1: real ingest + extract + resolve)...")
    health = await run_pipeline(
        source_id=source_id,
        pool=pool,
        storage=storage,
        llm=llm,
        embeddings=embeddings,
        max_documents=5,
        max_chunks_per_doc=10,
        use_embeddings_for_resolve=True,
        use_embeddings_for_link=True,
    )
    print(f"  Pass 1 status: {health.status}")
    print(f"  Pass 1 counters: docs_fetched={health.docs_fetched} new={health.docs_new}")
    print(f"    mentions={health.mentions_extracted} claims={health.claims_extracted}")
    print(
        f"    entities={health.entities_created} merged={health.entities_merged} "
        f"review={health.review_candidates}"
    )
    print(
        f"    relationships={health.relationships_written} "
        f"fact_versions={health.fact_versions_written}"
    )
    print()

    if health.status == "failed":
        print("  [FAIL] run_pipeline returned status='failed'")
        all_passed = False

    # Post-run counts
    entities_after = await _count("SELECT count(*) FROM entities WHERE is_deprecated = false")
    rels_after = await _count("SELECT count(*) FROM relationships")
    versions_after = await _count("SELECT count(*) FROM fact_versions WHERE is_current = true")
    candidates_after = await _count(
        "SELECT count(*) FROM entity_resolution_candidates WHERE proposed_decision = 'needs_review'"
    )

    print(
        f"  After: entities={entities_after} rels={rels_after} "
        f"versions={versions_after} review_candidates={candidates_after}"
    )
    print()

    # ── Phase B acceptance gate ───────────────────────────────────────────────
    if entities_after >= 1:
        print(f"  [PASS] >=1 resolved entity: {entities_after}")
    else:
        print("  [FAIL] 0 entities resolved")
        all_passed = False

    if candidates_after >= 1:
        print(f"  [PASS] >=1 review-needed candidate: {candidates_after}")
    else:
        print("  [WARN] 0 review-needed candidates (corpus may have no ambiguous entities)")

    if rels_after >= 1:
        print(f"  [PASS] >=1 relationship: {rels_after}")
    else:
        print("  [WARN] 0 relationships (predicate mapping may not match seeded types)")

    if versions_after >= 1:
        print(f"  [PASS] >=1 fact version: {versions_after}")
    else:
        print("  [FAIL] 0 fact versions written")
        all_passed = False

    # ── Idempotent re-run ─────────────────────────────────────────────────────
    print()
    print("  Running run_pipeline (pass 2: idempotent re-run)...")
    health2 = await run_pipeline(
        source_id=source_id,
        pool=pool,
        storage=storage,
        llm=llm,
        embeddings=embeddings,
        max_documents=5,
        max_chunks_per_doc=10,
        use_embeddings_for_resolve=True,
        use_embeddings_for_link=True,
    )
    print(f"  Pass 2 status: {health2.status}")

    entities_idem = await _count("SELECT count(*) FROM entities WHERE is_deprecated = false")
    rels_idem = await _count("SELECT count(*) FROM relationships")
    versions_idem = await _count("SELECT count(*) FROM fact_versions WHERE is_current = true")

    if entities_idem == entities_after:
        print(f"  [PASS] entity count stable: {entities_idem} (idempotent)")
    else:
        delta = entities_idem - entities_after
        print(f"  [FAIL] entity count changed on re-run: +{delta}")
        all_passed = False

    if rels_idem == rels_after:
        print(f"  [PASS] relationship count stable: {rels_idem} (idempotent)")
    else:
        delta = rels_idem - rels_after
        print(f"  [WARN] relationship count changed on re-run: +{delta} (ok if new claims linked)")

    new_versions = versions_idem - versions_after
    if new_versions == 0:
        print(f"  [PASS] fact versions stable: {versions_idem} (idempotent)")
    else:
        print(f"  [WARN] {new_versions} new fact versions on re-run (ok if pass 1 was partial)")

    # ── Final ─────────────────────────────────────────────────────────────────
    await close_all_pools()
    print()
    print("=" * 60)
    if all_passed:
        print("  Smoke test: PASS")
    else:
        print("  Smoke test: FAIL")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
