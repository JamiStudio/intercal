"""W4 provider smoke test — live LLM + embeddings calls through the ports.

Requires:
- GOOGLE_APPLICATION_CREDENTIALS set to a SA key with Vertex AI access, AND
  VERTEX_PROJECT set — OR — GEMINI_API_KEY set.
- fastembed installed (intercal-shared[embeddings-local]).

Run:
    uv run python scripts/dev/verify_w4_providers.py

Respects LLM_DAILY_REQUEST_BUDGET (only makes 1 LLM call).
Does NOT write to the database.
"""

from __future__ import annotations

import asyncio
import sys


async def main() -> None:
    from intercal_shared.config import Settings

    cfg = Settings()

    print("=" * 60)
    print("W4 Provider Smoke Test")
    print("=" * 60)

    # ── LLM smoke test ────────────────────────────────────────────
    print(f"\n[LLM] provider={cfg.llm_provider!r}  model={cfg.llm_model!r}")

    if cfg.llm_provider == "vertex":
        if not cfg.resolved_vertex_project:
            print(
                "  SKIP: LLM_PROVIDER=vertex but no project resolved. "
                "Set VERTEX_PROJECT (or GCLOUD_PROJECT_ID) in .env to test Vertex mode."
            )
        else:
            print(f"  project={cfg.resolved_vertex_project!r}  location={cfg.vertex_location!r}")
            await _test_llm_vertex(cfg)
    elif cfg.llm_provider == "gemini":
        if not cfg.gemini_api_key:
            print(
                "  SKIP: LLM_PROVIDER=gemini but GEMINI_API_KEY is not set. "
                "Set GEMINI_API_KEY in .env to test Gemini mode."
            )
        else:
            await _test_llm_gemini(cfg)
    else:
        print(f"  SKIP: live test not implemented for provider={cfg.llm_provider!r}")

    # ── Embeddings smoke test ─────────────────────────────────────
    print(f"\n[Embeddings] provider={cfg.embeddings_provider!r}  model={cfg.embeddings_model!r}")
    if cfg.embeddings_provider == "local":
        await _test_embeddings_local(cfg)
    else:
        print(f"  SKIP: live test not implemented for provider={cfg.embeddings_provider!r}")

    print("\n" + "=" * 60)
    print("W4 smoke test complete.")
    print("=" * 60)


async def _test_llm_vertex(cfg: object) -> None:
    from intercal_shared.factory import make_llm

    llm = make_llm(cfg)  # type: ignore[arg-type]
    print("  Adapter:", type(llm).__name__)
    try:
        response = await llm.complete(
            "Respond with exactly one word: OK",
            max_tokens=100,
            temperature=0.0,
        )
        print(f"  complete() -> text={response.text!r}  model={response.model!r}")
        print(f"  input_tokens={response.input_tokens}  output_tokens={response.output_tokens}")
        assert response.text.strip(), "Expected non-empty response text"
        print("  [PASS] Vertex AI LLM complete()")
    except Exception as exc:
        print(f"  [FAIL] Vertex AI LLM complete(): {exc}")
        sys.exit(1)

    # Also test extract_structured
    try:
        schema = {
            "type": "object",
            "properties": {"answer": {"type": "string"}},
            "required": ["answer"],
        }
        result = await llm.extract_structured(
            schema,
            'Return JSON with key "answer" set to "yes".',
            max_tokens=100,
        )
        print(f"  extract_structured() -> data={result.data}")
        print(f"  input_tokens={result.input_tokens}  output_tokens={result.output_tokens}")
        assert isinstance(result.data, dict), "Expected dict in StructuredResult.data"
        assert "answer" in result.data, "Schema validation should guarantee 'answer' key"
        print("  [PASS] Vertex AI LLM extract_structured() (schema-validated)")
    except Exception as exc:
        print(f"  [FAIL] Vertex AI LLM extract_structured(): {exc}")
        sys.exit(1)


async def _test_llm_gemini(cfg: object) -> None:
    from intercal_shared.factory import make_llm

    llm = make_llm(cfg)  # type: ignore[arg-type]
    print("  Adapter:", type(llm).__name__)
    try:
        response = await llm.complete(
            "Respond with exactly one word: OK",
            max_tokens=100,
            temperature=0.0,
        )
        print(f"  complete() -> text={response.text!r}  model={response.model!r}")
        assert response.text.strip(), "Expected non-empty response text"
        print("  [PASS] Gemini API key LLM complete()")
    except Exception as exc:
        print(f"  [FAIL] Gemini API key LLM complete(): {exc}")
        sys.exit(1)


async def _test_embeddings_local(cfg: object) -> None:
    from intercal_shared.factory import make_embeddings

    emb = make_embeddings(cfg)  # type: ignore[arg-type]
    print("  Adapter:", type(emb).__name__, f"  model={emb.model!r}  dim={emb.dim}")
    texts = [
        "Intercal is a temporal knowledge substrate.",
        "Embeddings encode semantic meaning into vectors.",
    ]
    try:
        vecs = await emb.embed(texts)
        assert len(vecs) == 2, f"Expected 2 vectors, got {len(vecs)}"
        assert len(vecs[0]) == emb.dim, f"Expected dim={emb.dim}, got {len(vecs[0])}"
        # Spot-check: vectors should not be identical
        assert vecs[0] != vecs[1], "Expected distinct vectors for distinct texts"
        print(f"  embed({len(texts)} texts) -> {len(vecs)} vectors of dim={len(vecs[0])}")
        print(f"  first vector[:4] = {[round(v, 4) for v in vecs[0][:4]]}")
        print("  [PASS] Local fastembed embed()")
    except Exception as exc:
        print(f"  [FAIL] Local embeddings embed(): {exc}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
