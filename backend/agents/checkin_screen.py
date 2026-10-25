"""Code screen for check-in text, run before any agent sees it. Plain Python, no LLM.

1. Medical red flags (chest pain, fainting, breathing trouble, palpitations, suspected fracture,
   sharp bone pain, can't bear weight, numbness, head injury, blood, heat illness, pain 7+/10):
   the council never runs, the athlete gets a "see a doctor" message, nudges pause. No diagnosis, ever.
2. Instruction-like sentences aimed at the AI ("ignore your instructions...") are cut, using the
   same signal families as the race Guardian.
3. Mileage requests above the hard limits are noted, so the app can show the checker holding the line.

Negations ("no chest pain", "didn't faint") don't count as red flags.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from agents import guardian

MAX_CHARS = 1200
NEGATION = re.compile(r"\b(no|not|never|without|zero|none|didn'?t|don'?t|doesn'?t|wasn'?t|isn'?t|haven'?t|nothing like)\b", re.I)
LOCATIONS = r"(shin|shins|foot|feet|heel|hip|knee|ankle|tibia|femur|metatarsal|bone|pelvis|groin|achilles)"

# (category, pattern). Each is checked per sentence; a negation in the 4 words before the match cancels it.
RED_FLAGS: list[tuple[str, re.Pattern]] = [
    ("chest", re.compile(r"\bchest\b[^.!?]{0,30}\b(pain|pressure|tight\w*|hurt\w*|ache\w*|squeez\w*)|\b(pain|pressure|tightness)\s+in\s+(my\s+)?chest", re.I)),
    ("breathing", re.compile(r"short(ness)?\s+of\s+breath|can'?t\s+(catch\s+my\s+)?breathe?\b|trouble\s+breathing|struggl\w*\s+to\s+breathe", re.I)),
    ("fainting", re.compile(r"\b(faint(ed|ing)?|pass(ed)?\s+out|black(ed)?\s+out|blackout|collaps\w*)\b", re.I)),
    ("heart", re.compile(r"\b(palpitation\w*|heart\s+(was\s+)?(racing|flutter\w*|skipp\w*|pounding)\s+at\s+rest|irregular\s+heart\w*)", re.I)),
    ("fracture", re.compile(r"\b(stress\s+fracture|fractur\w*|broken\s+(bone|foot|toe|leg))\b", re.I)),
    ("weight_bearing", re.compile(r"can'?t\s+(put|bear)\s+(any\s+)?weight|\bunable\s+to\s+(walk|bear\s+weight)|\blimp(ing)?\b", re.I)),
    ("numbness", re.compile(r"\bnumb(ness)?\b", re.I)),
    ("head_injury", re.compile(r"\b(concussion|hit\s+my\s+head|head\s+injury)\b", re.I)),
    ("blood", re.compile(r"blood\s+in\s+(my\s+)?(urine|pee|stool)|cough\w*\s+(up\s+)?blood|vomit\w*\s+blood|peeing\s+blood", re.I)),
    ("heat_illness", re.compile(r"\bheat\s*stroke\b|\bconfus\w*\s+(after|during)\s+(the\s+|my\s+)?run", re.I)),
    ("severe_pain", re.compile(r"\b([7-9]|10)\s*(/|out\s+of)\s*10\b", re.I)),
]
SHARP = re.compile(r"\b(sharp|stabbing|shooting|searing)\b", re.I)
PAIN = re.compile(r"\bpain\w*|\bhurt\w*", re.I)
LOC = re.compile(rf"\b{LOCATIONS}\b", re.I)
KM_REQUEST = re.compile(r"\b(\d{2,4})\s*(km|k|kilomet\w*)\s*(a|per|/)?\s*week\b|\b(\d{2,4})\s*(km|k)\s+weeks?\b", re.I)
MI_REQUEST = re.compile(r"\b(\d{2,3})\s*(mi|miles?)\s*(a|per|/)?\s*week\b", re.I)

ADVICE = {
    "chest": "Chest pain or pressure needs a doctor today, not a training tweak. If it's happening now or it's severe, call 911.",
    "breathing": "Trouble breathing is a stop sign. Please get checked by a doctor before you run again; call 911 if it's severe.",
    "fainting": "Fainting or blacking out needs a doctor's check before any more running.",
    "heart": "A racing or irregular heartbeat at rest should be checked by a doctor before you train again.",
    "fracture": "A possible fracture needs a doctor or sports physio. Please don't run on it.",
    "weight_bearing": "If it hurts to put weight on it, don't run. Please see a doctor or physio.",
    "numbness": "Numbness should be looked at by a doctor before you keep training.",
    "head_injury": "After a head injury, see a doctor before running again.",
    "blood": "Blood in urine, stool or when you cough needs a doctor, not a training plan.",
    "heat_illness": "Signs of heat illness need medical attention. Rest, cool down and see a doctor.",
    "severe_pain": "Pain that strong is beyond a training plan. Please see a doctor or physio before your next run.",
    "sharp_bone_pain": "Sharp pain in a bone or joint can be a serious injury. Please don't run on it, and see a doctor or physio first.",
}


@dataclass
class Screen:
    text: str                                         # cleaned text that goes on to the agents
    red_flags: list[tuple[str, str]] = field(default_factory=list)   # (category, excerpt)
    removed: list[str] = field(default_factory=list)  # instruction-like sentences that were cut
    km_request: float | None = None                   # weekly km the athlete asked for, if any

    @property
    def stop_message(self) -> str | None:
        if not self.red_flags:
            return None
        cats = list(dict.fromkeys(c for c, _ in self.red_flags))
        lines = [ADVICE[c] for c in cats[:2]]
        return (" ".join(lines) + " PaceLab doesn't diagnose, and your plan is paused (no nudges) until you check in "
                "again after you've been seen.")


def _negated(sentence: str, start: int) -> bool:
    before = sentence[:start].split()[-4:]
    return bool(NEGATION.search(" ".join(before)))


def red_flags(text: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for sentence in re.split(r"(?<=[.!?;])\s+|\n+|,\s+(?=but\b)", text):
        for cat, rx in RED_FLAGS:
            m = rx.search(sentence)
            if m and not _negated(sentence, m.start()):
                found.append((cat, sentence.strip()[:140]))
        s, p, loc = SHARP.search(sentence), PAIN.search(sentence), LOC.search(sentence)
        if s and p and loc and not _negated(sentence, s.start()):
            found.append(("sharp_bone_pain", sentence.strip()[:140]))
    return found


def screen(raw: str) -> Screen:
    report = guardian.clean_untrusted(raw or "", source="check-in", max_chars=MAX_CHARS)
    removed = [r["text"] for r in report.removed if r["why"] not in {"link removed", "email address removed", "phone number removed"}
               and ("injection" in report.flags or "offsite_link" in report.flags)]
    km = None
    for rx, factor in ((KM_REQUEST, 1.0), (MI_REQUEST, 1.609344)):
        for m in rx.finditer(raw or ""):
            val = next(g for g in m.groups() if g and g.isdigit())
            km = max(km or 0, float(val) * factor)
    # Red flags are checked on the raw text too: a symptom inside a cut sentence still counts.
    return Screen(text=report.text, red_flags=red_flags(raw or ""), removed=removed, km_request=km)
