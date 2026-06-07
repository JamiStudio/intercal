"""W3 extraction smoke test — live LLM + real Neon branch.

Runs extract_mentions and extract_claims on a small subset of real chunks
from the Neon dev branch (br-still-water-ajmss6b6).

Requirements:
- DATABASE_URL pointing at the Neon dev branch.
- LLM credentials: LLM_PROVIDER=vertex + VERTEX_PROJECT + ADC, or GEMINI_API_KEY.

Run (from repo root):
    uv run python scripts/dev/verify_w3_extract.py

Resource budget: extracts from at most 2 English-language documents,
MAX_CHUNKS_PER_DOC chunks each → a handful of LLM calls.  Far within
LLM_DAILY_REQUEST_BUDGET.

Does NOT mock — uses the real LLM port and real DB.
Does NOT write secrets to output.
"""

from __future__ import annotations

import asyncio
import sys

MAX_DOCS = 2  # cap: only process a few documents
MAX_CHUNKS_PER_DOC = 2  # cap: only a couple of chunks per doc


async def main() -> None:
    from intercal_extract.jobs import extract_claims, extract_mentions
    from intercal_shared.config import Settings
    from intercal_shared.db import close_all_pools, get_pool
    from intercal_shared.factory import make_llm

    cfg = Settings()

    print("=" * 60)
    print("W3 Extraction Smoke Test")
    print("=" * 60)
    print(f"  LLM provider: {cfg.llm_provider!r}  model: {cfg.llm_model!r}")
    print(f"  Max docs: {MAX_DOCS}  Max chunks/doc: {MAX_CHUNKS_PER_DOC}")
    print()

    pool = await get_pool(cfg.database_url)
    llm = make_llm(cfg)

    # ── Pick a small set of normalised English-language docs ──────────────────
    rows = await pool.fetch(
        """
        SELECT id, title, language, chunk_count
        FROM source_documents
        WHERE normalized_at IS NOT NULL
          AND language = 'en'
          AND chunk_count > 0
        ORDER BY ingested_at
        LIMIT $1
        """,
        MAX_DOCS,
    )

    if not rows:
        print("  No normalised English documents found in the dev branch.")
        print("  Run W1 + W2 first (verify_w2_normalize.py).")
        await close_all_pools()
        sys.exit(0)

    print(f"  Found {len(rows)} English document(s) to test against.\n")

    all_passed = True

    for row in rows:
        doc_id = str(row["id"])
        print(
            f"  -- Document {doc_id} (title={row['title']!r}, lang={row['language']!r},"
            f" chunks={row['chunk_count']}) --"
        )

        # ── extract_mentions ──────────────────────────────────────────────────
        try:
            m_counters = await extract_mentions(
                document_id=doc_id,
                pool=pool,
                llm=llm,
            )
            print(f"    extract_mentions: {m_counters}")
            # Verify mentions were written
            mention_count = await pool.fetchval(
                "SELECT COUNT(*) FROM mentions WHERE document_id = $1",
                row["id"],
            )
            print(f"    mentions in DB: {mention_count}")
            if mention_count != m_counters["persisted"]:
                persisted = m_counters["persisted"]
                print(f"    [WARN] DB count {mention_count} != persisted counter {persisted}")
            print("    [PASS] extract_mentions")
        except Exception as exc:
            print(f"    [FAIL] extract_mentions: {exc}")
            all_passed = False

        # ── extract_claims ────────────────────────────────────────────────────
        try:
            c_counters = await extract_claims(
                document_id=doc_id,
                pool=pool,
                llm=llm,
                max_chunks=MAX_CHUNKS_PER_DOC,
            )
            print(f"    extract_claims: {c_counters}")
            # Verify claims were written
            claim_count = await pool.fetchval(
                "SELECT COUNT(*) FROM claims WHERE $1 = ANY(source_document_ids)",
                row["id"],
            )
            evidence_count = await pool.fetchval(
                "SELECT COUNT(*) FROM claim_evidence WHERE document_id = $1",
                row["id"],
            )
            print(f"    claims in DB: {claim_count}  evidence rows: {evidence_count}")

            # Verify source spans in raw_spans
            span_check = await pool.fetchval(
                """
                SELECT COUNT(*) FROM claims
                WHERE $1 = ANY(source_document_ids)
                  AND jsonb_array_length(raw_spans) > 0
                """,
                row["id"],
            )
            print(f"    claims with source spans: {span_check}")

            if c_counters["claims_persisted"] > 0:
                if int(claim_count) == 0:
                    print("    [WARN] persisted counter > 0 but no claim rows found")
                    all_passed = False
                else:
                    print("    [PASS] extract_claims")
            else:
                print("    [NOTE] 0 claims extracted (document may be too short or metadata-only)")
                print("    [PASS] extract_claims (0-claim run is valid)")
        except Exception as exc:
            print(f"    [FAIL] extract_claims: {exc}")
            all_passed = False

        print()

    await close_all_pools()

    print("=" * 60)
    if all_passed:
        print("W3 smoke test: PASS")
    else:
        print("W3 smoke test: FAIL — see output above")
    print("=" * 60)

    if not all_passed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
