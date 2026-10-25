"""The athlete's goal distance, for defaults (race search, preferences). No LLM."""

from __future__ import annotations

import re

KEYWORDS = [("Half Marathon", r"\bhalf"), ("Marathon", r"\bmarathon\b"), ("10K", r"\b10\s?k\b"), ("5K", r"\b5\s?k\b")]
KM = {"5K": 5.0, "10K": 10.0, "Half Marathon": 21.1, "Marathon": 42.2}


def goal_distance(goal_text: str | None, fallback: str = "Half Marathon") -> str:
    """First distance named in the goal text ("Sub-3:00 marathon (BQ); sub-1:30 half" -> Marathon)."""
    text = (goal_text or "").lower()
    hits = [(m.start(), name) for name, rx in KEYWORDS for m in [re.search(rx, text)] if m]
    return min(hits)[1] if hits else fallback
