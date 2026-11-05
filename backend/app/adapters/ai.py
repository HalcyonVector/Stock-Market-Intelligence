"""AI provider implementations (Anthropic / OpenAI / Groq / Ollama) with mock fallback."""
from __future__ import annotations

import re

from app.adapters.base import AIProvider
from app.adapters.mock import MockAIProvider
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("adapters.ai")


class AnthropicAIProvider(AIProvider):
    name = "anthropic"

    async def explain(self, system: str, prompt: str) -> str:
        try:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model=settings.AI_MODEL,
                max_tokens=600,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            return "".join(b.text for b in resp.content if b.type == "text")
        except Exception as e:  # noqa: BLE001
            log.warning("anthropic.fallback", error=str(e))
            return await MockAIProvider().explain(system, prompt)


class OpenAIAIProvider(AIProvider):
    name = "openai"

    async def explain(self, system: str, prompt: str) -> str:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.AI_MODEL,
                max_tokens=600,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            )
            return resp.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001
            log.warning("openai.fallback", error=str(e))
            return await MockAIProvider().explain(system, prompt)


class OllamaAIProvider(AIProvider):
    """Use a local Ollama model via its OpenAI-compatible API."""

    name = "ollama"

    async def explain(self, system: str, prompt: str) -> str:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(
                base_url=settings.OLLAMA_BASE_URL,
                api_key="ollama",
                timeout=85.0,
            )
            resp = await client.chat.completions.create(
                model=settings.OLLAMA_MODEL,
                max_tokens=900,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            )
            return resp.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001
            log.warning("ollama.fallback", error=str(e))
            return await MockAIProvider().explain(system, prompt)


# Live status of the AI layer, surfaced on /health so a silent fallback to the
# mock text is visible without digging through logs.
ai_status: dict = {"model": None, "degraded": False, "last_error": None}

# Groq retires models from the free tier periodically (llama-3.3-70b-versatile
# went away on 2026-08-16, after which every call 404'd and the app quietly
# served mock text for months). On "model not found / decommissioned" we
# switch to the first of these that the account can actually see.
GROQ_PREFERRED_MODELS = [
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-20b",
]

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _is_model_gone(err: Exception) -> bool:
    msg = str(err).lower()
    return "model_not_found" in msg or "decommissioned" in msg or "does not exist" in msg


class GroqAIProvider(AIProvider):
    """Use Groq's LPU inference via its OpenAI-compatible API (free tier)."""

    name = "groq"
    # Process-wide: once we've switched off a retired model, stay switched.
    _model: str | None = None

    def _client(self):
        from openai import AsyncOpenAI

        return AsyncOpenAI(base_url=settings.GROQ_BASE_URL, api_key=settings.GROQ_API_KEY, timeout=30.0)

    @staticmethod
    def _extra_body(model: str) -> dict:
        # Reasoning models spend completion tokens "thinking" before answering.
        # Keep that short so the answer fits in max_tokens, and hide the
        # reasoning text so it never leaks into the UI.
        if model.startswith("openai/gpt-oss"):
            return {"reasoning_effort": "low"}
        if model.startswith("qwen/"):
            return {"reasoning_format": "hidden"}
        return {}

    async def _pick_replacement(self, client, current: str) -> str | None:
        try:
            available = {m.id async for m in client.models.list()}
        except Exception as e:  # noqa: BLE001
            log.warning("groq.models_list_failed", error=str(e))
            available = set()
        for m in GROQ_PREFERRED_MODELS:
            if m != current and (not available or m in available):
                return m
        return None

    async def _complete(self, client, model: str, system: str, prompt: str) -> str:
        resp = await client.chat.completions.create(
            model=model,
            max_tokens=1500,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            extra_body=self._extra_body(model) or None,
        )
        text = _THINK_RE.sub("", resp.choices[0].message.content or "").strip()
        if not text:
            raise RuntimeError(f"empty completion from {model}")
        return text

    async def explain(self, system: str, prompt: str) -> str:
        model = GroqAIProvider._model or settings.GROQ_MODEL
        try:
            client = self._client()
            try:
                text = await self._complete(client, model, system, prompt)
            except Exception as e:  # noqa: BLE001
                if not _is_model_gone(e):
                    raise
                replacement = await self._pick_replacement(client, model)
                if not replacement:
                    raise
                log.warning("groq.model_retired", old=model, new=replacement, error=str(e))
                model = replacement
                text = await self._complete(client, model, system, prompt)
                GroqAIProvider._model = model
            ai_status.update(model=model, degraded=False, last_error=None)
            return text
        except Exception as e:  # noqa: BLE001
            log.warning("groq.fallback", model=model, error=str(e))
            ai_status.update(model=model, degraded=True, last_error=str(e)[:300])
            return await MockAIProvider().explain(system, prompt)


def ai_cache_ttl(normal: int) -> int:
    """TTL for cached AI output: short while the AI layer is degraded.

    Without this a mock/fallback briefing was cached for 24 h, so even after
    the AI was fixed the site kept showing the placeholder text for a day.
    """
    from app.adapters.registry import providers

    degraded = ai_status["degraded"] or isinstance(providers.ai, MockAIProvider)
    return min(normal, 300) if degraded and settings.AI_PROVIDER != "mock" else normal
