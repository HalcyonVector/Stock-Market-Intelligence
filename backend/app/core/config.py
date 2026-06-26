"""
Central application configuration.

All settings are read from environment variables (12-factor). A `.env` file is
loaded automatically in development. Nothing secret is ever hard-coded.
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- App ---
    ENV: Literal["dev", "staging", "prod"] = "dev"
    APP_NAME: str = "Stock Discovery & Intelligence"
    API_V1_PREFIX: str = "/api/v1"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # --- Data provider selection ---
    DATA_MODE: Literal["mock", "live"] = "mock"
    DEFAULT_MARKET: Literal["US", "IN", "GLOBAL"] = "GLOBAL"

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://sdi:sdi@localhost:5432/sdi"

    # --- Redis (cache + pub/sub + celery broker) ---
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # --- Refresh cadences (seconds) ---
    # Tuned for free-tier hosting (Upstash 500K cmds/mo).
    # yfinance data is 15min delayed anyway; RSS updates 2-3x/hr;
    # sentiment doesn't shift meaningfully in under an hour.
    REFRESH_MARKET: int = 900       # 15 min (matches yfinance delay)
    REFRESH_NEWS: int = 1800        # 30 min
    REFRESH_SENTIMENT: int = 3600   # 60 min
    REFRESH_SCORES: int = 3600      # 60 min (derived from quotes + sentiment)

    # --- Market-aware back-off ---
    # The base cadences above apply during US market hours. When the market is
    # closed the ETL backs off (intervals are multiplied) so we don't burn free
    # provider rate limits refreshing data that isn't moving. Set both to 1 to
    # disable and refresh at a constant cadence around the clock.
    SCHEDULE_MARKET_AWARE: bool = True
    OFFHOURS_BACKOFF: float = 4.0    # weekday, outside 09:30–16:00 ET
    WEEKEND_BACKOFF: float = 12.0    # Saturday / Sunday

    # --- Optional free-tier API keys ---
    FINNHUB_API_KEY: str = ""
    ALPHAVANTAGE_API_KEY: str = ""
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "sdi-research/0.1"

    # --- Auth ---
    AUTH_SECRET: str = ""
    AUTH_ALGORITHM: str = "HS256"
    AUTH_TOKEN_TTL_MIN: int = 60 * 24 * 7
    AUTO_CREATE_TABLES: bool = True

    # --- AI providers ---
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    AI_PROVIDER: Literal["anthropic", "openai", "groq", "ollama", "mock"] = "mock"
    AI_MODEL: str = "claude-sonnet-4-6"

    # --- Ollama (local LLM) ---
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "qwen2.5:7b"

    # --- Groq (free cloud LLM) ---
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "llama-3.3-70b-versatile"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
