"""Tests for intercal_extract CLI and job registry wiring — no live network required."""

from __future__ import annotations

import inspect

from intercal_extract.cli import app
from intercal_extract.jobs import extract_claims, extract_mentions
from typer.testing import CliRunner


def test_jobs_are_importable() -> None:
    assert callable(extract_mentions)
    assert callable(extract_claims)


def test_jobs_are_async() -> None:
    assert inspect.iscoroutinefunction(extract_mentions)
    assert inspect.iscoroutinefunction(extract_claims)


def test_cli_help_lists_all_commands() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "extract-mentions" in result.output
    assert "extract-claims" in result.output


def test_extract_mentions_missing_option() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["extract-mentions"])
    assert result.exit_code != 0


def test_extract_claims_missing_option() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["extract-claims"])
    assert result.exit_code != 0
