"""PaceLab FastAPI app.

Part 1: data routes (sample data, uploads, dashboard, athlete profile, paces, plan check).
Agent routes (race search, council SSE, check-ins, usage) are added in later parts.

Run from backend/:  uvicorn main:app --port 8000
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from engine.metrics import athlete_profile, build_dashboard, compute_paces
from engine.parsers import MAX_FILE_BYTES, load_folder, parse_files
from engine.wellness import WellnessDay, load_wellness, wellness_from_files
from agents import budget, council, race_scout, usage
from agents.logs import SAFETY_LOG, TRAP_LOG, read_json
from engine.goals import KM as GOAL_KM, goal_distance
from engine.plan_checker import check_plan
from models import (
    CheckInResult, CheckResult, CouncilRequest, Dashboard, PaceTable, Preferences, ParseReport, Plan, PlanView, RaceHit, RaceQuery, RaceSearchResult, Run, ScoutResult,
)
from tools import races as race_tools

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
SAMPLE_DIR = ROOT / "data" / "sample"
DEFAULT_SAMPLE = "athlete_a"

# .env from the repo folder and one folder up (same as the Lecture 7 shell)
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

app = FastAPI(title="PaceLab", version="0.6.0")


@app.middleware("http")
async def persist_sessions(request, call_next):
    """Save the caller's session after anything that can change it."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") and (request.method != "GET" or path == "/api/today") and not path.endswith("/stream"):
        save_session(request.headers.get("x-session", "local"))
    return response
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------- session state
# Local single-user app: state lives in memory, keyed by an optional session header.

class Athlete:
    def __init__(self, runs: list[Run], report: ParseReport, source: str, wellness: list[WellnessDay] | None = None):
        self.runs = sorted(runs, key=lambda r: r.start)
        self.report = report
        self.source = source
        self.wellness = wellness or []
        self.target_race: RaceHit | None = None
        self.plan_view: PlanView | None = None          # last council result (My Plan tab)
        self.council_events: list[dict] = []            # last council run, replayed when the tab reopens
        self.nudge_history: list[str] = []              # recent nudge ids, so lines don't repeat
        self.checkins: list[CheckInResult] = []         # weekly check-ins, newest last
        self.pending: dict[str, Plan] = {}              # check-in id -> proposed plan awaiting accept/reject
        self.extras: dict = {}                          # preferences, last race search, sample id

    def profile(self) -> dict:
        return athlete_profile(self.runs, self.wellness, self.report.strength_dates)

    # -- persistence: the session survives a backend restart (output/_sessions/, git-ignored)
    def to_dict(self) -> dict:
        return {
            "runs": [r.model_dump(mode="json") for r in self.runs], "report": self.report.model_dump(mode="json"),
            "source": self.source, "wellness": [w.model_dump(mode="json") for w in self.wellness],
            "target_race": self.target_race.model_dump(mode="json") if self.target_race else None,
            "plan_view": self.plan_view.model_dump(mode="json") if self.plan_view else None,
            "council_events": self.council_events, "nudge_history": self.nudge_history,
            "checkins": [c.model_dump(mode="json") for c in self.checkins],
            "pending": {k: v.model_dump(mode="json") for k, v in self.pending.items()}, "extras": self.extras,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Athlete":
        a = cls([Run.model_validate(r) for r in d["runs"]], ParseReport.model_validate(d["report"]), d["source"],
                [WellnessDay.model_validate(w) for w in d.get("wellness", [])])
        a.target_race = RaceHit.model_validate(d["target_race"]) if d.get("target_race") else None
        a.plan_view = PlanView.model_validate(d["plan_view"]) if d.get("plan_view") else None
        a.council_events = d.get("council_events", [])
        a.nudge_history = d.get("nudge_history", [])
        a.checkins = [CheckInResult.model_validate(c) for c in d.get("checkins", [])]
        a.pending = {k: Plan.model_validate(v) for k, v in d.get("pending", {}).items()}
        a.extras = d.get("extras", {})
        return a


SESSION_DIR = ROOT / "output" / "_sessions"
SESSION_NAME = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


def _session_file(name: str) -> Path | None:
    return SESSION_DIR / f"{name}.json" if SESSION_NAME.match(name) else None


def save_session(name: str) -> None:
    athlete = dict.get(SESSIONS, name)
    path = _session_file(name)
    if athlete is None or path is None or name.startswith("pytest"):
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(athlete.to_dict(), default=str), encoding="utf-8")
    os.replace(tmp, path)


class SessionStore(dict):
    """In memory, loaded lazily from disk on first use after a restart."""

    def get(self, key, default=None):
        if not dict.__contains__(self, key):
            path = _session_file(key)
            if path and path.exists():
                try:
                    dict.__setitem__(self, key, Athlete.from_dict(json.loads(path.read_text(encoding="utf-8"))))
                except Exception:  # an old or broken file: start fresh rather than fail
                    pass
        return dict.get(self, key, default)


SESSIONS: SessionStore = SessionStore()


def _athlete(session: str) -> Athlete:
    athlete = SESSIONS.get(session)
    if athlete is None:
        raise HTTPException(404, "No data loaded yet. Upload a file or use the sample data first.")
    return athlete


def _store(session: str, runs: list[Run], report: ParseReport, source: str,
           wellness: list[WellnessDay] | None = None) -> Dashboard:
    if not runs:
        detail = "No runs found in that upload."
        if report.warnings:
            detail += " " + " ".join(report.warnings)
        raise HTTPException(422, detail)
    SESSIONS[session] = Athlete(runs, report, source, wellness)
    return build_dashboard(runs, report=report)


# ---------------------------------------------------------------- routes

def _sample_athletes() -> dict[str, dict]:
    """data/sample/<athlete_id>/ folders, with label and goal from athlete.json."""
    out = {}
    for folder in sorted(p for p in SAMPLE_DIR.iterdir() if p.is_dir()):
        meta = {}
        if (folder / "athlete.json").exists():
            meta = json.loads((folder / "athlete.json").read_text(encoding="utf-8"))
        out[folder.name] = {"id": folder.name, "label": meta.get("label", folder.name), "goal": meta.get("goal", "")}
    return out


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "sample_athletes": list(_sample_athletes())}


@app.get("/api/data/samples")
def samples() -> list[dict]:
    return list(_sample_athletes().values())


@app.post("/api/data/sample", response_model=Dashboard)
def use_sample(athlete: str = DEFAULT_SAMPLE, x_session: str = Header("local")) -> Dashboard:
    if athlete not in _sample_athletes():
        raise HTTPException(404, f"No sample athlete '{athlete}'")
    runs, report = load_folder(SAMPLE_DIR / athlete)
    dash = _store(x_session, runs, report, f"sample:{athlete}", load_wellness(SAMPLE_DIR / athlete))
    meta = _sample_athletes()[athlete]
    SESSIONS[x_session].extras.update({"athlete_id": athlete, "label": athlete.replace("_", " ").title(),
                                      "goal": meta.get("goal", ""), "goal_distance": goal_distance(meta.get("goal"))})
    return dash


@app.post("/api/data/upload", response_model=Dashboard)
async def upload(files: list[UploadFile] = File(...), units: str = Form("km"),
                 x_session: str = Header("local")) -> Dashboard:
    if units not in {"km", "mi"}:
        raise HTTPException(422, "units must be km or mi")
    payload = []
    for f in files[:50]:
        raw = await f.read(MAX_FILE_BYTES + 1)
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(413, f"{f.filename} is larger than {MAX_FILE_BYTES // 2**20} MB")
        payload.append((f.filename or "upload", raw))
    runs, report = parse_files(payload, units)
    dash = _store(x_session, runs, report, "upload", wellness_from_files(payload))
    SESSIONS[x_session].extras.update({"athlete_id": "upload", "label": "Your data", "goal": "",
                                      "goal_distance": "Half Marathon"})
    return dash


@app.get("/api/dashboard", response_model=Dashboard)
def dashboard(start: date | None = None, end: date | None = None, x_session: str = Header("local")) -> Dashboard:
    athlete = _athlete(x_session)
    try:
        return build_dashboard(athlete.runs, start, end, athlete.report)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/profile")
def profile(x_session: str = Header("local")) -> dict:
    """The compact JSON the agents get (never raw runs)."""
    return _athlete(x_session).profile()


@app.get("/api/paces", response_model=PaceTable)
def paces(distance: str = "half marathon", goal_time: str | None = None, x_session: str = Header("local")) -> PaceTable:
    try:
        return compute_paces(_athlete(x_session).runs, distance, goal_time)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/plan/check", response_model=CheckResult)
def plan_check(plan: Plan, x_session: str = Header("local")) -> CheckResult:
    athlete = SESSIONS.get(x_session)
    prof = athlete.profile() if athlete else {}
    vol = prof.get("volume_km", {})
    return check_plan(plan, vol.get("avg_week_last_4"), vol.get("peak_week_last_12"))


# ---------------------------------------------------------------- races (Part 3)

@app.post("/api/races/search", response_model=RaceSearchResult)
def races_search(q: RaceQuery) -> RaceSearchResult:
    """Code only, instant: structured race fields, no AI."""
    try:
        result = race_tools.search_races(q, paths=race_tools.race_files(q.safety_demo))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not result.hits:
        wider = q.model_copy(update={"radius_mi": max(q.radius_mi, 150), "weeks": 52, "end": None})
        result.suggestions = race_tools.search_races(wider, paths=race_tools.race_files(q.safety_demo)).hits[:6]
    return result


@app.post("/api/races/scout", response_model=ScoutResult)
async def races_scout(q: RaceQuery, x_session: str = Header("local")) -> ScoutResult:
    """The Race Scout agent writes a note per race (one LLM run, ~2 calls)."""
    athlete = SESSIONS.get(x_session)
    try:
        race_tools.locate_zip(q.zip)
        result = await race_scout.scout(q, athlete.profile() if athlete else None, include_attacks=q.safety_demo)
        if athlete and not q.safety_demo:
            athlete.extras["last_scout"] = {"query": q.model_dump(mode="json"), "result": result.model_dump(mode="json")}
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class SelectRace(BaseModel):
    race_id: str
    miles_away: float = 0.0
    distance_km: float | None = None       # the distance searched for; must be one the race offers


@app.post("/api/races/select")
def races_select(body: SelectRace, x_session: str = Header("local")) -> dict:
    """"Train for this": stores structured fields rebuilt from the race file (never client text or race text)."""
    athlete = _athlete(x_session)
    race = race_tools.get_race(body.race_id, race_tools.race_files(True))
    if not race:
        raise HTTPException(404, "Unknown race")
    fields = race.model_dump(exclude={"description", "lat", "lon", "zip", "source"})
    offered = race.distance_km or [21.1]
    wanted = body.distance_km
    target = next((km for km in offered if wanted and abs(km - wanted) / wanted <= 0.03), max(offered))
    athlete.target_race = RaceHit(**fields, miles_away=round(body.miles_away, 1),
                                  weeks_until=(race.date - date.today()).days // 7, target_km=target)
    return {"selected": athlete.target_race.model_dump(mode="json")}


@app.get("/api/races/selected")
def races_selected(x_session: str = Header("local")) -> dict:
    athlete = SESSIONS.get(x_session)
    return {"selected": athlete.target_race.model_dump(mode="json") if athlete and athlete.target_race else None}


# ---------------------------------------------------------------- usage + safety

@app.get("/api/usage")
def usage_summary() -> dict:
    return usage.summary()


@app.get("/api/safety")
def safety() -> dict:
    events = read_json(SAFETY_LOG)
    return {"events": events[-100:][::-1], "total": len(events), "trap_calls": read_json(TRAP_LOG)}


# ---------------------------------------------------------------- coaching council (Part 4)

VOICES = ROOT / "data" / "agent_voices.json"


@app.get("/api/voices")
def voices() -> Response:
    """Persona pack: scripted lines per agent and event, quotes, banter (shown for free on SSE events)."""
    return Response(VOICES.read_text(encoding="utf-8"), media_type="application/json")


@app.post("/api/council/stream")
async def council_stream(body: CouncilRequest, x_session: str = Header("local")):
    """SSE: every council step as it happens; ends with plan_ready (the full plan) and done."""
    athlete = _athlete(x_session)
    if athlete.target_race is None:
        raise HTTPException(409, "Pick a target race in Race Finder first (Train for this).")
    goal = (body.goal_time or "").strip() or None
    if goal:
        try:
            from engine.metrics import parse_time
            parse_time(goal)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    if athlete.target_race.date <= date.today():
        raise HTTPException(422, "That race is in the past. Pick an upcoming race.")
    race = athlete.target_race
    if body.distance_km:
        offered = race.distance_km or []
        if not any(abs(km - body.distance_km) / body.distance_km <= 0.03 for km in offered):
            raise HTTPException(422, f"{race.name} offers {', '.join(race.distances)}")
        race = race.model_copy(update={"target_km": body.distance_km})

    async def gen():
        athlete.council_events = []
        if body.preferences is not None:
            athlete.extras["preferences"] = body.preferences.model_dump(mode="json")
        async for event in council.council_events(athlete.profile(), athlete.runs, race, goal, body.mode,
                                                  prefs=body.preferences):
            athlete.council_events.append(event)
            if event["type"] == "plan_ready":
                athlete.plan_view = PlanView.model_validate(event["plan_view"])
            if event["type"] == "done":
                save_session(x_session)
            yield f"event: {event['type']}\ndata: {json.dumps(event, default=str, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@app.get("/api/council/last")
def council_last(x_session: str = Header("local")) -> dict:
    athlete = SESSIONS.get(x_session)
    return {"events": athlete.council_events if athlete else []}


@app.get("/api/plan")
def get_plan(x_session: str = Header("local")) -> dict:
    athlete = SESSIONS.get(x_session)
    return {"plan_view": athlete.plan_view.model_dump(mode="json") if athlete and athlete.plan_view else None}


class WorkoutStatus(BaseModel):
    day: date
    type: str
    status: str


@app.post("/api/plan/workout")
def set_workout_status(body: WorkoutStatus, x_session: str = Header("local")) -> dict:
    athlete = _athlete(x_session)
    if not athlete.plan_view:
        raise HTTPException(404, "No plan yet")
    if body.status not in {"planned", "done", "missed"}:
        raise HTTPException(422, "status must be planned, done or missed")
    for w in athlete.plan_view.plan.weeks:
        for wo in w.workouts:
            if wo.day == body.day and wo.type == body.type:
                wo.status = body.status
                return {"ok": True}
    raise HTTPException(404, "No such workout")


@app.get("/api/plan.ics")
def plan_ics(session: str | None = None, x_session: str = Header("local")) -> Response:
    """A plain link can't send headers, so the session can also come as ?session=."""
    from engine.ics import plan_to_ics
    athlete = _athlete(session or x_session)
    if not athlete.plan_view:
        raise HTTPException(404, "No plan yet")
    return Response(plan_to_ics(athlete.plan_view.plan), media_type="text/calendar",
                    headers={"Content-Disposition": 'attachment; filename="pacelab-plan.ics"'})


@app.get("/api/budget")
def get_budget() -> dict:
    return budget.status()


@app.post("/api/budget")
def set_budget(caps: budget.BudgetCaps) -> dict:
    """Demo control: set the caps low, run the council, watch the hard stop."""
    budget.CAPS = caps
    return budget.status()


@app.get("/api/receipts")
def receipts() -> dict:
    """Usage log grouped by run, plus measured cost per user per month."""
    from agents.logs import USAGE_LOG, read_jsonl
    rows = read_jsonl(USAGE_LOG)
    runs: dict[str, dict] = {}
    for r in rows:
        kind = "plan_build" if r["run_id"].startswith("council") else "race_search" if r["run_id"].startswith("scout") else             "check_in" if r["run_id"].startswith("checkin") else "other"
        run = runs.setdefault(r["run_id"], {"run_id": r["run_id"], "type": kind, "time": r["time"], "agents": {},
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
    mix = {"plan_build": 1, "check_in": 4, "race_search": 2}
    per_user = sum(avg.get(k, 0) * n for k, n in mix.items())
    return {
        "runs": sorted(runs.values(), key=lambda r: r["time"], reverse=True)[:50],
        "avg_cost_by_type": avg, "runs_by_type": {k: len(v) for k, v in by_type.items()},
        "monthly_mix": mix, "measured_types": [k for k in mix if k in avg],
        "cost_per_user_month": round(per_user, 6),
        "scale": {"100_users": round(per_user * 100, 4), "10000_users": round(per_user * 10_000, 2)},
    }


# ---------------------------------------------------------------- Today card: streak + nudges (voice pack)

@app.get("/api/today")
def today(scenario: str = "real", slot: str | None = None, x_session: str = Header("local")) -> dict:
    """Plan streak and Duolingo-style nudges, picked by code (zero tokens). scenario simulates a situation for demos."""
    from engine.today import SCENARIOS, today_card
    if scenario not in SCENARIOS:
        raise HTTPException(422, f"scenario must be one of {', '.join(SCENARIOS)}")
    if slot not in (None, "morning", "evening"):
        raise HTTPException(422, "slot must be morning or evening")
    athlete = _athlete(x_session)
    pv = athlete.plan_view
    ctx = {}
    if pv:
        ctx = {"race_name": pv.race.name, "weeks_until": pv.race.weeks_until}
    elif athlete.target_race:
        ctx = {"race_name": athlete.target_race.name, "weeks_until": athlete.target_race.weeks_until}
    done = {wo.day for w in pv.plan.weeks for wo in w.workouts if wo.status == "done"} if pv else set()
    card = today_card(pv.plan if pv else None, {r.start.date() for r in athlete.runs}, scenario, slot, ctx,
                      done=done, history=athlete.nudge_history, flags=_checkin_flags(athlete))
    athlete.nudge_history = card.pop("history")
    return card


# ---------------------------------------------------------------- weekly check-in (Part 5)

CHECKIN_FLAG_DAYS = 10                    # a sick/pain/red-flag check-in pauses nudges for this long (or until the next one)


def _checkin_flags(athlete: Athlete) -> dict:
    """Illness, pain or a red flag in the latest check-in pauses every nudge (no guilt when it matters)."""
    real = [c for c in athlete.checkins if c.status != "refused"]   # a refused message says nothing about health
    if not real:
        return {}
    last = real[-1]
    if (datetime.now() - last.created).days > CHECKIN_FLAG_DAYS:
        return {}
    ci = last.checkin
    return {
        "red_flag": last.status == "red_flag",
        "ill": bool(ci and ci.illness != "none"),
        "pain": bool(ci and (ci.pain_location or (ci.pain_score or 0) >= 3)),
    }


def _default_week(plan: Plan) -> int:
    today = date.today()
    for w in plan.weeks:
        if w.workouts[0].day <= today <= w.workouts[-1].day:
            return w.index
    return plan.weeks[0].index if today < plan.weeks[0].workouts[0].day else plan.weeks[-1].index


@app.get("/api/checkins")
def checkins(x_session: str = Header("local")) -> dict:
    athlete = _athlete(x_session)
    pv = athlete.plan_view
    weeks = [{"index": w.index, "phase": w.phase, "start": w.workouts[0].day.isoformat()} for w in pv.plan.weeks] if pv else []
    return {"history": [c.model_dump(mode="json") for c in reversed(athlete.checkins)], "weeks": weeks,
            "default_week": _default_week(pv.plan) if pv else None, "flags": _checkin_flags(athlete),
            "plan_started": bool(pv and pv.plan.weeks[0].workouts[0].day <= date.today())}


@app.post("/api/checkin", response_model=CheckInResult)
async def checkin(text: str = Form(..., max_length=4000), week: int | None = Form(None),
                  files: list[UploadFile] | None = File(None), x_session: str = Header("local")) -> CheckInResult:
    """Free text (+ optional new upload) -> CheckIn record -> proposed plan changes with a reason each."""
    from agents.checkin import run_checkin
    athlete = _athlete(x_session)
    pv = athlete.plan_view
    if pv is None:
        raise HTTPException(409, "Build a plan in the Coaching Council first.")
    week = week or _default_week(pv.plan)
    if week not in {w.index for w in pv.plan.weeks}:
        raise HTTPException(422, f"The plan has weeks 1 to {len(pv.plan.weeks)}")
    run_dates = None
    if files:
        payload = []
        for f in files[:20]:
            raw = await f.read(MAX_FILE_BYTES + 1)
            if len(raw) > MAX_FILE_BYTES:
                raise HTTPException(413, f"{f.filename} is too large")
            payload.append((f.filename or "upload", raw))
        new_runs, _ = parse_files(payload)
        run_dates = {r.start.date() for r in new_runs}
    prof = athlete.profile()
    vol = prof.get("volume_km", {})
    easy = next((z.label for z in (pv.paces.zones if pv.paces else []) if z.name == "Easy"), "")
    try:
        result, new_plan = await run_checkin(prof, pv.plan, week, text, (vol.get("avg_week_last_4"), vol.get("peak_week_last_12")),
                                             easy, run_dates)
    except budget.BudgetExceeded as exc:
        raise HTTPException(429, f"Budget cap reached ({exc.scope}): ${exc.spent:.4f} of ${exc.cap:.4f}. "
                                 "Raise it on Under the hood to continue.") from exc
    athlete.checkins.append(result)
    if new_plan is not None:
        athlete.pending = {result.id: new_plan}           # only the latest proposal can be accepted
    return result


def _find_checkin(athlete: Athlete, checkin_id: str) -> CheckInResult:
    found = next((c for c in athlete.checkins if c.id == checkin_id), None)
    if found is None:
        raise HTTPException(404, "No such check-in")
    return found


@app.post("/api/checkin/{checkin_id}/accept")
def accept_checkin(checkin_id: str, x_session: str = Header("local")) -> dict:
    athlete = _athlete(x_session)
    ci = _find_checkin(athlete, checkin_id)
    new_plan = athlete.pending.pop(checkin_id, None)
    if new_plan is None or ci.decision != "pending" or athlete.plan_view is None:
        raise HTTPException(409, "This proposal is no longer open (only the latest one can be accepted).")
    vol = athlete.profile().get("volume_km", {})
    check = check_plan(new_plan, vol.get("avg_week_last_4"), vol.get("peak_week_last_12"))
    if not check.passed:                                   # never ship a plan that fails the checker
        raise HTTPException(409, "The proposed plan no longer passes the plan checker.")
    athlete.plan_view = athlete.plan_view.model_copy(update={
        "plan": new_plan, "check": check,
        "changes": athlete.plan_view.changes + [f"Check-in week {ci.week}: {r}" for r in ci.rules_applied]})
    ci.decision = "accepted"
    return {"ok": True, "plan_view": athlete.plan_view.model_dump(mode="json")}


@app.post("/api/checkin/{checkin_id}/reject")
def reject_checkin(checkin_id: str, x_session: str = Header("local")) -> dict:
    athlete = _athlete(x_session)
    ci = _find_checkin(athlete, checkin_id)
    athlete.pending.pop(checkin_id, None)
    if ci.decision == "pending":
        ci.decision = "rejected"
    return {"ok": True}


# ---------------------------------------------------------------- app state for the Council home (restructure)

@app.get("/api/state")
def state(x_session: str = Header("local")) -> dict:
    """One call for the context bar and the stepper: athlete, target, plan, last race search."""
    athlete = SESSIONS.get(x_session)
    if athlete is None:
        return {"athlete": None, "target": None, "plan": None, "last_scout": None, "checkin_flags": {}}
    prof = athlete.profile()
    ex = athlete.extras
    target = athlete.target_race
    predicted = None
    if target:
        from engine.metrics import resolve_distance
        name, _ = resolve_distance(target.target_km or max(target.distance_km or [21.1]))
        predicted = prof.get("race_predictions", {}).get(name)
    pv = athlete.plan_view
    plan = None
    if pv:
        kms = [round(sum(wo.distance_km for wo in w.workouts if wo.type not in {"race", "rest", "strength"}), 1) for w in pv.plan.weeks]
        plan = {"run_id": pv.run_id, "weeks": len(pv.plan.weeks), "start": pv.plan.weeks[0].workouts[0].day.isoformat(),
                "race": pv.race.name, "race_date": pv.race.date.isoformat(), "passed": pv.check.passed}
    return {
        "athlete": {"id": ex.get("athlete_id", "upload"), "label": ex.get("label", "Your data"), "goal": ex.get("goal", ""),
                    "goal_distance": ex.get("goal_distance", "Half Marathon"),
                    "goal_km": GOAL_KM.get(ex.get("goal_distance", "Half Marathon"), 21.1),
                    "runs": len(athlete.runs), "avg_week_km": prof["volume_km"]["avg_week_last_4"],
                    "runs_per_week": prof["frequency"]["runs_per_week_last_4"], "as_of": prof["as_of"],
                    "predictions": prof.get("race_predictions", {})},
        "target": target.model_dump(mode="json") if target else None,
        "predicted_for_target": predicted,
        "plan": plan,
        "last_scout": ex.get("last_scout"),
        "checkin_flags": _checkin_flags(athlete),
    }


@app.get("/api/preferences/defaults")
def preference_defaults(x_session: str = Header("local")) -> dict:
    """Defaults from the athlete's own data (runs per week, usual gym days, long-run limit by race distance)."""
    from engine.plan_expander import plan_window
    from engine.prefs import defaults, reconcile, summary
    athlete = _athlete(x_session)
    prof = athlete.profile()
    target = athlete.target_race
    km = (target.target_km or max(target.distance_km or [21.1])) if target else GOAL_KM.get(athlete.extras.get("goal_distance", ""), 21.1)
    prefs = defaults(prof, km, date.today())
    saved = athlete.extras.get("preferences")
    if saved:
        from models import Preferences
        prefs = Preferences.model_validate(saved)
    prefs, notes = reconcile(prefs, prof)
    start, weeks = plan_window(date.today(), target.date if target else date.today(), None)
    return {"defaults": prefs.model_dump(mode="json"), "notes": notes, "summary": summary(prefs, start),
            "plan_start": start.isoformat(), "runs_per_week_now": prof["frequency"]["runs_per_week_last_4"],
            "load_ratio": prof["load_ratio"]["ratio"]}


@app.post("/api/preferences/check")
def preference_check(prefs: Preferences, x_session: str = Header("local")) -> dict:
    """Live: what safety would change in these preferences, and the summary sentence."""
    from engine.plan_expander import plan_window
    from engine.prefs import plan_start, reconcile, summary
    athlete = _athlete(x_session)
    adjusted, notes = reconcile(prefs, athlete.profile())
    target = athlete.target_race
    start, _ = plan_window(date.today(), target.date if target else date.today(), plan_start(adjusted, date.today()))
    return {"adjusted": adjusted.model_dump(mode="json"), "notes": notes, "summary": summary(adjusted, start),
            "plan_start": start.isoformat()}


@app.get("/api/glossary")
def glossary() -> dict:
    from engine.glossary import GLOSSARY
    return GLOSSARY
