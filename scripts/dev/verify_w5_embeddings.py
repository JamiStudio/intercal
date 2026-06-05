"""W5 embeddings + hybrid retrieval smoke test — real fastembed + real Neon branch.

Runs embed_chunks, embed_claims, and hybrid_search on the live Neon dev branch
(br-still-water-ajmss6b6) using the local fastembed adapter (zero-cost, no API key).

Requirements:
- DATABASE_URL pointing at the Neon dev branch.
- EMBEDDINGS_PROVIDER=local (default) — fastembed must be installed.
- W1 + W2 already run: source_documents with normalized_at IS NOT NULL and
  document_chunks rows present.

Run (from repo root):
    uv run python scripts/dev/verify_w5_embeddings.py

Resource budget: fastembed is local/zero-cost; no LLM calls.
Does NOT mock — uses the real embeddings port and real DB.
Does NOT write secrets to output.
"""

from __future__ import annotations

import asyncio
import sys

MAX_DOCS = 5  # embed all available chunks; we have 5 from W2


async def main() -> None:
    from intercal_extract.jobs import embed_chunks, embed_claims, hybrid_search
    from intercal_shared.config import Settings
    from intercal_shared.db import close_all_pools, get_pool
    from intercal_shared.factory import make_embeddings

    cfg = Settings()

    print("=" * 60)
    print("W5 Embeddings + Hybrid Retrieval Smoke Test")
    print("=" * 60)
    print(f"  Embeddings provider: {cfg.embeddings_provider!r}")
    print(f"  Model: {cfg.embeddings_model!r}  dim={cfg.embeddings_dim}")
    print(f"  Batch size: {cfg.embeddings_batch_size}")
    print()

    pool = await get_pool(cfg.database_url)
    emb = make_embeddings(cfg)

    all_passed = True

    # ── Step 1: Gather normalized documents ───────────────────────────────────
    docs = await pool.fetch(
        """
        SELECT id, title, language, chunk_count
        FROM source_documents
        WHERE normalized_at IS NOT NULL
          AND chunk_count > 0
        ORDER BY ingested_at
        LIMIT $1
        """,
        MAX_DOCS,
    )

    if not docs:
        print("  No normalized documents found. Run W1 + W2 first.")
        await close_all_pools()
        sys.exit(0)

    print(f"  Found {len(docs)} normalized document(s) to embed.\n")

    total_chunks_embedded = 0
    total_vectors_persisted = 0

    # ── Step 2: Embed chunks for each document ────────────────────────────────
    print("-- Step 2: embed_chunks --")
    for doc in docs:
        doc_id = str(doc["id"])
        try:
            counters = await embed_chunks(
                document_id=doc_id,
                pool=pool,
                embeddings=emb,
                batch_size=cfg.embeddings_batch_size,
            )
            print(f"  doc={doc_id[:8]}… lang={doc['language']!r}: {counters}")
            total_chunks_embedded += counters["chunks_embedded"]
            total_vectors_persisted += counters["vectors_persisted"]
        except Exception as exc:
            print(f"  [FAIL] embed_chunks doc {doc_id[:8]}…: {exc}")
            all_passed = False

    # Verify DB rows
    chunk_emb_count = await pool.fetchval(
        "SELECT COUNT(*) FROM chunk_embeddings WHERE model = $1", emb.model
    )
    print(f"\n  chunk_embeddings in DB (model={emb.model!r}): {chunk_emb_count}")
    if int(chunk_emb_count) == 0:
        print("  [FAIL] No chunk_embeddings rows found after embed_chunks")
        all_passed = False
    else:
        print("  [PASS] embed_chunks — vectors persisted to chunk_embeddings")

    # ── Step 3: Idempotent re-run (should skip all) ───────────────────────────
    print("\n-- Step 3: embed_chunks idempotency (re-run without force) --")
    rerun_embedded = 0
    for doc in docs:
        doc_id = str(doc["id"])
        counters = await embed_chunks(
            document_id=doc_id,
            pool=pool,
            embeddings=emb,
        )
        rerun_embedded += counters["chunks_embedded"]

    if rerun_embedded == 0:
        print("  [PASS] Idempotent re-run: all chunks skipped (no duplicates)")
    else:
        print(f"  [WARN] Re-run embedded {rerun_embedded} chunks (expected 0)")

    # ── Step 4: Verify embedding_version column is set ────────────────────────
    print("\n-- Step 4: embedding_version column check --")
    unknown_count = await pool.fetchval(
        "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_version = 'unknown'"
    )
    versioned_count = await pool.fetchval(
        "SELECT COUNT(*) FROM chunk_embeddings WHERE embedding_version != 'unknown'"
    )
    print(f"  versioned rows: {versioned_count}  unknown rows: {unknown_count}")
    if int(versioned_count) > 0:
        print("  [PASS] embedding_version column is populated")
    else:
        print("  [WARN] All embedding_version values are 'unknown' — version write may be broken")

    # ── Step 5: Embed claims if any exist ─────────────────────────────────────
    print("\n-- Step 5: embed_claims --")
    claim_count_total = await pool.fetchval("SELECT COUNT(*) FROM claims WHERE status = 'active'")
    print(f"  Active claims in DB: {claim_count_total}")

    if int(claim_count_total) > 0:
        # Embed claims for all docs that have them
        docs_with_claims = await pool.fetch(
            """
            SELECT DISTINCT unnest(source_document_ids) AS doc_id
            FROM claims
            WHERE status = 'active'
            LIMIT $1
            """,
            MAX_DOCS,
        )
        claim_vecs_persisted = 0
        for row in docs_with_claims:
            doc_id = str(row["doc_id"])
            try:
                c = await embed_claims(
                    document_id=doc_id,
                    pool=pool,
                    embeddings=emb,
                )
                claim_vecs_persisted += c["vectors_persisted"]
                print(f"  doc={doc_id[:8]}…: {c}")
            except Exception as exc:
                print(f"  [FAIL] embed_claims doc {doc_id[:8]}…: {exc}")
                all_passed = False

        claim_emb_count = await pool.fetchval(
            "SELECT COUNT(*) FROM claim_embeddings WHERE model = $1", emb.model
        )
        print(f"  claim_embeddings in DB: {claim_emb_count}")
        if int(claim_emb_count) > 0:
            print("  [PASS] embed_claims — vectors persisted to claim_embeddings")
        else:
            print("  [NOTE] 0 claim embeddings (claims may have empty normalized_text)")
    else:
        print("  [NOTE] No active claims found; skipping embed_claims (run W3 first)")

    # ── Step 6: HNSW index verification ──────────────────────────────────────
    print("\n-- Step 6: HNSW index verification --")
    hnsw_index = await pool.fetchrow(
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'chunk_embeddings'
          AND indexname = 'idx_chunk_embeddings_hnsw'
        """
    )
    if hnsw_index:
        print(f"  HNSW index present: {hnsw_index['indexname']}")
        print(f"  Definition: {hnsw_index['indexdef']}")
        print("  [PASS] HNSW index exists on chunk_embeddings")
    else:
        print("  [FAIL] HNSW index not found on chunk_embeddings")
        all_passed = False

    # ── Step 7: FTS index verification ───────────────────────────────────────
    print("\n-- Step 7: FTS index verification (W5 migration 0024) --")
    fts_index = await pool.fetchrow(
        """
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'document_chunks'
          AND indexname = 'idx_document_chunks_fts'
        """
    )
    if fts_index:
        print("  [PASS] FTS GIN index exists on document_chunks.chunk_text")
    else:
        print("  [FAIL] FTS GIN index not found — run migration 0024 first")
        all_passed = False

    # ── Step 8: hybrid_search ────────────────────────────────────────────────
    print("\n-- Step 8: hybrid_search --")
    test_queries = [
        "Wikidata entity",
        "software release version",
        "organization founded",
    ]

    for query in test_queries:
        try:
            results = await hybrid_search(
                query=query,
                pool=pool,
                embeddings=emb,
                limit=5,
            )
            print(f"  query={query!r}: {len(results)} result(s)")
            if results:
                top = results[0]
                print(
                    f"    top chunk: doc={str(top['document_id'])[:8]}… "
                    f"idx={top['chunk_index']} rrf={top['rrf_score']:.4f} "
                    f"vec_rank={top['vector_rank']} fts_rank={top['fts_rank']}"
                )
                print(f"    text preview: {str(top['chunk_text'])[:80]!r}…")
        except Exception as exc:
            print(f"  [FAIL] hybrid_search query={query!r}: {exc}")
            all_passed = False

    # Verify at least one search returned results
    try:
        any_results = await hybrid_search(
            query="entity", pool=pool, embeddings=emb, limit=10
        )
        if any_results:
            print("\n  [PASS] hybrid_search returned ranked results")
        else:
            print("\n  [WARN] hybrid_search returned 0 results — "
                  "check that chunks are embedded and FTS index exists")
    except Exception as exc:
        print(f"\n  [FAIL] hybrid_search: {exc}")
        all_passed = False

    await close_all_pools()

    print()
    print("=" * 60)
    print(f"  chunks embedded this run: {total_chunks_embedded}")
    print(f"  vectors persisted: {total_vectors_persisted}")
    if all_passed:
        print("W5 smoke test: PASS")
    else:
        print("W5 smoke test: FAIL — see output above")
    print("=" * 60)

    if not all_passed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
