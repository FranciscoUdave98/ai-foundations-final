"""Under the hood: summary tiles, run inspector, safety log grouped by run, the safety demo, the A/B table.

Everything here reads the log files; nothing calls a model.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

from agents import guardian
from agents.costs import receipts, run_type
from agents.logs import AUDIT_LOG, OUTPUT_DIR, ROOT, SAFETY_LOG, TRAP_LOG, USAGE_LOG, read_json, read_jsonl

AB_FILE = OUTPUT_DIR / "ab_test.json"
ATTACKS = ROOT / "tests" / "attacks" / "attack_races.csv"

AI_AGENTS = ["Marathon Monk (head coach)", "Sgt. Wall-Breaker (plan builder)", "Dr. Taper (physio)",
             "Kickstarter (race day)", "Glute Guru (strength)", "Course Whisperer (race scout)"]
CODE_PARTS = ["Guardian (cleans race text)", "Course Marshal (plan checker)", "Plan expander + make_safe", "Budget controller"]
CLEANED = {"race_text_cleaned", "user_injection", "agent_text_rejected"}


def summary() -> dict:
    r = receipts()
    events = read_json(SAFETY_LOG)
    plan = r["avg_cost_by_type"].get("plan_build", 0.0)
    return {
        "agents": {"ai": AI_AGENTS, "chat": "Coach chat (the Monk's voice)", "code": CODE_PARTS},
        "cost": {"per_plan_usd": plan, "per_user_month_usd": r["cost_per_user_month"], "users_100_month_usd": r["scale"]["100_users"]},
        "safety": {"cleaned": sum(1 for e in events if e.get("kind") in CLEANED), "trap_calls": len(read_json(TRAP_LOG)),
                   "events": len(events)},
    }


# ---------------------------------------------------------------- run inspector

def _usage_by_run() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in read_jsonl(USAGE_LOG):
        run = out.setdefault(row["run_id"], {"agents": {}, "cost_usd": 0.0, "calls": 0, "tokens": 0, "time": row["time"]})
        a = run["agents"].setdefault(row["agent"], {"calls": 0, "input": 0, "cached": 0, "output": 0, "cost_usd": 0.0, "seconds": 0.0})
        a["calls"] += row["requests"]; a["input"] += row["input_tokens"]; a["cached"] += row["cached_input_tokens"]
        a["output"] += row["output_tokens"]; a["cost_usd"] = round(a["cost_usd"] + row["cost_usd"], 8)
        a["seconds"] = round(a["seconds"] + row.get("seconds", 0), 2)
        run["cost_usd"] = round(run["cost_usd"] + row["cost_usd"], 8)
        run["calls"] += row["requests"]; run["tokens"] += row["input_tokens"] + row["output_tokens"]
    return out


def _outputs(entry: dict) -> dict:
    if "outputs" in entry:
        return entry["outputs"]
    if entry.get("agent") == "race_scout":
        return {"race_scout": entry.get("agent_output_before_screening")}
    if entry.get("type") == "check_in":
        return {"check_in": {k: entry.get(k) for k in ("checkin", "red_flags", "guardian_removed", "rules", "status", "mode")}}
    if entry.get("type") == "plan_build":           # older runs, before outputs were stored
        return {"physio": entry.get("physio"), "note": "Run from before full outputs were logged: only the physio reviews were kept."}
    return {}


def runs(limit: int = 40) -> list[dict]:
    usage = _usage_by_run()
    out = []
    for e in reversed(read_json(AUDIT_LOG)):
        rid = e.get("run_id")
        if not rid or rid not in usage:
            continue
        u = usage[rid]
        out.append({"run_id": rid, "type": run_type(rid), "time": e.get("time"), "mode": e.get("mode"),
                    "cost_usd": u["cost_usd"], "calls": u["calls"], "tokens": u["tokens"]})
        if len(out) >= limit:
            break
    return out


def run_detail(run_id: str) -> dict | None:
    entry = next((e for e in reversed(read_json(AUDIT_LOG)) if e.get("run_id") == run_id), None)
    usage = _usage_by_run().get(run_id)
    if not entry and not usage:
        return None
    entry = entry or {}
    return {"run_id": run_id, "type": run_type(run_id), "time": entry.get("time"), "mode": entry.get("mode"),
            "agents": (usage or {}).get("agents", {}), "cost_usd": (usage or {}).get("cost_usd", 0.0),
            "outputs": _outputs(entry), "checker_passed": entry.get("checker_passed"),
            "receipt": entry.get("receipt")}


# ---------------------------------------------------------------- safety log, grouped by run

def _label(run_id: str | None, source: str) -> str:
    kind = run_type(run_id) if run_id else ""
    names = {"plan_build": "Plan build", "race_search": "Race search", "check_in": "Weekly check-in", "chat": "Coach chat"}
    if kind in names:
        return f"{names[kind]} · {run_id}"
    return "Coach chat" if source == "coach chat" else "Weekly check-in" if source.startswith("check-in") else \
        "Race search" if source.startswith("race") else source


def safety_grouped() -> list[dict]:
    """Newest group first. Events from before run ids were logged are grouped by source within 2 minutes."""
    groups: list[dict] = []
    for e in read_json(SAFETY_LOG):
        rid = e.get("run_id")
        key = rid or _label(None, e.get("source", ""))
        t = datetime.fromisoformat(e["time"])
        last = groups[-1] if groups else None
        if last and last["key"] == key and (rid or (t - last["_t"]).total_seconds() <= 120):
            last["events"].append(e); last["_t"] = t; last["end"] = e["time"]
        else:
            groups.append({"key": key, "label": _label(rid, e.get("source", "")), "run_id": rid, "start": e["time"],
                           "end": e["time"], "events": [e], "_t": t})
    for g in groups:
        g.pop("_t")
        g["count"] = len(g["events"])
    return list(reversed(groups))


def safety_demo(n: int = 0) -> dict:
    """One planted attack listing: the raw text next to what the Guardian lets through. Code only, no model."""
    with ATTACKS.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    row = rows[n % len(rows)]
    allowed = guardian.domain_of(row.get("url"))
    raw, cleaned, flags, removed = [], [], [], []
    # The same pass the race loader runs on every stranger-written field (tools/races.py).
    for field, cap in (("name", 100), ("city", 60), ("description", 600)):
        report = guardian.clean_untrusted(row.get(field, ""), source=f"race {row['id']} {field}", max_chars=cap, allowed_domains=allowed)
        text = f"(hidden: suspicious {field})" if report.blocked else report.text
        raw.append(f"{field}: {row.get(field, '')}")
        cleaned.append(f"{field}: {text}")
        flags += [f for f in report.flags if f not in flags]
        removed += report.removed
    return {"n": n % len(rows), "total": len(rows), "id": row["id"], "name": row["name"], "attack": row.get("attack", ""),
            "raw": "\n".join(raw), "cleaned": "\n".join(cleaned), "flags": flags, "removed": removed}


def ab() -> dict | None:
    if not AB_FILE.exists():
        return None
    return json.loads(AB_FILE.read_text(encoding="utf-8"))
