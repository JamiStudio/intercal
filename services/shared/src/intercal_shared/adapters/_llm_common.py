"""Shared adapter-side helpers for LLM ports.

Keeps the retry / validation / budget / timeout policy in one place so every
provider adapter behaves identically at the port boundary.  Provider-specific
request construction stays in each adapter; this module owns only the
provider-agnostic control flow.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from intercal_shared.ports.llm import (
    LlmExtractionError,
    LlmRateLimitError,
    LlmTimeoutError,
    RequestBudget,
    StructuredResult,
    validate_against_schema,
)

_log = logging.getLogger(__name__)

# Bounded retry count for transient failures and malformed structured output.
DEFAULT_MAX_RETRIES = 2
# Base backoff (seconds); exponential.  Small — pipeline jobs are batch, not interactive.
_BACKOFF_BASE = 0.5


def consume_budget(budget: RequestBudget | None) -> None:
    """Reserve one request against *budget* if one is configured."""
    if budget is not None:
        budget.check_and_consume(cost=1)


async def with_timeout(coro: Awaitable[Any], timeout_s: float | None) -> Any:
    """Await *coro* with an optional timeout, translating to ``LlmTimeoutError``.

    A ``timeout_s`` value is intentional here (not ``asyncio.timeout`` as a context
    manager) because the awaited object is an executor future, not a cancellable task.
    """
    if timeout_s is None:
        return await coro
    try:
        return await asyncio.wait_for(coro, timeout=timeout_s)
    except (TimeoutError, asyncio.TimeoutError) as exc:  # noqa: UP041
        raise LlmTimeoutError(f"LLM request exceeded timeout of {timeout_s}s") from exc


def parse_json_object(raw: str, *, provider: str) -> dict[str, Any]:
    """Parse *raw* into a JSON object, raising ``LlmExtractionError`` on failure."""
    text = (raw or "").strip()
    try:
        parsed: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise LlmExtractionError(
            f"{provider} returned non-JSON structured output: {text[:200]!r}"
        ) from exc
    if not isinstance(parsed, dict):
        raise LlmExtractionError(
            f"{provider} structured output is not a JSON object (got {type(parsed).__name__})."
        )
    return parsed


async def run_structured_with_retries(
    *,
    attempt: Callable[[], Awaitable[StructuredResult]],
    schema: dict[str, Any],
    provider: str,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> StructuredResult:
    """Run a structured-extraction *attempt*, validating + retrying on failure.

    *attempt* must perform one provider call and return a :class:`StructuredResult`
    whose ``data`` is the parsed (but not yet schema-validated) object.  This helper
    validates ``data`` against *schema* and retries the whole attempt on malformed
    output, schema-validation failure, rate limits, or timeouts — up to
    *max_retries* additional tries.  Persistent failure re-raises the last error
    (``LlmExtractionError`` for shape problems).
    """
    last_exc: Exception | None = None
    for attempt_index in range(max_retries + 1):
        try:
            result = await attempt()
            validate_against_schema(result.data, schema)
            return result
        except (LlmExtractionError, LlmRateLimitError, LlmTimeoutError) as exc:
            last_exc = exc
            if attempt_index < max_retries:
                delay = _BACKOFF_BASE * (2**attempt_index)
                _log.warning(
                    "%s structured extraction attempt %d/%d failed (%s); retrying in %.1fs",
                    provider,
                    attempt_index + 1,
                    max_retries + 1,
                    type(exc).__name__,
                    delay,
                )
                await asyncio.sleep(delay)
                continue
            break
    assert last_exc is not None  # loop runs at least once
    raise last_exc
