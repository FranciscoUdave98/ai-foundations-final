"""Weekly check-in: free text in, a proposed plan change out (the athlete accepts or rejects it).

Flow (cheapest path first):
  code    screen the text: medical red flags stop here (0 AI calls); instruction-like sentences are cut
  AI #1   the Head Coach turns the text into a CheckIn record (and catches red flags code missed)
  code    adapt the plan with a reason per change; the plan checker has the last word
  light   nothing moved past a threshold: stop here (1 call total, cost lever #4)
  AI #2   Dr. Taper reviews the changes (a veto makes next week easy and 10% lighter)
  AI #3   the Head Coach explains the proposal in character
"""

from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic_ai import Agent
from pydantic_ai.usage import UsageLimits

from agents import budget, guardian
from agents.checkin_screen import screen
from agents.config import build_model, settings
from agents.logs import AUDIT_LOG, CURRENT_RUN, append_json, safety_event
from agents.usage import record
from engine.adapt import DAYS, Adaptation, adapt, is_light
from models import (
    AgentReceipt, CheckIn, CheckInIntake, CheckInMessage, CheckInResult, PhysioReview, Plan, Receipt, UsageRecord,
)

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"
LIMITS = UsageLimits(request_limit=2)
SICK = re.compile(r"\b(sick|ill|illness|flu|a cold|fever|covid|virus|stomach bug)\b", re.I)
NOT_SICK = re.compile(r"\b(not|no longer|wasn'?t|never)\s+(sick|ill)\b|\bsick of\b", re.I)
REFUSAL = ("I can't change PaceLab's rules or safety limits, and nobody can talk the plan past them. "
           "Tell me how your week went (sessions done or missed, sleep, how you feel) and I'll adapt the plan inside them.")


def _read(rel: str) -> str:
    return (PROMPTS / rel).read_text(encoding="utf-8").strip()


@lru_cache(maxsize=None)
def _agent(kind: str) -> Agent:
    persona, job, out, name = {
        "intake": ("head_coach_monk.md", "checkin_intake.md", CheckInIntake, "checkin_intake"),
        "physio": ("physio_taper.md", "checkin_physio.md", PhysioReview, "physio"),
        "coach": ("head_coach_monk.md", "checkin_coach.md", CheckInMessage, "head_coach"),
    }[kind]
    instructions = "\n\n".join([_read("personas/_shared_voice_rules.md"), _read(f"personas/{persona}"), _read(job)])
    return Agent(build_model(), output_type=out, instructions=instructions, name=name)


class Run:
    def __init__(self) -> None:
        self.id = f"checkin-{uuid.uuid4().hex[:8]}"
        self.records: list[UsageRecord] = []
        self.started = time.perf_counter()

    @property
    def spent(self) -> float:
        return sum(r.cost_usd for r in self.records)

    async def call(self, kind: str, prompt: str) -> Any:
        budget.check(self.spent)
        agent = _agent(kind)
        t0 = time.perf_counter()
        result = await agent.run(prompt, usage_limits=LIMITS, model_settings=settings(f"pacelab-checkin-{kind}"))
        self.records.append(record(self.id, agent.name, result.usage, time.perf_counter() - t0))
        return result.output

    def receipt(self) -> Receipt | None:
        if not self.records:
            return None
        by: dict[str, AgentReceipt] = {}
        for r in self.records:
            a = by.setdefault(r.agent, AgentReceipt(agent=r.agent, calls=0, input_tokens=0, cached_input_tokens=0,
                                                     output_tokens=0, cost_usd=0.0, seconds=0.0))
            a.calls += r.requests
            a.input_tokens += r.input_tokens
            a.cached_input_tokens += r.cached_input_tokens
            a.output_tokens += r.output_tokens
            a.cost_usd = round(a.cost_usd + r.cost_usd, 8)
            a.seconds = round(a.seconds + r.seconds, 2)
        return Receipt(run_id=self.id, run_type="check_in", mode="lean", agents=list(by.values()),
                       total_cost_usd=round(self.spent, 8), total_tokens=sum(r.input_tokens + r.output_tokens for r in self.records),
                       what_if_astra_usd=round(sum(r.what_if_astra_usd for r in self.records), 6),
                       seconds=round(time.perf_counter() - self.started, 1))


def _week_table(plan: Plan, weeks: list[int]) -> str:
    lines = []
    for w in plan.weeks:
        if w.index in weeks:
            items = ", ".join(f"{DAYS[wo.day.weekday()]} {wo.type}{f' {wo.distance_km:g} km' if wo.distance_km else ''}"
                              for wo in w.workouts if wo.type != "rest")
            lines.append(f"Week {w.index} ({w.phase}, from {w.workouts[0].day:%b %d}): {items}")
    return "\n".join(lines)


def _diff_text(a: Adaptation) -> str:
    rows = [f"- {r.day:%a %b %d} (week {r.week}): {r.before} -> {r.after}  [{r.reason}]" for r in a.diff]
    km = "; ".join(f"week {w.week}: {w.km_before:g} -> {w.km_after:g} km" for w in a.weeks)
    return ("\n".join(rows) or "- no changes") + f"\nWeekly km: {km}"


def _profile_bits(profile: dict) -> str:
    keep = {k: profile.get(k) for k in ("volume_km", "load_ratio", "recovery", "flags", "race_predictions")}
    return json.dumps(keep)


def _merge_actuals(ci: CheckIn, plan: Plan, week: int, run_dates: set | None) -> CheckIn:
    """With a new upload, the data decides which planned run days were done."""
    if not run_dates:
        return ci
    w = next(x for x in plan.weeks if x.index == week)
    planned = [wo for wo in w.workouts if wo.type not in {"rest", "strength", "race"}]
    missed = {DAYS[wo.day.weekday()] for wo in planned if wo.day not in run_dates}
    return ci.model_copy(update={"missed_days": sorted(set(ci.missed_days) | missed, key=DAYS.index),
                                 "completed_all": not missed and ci.completed_all})


async def run_checkin(profile: dict, plan: Plan, week: int, raw_text: str, baseline: tuple[float | None, float | None],
                      easy_pace: str, run_dates: set | None = None) -> tuple[CheckInResult, Plan | None]:
    run = Run()
    CURRENT_RUN.set(run.id)
    s = screen(raw_text)
    base = dict(id=run.id, created=datetime.now(), week=week, text=s.text or "")

    def done(result: CheckInResult, new_plan: Plan | None) -> tuple[CheckInResult, Plan | None]:
        result.usage = run.receipt()
        append_json(AUDIT_LOG, {"time": datetime.now().isoformat(timespec="seconds"), "run_id": run.id, "type": "check_in",
                                "week": week, "status": result.status, "mode": result.mode,
                                "checkin": result.checkin.model_dump() if result.checkin else None,
                                "red_flags": result.red_flags, "guardian_removed": result.guardian_removed,
                                "rules": result.rules_applied, "diff_rows": len(result.diff),
                                "physio": result.physio.decision if result.physio else None,
                                "usage": result.usage.model_dump() if result.usage else None})
        return result, new_plan

    # 1. Code: red flags never reach the council
    if s.red_flags:
        for cat, excerpt in s.red_flags:
            safety_event("code", "medical_red_flag", f"check-in week {week}", f"Red flag ({cat}): council not run",
                         excerpt, "see-a-doctor message; nudges paused")
        return done(CheckInResult(**base, status="red_flag", mode="none", red_flags=[c for c, _ in s.red_flags],
                                  stop_message=s.stop_message, decision="n/a"), None)

    if s.removed:
        safety_event("code", "user_injection", f"check-in week {week}", "Instruction-like text removed from a check-in",
                     " | ".join(s.removed), "removed; the plan checker enforces limits regardless")
    held = []
    if s.km_request:
        from engine import plan_checker as pc
        cap = pc.peak_cap(baseline[1]) if baseline[1] else pc.MAX_WEEK_KM
        if s.km_request > cap:
            held.append(f"You asked for {s.km_request:g} km a week. The ceiling for you is {cap:.0f} km (1.5x your recent "
                        f"peak), and {pc.MAX_WEEK_KM:g} km is the hard limit for anyone. The plan stays inside it.")
            safety_event("code", "limit_request", f"check-in week {week}", f"Asked for {s.km_request:g} km/week (cap {cap:.0f})",
                         raw_text[:120], "plan checker holds the limit")
    if not s.text.strip():
        return done(CheckInResult(**base, status="refused", mode="none", stop_message=REFUSAL, guardian_removed=s.removed,
                                  checker_held=held, decision="n/a"), None)

    # 2. AI #1: text -> CheckIn record
    wrapped = guardian.wrap_untrusted("checkin", s.text).replace("race_text", "athlete_checkin")
    intake: CheckInIntake = await run.call("intake", f"Plan for week {week}:\n{_week_table(plan, [week])}\n\n{wrapped}")
    ci = _merge_actuals(intake.checkin, plan, week, run_dates)
    if ci.illness == "none" and SICK.search(s.text) and not NOT_SICK.search(s.text):
        ci = ci.model_copy(update={"illness": "recovering"})   # code backstop: they said they were ill
    if ci.red_flag_symptoms or (ci.pain_score or 0) >= 7:
        flags = ci.red_flag_symptoms or [f"pain {ci.pain_score}/10"]
        safety_event("prompt", "medical_red_flag", f"check-in week {week}", f"Head Coach flagged: {', '.join(flags)}",
                     s.text[:160], "see-a-doctor message; nudges paused")
        msg = ("That sounds like something a doctor or physio should look at before you run again. PaceLab doesn't diagnose, "
               "and your plan is paused (no nudges) until you check in after you've been seen. If it's severe or happening now, call 911.")
        return done(CheckInResult(**base, status="red_flag", mode="light", checkin=ci, red_flags=flags, stop_message=msg,
                                  decision="n/a"), None)

    # 3. Code: adapt with reasons; the checker has the last word
    a = adapt(plan, week, ci, baseline[0], baseline[1], easy_pace)
    a.checker_held = held + a.checker_held
    reply, voice = guardian.screen_output(intake.reply, 260)[0], guardian.screen_output(intake.voice_line, 160)[0]
    result = CheckInResult(**base, status="proposal" if a.changed else "no_change", mode="light", checkin=ci,
                           guardian_removed=s.removed, reply=reply, reply_voice=voice, rules_applied=a.rules,
                           diff=a.diff, weeks=a.weeks, checker_held=a.checker_held, check=a.check,
                           decision="pending" if a.changed else "n/a")
    if is_light(ci, plan, week):
        return done(result, a.plan if a.changed else None)

    # 4. Full: AI #2 Dr. Taper reviews, AI #3 the Head Coach explains
    result.mode = "full"
    review: PhysioReview = await run.call("physio", (
        f"Check-in record: {ci.model_dump_json()}\n\nChanges code made:\n{_diff_text(a)}\n\n"
        f"Plan checker: {'PASS' if a.check.passed else 'FAIL'}. Held: {a.checker_held or 'nothing'}\n\n"
        f"Athlete profile: {_profile_bits(profile)}"))
    if review.decision == "veto":
        a = adapt(plan, week, ci, baseline[0], baseline[1], easy_pace, extra_caution=True)
        a.checker_held = held + a.checker_held
    msg: CheckInMessage = await run.call("coach", (
        f"Check-in record: {ci.model_dump_json()}\n\nProposed changes:\n{_diff_text(a)}\n\n"
        f"Rules applied: {a.rules}\nDr. Taper: {review.decision}; {review.triggers}\nPlan checker held: {a.checker_held or 'nothing'}"))
    result.physio = review
    result.reply = guardian.screen_output(msg.message, 720)[0] or reply
    result.reply_voice = guardian.screen_output(msg.voice_line, 160)[0] or voice
    result.rules_applied, result.diff, result.weeks = a.rules, a.diff, a.weeks
    result.checker_held, result.check = a.checker_held, a.check
    result.status = "proposal" if a.changed else "no_change"
    result.decision = "pending" if a.changed else "n/a"
    return done(result, a.plan if a.changed else None)
