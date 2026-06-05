"""Google Gemini / Vertex AI LLM adapter.

Requires: ``intercal-shared[llm-gemini]`` (google-genai>=1.0.0).

Two credential modes — same adapter class, selected at construction time:

**Gemini API key mode** (``vertexai=False``, default):
    Requires ``GEMINI_API_KEY``.  Free-tier daily limits apply.
    ``Client(api_key=...)`` per the google-genai v2 SDK.

**Vertex AI mode** (``vertexai=True``):
    Uses Application Default Credentials (ADC) or an explicit service-account
    key file.  Requires ``VERTEX_PROJECT`` and ``VERTEX_LOCATION``.
    Primary provider per the program posture (yrka.io trial credits, ADC).
    ``Client(vertexai=True, project=..., location=...)`` per the
    google-genai v2 SDK (``project`` + ``location`` required for Vertex).

Vertex model names are the same as the Gemini API names (``gemini-2.5-flash``
etc.) — the SDK routes them correctly based on the ``vertexai`` flag.

Structured extraction uses JSON-mode generation_config (``response_mime_type``).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from intercal_shared.ports.llm import LlmError, LlmExtractionError, LlmResponse

_log = logging.getLogger(__name__)


class GeminiLlmAdapter:
    """LlmPort implementation backed by Google Gemini / Vertex AI via google-genai v2.

    Parameters
    ----------
    api_key:
        Gemini API key for API-key mode.  Mutually exclusive with *vertexai=True*.
        A clear error is raised at construction time if absent when
        ``vertexai=False``.
    model:
        Model identifier, e.g. ``"gemini-2.5-flash"`` (the same name works for
        both Gemini API and Vertex AI modes).
    vertexai:
        If ``True`` the adapter uses Vertex AI mode.  ADC (or the JSON key file
        at ``GOOGLE_APPLICATION_CREDENTIALS``) must be valid.
        Requires *project* and *location*.
    project:
        GCP project ID.  Required when ``vertexai=True``.
    location:
        GCP region, e.g. ``"us-east4"``.  Required when ``vertexai=True``.
    """

    def __init__(
        self,
        api_key: str = "",
        model: str = "gemini-2.5-flash",
        *,
        vertexai: bool = False,
        project: str = "",
        location: str = "us-east4",
    ) -> None:
        try:
            import google.genai as genai  # type: ignore[import-untyped]
        except ImportError as exc:
            raise ImportError(
                "google-genai is required for the Gemini/Vertex LLM adapter. "
                "Install it with: pip install 'intercal-shared[llm-gemini]'"
            ) from exc

        if vertexai:
            if not project:
                raise ValueError(
                    "VERTEX_PROJECT is required for Vertex AI mode. "
                    "Set it in your .env (VERTEX_PROJECT=<gcp-project-id>)."
                )
            # ADC resolution order: GOOGLE_APPLICATION_CREDENTIALS env var,
            # then gcloud application-default, then metadata server.
            # Explicit SA key path is set via GOOGLE_APPLICATION_CREDENTIALS.
            self._client = genai.Client(
                vertexai=True,
                project=project,
                location=location,
            )
            _log.info(
                "Gemini/Vertex LLM adapter initialised (model=%r, project=%r, location=%r)",
                model,
                project,
                location,
            )
        else:
            if not api_key:
                raise ValueError(
                    "GEMINI_API_KEY is required for the Gemini LLM adapter (API-key mode). "
                    "Set it in your .env or environment (GEMINI_API_KEY=...). "
                    "To use Vertex AI instead, set LLM_PROVIDER=vertex."
                )
            self._client = genai.Client(api_key=api_key)
            _log.info("Gemini LLM adapter initialised (model=%r, mode=api-key)", model)

        self._genai = genai
        self._model = model
        self._vertexai = vertexai

    @property
    def model(self) -> str:
        """Model identifier used by this adapter."""
        return self._model

    async def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.0,
    ) -> LlmResponse:
        import asyncio

        try:
            config: dict[str, Any] = {
                "max_output_tokens": max_tokens,
                "temperature": temperature,
            }
            if system:
                config["system_instruction"] = system

            loop = asyncio.get_event_loop()

            def _sync() -> Any:
                return self._client.models.generate_content(
                    model=self._model,
                    contents=prompt,
                    config=self._genai.types.GenerateContentConfig(**config),
                )

            response = await loop.run_in_executor(None, _sync)
            text: str = response.text or ""
            # Surface token counts if the SDK populated usage_metadata.
            usage = getattr(response, "usage_metadata", None)
            input_tokens: int | None = (
                getattr(usage, "prompt_token_count", None) if usage else None
            )
            output_tokens: int | None = (
                getattr(usage, "candidates_token_count", None)
                or getattr(usage, "total_token_count", None)
                if usage
                else None
            )
            return LlmResponse(
                text=text,
                model=self._model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except LlmError:
            raise
        except Exception as exc:
            mode = "Vertex" if self._vertexai else "Gemini"
            raise LlmError(f"{mode} completion failed: {exc}") from exc

    async def extract_structured(
        self,
        schema: dict[str, Any],
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 2048,
    ) -> dict[str, Any]:
        import asyncio

        try:
            schema_hint = json.dumps(schema, indent=2)
            full_prompt = (
                f"{prompt}\n\nRespond ONLY with a JSON object matching this schema:\n{schema_hint}"
            )
            config: dict[str, Any] = {
                "max_output_tokens": max_tokens,
                "temperature": 0.0,
                "response_mime_type": "application/json",
            }
            if system:
                config["system_instruction"] = system

            loop = asyncio.get_event_loop()

            def _sync() -> Any:
                return self._client.models.generate_content(
                    model=self._model,
                    contents=full_prompt,
                    config=self._genai.types.GenerateContentConfig(**config),
                )

            response = await loop.run_in_executor(None, _sync)
            raw = (response.text or "").strip()
            try:
                result: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError as parse_exc:
                raise LlmExtractionError(
                    f"Gemini/Vertex returned non-JSON response: {raw[:200]!r}"
                ) from parse_exc
            return result
        except LlmExtractionError:
            raise
        except LlmError:
            raise
        except Exception as exc:
            mode = "Vertex" if self._vertexai else "Gemini"
            raise LlmError(f"{mode} structured extraction failed: {exc}") from exc
