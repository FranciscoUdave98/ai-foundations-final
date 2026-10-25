"""Model setup: every PaceLab agent runs on gpt-6-luna through Portkey, on the Responses API.

gpt-6-luna needs the Responses API for function tools (chat/completions rejects tools plus
reasoning on this model). .env is read from the repo folder and the folder above it.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic_ai.models.openai import OpenAIResponsesModel, OpenAIResponsesModelSettings
from pydantic_ai.providers.openai import OpenAIProvider

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

MODEL_NAME = "gpt-6-luna"                 # the only model the course key allows
PORTKEY_URL = "https://api.portkey.ai/v1"


def require_api_key() -> str:
    key = (os.getenv("PORTKEY_API_KEY") or os.getenv("PORTKEY_PAI_KEY") or "").strip()
    if not key:
        raise RuntimeError("PORTKEY_API_KEY is missing. Put it in .env in the repo folder or the folder above.")
    return key


@lru_cache(maxsize=1)
def build_model() -> OpenAIResponsesModel:
    key = require_api_key()
    client = AsyncOpenAI(
        api_key=key,
        base_url=PORTKEY_URL,
        default_headers={
            "x-portkey-api-key": key,
            "x-portkey-provider": "openai",
            # Portkey can replay an old answer for an identical request. Force a live call so
            # answers and token counts are real (the course grades real counts, not replays).
            "x-portkey-cache-force-refresh": "true",
        },
        timeout=180,
    )
    return OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))


def settings(cache_key: str, effort: str = "low") -> OpenAIResponsesModelSettings:
    """Low reasoning effort and a shared prompt-cache key per agent (the static prompt is cached)."""
    return OpenAIResponsesModelSettings(
        openai_reasoning_effort=effort,
        openai_prompt_cache_key=cache_key,
        openai_cache_instructions=True,
    )
