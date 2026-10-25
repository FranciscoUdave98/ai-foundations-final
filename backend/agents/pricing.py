"""Token prices (USD per 1M tokens, OpenAI standard tier, as used in Lecture 11).

gpt-6-astra is never called (the course key is luna-only); it only powers the what-if line.
"""

from __future__ import annotations

PRICES = {
    "gpt-6-luna": {"input": 0.10, "cached_input": 0.01, "cache_write": 0.125, "output": 0.50},
    "gpt-6-astra": {"input": 10.00, "cached_input": 1.00, "cache_write": 12.50, "output": 50.00},
}


def cost_usd(model: str, input_tokens: int, cached_input: int, cache_write: int, output_tokens: int) -> float:
    """input_tokens includes cached and cache-write tokens; each part is priced at its own rate."""
    p = PRICES[model]
    fresh = max(0, input_tokens - cached_input - cache_write)
    return (fresh * p["input"] + cached_input * p["cached_input"]
            + cache_write * p["cache_write"] + output_tokens * p["output"]) / 1e6
