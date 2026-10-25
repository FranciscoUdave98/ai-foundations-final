"""Race search over data/races.csv (offline copy of RunSignup-style listings). No LLM.

Every text field in the file was written by strangers (race organizers, calendars), so the
loader runs each one through the Guardian once, at load time. Nothing downstream ever sees
the raw text: the Race Scout gets the cleaned description wrapped as data, and the Head
Coach gets the structured fields of RaceHit only.
"""

from __future__ import annotations

import csv
import math
import re
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from agents import guardian
from models import Race, RaceHit, RaceQuery, RaceSearchResult

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RACES_CSV = DATA_DIR / "races.csv"
ZIPS_CSV = DATA_DIR / "us_zips.csv"

MAX_HITS = 40
DISTANCE_KM = {"5K": 5.0, "10K": 10.0, "Half Marathon": 21.1, "Marathon": 42.2}
SAFE_URL = re.compile(r"^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[A-Za-z0-9._~%/+-]*)?(\?[A-Za-z0-9._~%=&+-]*)?$")
RACE_ID = re.compile(r"^[A-Za-z0-9_-]{1,20}$")


# ---------------------------------------------------------------- zip codes

@lru_cache(maxsize=1)
def _zips() -> dict[str, tuple[float, float, str, str]]:
    out = {}
    with ZIPS_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["zip"]] = (float(row["lat"]), float(row["lon"]), row["city"], row["state"])
    return out


def locate_zip(zip_code: str) -> tuple[float, float, str]:
    hit = _zips().get(zip_code)
    if not hit:
        raise ValueError(f"Unknown US zip code {zip_code}")
    lat, lon, city, state = hit
    return lat, lon, f"{city}, {state} {zip_code}"


def miles_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- loading

def _floats(text: str) -> list[float]:
    out = []
    for part in (text or "").split(";"):
        try:
            out.append(float(part.strip()))
        except ValueError:
            continue
    return out


def _clean_field(value: str, race_id: str, field: str, cap: int, allowed: set[str], clean: bool = True) -> tuple[str, list[str]]:
    """Short text fields (name, city) get the same Guardian pass as descriptions."""
    if not clean:
        return (value or "")[:cap], []
    report = guardian.clean_untrusted(value or "", source=f"race {race_id} {field}", max_chars=cap, allowed_domains=allowed)
    if report.blocked:
        return f"(hidden: suspicious {field})", report.flags
    return report.text, report.flags


def load_races(path: Path = RACES_CSV, clean: bool = True) -> list[Race]:
    """clean=False skips the Guardian (code layer off) for the attack suite only."""
    races = []
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rid = (row.get("id") or "").strip()
            if not RACE_ID.match(rid):
                continue
            try:
                when = date.fromisoformat(row["date"].strip())
                lat, lon = float(row["lat"]), float(row["lon"])
            except (KeyError, ValueError):
                continue
            url = (row.get("url") or "").strip()
            url_flags = []
            if url and not SAFE_URL.match(url):
                url_flags.append("url_rejected")
                url = ""
            allowed = guardian.domain_of(url)               # the race's own site may be mentioned
            name, f1 = _clean_field(row.get("name", ""), rid, "name", 100, allowed, clean)
            city, f2 = _clean_field(row.get("city", ""), rid, "city", 60, allowed, clean)
            if clean:
                desc = guardian.clean_untrusted(row.get("description", ""), source=f"race {rid} description",
                                                max_chars=600, allowed_domains=allowed)
            else:
                desc = guardian.CleanReport(text=(row.get("description") or "")[:600])
            flags = url_flags + f1 + f2 + desc.flags
            status = (row.get("date_status") or "confirmed").strip()
            price = _floats(row.get("price_usd", ""))
            races.append(Race(
                id=rid, name=name, date=when,
                date_status=status if status in {"confirmed", "reported", "estimated"} else "estimated",
                city=city, state=(row.get("state") or "")[:2].upper(), zip=(row.get("zip") or "")[:5],
                lat=lat, lon=lon,
                distances=[d.strip()[:12] for d in (row.get("distances") or "").split(";") if d.strip()][:6],
                distance_km=_floats(row.get("distance_km", ""))[:6],
                price_usd=price[0] if price else None,
                terrain=(row.get("terrain") or "road").strip()[:20],
                url=url or None, source=(row.get("source") or "")[:80],
                description=desc.text, guardian_flags=sorted(set(flags)),
            ))
    return races


_cache: dict[tuple[Path, bool], tuple[float, list[Race]]] = {}


def races_from(path: Path = RACES_CSV, clean: bool = True) -> list[Race]:
    """Load once per file version (reloads if the file changes)."""
    mtime = path.stat().st_mtime
    key = (path, clean)
    if key not in _cache or _cache[key][0] != mtime:
        _cache[key] = (mtime, load_races(path, clean))
    return _cache[key][1]


# ---------------------------------------------------------------- search

def _matches(race: Race, distance: str) -> bool:
    if distance == "any":
        return True
    if distance == "other":
        return any(all(abs(km - d) / d > 0.03 for d in DISTANCE_KM.values()) for km in race.distance_km)
    target = DISTANCE_KM[distance]
    return any(abs(km - target) / target <= 0.03 for km in race.distance_km)


ATTACK_CSV = DATA_DIR.parent / "tests" / "attacks" / "attack_races.csv"


def race_files(include_attacks: bool = False) -> list[Path]:
    """The real race file, plus the planted attack races for the safety demo when asked."""
    return [RACES_CSV, ATTACK_CSV] if include_attacks else [RACES_CSV]


def all_races(paths: list[Path], clean: bool = True) -> list[Race]:
    return [r for p in paths for r in races_from(p, clean)]


def search_races(q: RaceQuery, today: date | None = None, paths: list[Path] | None = None,
                 clean: bool = True) -> RaceSearchResult:
    today = today or date.today()
    start = max(q.start or today, today)
    end = q.end or start + timedelta(weeks=q.weeks)
    lat, lon, origin = locate_zip(q.zip)
    races = all_races(paths or race_files(), clean)
    hits = []
    for r in races:
        if not (start <= r.date <= end) or not _matches(r, q.distance):
            continue
        miles = miles_between(lat, lon, r.lat, r.lon)
        if miles > q.radius_mi:
            continue
        hits.append(RaceHit(
            id=r.id, name=r.name, date=r.date, date_status=r.date_status, city=r.city, state=r.state,
            distances=r.distances, distance_km=r.distance_km, price_usd=r.price_usd, terrain=r.terrain,
            url=r.url, miles_away=round(miles, 1), weeks_until=(r.date - today).days // 7,
            guardian_flags=r.guardian_flags,
        ))
    hits.sort(key=lambda h: (h.date, h.miles_away))
    return RaceSearchResult(query=q, origin=origin, start=start, end=end, hits=hits[:MAX_HITS], searched=len(races))


def get_race(race_id: str, paths: list[Path] | None = None, clean: bool = True) -> Race | None:
    return next((r for r in all_races(paths or race_files(), clean) if r.id == race_id), None)
