"""Anthropic Claude LLM adapter.

Requires: `intercal-shared[llm-anthropic]` (anthropic) and ANTHROPIC_API_KEY.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from intercal_shared.adapters._llm_common import (
    consume_budget,
    run_structured_with_retries,
    with_timeout,
)
from intercal_shared.ports.llm import (
    LlmAuthError,
    LlmError,
    LlmExtractionError,
    LlmRateLimitError,
    LlmResponse,
    LlmTimeoutError,
    RequestBudget,
    StructuredResult,
)

_log = logging.getLogger(__name__)


def _classify(exc: Exception, *, op: str) -> LlmError:
    text = str(exc).lower()
    name = type(exc).__name__.lower()
    auth_markers = ("auth", "permission", "401", "403", "api key")
    if any(m in name or m in text for m in auth_markers):
        return LlmAuthError(f"Anthropic {op} failed (auth): {exc}")
    if "rate" in name or "429" in text or "overloaded" in text or "quota" in text:
        return LlmRateLimitError(f"Anthropic {op} failed (rate limit): {exc}")
    if "timeout" in name or "timeout" in text:
        return LlmTimeoutError(f"Anthropic {op} failed (timeout): {exc}")
    return LlmError(f"Anthropic {op} failed: {exc}")


class AnthropicLlmAdapter:
    """LlmPort implementation backed by the Anthropic Messages API.

    Parameters
    ----------
    api_key:
        Anthropic API key.  A clear error is raised at construction time if absent.
    model:
        Claude model name, e.g. ``"claude-haiku-4-5"``.
    default_max_tokens / timeout / budget:
        Shared port-policy knobs (see :class:`GeminiLlmAdapter`).
    """

    def __init__(
        self,
        api_key: str,
        model: str = "claude-haiku-4-5",
        *,
        default_max_tokens: int = 2048,
        timeout: float | None = 60.0,
        budget: RequestBudget | None = None,
    ) -> None:
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY is required for the Anthropic LLM adapter. "
                "Set it in your .env or environment (ANTHROPIC_API_KEY=...)."
            )
        try:
            import anthropic as _anthropic  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "anthropic is required for the Anthropic LLM adapter. "
                "Install it with: pip install 'intercal-shared[llm-anthropic]'"
            ) from exc

        self._client = _anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model
        self._default_max_tokens = default_max_tokens
        self._timeout = timeout
        self._budget = budget
        _log.info("Anthropic LLM adapter initialised (model=%r)", model)

    @property
    def model(self) -> str:
        return self._model

    async def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int | None = None,
        temperature: float = 0.0,
    ) -> LlmResponse:
        consume_budget(self._budget)
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens if max_tokens is not None else self._default_max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        try:
            response = await with_timeout(self._client.messages.create(**kwargs), self._timeout)
        except LlmError:
            raise
        except Exception as exc:
            raise _classify(exc, op="completion") from exc

        text = "".join(block.text for block in response.content if hasattr(block, "text"))
        return LlmResponse(
            text=text,
            model=self._model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

    async def extract_structured(
        self,
        schema: dict[str, Any],
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int | None = None,
    ) -> StructuredResult:
        schema_hint = json.dumps(schema, indent=2)
        tool_definition: dict[str, Any] = {
            "name": "extract_structured",
            "description": "Extract structured data from the provided text.",
            "input_schema": schema if schema else {"type": "object"},
        }
        full_prompt = f"{prompt}\n\nSchema:\n{schema_hint}"

        async def _attempt() -> StructuredResult:
            consume_budget(self._budget)
            kwargs: dict[str, Any] = {
                "model": self._model,
                "max_tokens": max_tokens if max_tokens is not None else self._default_max_tokens,
                "messages": [{"role": "user", "content": full_prompt}],
                "tools": [tool_definition],
                "tool_choice": {"type": "tool", "name": "extract_structured"},
            }
            if system:
                kwargs["system"] = system
            try:
                response = await with_timeout(self._client.messages.create(**kwargs), self._timeout)
            except LlmError:
                raise
            except Exception as exc:
                raise _classify(exc, op="structured extraction") from exc

            data: dict[str, Any] | None = None
            for block in response.content:
                if getattr(block, "type", None) == "tool_use":
                    data = block.input  # type: ignore[assignment]
                    break
            if data is None:
                # Fallback: parse any text content as JSON.
                text = "".join(b.text for b in response.content if hasattr(b, "text"))
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError as exc:
                    raise LlmExtractionError(
                        f"Anthropic returned non-JSON structured output: {text[:200]!r}"
                    ) from exc
                if not isinstance(parsed, dict):
                    raise LlmExtractionError(
                        f"Anthropic structured output is not a JSON object "
                        f"(got {type(parsed).__name__})."
                    )
                data = parsed
            return StructuredResult(
                data=data,
                model=self._model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

        return await run_structured_with_retries(
            attempt=_attempt, schema=schema, provider="Anthropic"
        )
