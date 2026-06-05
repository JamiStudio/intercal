"""OpenAI LLM adapter.

Requires: `intercal-shared[llm-openai]` (openai) and OPENAI_API_KEY.
"""

from __future__ import annotations

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
        return LlmAuthError(f"OpenAI {op} failed (auth): {exc}")
    if "rate" in name or "429" in text or "quota" in text:
        return LlmRateLimitError(f"OpenAI {op} failed (rate limit): {exc}")
    if "timeout" in name or "timeout" in text:
        return LlmTimeoutError(f"OpenAI {op} failed (timeout): {exc}")
    return LlmError(f"OpenAI {op} failed: {exc}")


class OpenAILlmAdapter:
    """LlmPort implementation backed by the OpenAI Chat Completions API.

    Parameters
    ----------
    api_key:
        OpenAI API key.  A clear error is raised at construction time if absent.
    model:
        OpenAI model name, e.g. ``"gpt-4o-mini"``.
    default_max_tokens / timeout / budget:
        Shared port-policy knobs (see :class:`GeminiLlmAdapter`).
    """

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        *,
        default_max_tokens: int = 2048,
        timeout: float | None = 60.0,
        budget: RequestBudget | None = None,
    ) -> None:
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY is required for the OpenAI LLM adapter. "
                "Set it in your .env or environment (OPENAI_API_KEY=...)."
            )
        try:
            from openai import AsyncOpenAI  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "openai is required for the OpenAI LLM adapter. "
                "Install it with: pip install 'intercal-shared[llm-openai]'"
            ) from exc

        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model
        self._default_max_tokens = default_max_tokens
        self._timeout = timeout
        self._budget = budget
        _log.info("OpenAI LLM adapter initialised (model=%r)", model)

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
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

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

            data = parse_json_object(response.choices[0].message.content or "", provider="OpenAI")
            return StructuredResult(
                data=data,
                model=self._model,
                input_tokens=response.usage.prompt_tokens if response.usage else None,
                output_tokens=response.usage.completion_tokens if response.usage else None,
            )

        return await run_structured_with_retries(
            attempt=_attempt, schema=schema, provider="OpenAI"
        )
