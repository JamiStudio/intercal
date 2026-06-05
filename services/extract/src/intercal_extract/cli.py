"""Intercal extract service CLI.

Entry point: ``python -m intercal_extract <command> [options]``
"""

from __future__ import annotations

import asyncio
import logging
import sys

import typer
from intercal_shared.config import Settings

app = typer.Typer(
    name="intercal-extract",
    help="Intercal extraction service worker.",
    add_completion=False,
)


def _setup_logging(log_level: str) -> None:
    logging.basicConfig(
        level=log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )


def _get_settings() -> Settings:
    return Settings()


@app.command("extract-mentions")
def extract_mentions_cmd(
    document_id: str = typer.Option(
        ..., "--document-id", help="UUID of the normalised source document."
    ),
) -> None:
    """Extract entity mention spans from a normalised document.

    Reads source_documents.cleaned_text and document_chunks.
    Idempotent — existing mentions are replaced on each run.
    Applies rule-based NER; augments with LLM when LLM_PROVIDER is configured.
    """
    cfg = _get_settings()
    _setup_logging(cfg.log_level)

    async def _run() -> None:
        from intercal_shared.db import get_pool
        from intercal_shared.factory import make_llm

        from intercal_extract.jobs import extract_mentions

        pool = await get_pool(cfg.database_url)
        llm = make_llm(cfg)
        counters = await extract_mentions(document_id=document_id, pool=pool, llm=llm)
        _log.info("extract-mentions complete: %s", counters)

    _log = logging.getLogger(__name__)
    asyncio.run(_run())


@app.command("extract-claims")
def extract_claims_cmd(
    document_id: str = typer.Option(
        ..., "--document-id", help="UUID of the normalised source document."
    ),
    max_chunks: int = typer.Option(
        20,
        "--max-chunks",
        help=(
            "Maximum number of document chunks to extract claims from in one run. "
            "Defaults to 20. Set lower when testing to limit LLM spend."
        ),
    ),
) -> None:
    """Extract atomic factual claims from a normalised document via the LLM adapter.

    Reads source_documents.cleaned_text and document_chunks.
    Idempotent — existing claims are replaced on each run.
    LLM provider is selected via LLM_PROVIDER / LLM_MODEL env vars.
    Source spans (chunk_id + char offsets) are stored for full provenance.
    """
    cfg = _get_settings()
    _setup_logging(cfg.log_level)

    async def _run() -> None:
        from intercal_shared.db import get_pool
        from intercal_shared.factory import make_llm

        from intercal_extract.jobs import extract_claims

        pool = await get_pool(cfg.database_url)
        llm = make_llm(cfg)
        counters = await extract_claims(
            document_id=document_id, pool=pool, llm=llm, max_chunks=max_chunks
        )
        _log.info("extract-claims complete: %s", counters)

    _log = logging.getLogger(__name__)
    asyncio.run(_run())


@app.command("embed-chunks")
def embed_chunks_cmd(
    document_id: str = typer.Option(
        ..., "--document-id", help="UUID of the normalised source document."
    ),
    batch_size: int = typer.Option(
        64,
        "--batch-size",
        help="Number of chunks to embed in each adapter call (default 64).",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        help="Re-embed chunks even when an up-to-date embedding already exists.",
    ),
) -> None:
    """Embed document_chunks for a document via the EmbeddingsPort adapter.

    Upserts to chunk_embeddings with model + dim + version metadata.
    Idempotent — skips chunks that already have a current-model embedding
    unless --force is passed.
    Provider selected via EMBEDDINGS_PROVIDER / EMBEDDINGS_MODEL env vars.
    """
    cfg = _get_settings()
    _setup_logging(cfg.log_level)

    async def _run() -> None:
        from intercal_shared.db import get_pool
        from intercal_shared.factory import make_embeddings

        from intercal_extract.jobs import embed_chunks

        pool = await get_pool(cfg.database_url)
        emb = make_embeddings(cfg)
        counters = await embed_chunks(
            document_id=document_id,
            pool=pool,
            embeddings=emb,
            batch_size=batch_size,
            force=force,
        )
        _log.info("embed-chunks complete: %s", counters)

    _log = logging.getLogger(__name__)
    asyncio.run(_run())


@app.command("embed-claims")
def embed_claims_cmd(
    document_id: str = typer.Option(
        ..., "--document-id", help="UUID of the source document whose claims to embed."
    ),
    batch_size: int = typer.Option(
        64,
        "--batch-size",
        help="Number of claims to embed in each adapter call (default 64).",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        help="Re-embed claims even when an up-to-date embedding already exists.",
    ),
) -> None:
    """Embed claim normalized_text for claims from a document via the EmbeddingsPort adapter.

    Upserts to claim_embeddings with model + dim + version metadata.
    Idempotent — skips claims that already have a current-model embedding
    unless --force is passed.
    Provider selected via EMBEDDINGS_PROVIDER / EMBEDDINGS_MODEL env vars.
    """
    cfg = _get_settings()
    _setup_logging(cfg.log_level)

    async def _run() -> None:
        from intercal_shared.db import get_pool
        from intercal_shared.factory import make_embeddings

        from intercal_extract.jobs import embed_claims

        pool = await get_pool(cfg.database_url)
        emb = make_embeddings(cfg)
        counters = await embed_claims(
            document_id=document_id,
            pool=pool,
            embeddings=emb,
            batch_size=batch_size,
            force=force,
        )
        _log.info("embed-claims complete: %s", counters)

    _log = logging.getLogger(__name__)
    asyncio.run(_run())


def main() -> None:
    app()


if __name__ == "__main__":
    main()
