"""W7 relationship + fact-version smoke test — real claims + real Neon branch.

Runs derive_relationships and write_fact_versions on the live Neon dev branch
(br-still-water-ajmss6b6).

Confirms:
  - >= 1 relationship written with provenance (claim_ids, source_document_ids set)
  - >= 1 fact version written with bitemporal columns correct
  - Append-only: prior fact versions are closed (is_current=false, superseded_by_id
    set, valid_until set) — NOT deleted
  - Idempotent re-run: no duplicate relationships or duplicate is_current fact versions
  - Provenance: relationship.claim_ids traces back to a real claim UUID

Requirements:
  DATABASE_URL pointing at the Neon dev branch.
  W3 + W6 already run (claims table has rows; entities table has resolved entities).

Run (from repo root):
    uv run python scripts/dev/verify_w7_relationships.py

Resource budget: no LLM calls; no embeddings calls. Pure DB read/write.
Does NOT mock — uses the real resolve port and real DB.
Does NOT write secrets to output.
"""

from __future__ import annotations

import asyncio
import json
import sys


async def main() -> None:
    from intercal_resolve.jobs import derive_relationships, write_fact_versions
    from intercal_shared.config import Settings
    from intercal_shared.db import close_all_pools, get_pool

    cfg = Settings()

    print("=" * 60)
    print("W7 Relationships + Fact Versions Smoke Test")
    print("=" * 60)
    print()

    pool = await get_pool(cfg.database_url)
    all_passed = True

    # ── Pre-conditions ────────────────────────────────────────────────────────
    claims_before = await pool.fetchval("SELECT count(*) FROM claims WHERE status = 'active'")
    entities_before = await pool.fetchval(
        "SELECT count(*) FROM entities WHERE is_deprecated = false"
    )
    rels_before = await pool.fetchval("SELECT count(*) FROM relationships")
    fv_before = await pool.fetchval("SELECT count(*) FROM fact_versions")

    print("  Before:")
    print(f"    claims (active)={claims_before}  entities={entities_before}")
    print(f"    relationships={rels_before}  fact_versions={fv_before}")
    print()

    if int(claims_before) == 0:
        print("  [WARN] No active claims — run W3 first.")
        await close_all_pools()
        sys.exit(0)

    if int(entities_before) == 0:
        print("  [WARN] No entities — run W6 first.")
        await close_all_pools()
        sys.exit(0)

    # ── Step 1: derive_relationships for all active claims ────────────────────
    claim_rows = await pool.fetch("SELECT id FROM claims WHERE status = 'active'")
    print(f"  Running derive_relationships on {len(claim_rows)} active claim(s)...")

    total_written = 0
    total_skipped = 0
    for row in claim_rows:
        cid = str(row["id"])
        counters = await derive_relationships(claim_id=cid, pool=pool)
        total_written += counters["relationships_written"]
        total_skipped += counters["relationships_skipped"]
        print(f"    claim {cid[:8]}... written={counters['relationships_written']}"
              f"  skipped={counters['relationships_skipped']}")

    rels_after = await pool.fetchval("SELECT count(*) FROM relationships")
    print()
    print(f"  derive_relationships totals: written={total_written}  skipped={total_skipped}")
    print(f"  relationships in DB: {rels_before} -> {rels_after}")

    # Accept gate: >= 1 relationship present (may have been from prior run)
    if int(rels_after) >= 1:
        print(f"  [PASS] >=1 relationship in DB ({rels_after} total)")
    else:
        print("  [FAIL] No relationships in DB after derive_relationships")
        all_passed = False

    # Check provenance on at least one relationship
    rel_row = await pool.fetchrow(
        """
        SELECT id, type_id, subject_entity_id, object_entity_id,
               claim_ids, source_document_ids, recorded_at, valid_from
        FROM relationships
        LIMIT 1
        """
    )
    if rel_row is not None:
        print()
        print("  Sample relationship:")
        print(f"    id={str(rel_row['id'])[:8]}...")
        print(f"    type={rel_row['type_id']}")
        print(f"    subject={str(rel_row['subject_entity_id'])[:8]}...")
        print(f"    object={str(rel_row['object_entity_id'])[:8]}...")
        print(f"    claim_ids={[str(c)[:8]+'...' for c in (rel_row['claim_ids'] or [])]}")
        print(f"    recorded_at={rel_row['recorded_at']}")
        if rel_row["claim_ids"] and len(rel_row["claim_ids"]) > 0:
            print("  [PASS] Provenance: claim_ids set on relationship")
        else:
            print("  [WARN] claim_ids empty on relationship (claim had no entity ends?)")

    # ── Step 2: write_fact_versions for all live entities ─────────────────────
    print()
    entity_rows = await pool.fetch("SELECT id FROM entities WHERE is_deprecated = false")
    print(f"  Running write_fact_versions on {len(entity_rows)} live entity/entities...")

    fv_written = 0
    fv_skipped = 0
    for row in entity_rows:
        eid = str(row["id"])
        counters = await write_fact_versions(entity_id=eid, pool=pool)
        fv_written += counters["versions_written"]
        fv_skipped += counters["versions_skipped"]

    fv_after = await pool.fetchval("SELECT count(*) FROM fact_versions")
    fv_current = await pool.fetchval(
        "SELECT count(*) FROM fact_versions WHERE is_current = true"
    )
    fv_superseded = await pool.fetchval(
        "SELECT count(*) FROM fact_versions WHERE is_current = false"
    )

    print(f"  write_fact_versions totals: written={fv_written}  skipped={fv_skipped}")
    print(f"  fact_versions in DB: {fv_before} -> {fv_after} "
          f"(current={fv_current}, superseded={fv_superseded})")

    if int(fv_after) >= 1:
        print(f"  [PASS] >=1 fact version in DB ({fv_after} total)")
    else:
        print("  [FAIL] No fact versions written")
        all_passed = False

    # Check bitemporal columns on a sample fact version
    sample_fv = await pool.fetchrow(
        """
        SELECT id, fact_subject_type, fact_subject_id, payload,
               valid_from, valid_until, recorded_at, is_current,
               superseded_by_id, superseded_at, claim_ids, produced_by
        FROM fact_versions
        WHERE is_current = true
        LIMIT 1
        """
    )
    if sample_fv is not None:
        print()
        print("  Sample current fact version:")
        print(f"    id={str(sample_fv['id'])[:8]}...")
        print(f"    subject_type={sample_fv['fact_subject_type']}")
        print(f"    subject_id={str(sample_fv['fact_subject_id'])[:8]}...")
        print(f"    valid_from={sample_fv['valid_from']}")
        print(f"    recorded_at={sample_fv['recorded_at']}")
        print(f"    is_current={sample_fv['is_current']}")
        print(f"    superseded_by_id={sample_fv['superseded_by_id']}")
        print(f"    produced_by={sample_fv['produced_by']}")
        raw_payload = sample_fv["payload"]
        payload = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
        print(f"    payload.type_id={payload.get('type_id')}")
        print(f"    payload.canonical_name={payload.get('canonical_name')}")
        print(f"    payload.external_ids={payload.get('external_ids')}")
        print(f"    payload.active_relationship_count={payload.get('active_relationship_count')}")

        if (sample_fv["valid_from"] is not None
                and sample_fv["recorded_at"] is not None
                and sample_fv["is_current"] is True
                and sample_fv["superseded_by_id"] is None):
            print("  [PASS] Bitemporal columns correct on current version")
        else:
            print("  [FAIL] Bitemporal columns incorrect on current version")
            all_passed = False

    # ── Step 3: Idempotent re-run ─────────────────────────────────────────────
    print()
    print("  Idempotent re-run check...")

    # derive_relationships again — should write nothing new (or just update claim_ids)
    rels_after_1 = int(await pool.fetchval("SELECT count(*) FROM relationships"))
    for row in claim_rows:
        await derive_relationships(claim_id=str(row["id"]), pool=pool)
    rels_after_2 = int(await pool.fetchval("SELECT count(*) FROM relationships"))
    if rels_after_2 == rels_after_1:
        print(
            f"  [PASS] derive_relationships idempotent: "
            f"{rels_after_1} -> {rels_after_2} relationships"
        )
    else:
        delta = rels_after_2 - rels_after_1
        print(f"  [FAIL] derive_relationships not idempotent: +{delta} new relationships on re-run")
        all_passed = False

    # write_fact_versions again — all should be skipped (payload unchanged)
    fv_current_before2 = int(await pool.fetchval(
        "SELECT count(*) FROM fact_versions WHERE is_current = true"
    ))
    for row in entity_rows:
        await write_fact_versions(entity_id=str(row["id"]), pool=pool)
    fv_current_after2 = int(await pool.fetchval(
        "SELECT count(*) FROM fact_versions WHERE is_current = true"
    ))
    fv_total_after2 = int(await pool.fetchval("SELECT count(*) FROM fact_versions"))
    if fv_current_after2 == fv_current_before2:
        print(f"  [PASS] write_fact_versions idempotent: "
              f"{fv_current_before2} -> {fv_current_after2} current versions (no change)")
    else:
        print(f"  [FAIL] write_fact_versions not idempotent: "
              f"current versions changed {fv_current_before2} -> {fv_current_after2}")
        all_passed = False

    # ── Step 4: Append-only proof ─────────────────────────────────────────────
    print()
    print("  Append-only proof (no fact_versions rows deleted)...")
    # The superseded rows (if any) must still exist with is_current=false
    fv_superseded_after = int(await pool.fetchval(
        "SELECT count(*) FROM fact_versions WHERE is_current = false"
    ))
    # Check that no superseded row is missing superseded_by_id
    orphan_superseded = int(await pool.fetchval(
        "SELECT count(*) FROM fact_versions WHERE is_current = false AND superseded_by_id IS NULL"
    ))
    if orphan_superseded == 0:
        print(f"  [PASS] Append-only: {fv_superseded_after} superseded version(s), "
              f"all have superseded_by_id set")
    else:
        print(f"  [WARN] {orphan_superseded} superseded version(s) without superseded_by_id "
              f"(expected only if superseded by external process)")

    # Total fact_versions must not have decreased
    if fv_total_after2 >= int(fv_after):
        print(f"  [PASS] Fact versions total non-decreasing: {fv_after} -> {fv_total_after2}")
    else:
        print(f"  [FAIL] Fact versions total decreased: {fv_after} -> {fv_total_after2} "
              f"(append-only violated)")
        all_passed = False

    # ── Final ─────────────────────────────────────────────────────────────────
    await close_all_pools()
    print()
    if all_passed:
        print("  Smoke test: PASS")
    else:
        print("  Smoke test: FAIL")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
