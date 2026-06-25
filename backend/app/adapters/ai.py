"""AI provider implementations (Anthropic / OpenAI / Ollama) with mock fallback."""
from __future__ import annotations

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
                timeout=120.0,
            )
            resp = await client.chat.completions.create(
                model=settings.OLLAMA_MODEL,
                max_tokens=1200,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            )
            return resp.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001
            log.warning("ollama.fallback", error=str(e))
            return await MockAIProvider().explain(system, prompt)
