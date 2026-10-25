"""Pick today's streak nudge from the plan and the logged runs. Plain code, zero tokens.

    from nudge_engine import NudgeEngine
    eng = NudgeEngine("nudges.json", "agent_voices.json")
    notes = eng.nudges(today, "morning", plan, run_dates, ctx={"athlete": "Alex", "race_name": "...", "weeks_until": 23})
    # -> [{"trigger": "missed_1", "persona": "wallbreaker", "title": "🪖 Sgt. Wall-Breaker", "text": "..."}, ...]

plan: {date: {"type": "easy|recovery|long|tempo|intervals|strength|rest", "km": 8, "pace": "5:40", "workout": "8 km easy"}}
run_dates: set of dates with any logged run. strength_dates (optional): dates with a logged strength session.
flags (optional): {"ill": bool, "pain": bool, "red_flag": bool} from the latest check-in.
The first nudge in the list is the one to show as the notification; the rest can go in an inbox.
"""
from __future__ import annotations

import json
import random
import re
from datetime import date, timedelta

RUN = {"easy", "recovery", "long", "tempo", "intervals"}
HARD = {"tempo", "intervals"}


class NudgeEngine:
    def __init__(self, nudges_path="nudges.json", voices_path="agent_voices.json", seed=None, history=None):
        self.bank = json.load(open(nudges_path, encoding="utf-8"))
        voices = json.load(open(voices_path, encoding="utf-8"))
        self.quotes = {q["id"]: q["text"] for q in voices["quotes"]}
        self.personas = {p["id"]: p for p in voices["personas"]}
        self.rng = random.Random(seed)
        self.history = list(history or [])  # recent nudge ids, newest last (persist per user)

    # ---------------------------------------------------------------- plan state
    @staticmethod
    def kept(day, plan, run_dates):
        t = plan.get(day, {}).get("type", "rest")
        return day in run_dates if t in RUN else True  # rest and strength days keep the streak

    def streak(self, upto, plan, run_dates):
        n, d = 0, upto
        while (d in plan or d in run_dates) and self.kept(d, plan, run_dates):
            n, d = n + 1, d - timedelta(days=1)
        return n

    @staticmethod
    def missed_in_a_row(upto, plan, run_dates):
        """Planned run days missed back from `upto`, stopping at the last run."""
        n, d = 0, upto
        while d in plan or d in run_dates:
            if d in run_dates:
                break
            if plan.get(d, {}).get("type") in RUN:
                n += 1
            d -= timedelta(days=1)
        return n

    @staticmethod
    def next_day_of(kinds, after, plan):
        for i in range(1, 15):
            d = after + timedelta(days=i)
            if plan.get(d, {}).get("type") in kinds:
                return d.strftime("%A")
        return None

    # ---------------------------------------------------------------- triggers
    def triggers(self, today, slot, plan, run_dates, strength_dates=None, flags=None):
        flags = flags or {}
        if flags.get("ill") or flags.get("pain") or flags.get("red_flag"):
            return [("paused", {})]
        y, out = today - timedelta(days=1), []
        t_today = plan.get(today, {}).get("type", "rest")
        past_runs = [d for d in run_dates if d < today]
        days = (today - max(past_runs)).days if past_runs else None

        if slot == "morning":
            missed = self.missed_in_a_row(y, plan, run_dates)
            y_type = plan.get(y, {}).get("type")
            if missed and days and days >= 15:
                out.append(("gone_quiet", {"days": days}))
            elif missed and days and days >= 8:
                out.append(("missed_week", {"days": days}))
            elif missed:
                before = self.streak(y - timedelta(days=1), plan, run_dates)
                if missed == 1 and before >= 7:
                    out.append(("streak_lost", {"lost_streak": before}))
                elif missed == 1 and y_type == "long":
                    out.append(("missed_long_run", {"day": self.next_day_of({"long"}, y + timedelta(days=1), plan)}))
                elif missed == 1 and y_type in HARD:
                    out.append(("missed_workout", {"day": self.next_day_of(HARD, y + timedelta(days=1), plan)}))
                else:
                    out.append(({1: "missed_1", 2: "missed_2"}.get(missed, "missed_3"), {}))
            else:
                s = self.streak(y, plan, run_dates)
                gap = self.missed_in_a_row(y - timedelta(days=1), plan, run_dates)
                if y in run_dates and gap >= 2:
                    prev = [d for d in run_dates if d < y]
                    out.append(("comeback", {"days": (y - max(prev)).days - 1 if prev else None}))
                elif s in self.bank["milestones"]:
                    out.append(("streak_milestone", {"streak": s}))
                elif y_type in (None, "rest") and s:
                    out.append(("rest_day_kept", {"streak": s}))
            kind = {"recovery": "easy"}.get(t_today, t_today)
            out.append((f"morning_{kind}", {}))
        else:  # evening
            if t_today in RUN and today not in run_dates:
                s = self.streak(y, plan, run_dates)
                if s >= 3:
                    out.append(("streak_at_risk", {"streak": s}))
                else:
                    out.append(("evening_long" if t_today == "long" else
                                "evening_workout" if t_today in HARD else "evening_easy", {}))
            elif t_today == "strength" and strength_dates is not None and today not in strength_dates:
                out.append(("evening_strength", {}))
            elif t_today == "rest" and today in run_dates:
                out.append(("evening_rest_broken", {}))
        return out

    # ---------------------------------------------------------------- rendering
    def _fill(self, text, ctx):
        def sub(m):
            key = m.group(1)
            if key.startswith("quote:"):
                return f"“{self.quotes[key[6:]]}”"
            val = ctx.get(key)
            if val in (None, ""):
                raise KeyError(key)
            return str(val)
        try:
            return re.sub(r"\{([^}]+)\}", sub, text)
        except KeyError:
            return None

    def render(self, trigger, ctx):
        lines = self.bank["nudges"][trigger]
        last_persona = None
        for nid in reversed(self.history):
            last_persona = next((l["persona"] for t in self.bank["nudges"].values() for l in t if l["id"] == nid), None)
            break
        options = []
        for line in lines:
            text = self._fill(line["text"], ctx)
            if text:
                options.append((line, text))
        if not options:
            return None
        fresh = [o for o in options if o[0]["id"] not in self.history[-10:]] or options
        varied = [o for o in fresh if o[0]["persona"] != last_persona] or fresh
        line, text = self.rng.choice(varied)
        self.history.append(line["id"])
        p = self.personas[line["persona"]]
        return {"trigger": trigger, "id": line["id"], "persona": p["id"],
                "title": f"{p['emoji']} {p['name']}", "text": text}

    def nudges(self, today, slot, plan, run_dates, ctx=None, strength_dates=None, flags=None):
        base = dict(ctx or {})
        p = plan.get(today, {})
        long_day = next((plan[d] for d in sorted(plan) if d >= today and plan[d].get("type") == "long"), {})
        base.setdefault("workout", p.get("workout"))
        base.setdefault("km", p.get("km"))
        base.setdefault("pace", p.get("pace"))
        base.setdefault("long_km", p.get("km") if p.get("type") == "long" else long_day.get("km"))
        out = []
        for trig, extra in self.triggers(today, slot, plan, run_dates, strength_dates, flags):
            n = self.render(trig, {**base, **{k: v for k, v in extra.items() if v is not None}})
            if n:
                out.append(n)
        return out
