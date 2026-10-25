"""Token receipt: every LLM call is logged with real counts to logs/usage.jsonl."""

from __future__ import annotations

from datetime import datetime

from pydantic_ai.usage import RunUsage

from agents.config import MODEL_NAME
from agents.logs import USAGE_LOG, append_jsonl, read_jsonl
from agents.pricing import cost_usd
from models import UsageRecord

STARTED = datetime.now()                  # "this session" = since the backend started


def record(run_id: str, agent: str, usage: RunUsage, seconds: float) -> UsageRecord:
    rec = UsageRecord(
        run_id=run_id, agent=agent, model=MODEL_NAME, time=datetime.now(), seconds=round(seconds, 2),
        requests=usage.requests, tool_calls=usage.tool_calls,
        input_tokens=usage.input_tokens, cached_input_tokens=usage.cache_read_tokens,
        cache_write_tokens=usage.cache_write_tokens, output_tokens=usage.output_tokens,
        reasoning_tokens=usage.output_reasoning_tokens or 0,
        cost_usd=round(cost_usd(MODEL_NAME, usage.input_tokens, usage.cache_read_tokens,
                                usage.cache_write_tokens, usage.output_tokens), 8),
        what_if_astra_usd=round(cost_usd("gpt-6-astra", usage.input_tokens, usage.cache_read_tokens,
                                         usage.cache_write_tokens, usage.output_tokens), 6),
    )
    append_jsonl(USAGE_LOG, rec.model_dump(mode="json"))
    return rec


def summary() -> dict:
    """Totals for the sidebar meter: this session (since backend start) and all time."""
    rows = read_jsonl(USAGE_LOG)
    session = [r for r in rows if datetime.fromisoformat(r["time"]) >= STARTED]

    def total(rs: list[dict]) -> dict:
        by_agent: dict[str, dict] = {}
        for r in rs:
            a = by_agent.setdefault(r["agent"], {"calls": 0, "tokens": 0, "cost_usd": 0.0})
            a["calls"] += r["requests"]
            a["tokens"] += r["input_tokens"] + r["output_tokens"]
            a["cost_usd"] = round(a["cost_usd"] + r["cost_usd"], 8)
        return {
            "runs": len({r["run_id"] for r in rs}),
            "requests": sum(r["requests"] for r in rs),
            "input_tokens": sum(r["input_tokens"] for r in rs),
            "cached_input_tokens": sum(r["cached_input_tokens"] for r in rs),
            "output_tokens": sum(r["output_tokens"] for r in rs),
            "cost_usd": round(sum(r["cost_usd"] for r in rs), 8),
            "what_if_astra_usd": round(sum(r["what_if_astra_usd"] for r in rs), 6),
            "by_agent": by_agent,
        }

    return {"session": total(session), "all_time": total(rows), "last": rows[-1] if rows else None}
