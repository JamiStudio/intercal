"""Groq LLM adapter (free tier alternative).

Requires: `intercal-shared[llm-groq]` (groq) and GROQ_API_KEY.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from intercal_shared.adapters._llm_common import (
    consume_budget,
    parse_json_object,
    run_structured_with_retries,
    with_timeout,
)
from intercal_shared.ports.llm import (
    LlmAuthError,
    LlmError,
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
    if "auth" in name or "401" in text or "403" in text or "api key" in text:
        return LlmAuthError(f"Groq {op} failed (auth): {exc}")
    if "rate" in name or "429" in text or "quota" in text:
        return LlmRateLimitError(f"Groq {op} failed (rate limit): {exc}")
    if "timeout" in name or "timeout" in text:
        return LlmTimeoutError(f"Groq {op} failed (timeout): {exc}")
    return LlmError(f"Groq {op} failed: {exc}")


class GroqLlmAdapter:
    """LlmPort implementation backed by the Groq API.

    Parameters
    ----------
    api_key:
        Groq API key.  A clear error is raised at construction time if absent.
    model:
        Groq model name, e.g. ``"llama-3.3-70b-versatile"``.
    default_max_tokens / timeout / budget:
        Shared port-policy knobs (see :class:`GeminiLlmAdapter`).
    """

    def __init__(
        self,
        api_key: str,
        model: str = "llama-3.3-70b-versatile",
        *,
        default_max_tokens: int = 2048,
        timeout: float | None = 60.0,
        budget: RequestBudget | None = None,
    ) -> None:
        if not api_key:
            raise ValueError(
                "GROQ_API_KEY is required for the Groq LLM adapter. "
                "Set it in your .env or environment (GROQ_API_KEY=...)."
            )
        try:
            from groq import AsyncGroq  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "groq is required for the Groq LLM adapter. "
                "Install it with: pip install 'intercal-shared[llm-groq]'"
            ) from exc

        self._client = AsyncGroq(api_key=api_key)
        self._model = model
        self._default_max_tokens = default_max_tokens
        self._timeout = timeout
        self._budget = budget
        _log.info("Groq LLM adapter initialised (model=%r)", model)

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
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        try:
            response = await with_timeout(
                self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,  # type: ignore[arg-type]
                    max_tokens=max_tokens if max_tokens is not None else self._default_max_tokens,
                    temperature=temperature,
                ),
                self._timeout,
            )
        except LlmError:
            raise
        except Exception as exc:
            raise _classify(exc, op="completion") from exc

        text = response.choices[0].message.content or ""
        return LlmResponse(
            text=text,
            model=self._model,
            input_tokens=response.usage.prompt_tokens if response.usage else None,
            output_tokens=response.usage.completion_tokens if response.usage else None,
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
        full_prompt = (
            f"{prompt}\n\nRespond ONLY with a JSON object matching this schema:\n{schema_hint}"
        )
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": full_prompt})

        async def _attempt() -> StructuredResult:
            consume_budget(self._budget)
            try:
                response = await with_timeout(
                    self._client.chat.completions.create(
                        model=self._model,
                        messages=messages,  # type: ignore[arg-type]
                        max_tokens=max_tokens
                        if max_tokens is not None
                        else self._default_max_tokens,
                        temperature=0.0,
                        response_format={"type": "json_object"},
                    ),
                    self._timeout,
                )
            except LlmError:
                raise
            except Exception as exc:
                raise _classify(exc, op="structured extraction") from exc

            data = parse_json_object(response.choices[0].message.content or "", provider="Groq")
            return StructuredResult(
                data=data,
                model=self._model,
                input_tokens=response.usage.prompt_tokens if response.usage else None,
                output_tokens=response.usage.completion_tokens if response.usage else None,
            )

        return await run_structured_with_retries(attempt=_attempt, schema=schema, provider="Groq")
