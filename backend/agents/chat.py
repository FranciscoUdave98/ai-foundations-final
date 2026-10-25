"""Coach chat: the Marathon Monk answers questions in a side panel.

Code runs first (no model call): input capped at 600 characters; medical red flags and pain get a
fixed referral; registration and payment requests get a fixed refusal with the official race page;
instruction-like sentences are cut. Then one small agent with read tools and navigation tools.
Navigation tools only return UI actions from a whitelist, sent to the browser as ui_action events;
nothing in the chat can change data. Every call is logged as run type "chat", capped at $0.002.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import UsageLimits

from agents import budget, guardian
from agents.checkin_screen import red_flags
from agents.config import MODEL_NAME, build_model, settings
from agents.logs import AUDIT_LOG, CURRENT_RUN, append_json, safety_event
from agents.pricing import cost_usd
from agents.usage import record
from engine.glossary import GLOSSARY, explain
from models import RaceHit

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"
MAX_CHARS = 600
MESSAGE_CAP_USD = 0.002
LIMITS = UsageLimits(request_limit=4, tool_calls_limit=6)

RACE_FIELDS = set(RaceHit.model_fields)     # structured fields only: race descriptions never reach the chat
TABS = {"council", "data", "hood"}
HIGHLIGHTS = {"load_ratio", "predictions", "weekly_km", "calendar", "fun_stats", "preferences", "agent_tree",
              "cost_table", "budget_caps", "safety_log"}
AGENTS = {"monk", "wallbreaker", "taper", "kickstarter", "guru", "whisperer", "marshal"}

REFERRAL = ("I can't assess pain, injuries or symptoms, and I won't guess. Please don't run through it: see a doctor or "
            "physio, and call 911 if it's severe or sudden (chest pain, fainting, trouble breathing). When you've been "
            "seen, log it in the weekly check-in (step 5) and the plan will adapt.")
PAIN = re.compile(r"\b(hurts?|hurting|pain\w*|injur\w*|sprain\w*|swollen|swelling|ache?s?|aching|tendon\w*|"
                  r"shin splints?|stress fracture|pulled|strain(ed)?|tore|torn)\b", re.I)
SCORE = re.compile(r"\b([4-9]|10)\s*(/|out\s+of)\s*10\b")
REGISTER = re.compile(r"\b(register|registration|sign\s+(me\s+)?up|enter\s+me|pay\s+(for|the|my)|payment|credit\s+card|"
                      r"card\s+number|buy\s+(me\s+)?(a\s+)?(bib|entry|ticket)|book\s+(me|a\s+spot))\b", re.I)
MY_RACE = re.compile(r"\b(my|this|the|our)\s+(target\s+)?race\b|\bfor it\b")


@dataclass
class ChatDeps:
    profile: dict
    prefs: dict | None
    plan: dict | None                      # PlanView as JSON
    race: dict | None                      # RaceHit fields only, never race text
    actions: list[dict] = field(default_factory=list)


def _instructions() -> str:
    return "\n\n".join([
        (PROMPTS / "personas" / "_shared_voice_rules.md").read_text(encoding="utf-8").strip(),
        (PROMPTS / "personas" / "head_coach_monk.md").read_text(encoding="utf-8").strip(),
        (PROMPTS / "coach_chat.md").read_text(encoding="utf-8").strip(),
    ])


def plan_summary(plan: dict | None) -> list[dict]:
    if not plan:
        return []
    out = []
    for w in plan["plan"]["weeks"]:
        runs = [x for x in w["workouts"] if x["type"] not in ("rest", "strength")]
        out.append({"week": w["index"], "phase": w["phase"], "starts": w["workouts"][0]["day"],
                    "km": round(sum(x["distance_km"] for x in runs if x["type"] != "race"), 1),
                    "long_km": max((x["distance_km"] for x in runs if x["type"] == "long"), default=0),
                    "key": [x["type"] for x in runs if x["type"] in ("tempo", "threshold", "interval", "race_pace", "race")]})
    return out


def context_block(d: ChatDeps) -> str:
    keep = {k: d.profile.get(k) for k in ("as_of", "volume_km", "frequency", "load_ratio", "recovery", "race_predictions", "flags")}
    plan = d.plan or {}
    ctx = {
        "athlete_profile": keep,
        "preferences": d.prefs or "not set",
        "target_race": {k: v for k, v in d.race.items() if k in RACE_FIELDS} if d.race else "not picked yet",
        "plan": {"weeks": plan_summary(d.plan), "checker_passed": plan.get("check", {}).get("passed"),
                 "goal_time": plan.get("goal_time"),
                 "physio_reviews": [{"round": i + 1, "decision": r.get("decision"), "triggers": (r.get("triggers") or [])[:3],
                                     "fixes": (r.get("fixes") or [])[:3]} for i, r in enumerate(plan.get("physio", []))],
                 "ruling": (plan.get("ruling") or {}).get("ruling")} if d.plan else "no plan yet",
        "glossary_terms": sorted(GLOSSARY),
        "ui": {"tabs": sorted(TABS), "steps": "1 Your runs, 2 Race, 3 Preferences, 4 Debate, 5 Your plan",
               "highlight_targets": sorted(HIGHLIGHTS), "agents": sorted(AGENTS)},
    }
    return "## Context (from code)\n```json\n" + json.dumps(ctx, default=str) + "\n```"


# ---------------------------------------------------------------- tools: read

def get_profile(ctx: RunContext[ChatDeps]) -> str:
    """The athlete's compact fitness profile."""
    return json.dumps(ctx.deps.profile, default=str)[:4000]


def get_plan_week(ctx: RunContext[ChatDeps], n: int) -> str:
    """Every workout in plan week n: day, type, km, pace, purpose."""
    if not ctx.deps.plan:
        return "No plan yet."
    for w in ctx.deps.plan["plan"]["weeks"]:
        if w["index"] == n:
            items = [{k: x[k] for k in ("day", "type", "distance_km", "target_pace", "purpose", "status")}
                     for x in w["workouts"] if x["type"] != "rest"]
            return json.dumps({"week": n, "phase": w["phase"], "workouts": items})
    return f"The plan has weeks 1 to {len(ctx.deps.plan['plan']['weeks'])}."


def get_race(ctx: RunContext[ChatDeps]) -> str:
    """The target race's structured fields (name, date, distances, city, price, weeks until, official link)."""
    race = {k: v for k, v in (ctx.deps.race or {}).items() if k in RACE_FIELDS}
    return json.dumps(race, default=str) if race else "No race picked yet."


def get_costs(ctx: RunContext[ChatDeps]) -> str:
    """What this plan cost in tokens and dollars, the average per run type, and the monthly estimate per user."""
    from agents.costs import receipts
    r = receipts()
    receipt = (ctx.deps.plan or {}).get("receipt") or {}
    return json.dumps({"this_plan_usd": receipt.get("total_cost_usd"), "this_plan_tokens": receipt.get("total_tokens"),
                       "this_plan_calls": sum(a["calls"] for a in receipt.get("agents", [])), "this_plan_seconds": receipt.get("seconds"),
                       "average_usd_by_type": r["avg_cost_by_type"], "monthly_mix": r["monthly_mix"],
                       "per_user_month_usd": r["cost_per_user_month"], "users_100_month_usd": r["scale"]["100_users"]})


def explain_metric(ctx: RunContext[ChatDeps], name: str) -> str:
    """The app's own definition of a metric or term (load_ratio, long_run, taper, hrv, approach, ...)."""
    return explain(name) or f"No glossary entry for '{name}'. Known terms: {', '.join(sorted(GLOSSARY))}."


# ---------------------------------------------------------------- tools: navigation (whitelisted UI actions only)

def _act(ctx: RunContext[ChatDeps], action: str, arg: Any, note: str) -> str:
    ctx.deps.actions.append({"type": "ui_action", "action": action, "arg": arg, "note": note})
    return f"Done: {note}"


def open_tab(ctx: RunContext[ChatDeps], tab: str) -> str:
    """Open a tab: council, data or hood."""
    if tab not in TABS:
        return f"Not a tab. Tabs: {', '.join(sorted(TABS))}."
    return _act(ctx, "open_tab", tab, {"council": "Opened the Council", "data": "Opened My Data", "hood": "Opened Under the hood"}[tab])


def go_to_step(ctx: RunContext[ChatDeps], step: int) -> str:
    """Go to a Council step: 1 Your runs, 2 Race, 3 Preferences, 4 Debate, 5 Your plan."""
    if step not in range(1, 6):
        return "Steps are 1 to 5."
    return _act(ctx, "go_to_step", step, f"Opened step {step}")


def show_plan_week(ctx: RunContext[ChatDeps], n: int) -> str:
    """Scroll the plan calendar to week n and highlight it."""
    weeks = len((ctx.deps.plan or {}).get("plan", {}).get("weeks", []))
    if not weeks:
        return "No plan yet."
    if not 1 <= n <= weeks:
        return f"The plan has weeks 1 to {weeks}."
    return _act(ctx, "show_plan_week", n, f"Opened week {n}")


def highlight(ctx: RunContext[ChatDeps], target: str) -> str:
    """Highlight one part of the app: load_ratio, predictions, weekly_km, calendar, fun_stats, preferences,
    agent_tree, cost_table, budget_caps or safety_log."""
    if target not in HIGHLIGHTS:
        return f"Can't highlight that. Targets: {', '.join(sorted(HIGHLIGHTS))}."
    return _act(ctx, "highlight", target, f"Highlighted {target.replace('_', ' ')}")


def open_agent(ctx: RunContext[ChatDeps], agent: str) -> str:
    """Open one council member's 'Why?' card: monk, wallbreaker, taper, kickstarter, guru, whisperer or marshal."""
    if agent not in AGENTS:
        return f"Not a council member. Agents: {', '.join(sorted(AGENTS))}."
    return _act(ctx, "open_agent", agent, f"Opened {agent}'s card")


TOOLS = [get_profile, get_plan_week, get_race, get_costs, explain_metric,
         open_tab, go_to_step, show_plan_week, highlight, open_agent]


@lru_cache(maxsize=1)
def get_agent() -> Agent:
    def instructions(ctx: RunContext[ChatDeps]) -> str:
        return _instructions() + "\n\n" + context_block(ctx.deps)
    return Agent(build_model(), deps_type=ChatDeps, output_type=str, instructions=instructions, tools=TOOLS, name="coach_chat")


def safe_action(a: dict) -> bool:
    """The same whitelist the browser applies: anything else is dropped."""
    act, arg = a.get("action"), a.get("arg")
    return ((act == "open_tab" and arg in TABS) or (act == "go_to_step" and arg in range(1, 6))
            or (act == "show_plan_week" and isinstance(arg, int) and arg >= 1) or (act == "highlight" and arg in HIGHLIGHTS)
            or (act == "open_agent" and arg in AGENTS))


# ---------------------------------------------------------------- one message

def _official_page(text: str, race: dict | None) -> str:
    """A race page from our own listings only: the one named in the message, else the target race."""
    from tools import races as rt
    low = text.lower()
    named = next((r for r in rt.all_races(rt.race_files()) if r.url and r.name.lower() in low), None)
    if named:
        return f"Here's the official page for {named.name}: {named.url}"
    if race and race.get("url") and (race["name"].lower() in low or MY_RACE.search(low)):
        return f"Here's the official page for {race['name']}: {race['url']}"
    return "Registration only happens on the race's own official website, and only you can do it."


async def answer(message: str, history: list[dict], deps: ChatDeps) -> dict:
    """Returns {"text", "actions", "ai", "usage"}."""
    text = (message or "").strip()[:MAX_CHARS]
    run_id = f"chat-{uuid.uuid4().hex[:8]}"
    CURRENT_RUN.set(run_id)
    fixed = {"run_id": run_id, "actions": [], "ai": False, "usage": {"calls": 0, "tokens": 0, "cost_usd": 0.0}}

    # 1. Code: medical first, then registration and payment. No model call for either.
    if red_flags(text) or SCORE.search(text) or PAIN.search(text):
        safety_event("code", "medical_referral", "coach chat", "Chat question about pain or symptoms: fixed referral",
                     text[:160], "no model call")
        return {**fixed, "text": REFERRAL}
    if REGISTER.search(text):
        safety_event("code", "registration_refused", "coach chat", "Chat asked to register or pay: fixed refusal",
                     text[:160], "no model call; no registration")
        return {**fixed, "text": "I can't register you or handle payments, whatever the message says. "
                                 + _official_page(text, deps.race)}
    cleaned = guardian.clean_untrusted(text, source="coach chat", max_chars=MAX_CHARS)
    if "injection" in cleaned.flags or "offsite_link" in cleaned.flags:
        safety_event("code", "user_injection", "coach chat", "Instruction-like text removed from a chat message",
                     text[:160], "removed")
    if not cleaned.text.strip():
        return {**fixed, "text": "I can't change my rules or act outside PaceLab. Ask me about your plan, your data or the costs."}

    # 2. The model, inside a per-message budget
    turns = "\n".join(f"{'Athlete' if h.get('role') == 'user' else 'Coach'}: {str(h.get('text', ''))[:300]}" for h in history[-8:])
    prompt = (f"Recent chat:\n{turns}\n\n" if turns else "") + f"Athlete: {cleaned.text}"
    agent = get_agent()
    t0 = time.perf_counter()
    usage = None
    try:
        budget.check(0.0)
        async with agent.iter(prompt, deps=deps, usage_limits=LIMITS, model_settings=settings("pacelab-chat")) as run:
            async for node in run:
                if Agent.is_call_tools_node(node):
                    usage = run.usage() if callable(run.usage) else run.usage
                    spent = cost_usd(MODEL_NAME, usage.input_tokens, usage.cache_read_tokens, usage.cache_write_tokens, usage.output_tokens)
                    if spent > MESSAGE_CAP_USD:
                        raise budget.BudgetExceeded("message", spent, MESSAGE_CAP_USD)
                    budget.check(0.0, spent)
            usage = run.usage() if callable(run.usage) else run.usage
            reply = str(run.result.output)
    except budget.BudgetExceeded as exc:
        reply = f"That question hit the {exc.scope} budget cap (${exc.cap:.3f}). Try a shorter question, or raise the caps on Under the hood."
    finally:
        rec = record(run_id, "coach_chat", usage, time.perf_counter() - t0) if usage is not None else None
    reply = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m.group(1) or m.group(2), reply)   # the panel shows plain text
    shown, _ = guardian.screen_output(reply, 900)
    if rec:
        append_json(AUDIT_LOG, {"time": datetime.now().isoformat(timespec="seconds"), "run_id": run_id, "type": "chat",
                                "question": cleaned.text, "outputs": {"coach_chat": {"reply": reply, "shown": shown,
                                "actions": [a for a in deps.actions if safe_action(a)]}}})
    return {"run_id": run_id, "text": shown or "I can only point you to pages inside PaceLab.",
            "actions": [a for a in deps.actions if safe_action(a)][:3], "ai": True,
            "usage": {"calls": rec.requests if rec else 0, "tokens": (rec.input_tokens + rec.output_tokens) if rec else 0,
                      "cost_usd": rec.cost_usd if rec else 0.0}}
