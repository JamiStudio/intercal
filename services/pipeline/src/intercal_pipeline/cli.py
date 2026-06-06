"""Intercal pipeline orchestrator CLI.

Entry point: ``python -m intercal_pipeline <command>``
Script entry point: ``intercal-pipeline <command>``

These are the portable orchestrator entrypoints invoked by:
- Local development: ``intercal-pipeline run --source-id <uuid>``
- GitHub Actions scheduled workflow: same command in a ``run:`` step.
- Cloud Run Jobs: same command as the container CMD.

No scheduler SDK is required — the external scheduler calls the CLI directly.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys

import typer
from intercal_shared.config import Settings

app = typer.Typer(
    name="intercal-pipeline",
    help=(
        "Intercal pipeline orchestrator (Plan 02 W8).\n\n"
        "Chains: ingest → normalize → extract → embed → resolve → link → derive → version.\n"
        "Each stage is idempotent; re-running the full pipeline is always safe."
    ),
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


@app.command("run")
def run_cmd(
    source_id: str = typer.Option(
        ...,
        "--source-id",
        help="UUID of the source to process end-to-end.",
    ),
    max_documents: int = typer.Option(
        0,
        "--max-documents",
        help=(
            "Hard cap on documents per run.  "
            "0 = use INGEST_MAX_DOCS_PER_RUN from settings (default 200)."
        ),
    ),
    max_chunks: int = typer.Option(
        20,
        "--max-chunks",
        help="Maximum chunks to extract claims from per document (budget guard).",
    ),
    no_embeddings: bool = typer.Option(
        False,
        "--no-embeddings",
        help="Skip embedding-based resolution and linking (faster, exact-match only).",
    ),
    extract_force: bool = typer.Option(
        False,
        "--extract-force",
        help=(
            "Re-extract mentions/claims for already-processed documents.  "
            "Default skips them (keeps re-runs idempotent)."
        ),
    ),
) -> None:
    """Run the full pipeline for a single source.

    Chains: ingest → normalize → extract (mentions+claims) → embed →
    resolve entities → link claim entities → derive relationships →
    write fact versions.

    Idempotent — re-running skips already-processed work.
    """
    cfg = _get_settings()
    _setup_logging(cfg.log_level)
    effective_max = max_documents if max_documents > 0 else cfg.ingest_max_docs_per_run

    async def _run() -> None:
        from intercal_shared.db import close_all_pools, get_pool
        from intercal_shared.factory import make_budgeted_llm, make_embeddings, make_storage

        from intercal_pipeline.run import run_pipeline

        pool = await get_pool(cfg.database_url)
        storage = make_storage(cfg)
        llm = await make_budgeted_llm(cfg, pool=pool)
        embeddings = make_embeddings(cfg)
        effective_extract_force = extract_force or not cfg.extract_only_changed

        health = await run_pipeline(
            source_id=source_id,
            pool=pool,
            storage=storage,
            llm=llm,
            embeddings=embeddings,
            max_documents=effective_max,
            max_chunks_per_doc=max_chunks,
            embed_batch_size=cfg.embeddings_batch_size,
            use_embeddings_for_resolve=not no_embeddings,
            use_embeddings_for_link=not no_embeddings,
            extract_force=effective_extract_force,
        )

        await close_all_pools()

        print(json.dumps(health.to_dict(), indent=2), file=sys.stderr)

        if health.status == "failed":
            raise typer.Exit(code=1)

    asyncio.run(_run())


@app.command("run-all")
def run_all_cmd(
    max_documents: int = typer.Option(
        0,
        "--max-documents",
        help="Hard cap per source per run.  0 = INGEST_MAX_DOCS_PER_RUN.",
    ),
    max_chunks: int = typer.Option(
        20,
        "--max-chunks",
        help="Maximum chunks to extract claims from per document.",
    ),
    no_embeddings: bool = typer.Option(
        False,
        "--no-embeddings",
        help="Skip embedding-based resolution and linking.",
    ),
    extract_force: bool = typer.Option(
        False,
        "--extract-force",
        help=(
            "Re-extract already-processed documents. Default honors "
            "EXTRACT_ONLY_CHANGED=true and skips unchanged documents."
        ),
    ),
) -> None:
    """Run the full pipeline for ALL active, non-paused sources.

    Sources are processed sequentially (one source at a time) to stay within
    the LLM daily budget and Neon CU-hour budget (resource-budget.md).
    Idempotent — re-running is always safe.
    """
    cfg = _get_settings()
    _setup_logging(cfg.log_level)
    effective_max = max_documents if max_documents > 0 else cfg.ingest_max_docs_per_run

    async def _run() -> None:

        from intercal_shared.db import close_all_pools, get_pool
        from intercal_shared.factory import make_budgeted_llm, make_embeddings, make_storage

        from intercal_pipeline.run import run_pipeline

        pool = await get_pool(cfg.database_url)
        storage = make_storage(cfg)
        llm = await make_budgeted_llm(cfg, pool=pool)
        embeddings = make_embeddings(cfg)
        effective_extract_force = extract_force or not cfg.extract_only_changed

        active_sources: list[dict[str, object]] = [
            {"id": str(r["id"]), "slug": r["slug"]}
            for r in await pool.fetch(
                "SELECT id, slug FROM sources WHERE is_active = true AND is_paused = false "
                "ORDER BY slug"
            )
        ]

        if not active_sources:
            print("No active sources found.", file=sys.stderr)
            await close_all_pools()
            return

        all_health: list[dict[str, object]] = []
        any_failed = False

        for src in active_sources:
            src_id = str(src["id"])
            print(f"Running pipeline for source: {src['slug']} ({src_id})", file=sys.stderr)
            try:
                health = await run_pipeline(
                    source_id=src_id,
                    pool=pool,
                    storage=storage,
                    llm=llm,
                    embeddings=embeddings,
                    max_documents=effective_max,
                    max_chunks_per_doc=max_chunks,
                    embed_batch_size=cfg.embeddings_batch_size,
                    use_embeddings_for_resolve=not no_embeddings,
                    use_embeddings_for_link=not no_embeddings,
                    extract_force=effective_extract_force,
                )
                all_health.append(health.to_dict())
                if health.status == "failed":
                    any_failed = True
            except Exception as exc:
                print(f"  Source {src['slug']} pipeline error: {exc}", file=sys.stderr)
                any_failed = True

        await close_all_pools()

        print(json.dumps(all_health, indent=2), file=sys.stderr)

        if any_failed:
            raise typer.Exit(code=1)

    asyncio.run(_run())


def main() -> None:
    app()


if __name__ == "__main__":
    main()
