"""The Coaching Council: the Head Coach runs the meeting; four specialists do the work.

Pattern from Lecture 10/11: the boss delegates through tools, and every step lands on an
asyncio.Queue that the SSE route streams to the live dashboard. Cost pattern from Lecture 11:
every agent run is logged with real token counts, and the budget controller can stop the run.

Cost levers built in:
- Code computes, AI explains: agents get the ~1K-token profile, never raw runs (unless mode="full").
- Shared cached prefix: every council member's instructions start with the same voice rules,
  charter and run context, so prompt caching hits from the second call on.
- Structured outputs with length caps; prose only in the Head Coach's message.
- The plan checker and the plan expander are code; revision loops are capped at 2.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, AsyncIterator

from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.usage import UsageLimits

from agents import budget
from agents.config import MODEL_NAME, build_model, settings
from agents.logs import AUDIT_LOG, CURRENT_RUN, append_json
from agents.pricing import cost_usd
from agents.usage import record
from engine.metrics import compute_paces, fmt_pace, resolve_distance
from engine.plan_checker import PREF_RULES, RULES, check_plan
from engine.prefs import plan_start, reconcile, template
from engine.plan_expander import (
    allowed_gym_days, baseline_specs, expand, make_safe, place_strength, plan_window, zone_seconds,
)
from models import (
    AgentReceipt, CheckResult, CoachRuling, PaceTable, PhysioReview, Plan, PlanDraft, PlanView, Preferences, RaceHit,
    Receipt, Run, StrengthPlan, UsageRecord, WeekSpec, WristCard,
)

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"
CACHE_KEY = "pacelab-council"
MAX_BUILDER_CALLS = 3                     # first draft + 2 revisions
LIMITS = {
    "monk": UsageLimits(request_limit=10, tool_calls_limit=12),
    "wallbreaker": UsageLimits(request_limit=3),
    "taper": UsageLimits(request_limit=3),
    "guru": UsageLimits(request_limit=3),
    "kickstarter": UsageLimits(request_limit=3),
}
AGENT_NAME = {"monk": "head_coach", "wallbreaker": "plan_builder", "taper": "physio",
              "guru": "strength", "kickstarter": "race_day"}
PERSONA_FILE = {"monk": "head_coach_monk.md", "wallbreaker": "plan_builder_wallbreaker.md",
                "taper": "physio_taper.md", "guru": "strength_glute_guru.md", "kickstarter": "race_day_kickstarter.md"}
JOB_FILE = {"monk": "head_coach.md", "wallbreaker": "plan_builder.md", "taper": "physio.md",
            "guru": "strength.md", "kickstarter": "race_day.md"}


def _read(rel: str) -> str:
    return (PROMPTS / rel).read_text(encoding="utf-8").strip()


SHARED = _read("personas/_shared_voice_rules.md") + "\n\n" + _read("council_charter.md")


# ---------------------------------------------------------------- run state + events

@dataclass
class CouncilRun:
    run_id: str
    queue: asyncio.Queue
    profile: dict
    runs: list[Run]
    race: RaceHit
    race_km: float
    goal_time: str | None
    mode: str
    paces: PaceTable
    start: date
    n_weeks: int
    prefs: Preferences | None = None
    pref_notes: list[str] = field(default_factory=list)
    context: str = ""
    started: float = field(default_factory=time.perf_counter)
    seq: int = 0
    specs: list[WeekSpec] | None = None
    draft_summary: str = ""
    plan: Plan | None = None
    check: CheckResult | None = None
    builder_calls: int = 0
    reviews: list[tuple[int, PhysioReview]] = field(default_factory=list)   # (draft number, review)
    strength: StrengthPlan | None = None
    wrist: WristCard | None = None
    records: list[UsageRecord] = field(default_factory=list)
    run_spent: float = 0.0
    requests: int = 0
    events: list[dict] = field(default_factory=list)
    said: dict[str, list[str]] = field(default_factory=dict)   # persona -> voice_lines so far this run

    def emit(self, kind: str, persona: str = "monk", **data: Any) -> None:
        if data.get("voice_line"):
            self.said.setdefault(persona, []).append(str(data["voice_line"]))
        self.seq += 1
        event = {"type": kind, "persona": persona, "seq": self.seq,
                 "t_ms": round((time.perf_counter() - self.started) * 1000), **data}
        self.events.append(event)
        self.queue.put_nowait(event)

    @property
    def pace_s(self) -> tuple[float, float]:
        return zone_seconds(self.paces, "Easy"), zone_seconds(self.paces, "Long run")

    def run_check(self, plan: Plan) -> CheckResult:
        """Safety rules, plus the athlete's preferences when they set them."""
        return check_plan(plan, *self.baseline, self.prefs, *self.pace_s)

    @property
    def baseline(self) -> tuple[float | None, float | None]:
        v = self.profile.get("volume_km", {})
        return v.get("avg_week_last_4"), v.get("peak_week_last_12")


def _instructions(persona: str):
    persona_text = _read(f"personas/{PERSONA_FILE[persona]}")
    job = _read(JOB_FILE[persona])

    def build(ctx: RunContext[CouncilRun]) -> str:
        # Shared prefix first (identical for every council member in a run, so it caches), then the role.
        return f"{SHARED}\n\n{ctx.deps.context}\n\n---\n\n{persona_text}\n\n{job}"
    return build


def fresh_voice(run: CouncilRun, persona: str) -> str:
    """A reminder of this agent's earlier lines this run, so each round sounds new."""
    before = run.said.get(persona, [])
    if not before:
        return ""
    lines = "\n".join(f"- {l}" for l in before[-4:])
    return ("\n\nYour earlier voice_lines this run (do NOT repeat them, their wording, or the same numbers):\n"
            f"{lines}\nSay something new: what changed this round, or a different detail from the data.")


async def run_agent(run: CouncilRun, persona: str, agent: Agent, prompt: str) -> Any:
    """Run one council member, streaming its steps and checking the budget after every model reply."""
    prompt = prompt + fresh_voice(run, persona)
    run.emit("agent_started", persona, agent=AGENT_NAME[persona])
    t0 = time.perf_counter()
    usage = None
    try:
        async with agent.iter(prompt, deps=run, usage_limits=LIMITS[persona],
                              model_settings=settings(CACHE_KEY)) as ar:
            async for node in ar:
                if Agent.is_call_tools_node(node):
                    usage = ar.usage() if callable(ar.usage) else ar.usage
                    tools = [p.tool_name for p in node.model_response.parts
                             if isinstance(p, ToolCallPart) and p.tool_name != "final_result"]
                    if tools:
                        run.emit("agent_thinking", persona, tools=tools)
                    in_flight = cost_usd(MODEL_NAME, usage.input_tokens, usage.cache_read_tokens,
                                         usage.cache_write_tokens, usage.output_tokens)
                    budget.check(run.run_spent, in_flight, run.requests + usage.requests)
            usage = ar.usage() if callable(ar.usage) else ar.usage
            output = ar.result.output
    finally:
        if usage is not None:
            rec = record(run.run_id, AGENT_NAME[persona], usage, time.perf_counter() - t0)
            run.records.append(rec)
            run.run_spent += rec.cost_usd
            run.requests += rec.requests
            run.emit("spend", persona, agent=AGENT_NAME[persona], cost_usd=rec.cost_usd,
                     run_total_usd=round(run.run_spent, 6), tokens=rec.input_tokens + rec.output_tokens,
                     cached=rec.cached_input_tokens, calls=rec.requests, seconds=rec.seconds)
    return output


# ---------------------------------------------------------------- shared run context (cached prefix)

def _context(run: CouncilRun, full_runs: list[Run] | None) -> str:
    week_starts = [(run.start + timedelta(weeks=i)).isoformat() for i in range(run.n_weeks)]
    zones = [{"zone": z.name, "pace": z.label, "use": z.purpose} for z in run.paces.zones]
    ctx = {
        "athlete_profile": run.profile,
        "target_race": {
            "name": run.race.name, "date": run.race.date.isoformat(), "weekday": run.race.date.strftime("%A"),
            "distance_km": run.race_km, "distances_offered": run.race.distances, "date_status": run.race.date_status,
            "terrain": run.race.terrain, "city": f"{run.race.city}, {run.race.state}", "weeks_until": run.race.weeks_until,
        },
        "goal_time": run.goal_time or "none given (plan from current fitness)",
        "predicted_time_from_data": run.paces.current_prediction,
        "goal_gap_pct": run.paces.goal_gap_pct,
        "pace_table": {"basis": run.paces.basis, "race_pace": run.paces.race_pace, "zones": zones},
        "plan_window": {"weeks": run.n_weeks, "week_1_starts": week_starts[0], "race_week": run.n_weeks,
                        "week_start_dates": week_starts},
        "plan_checker_rules": RULES + (PREF_RULES if run.prefs else []),
        "preferences": run.prefs.model_dump(mode="json", exclude={"units"}) if run.prefs else "none set",
        "preference_adjustments": run.pref_notes,
        "weekly_template": template(run.prefs) if run.prefs else "default pattern",
    }
    text = "## Run context (facts computed by code; use these numbers)\n```json\n" + json.dumps(ctx, indent=1) + "\n```"
    if full_runs is not None:                 # "Full" mode for the A/B test: raw runs instead of just the summary
        rows = ["date,km,time_s,pace,avg_hr,type"] + [
            f"{r.start.date()},{r.distance_km:.2f},{r.duration_s:.0f},{fmt_pace(r.pace_s_per_km)},{r.avg_hr or ''},{r.workout_type or ''}"
            for r in full_runs]
        text += "\n\n## Raw runs, last 90 days\n```csv\n" + "\n".join(rows) + "\n```"
    return text


def week_table(plan: Plan) -> str:
    lines = ["week | starts | phase | km | long | key sessions"]
    for w in plan.weeks:
        keys = ", ".join(f"{wo.type} {wo.distance_km:g}" for wo in w.workouts
                         if wo.type in {"tempo", "threshold", "interval", "race_pace"})
        race = " + RACE" if any(wo.type == "race" for wo in w.workouts) else ""
        km = sum(wo.distance_km for wo in w.workouts if wo.type not in {"race", "rest", "strength"})
        lines.append(f"{w.index} | {w.workouts[0].day:%b %d} | {w.phase} | {km:g}{race} | {w.long_run_km:g} | {keys or '-'}")
    return "\n".join(lines)


def _check_text(c: CheckResult) -> str:
    if c.passed:
        return "Plan checker: PASS (all hard rules hold)."
    return "Plan checker: FAIL\n" + "\n".join(f"- [{v.rule}] week {v.week}: {v.detail}" for v in c.violations if v.severity == "block")


# ---------------------------------------------------------------- the specialists, as Head Coach tools

async def ask_plan_builder(ctx: RunContext[CouncilRun], note: str) -> str:
    """Sgt. Wall-Breaker drafts (or revises) the weeks; code expands and checks the plan."""
    r = ctx.deps
    if r.builder_calls >= MAX_BUILDER_CALLS:
        return "Revision limit reached (2 revisions). Code will use the safest version of the latest draft."
    r.builder_calls += 1
    revision = r.builder_calls - 1
    r.emit("delegate", "monk", target="wallbreaker", note=note[:200])
    if revision == 0:
        msg = (f"Draft all {r.n_weeks} weeks (week {r.n_weeks} is race week). Head Coach's brief: {note}")
    else:
        last_review = r.reviews[-1][1] if r.reviews else None
        msg = (f"Revision {revision} of {MAX_BUILDER_CALLS - 1}. Your last draft:\n{week_table(r.plan)}\n\n"
               f"{_check_text(r.check)}\n\n"
               f"Dr. Taper: {last_review.decision.upper() if last_review else 'no review'}. "
               f"Fixes: {json.dumps(last_review.fixes if last_review else [])}\n"
               f"Head Coach: {note}\nReturn all {r.n_weeks} weeks again with every fix applied.")
        r.emit("veto_reaction", "wallbreaker", round=revision)
    draft: PlanDraft = await run_agent(r, "wallbreaker", _agent("wallbreaker"), msg)
    r.specs, r.draft_summary = draft.weeks, draft.summary
    r.plan = expand(draft.weeks, r.start, r.race.date, r.race_km, r.race.name, r.paces,
                    r.profile.get("frequency", {}).get("runs_per_week_last_4", 5), r.goal_time, r.prefs)
    r.check = r.run_check(r.plan)
    kms = [sum(wo.distance_km for wo in w.workouts if wo.type not in {"race", "rest", "strength"}) for w in r.plan.weeks]
    r.emit("agent_done", "wallbreaker", voice_line=draft.voice_line, summary=draft.summary, revision=revision,
           table=week_table(r.plan), vars={"peak_km": round(max(kms)), "weekly_km": round(kms[0]), "weeks": r.n_weeks,
                                           "long_run_km": max((w.long_run_km for w in r.plan.weeks), default=0)})
    r.emit("checker_pass" if r.check.passed else "checker_fail", "marshal",
           violations=[v.model_dump() for v in r.check.violations if v.severity == "block"][:8])
    return f"Draft {r.builder_calls} ({draft.summary})\n{week_table(r.plan)}\n\n{_check_text(r.check)}"


async def ask_physio(ctx: RunContext[CouncilRun], note: str) -> str:
    """Dr. Taper reviews the current draft against load and recovery. Approve or veto with fixes."""
    r = ctx.deps
    if r.plan is None:
        return "No draft yet. Call ask_plan_builder first."
    r.emit("delegate", "monk", target="taper", note=note[:200])
    msg = (f"Review draft {r.builder_calls}.\n{week_table(r.plan)}\n\n{_check_text(r.check)}\n\n"
           f"Head Coach: {note}")
    review: PhysioReview = await run_agent(r, "taper", _agent("taper"), msg)
    r.reviews.append((r.builder_calls, review))
    load = r.profile.get("load_ratio", {})
    rec = r.profile.get("recovery") or {}
    hrv_drop = round(rec["hrv_ms_baseline"] - rec["hrv_ms_7d"]) if rec.get("hrv_ms_7d") and rec.get("hrv_ms_baseline") else None
    first_km = sum(wo.distance_km for wo in r.plan.weeks[0].workouts if wo.type not in {"race", "rest", "strength"})
    base = r.baseline[0]
    r.emit("physio_veto" if review.decision == "veto" else "approve", "taper", voice_line=review.voice_line,
           decision=review.decision, triggers=review.triggers, fixes=review.fixes,
           vars={"acr": load.get("ratio"), "hrv_drop": hrv_drop, "week": 1, "proposed_km": round(first_km),
                 "spike_pct": round((first_km / base - 1) * 100) if base else None})
    return review.model_dump_json()


async def ask_strength(ctx: RunContext[CouncilRun], note: str) -> str:
    """The Glute Guru places gym days away from hard runs."""
    r = ctx.deps
    if r.plan is None:
        return "No draft yet. Call ask_plan_builder first."
    r.emit("delegate", "monk", target="guru", note=note[:200])
    phases = sorted({w.phase for w in r.plan.weeks if w.phase != "race"}, key=["base", "build", "peak", "taper"].index)
    allowed = {f"week {w.index}": allowed_gym_days(w) for w in r.plan.weeks[:3]}
    hard = sorted({wo.day.strftime("%a") for w in r.plan.weeks[:3] for wo in w.workouts
                   if wo.type in {"tempo", "threshold", "interval", "race_pace", "long"}},
                  key=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].index)
    msg = (f"Hard days in this plan: {', '.join(hard)}. Gym days allowed by the rule (first weeks): {json.dumps(allowed)}. "
           f"Athlete's usual gym days: {r.profile.get('strength', {}).get('usual_days') or 'none on record'}. "
           f"Phases in the plan: {', '.join(phases)}. Head Coach: {note}")
    plan: StrengthPlan = await run_agent(r, "guru", _agent("guru"), msg)
    r.strength = plan
    r.emit("agent_done", "guru", voice_line=plan.voice_line, days=plan.days, mobility=plan.mobility_note,
           sessions=[s.model_dump() for s in plan.sessions], vars={"gym_days": " and ".join(plan.days)})
    return plan.model_dump_json()


async def ask_race_day(ctx: RunContext[CouncilRun], note: str) -> str:
    """Kickstarter writes the race-day wrist card: pacing splits, fueling, cues."""
    r = ctx.deps
    r.emit("delegate", "monk", target="kickstarter", note=note[:200])
    msg = (f"Wrist card for {r.race.name} ({r.race_km:g} km, {r.race.terrain}, {r.race.date:%a %b %d %Y}). "
           f"Goal: {r.goal_time or 'none'}; predicted from data: {r.paces.current_prediction}; "
           f"race pace in the table: {r.paces.race_pace} for {r.paces.race_time}. Head Coach: {note}")
    card: WristCard = await run_agent(r, "kickstarter", _agent("kickstarter"), msg)
    r.wrist = card
    r.emit("agent_done", "kickstarter", voice_line=card.voice_line, wrist_card=card.model_dump(),
           vars={"goal_time": card.goal_time, "splits_count": len(card.splits), "race_name": r.race.name,
                 "pace_start": card.splits[0].pace if card.splits else None, "gels": len(card.fueling)})
    return card.model_dump_json()


async def check_plan_tool(ctx: RunContext[CouncilRun]) -> str:
    """Run the code plan checker on the current draft."""
    r = ctx.deps
    return _check_text(r.check) if r.check else "No draft yet."


async def get_week_actuals(ctx: RunContext[CouncilRun], week: int) -> str:
    """Planned vs done for one plan week (used in check-ins)."""
    return "This is a new plan: no completed weeks yet."


@lru_cache(maxsize=None)
def _agent(persona: str) -> Agent:
    output = {"monk": CoachRuling, "wallbreaker": PlanDraft, "taper": PhysioReview,
              "guru": StrengthPlan, "kickstarter": WristCard}[persona]
    tools = []
    if persona == "monk":
        from pydantic_ai import Tool
        tools = [ask_plan_builder, ask_physio, ask_strength, ask_race_day,
                 Tool(check_plan_tool, name="check_plan"), get_week_actuals]
    return Agent(build_model(), deps_type=CouncilRun, output_type=output, instructions=_instructions(persona),
                 tools=tools, name=AGENT_NAME[persona])


# ---------------------------------------------------------------- the run

def _receipt(run: CouncilRun, seconds: float) -> Receipt:
    by: dict[str, AgentReceipt] = {}
    for rec in run.records:
        a = by.setdefault(rec.agent, AgentReceipt(agent=rec.agent, calls=0, input_tokens=0, cached_input_tokens=0,
                                                   output_tokens=0, cost_usd=0.0, seconds=0.0))
        a.calls += rec.requests
        a.input_tokens += rec.input_tokens
        a.cached_input_tokens += rec.cached_input_tokens
        a.output_tokens += rec.output_tokens
        a.cost_usd = round(a.cost_usd + rec.cost_usd, 8)
        a.seconds = round(a.seconds + rec.seconds, 2)
    return Receipt(run_id=run.run_id, run_type="plan_build", mode=run.mode, agents=list(by.values()),
                   total_cost_usd=round(sum(r.cost_usd for r in run.records), 8),
                   total_tokens=sum(r.input_tokens + r.output_tokens for r in run.records),
                   what_if_astra_usd=round(sum(r.what_if_astra_usd for r in run.records), 6), seconds=round(seconds, 1))


def _ease_start(plan: Plan, baseline_week: float | None, easy_pace: str) -> list[str]:
    """Dr. Taper's veto stood: ease weeks 1-2 below the recent average and drop week 1's hard sessions."""
    if not baseline_week:
        return []
    changes = []
    for w in plan.weeks[:2]:
        if w.phase == "race":
            continue
        target = 0.85 * baseline_week
        km = sum(wo.distance_km for wo in w.workouts if wo.type not in {"race", "rest", "strength"})
        if km > target:
            f = target / km
            for wo in w.workouts:
                if wo.type not in {"race", "rest", "strength"}:
                    wo.distance_km = round(wo.distance_km * f * 2) / 2
            changes.append(f"Week {w.index}: eased to about {target:.0f} km (Dr. Taper's veto stands)")
    for wo in plan.weeks[0].workouts:
        if wo.type in {"tempo", "threshold", "interval", "race_pace"}:
            wo.type, wo.target_pace, wo.purpose = "easy", easy_pace, "Easy run (recovery first, per Dr. Taper)"
    return changes


async def council_events(profile: dict, runs: list[Run], race: RaceHit, goal_time: str | None,
                         mode: str = "lean", today: date | None = None,
                         prefs: Preferences | None = None) -> AsyncIterator[dict]:
    """Run the council, yielding every event. The last events are plan_ready (with a PlanView) and done."""
    queue: asyncio.Queue = asyncio.Queue()
    today = today or date.today()
    name, race_km = _race_distance(race)
    paces = compute_paces(runs, race_km, goal_time)
    notes: list[str] = []
    if prefs is not None:
        prefs, notes = reconcile(prefs, profile)              # safety wins; the banner says what changed
    start, n_weeks = plan_window(today, race.date, plan_start(prefs, today) if prefs else None)
    run = CouncilRun(run_id=f"council-{uuid.uuid4().hex[:8]}", queue=queue, profile=profile, runs=runs, race=race,
                     race_km=race_km, goal_time=goal_time, mode=mode, paces=paces, start=start, n_weeks=n_weeks,
                     prefs=prefs, pref_notes=notes)
    CURRENT_RUN.set(run.run_id)
    full =[r for r in runs if r.start.date() >= runs[-1].start.date() - timedelta(days=90)] if mode == "full" else None
    run.context = _context(run, full)

    async def work() -> None:
        stopped = None
        try:
            run.emit("run_started", "monk", run_id=run.run_id, mode=mode, vars={
                "athlete": "our runner", "race_name": race.name, "weeks": n_weeks, "race_date": f"{race.date:%b %d}",
                "goal_time": goal_time, "predicted_time": paces.current_prediction, "distance": name})
            budget.check(0.0)
            if goal_time and paces.current_prediction:
                run.emit("goal_check", "monk", vars={"goal_time": goal_time, "predicted_time": paces.current_prediction},
                         gap_pct=paces.goal_gap_pct)
            brief = (f"Build {n_weeks} weeks to {race.name} ({name}) on {race.date:%b %d}. "
                     f"Goal {goal_time or 'not set'}; data predicts {paces.current_prediction}.")
            ruling: CoachRuling | None = await run_agent(run, "monk", _agent("monk"), brief)
        except budget.BudgetExceeded as exc:
            ruling, stopped = None, exc
            run.emit("budget_stop", "marshal", scope=exc.scope, vars={"cost": f"${exc.spent:.4f}", "budget": f"${exc.cap:.4f}"})
        except Exception as exc:  # model or network failure: keep whatever the council finished
            ruling = None
            run.emit("error", "marshal", message=f"{type(exc).__name__}: {str(exc)[:300]}")
        try:
            view = await _assemble(run, ruling, stopped, today)
            if view:
                run.emit("plan_ready", "monk", plan_view=view.model_dump(mode="json"), voice_line=ruling.voice_line if ruling else None,
                         vars={"race_name": race.name, "weeks": n_weeks})
        except Exception as exc:
            run.emit("error", "marshal", message=f"Could not assemble the plan: {type(exc).__name__}: {str(exc)[:300]}")
        finally:
            run.emit("done", "monk", run_id=run.run_id, total_cost_usd=round(run.run_spent, 6))
            queue.put_nowait(None)

    task = asyncio.create_task(work())
    try:
        while (event := await queue.get()) is not None:
            yield event
    finally:
        if not task.done():                       # client hung up mid-run: stop spending tokens
            task.cancel()


def _race_distance(race: RaceHit) -> tuple[str, float]:
    """Race files list every distance offered; train for the one picked, else the longest."""
    km = race.target_km or (max(race.distance_km) if race.distance_km else 21.1)
    return resolve_distance(km)


async def _assemble(run: CouncilRun, ruling: CoachRuling | None, stopped, today: date) -> PlanView | None:
    if run.plan is None and stopped is None:
        # The Head Coach never got a draft: ask the Plan Builder directly so the athlete still gets a plan.
        try:
            await ask_plan_builder(SimpleCtx(run), "Draft a safe plan from the profile.")
        except Exception as exc:  # budget stop or model failure: fall through to the code-built plan
            run.emit("error", "marshal", message=f"Plan Builder unavailable: {type(exc).__name__}")
    changes: list[str] = []
    usable = run.plan is not None and max(
        (sum(wo.distance_km for wo in w.workouts if wo.type not in {"race", "rest", "strength"}) for w in run.plan.weeks),
        default=0) >= 5
    if not usable:
        # No usable draft (budget stop before the first draft, or nonsense output): build a conservative
        # plan in code from the athlete's own averages. The safest version wins.
        longest = max((r["km"] for r in run.profile.get("long_runs_last_12_weeks", [])), default=None)
        specs = baseline_specs(run.n_weeks, run.baseline[0], longest, run.race_km)
        run.plan = expand(specs, run.start, run.race.date, run.race_km, run.race.name, run.paces,
                          run.profile.get("frequency", {}).get("runs_per_week_last_4", 5), run.goal_time, run.prefs)
        run.reviews = []
        changes.append("No usable draft from the council: code built a conservative plan from your recent weeks")
    plan = run.plan
    easy = next((z.label for z in run.paces.zones if z.name == "Easy"), "")
    last = run.reviews[-1] if run.reviews else None
    veto_stands = bool(last and last[1].decision == "veto" and last[0] == run.builder_calls)
    if veto_stands:
        plan = plan.model_copy(deep=True)
        changes += _ease_start(plan, run.baseline[0], easy)
    check = run.run_check(plan)
    safest = veto_stands or not check.passed or not usable
    if not check.passed or veto_stands:
        plan, fixes, check = make_safe(plan, *run.baseline, easy, run.prefs, *run.pace_s)
        changes += fixes
    if safest:  # tell the room what code changed
        run.emit("fix", "taper", changes=changes[:12], passed=check.passed, vars={"cut_km": None})
    plan, gym_notes = place_strength(plan, run.strength, run.profile.get("strength", {}).get("usual_days") or [], run.prefs)
    if run.prefs is not None:                                 # gym placement can't break a preference, but check anyway
        final = run.run_check(plan)
        if not final.passed:
            plan, fixes, final = make_safe(plan, *run.baseline, easy, run.prefs, *run.pace_s)
            changes += fixes
        check = final
    if ruling:
        run.emit("ruling", "monk", ruling=ruling.ruling, goal_note=ruling.goal_note, message=ruling.message,
                 voice_line=ruling.voice_line)
    receipt = _receipt(run, time.perf_counter() - run.started)
    view = PlanView(
        run_id=run.run_id, created=datetime.now(), race=run.race, goal_time=run.goal_time, plan=plan, check=check,
        safest_version_used=safest, draft_summary=run.draft_summary, strength=run.strength, wrist_card=run.wrist,
        ruling=ruling, physio=[r for _, r in run.reviews], receipt=receipt, paces=run.paces,
        changes=changes + gym_notes, stopped_by_budget=stopped is not None,
        preferences=run.prefs, pref_adjustments=run.pref_notes,
        prefs_respected=not any(v.rule.startswith("pref_") for v in check.violations),
    )
    append_json(AUDIT_LOG, {
        "time": datetime.now().isoformat(timespec="seconds"), "run_id": run.run_id, "type": "plan_build",
        "mode": run.mode, "race": run.race.id, "goal_time": run.goal_time, "builder_calls": run.builder_calls,
        "physio": [r.model_dump() for _, r in run.reviews], "checker_passed": check.passed, "safest_version_used": safest,
        "changes": changes, "stopped_by_budget": stopped is not None, "receipt": receipt.model_dump(),
        "events": [{k: v for k, v in e.items() if k not in {"plan_view", "table", "wrist_card"}} for e in run.events],
        # Each agent's full structured output, for the run inspector on Under the hood.
        "outputs": {
            "head_coach": ruling.model_dump() if ruling else None,
            "plan_builder": {"summary": run.draft_summary, "weeks": [s.model_dump() for s in run.specs or []]},
            "physio": [{"draft": n, **r.model_dump()} for n, r in run.reviews],
            "strength": run.strength.model_dump() if run.strength else None,
            "race_day": run.wrist.model_dump() if run.wrist else None,
        },
    })
    return view


@dataclass
class SimpleCtx:
    """Lets code call a Head Coach tool directly (fallback path) with the same deps."""
    deps: CouncilRun
