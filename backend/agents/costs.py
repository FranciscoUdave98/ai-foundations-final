"""Usage log grouped by run, and the measured cost per user per month (shared by Under the hood and the chat)."""

from __future__ import annotations

from agents.logs import USAGE_LOG, read_jsonl

# A typical user's month: one plan, four weekly check-ins, two race searches, twenty chat messages.
MONTHLY_MIX = {"plan_build": 1, "check_in": 4, "race_search": 2, "chat": 20}
KINDS = {"council": "plan_build", "scout": "race_search", "checkin": "check_in", "chat": "chat"}


def run_type(run_id: str) -> str:
    return KINDS.get(run_id.split("-")[0], "other")


def receipts() -> dict:
    rows = read_jsonl(USAGE_LOG)
    runs: dict[str, dict] = {}
    for r in rows:
        run = runs.setdefault(r["run_id"], {"run_id": r["run_id"], "type": run_type(r["run_id"]), "time": r["time"], "agents": {},
                                            "cost_usd": 0.0, "tokens": 0, "cached": 0, "calls": 0, "astra_usd": 0.0})
        a = run["agents"].setdefault(r["agent"], {"calls": 0, "input": 0, "cached": 0, "output": 0, "cost_usd": 0.0})
        a["calls"] += r["requests"]; a["input"] += r["input_tokens"]; a["cached"] += r["cached_input_tokens"]
        a["output"] += r["output_tokens"]; a["cost_usd"] = round(a["cost_usd"] + r["cost_usd"], 8)
        run["cost_usd"] = round(run["cost_usd"] + r["cost_usd"], 8)
        run["tokens"] += r["input_tokens"] + r["output_tokens"]
        run["cached"] += r["cached_input_tokens"]; run["calls"] += r["requests"]
        run["astra_usd"] = round(run["astra_usd"] + r["what_if_astra_usd"], 6)
    by_type: dict[str, list[float]] = {}
    for run in runs.values():
        by_type.setdefault(run["type"], []).append(run["cost_usd"])
    avg = {k: round(sum(v) / len(v), 6) for k, v in by_type.items()}
    per_user = sum(avg.get(k, 0) * n for k, n in MONTHLY_MIX.items())
    return {
        "runs": sorted(runs.values(), key=lambda r: r["time"], reverse=True)[:50],
        "avg_cost_by_type": avg, "runs_by_type": {k: len(v) for k, v in by_type.items()},
        "monthly_mix": MONTHLY_MIX, "measured_types": [k for k in MONTHLY_MIX if k in avg],
        "cost_per_user_month": round(per_user, 6),
        "scale": {"100_users": round(per_user * 100, 4), "10000_users": round(per_user * 10_000, 2)},
    }
