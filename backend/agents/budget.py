"""Budget controller (code, not an agent): USD caps per run, per session and per day.

Checked before a run starts and after every model response. When a cap is hit the run stops
with a friendly message and keeps whatever it already finished (overshoot is at most one call).
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from agents.logs import USAGE_LOG, read_jsonl
from agents.usage import STARTED


class BudgetCaps(BaseModel):
    per_run_usd: float = Field(0.05, gt=0, le=5)        # a full council run costs about $0.01
    per_session_usd: float = Field(0.50, gt=0, le=20)   # since the backend started
    per_day_usd: float = Field(2.00, gt=0, le=50)
    max_requests_per_run: int = Field(40, ge=1, le=200)


CAPS = BudgetCaps()


class BudgetExceeded(Exception):
    def __init__(self, scope: str, spent: float, cap: float):
        self.scope, self.spent, self.cap = scope, spent, cap
        super().__init__(f"{scope} budget cap reached: ${spent:.4f} of ${cap:.4f}")


def spent_so_far() -> tuple[float, float]:
    """(this session, today) from the usage log."""
    rows = read_jsonl(USAGE_LOG)
    session = sum(r["cost_usd"] for r in rows if datetime.fromisoformat(r["time"]) >= STARTED)
    today = sum(r["cost_usd"] for r in rows if datetime.fromisoformat(r["time"]).date() == date.today())
    return session, today


def check(run_spent: float, in_flight: float = 0.0, requests: int = 0) -> None:
    """Raise BudgetExceeded if any cap is reached. in_flight = cost of a call not yet logged."""
    session, today = spent_so_far()
    if run_spent + in_flight >= CAPS.per_run_usd:
        raise BudgetExceeded("run", run_spent + in_flight, CAPS.per_run_usd)
    if session + in_flight >= CAPS.per_session_usd:
        raise BudgetExceeded("session", session + in_flight, CAPS.per_session_usd)
    if today + in_flight >= CAPS.per_day_usd:
        raise BudgetExceeded("day", today + in_flight, CAPS.per_day_usd)
    if requests > CAPS.max_requests_per_run:
        raise BudgetExceeded("request", requests, CAPS.max_requests_per_run)


def status() -> dict:
    session, today = spent_so_far()
    return {"caps": CAPS.model_dump(), "spent": {"session_usd": round(session, 6), "today_usd": round(today, 6)}}
