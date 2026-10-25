"""Export a plan to an .ics calendar (all-day events, one per workout). No LLM."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models import Plan

LABEL = {"easy": "Easy", "recovery": "Recovery", "long": "Long run", "tempo": "Tempo", "threshold": "Threshold",
         "interval": "Intervals", "race_pace": "Race pace", "strides": "Strides", "strength": "Gym",
         "cross": "Cross-training", "race": "RACE"}


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """RFC 5545: lines over 75 octets continue on the next line after a space."""
    out, raw = [], line.encode("utf-8")
    while len(raw) > 75:
        cut = 75
        while (raw[cut] & 0xC0) == 0x80:      # don't split a UTF-8 character
            cut -= 1
        out.append(raw[:cut].decode("utf-8"))
        raw = b" " + raw[cut:]
    out.append(raw.decode("utf-8"))
    return "\r\n".join(out)


def plan_to_ics(plan: Plan) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PaceLab//Training plan//EN", "CALSCALE:GREGORIAN",
             f"X-WR-CALNAME:{_escape('PaceLab: ' + plan.race_name)}"]
    for week in plan.weeks:
        for i, wo in enumerate(week.workouts):
            if wo.type == "rest":
                continue
            title = LABEL.get(wo.type, wo.type.title())
            if wo.distance_km:
                title += f" {wo.distance_km:g} km"
            desc = " · ".join(x for x in (wo.target_pace and f"Pace {wo.target_pace}", wo.purpose,
                                          f"Week {week.index} ({week.phase})") if x)
            lines += [
                "BEGIN:VEVENT",
                f"UID:pacelab-{wo.day:%Y%m%d}-{i}-{wo.type}@pacelab",
                f"DTSTAMP:{stamp}",
                f"DTSTART;VALUE=DATE:{wo.day:%Y%m%d}",
                f"DTEND;VALUE=DATE:{wo.day + timedelta(days=1):%Y%m%d}",
                f"SUMMARY:{_escape(title)}",
                f"DESCRIPTION:{_escape(desc)}",
                "END:VEVENT",
            ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
