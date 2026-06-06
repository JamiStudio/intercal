"""Tests for intercal_shared.config — no live network required."""

from __future__ import annotations

import pytest
from intercal_shared.config import Settings


def _isolated_settings(**kwargs: object) -> Settings:
    """Construct Settings with no .env file loading (uses only provided kwargs + env vars)."""
    # pydantic-settings v2: pass _env_file=None to suppress .env loading.
    # The type: ignore suppresses pyright's spurious 'unexpected keyword' warning
    # (pydantic-settings BaseSettings.__init__ accepts _env_file at runtime).
    return Settings(_env_file=None, **kwargs)  # type: ignore[call-arg]


def test_default_settings_instantiate() -> None:
    """Settings should instantiate with all defaults without any env vars set."""
    cfg = _isolated_settings()
    assert cfg.database_url.startswith("postgres://")
    assert cfg.storage_provider == "s3"
    assert cfg.queue_provider == "redis"
    assert cfg.embeddings_provider == "local"
    assert cfg.embeddings_dim == 384
    assert cfg.llm_provider == "gemini"
    assert cfg.scheduler_provider == "local"
    assert cfg.log_level == "info"


def test_settings_override_via_kwargs() -> None:
    """Settings fields should be overrideable via constructor kwargs (for test isolation)."""
    cfg = _isolated_settings(
        database_url="postgres://test:test@localhost:5432/testdb",
        llm_provider="groq",
        log_level="debug",
    )
    assert cfg.database_url == "postgres://test:test@localhost:5432/testdb"
    assert cfg.llm_provider == "groq"
    assert cfg.log_level == "debug"


def test_settings_accepts_all_llm_providers() -> None:
    for provider in ("vertex", "gemini", "groq", "anthropic", "openai"):
        # Vertex mode requires a resolvable project id (validator enforced).
        extra = {"vertex_project": "p"} if provider == "vertex" else {}
        cfg = _isolated_settings(llm_provider=provider, **extra)
        assert cfg.llm_provider == provider


def test_settings_accepts_all_queue_providers() -> None:
    for provider in ("redis", "postgres"):
        cfg = _isolated_settings(queue_provider=provider)
        assert cfg.queue_provider == provider


def test_settings_accepts_all_embeddings_providers() -> None:
    for provider in ("local", "openai"):
        cfg = _isolated_settings(embeddings_provider=provider)
        assert cfg.embeddings_provider == provider


def test_budget_knobs_validate() -> None:
    import pydantic

    with pytest.raises(pydantic.ValidationError, match="LLM_DAILY_REQUEST_BUDGET"):
        _isolated_settings(llm_daily_request_budget=-1)
    with pytest.raises(pydantic.ValidationError, match="INGEST_MAX_DOCS_PER_RUN"):
        _isolated_settings(ingest_max_docs_per_run=-1)
    with pytest.raises(pydantic.ValidationError, match="EMBEDDINGS_BATCH_SIZE"):
        _isolated_settings(embeddings_batch_size=0)
    with pytest.raises(pydantic.ValidationError, match="LLM_PRIMARY"):
        _isolated_settings(llm_primary="bogus")
