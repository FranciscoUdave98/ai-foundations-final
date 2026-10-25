"""Turn running exports into a clean list of Run records. No LLM involved.

Supported inputs:
- Strava bulk export: the .zip (uses activities.csv, else the .fit/.gpx files inside)
  or activities.csv on its own
- Garmin Connect: Activities.csv export, or single .fit files
- Any .gpx file
"""

from __future__ import annotations

import csv
import gzip
import io
import zipfile
from datetime import datetime
from pathlib import Path

from models import ParseReport, Run

MAX_FILE_BYTES = 200 * 1024 * 1024          # one upload, uncompressed
MAX_FILES_IN_ZIP = 5000
MI_TO_KM = 1.609344

STRAVA_DATE_FORMATS = ("%b %d, %Y, %I:%M:%S %p", "%b %d, %Y, %H:%M:%S", "%Y-%m-%d %H:%M:%S")
STRAVA_WORKOUT_TYPES = {"1": "race", "2": "long", "3": "workout"}   # Strava run workout_type codes
GARMIN_DATE_FORMATS = ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%m/%d/%Y %H:%M", "%m/%d/%Y")


# ---------------------------------------------------------------- helpers

def _is_strength(activity_type: str) -> bool:
    t = (activity_type or "").lower()
    return any(k in t for k in ("weight", "strength", "crossfit", "gym"))


def _is_run(activity_type: str) -> bool:
    t = (activity_type or "").lower()
    return "run" in t and "rowing" not in t


def _num(value: str | None) -> float | None:
    """'1,234.5' -> 1234.5; '--', '' and junk -> None."""
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text in {"--", "-", "nan", "None"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _duration(value: str | None) -> float | None:
    """'01:02:03', '45:12.3', '3723' -> seconds."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "--":
        return None
    if ":" not in text:
        return _num(text)
    parts = text.split(":")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return None
    seconds = 0.0
    for n in nums:
        seconds = seconds * 60 + n
    return seconds


def _date(value: str, formats: tuple[str, ...]) -> datetime | None:
    text = (value or "").strip()
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _cadence(value: float | None) -> float | None:
    """Some sources report one foot (~85); normalize to steps per minute (~170)."""
    if value is None or value <= 0:
        return None
    return value * 2 if value < 120 else value


def _valid(run: Run) -> bool:
    if run.distance_km < 0.3 or run.distance_km > 330:
        return False
    pace = run.pace_s_per_km
    return 120 <= pace <= 1200                # 2:00/km to 20:00/km


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


# ---------------------------------------------------------------- CSV formats

def _rows_with_dupe_headers(text: str) -> tuple[list[str], list[list[str]]]:
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return [], []
    return [h.strip() for h in rows[0]], rows[1:]


def _col(header: list[str], name: str, last: bool = False) -> int | None:
    idx = [i for i, h in enumerate(header) if h.lower() == name.lower()]
    if not idx:
        return None
    return idx[-1] if last else idx[0]


def parse_strava_csv(text: str, report: ParseReport) -> list[Run]:
    """Strava's activities.csv repeats some headers: the first 'Distance' is in the
    athlete's display units, a later 'Distance' is in meters. Prefer meters."""
    header, rows = _rows_with_dupe_headers(text)
    c_date = _col(header, "Activity Date")
    c_type = _col(header, "Activity Type")
    dist_cols = [i for i, h in enumerate(header) if h.lower() == "distance"]
    c_moving = _col(header, "Moving Time", last=True)
    c_elapsed = _col(header, "Elapsed Time")
    c_avg_hr = _col(header, "Average Heart Rate", last=True)
    c_max_hr = _col(header, "Max Heart Rate", last=True)
    c_cad = _col(header, "Average Cadence", last=True)
    c_elev = _col(header, "Elevation Gain", last=True)
    c_wtype = _col(header, "Workout Type", last=True)
    c_cal = _col(header, "Calories", last=True)
    if c_date is None or not dist_cols:
        report.warnings.append("activities.csv is missing Activity Date or Distance columns")
        return []

    runs: list[Run] = []
    for row in rows:
        get = lambda i: row[i] if i is not None and i < len(row) else None  # noqa: E731
        if c_type is not None and not _is_run(get(c_type) or ""):
            report.skipped_non_runs += 1
            if _is_strength(get(c_type) or ""):
                when = _date(get(c_date) or "", STRAVA_DATE_FORMATS)
                if when:
                    report.strength_dates.append(when.date())
            continue
        start = _date(get(c_date) or "", STRAVA_DATE_FORMATS)
        if len(dist_cols) >= 2 and _num(get(dist_cols[-1])):
            km = _num(get(dist_cols[-1])) / 1000
        else:
            km = _num(get(dist_cols[0])) or 0.0
            if km > 500:                      # single column but clearly meters
                km /= 1000
        secs = _duration(get(c_moving)) or _duration(get(c_elapsed))
        if start is None or not km or not secs:
            report.skipped_bad_rows += 1
            continue
        run = Run(
            start=start, distance_km=round(km, 3), duration_s=secs,
            avg_hr=_num(get(c_avg_hr)), max_hr=_num(get(c_max_hr)),
            cadence_spm=_cadence(_num(get(c_cad))), elevation_gain_m=_num(get(c_elev)),
            calories=_num(get(c_cal)), activity_type=get(c_type) or "Run", source="strava_csv",
            workout_type=STRAVA_WORKOUT_TYPES.get((get(c_wtype) or "").strip().split(".")[0]),
        )
        if _valid(run):
            runs.append(run)
        else:
            report.skipped_bad_rows += 1
    return runs


def parse_garmin_csv(text: str, report: ParseReport, units: str = "km") -> list[Run]:
    """Garmin Connect 'Activities.csv'. Distance follows the account's unit setting."""
    reader = csv.DictReader(io.StringIO(text))
    factor = MI_TO_KM if units == "mi" else 1.0
    runs: list[Run] = []
    for row in reader:
        row = {(k or "").strip(): v for k, v in row.items()}
        if not _is_run(row.get("Activity Type", "")):
            report.skipped_non_runs += 1
            if _is_strength(row.get("Activity Type", "")):
                when = _date(row.get("Date", ""), GARMIN_DATE_FORMATS)
                if when:
                    report.strength_dates.append(when.date())
            continue
        start = _date(row.get("Date", ""), GARMIN_DATE_FORMATS)
        km = (_num(row.get("Distance")) or 0.0) * factor
        secs = _duration(row.get("Moving Time")) or _duration(row.get("Time")) or _duration(row.get("Elapsed Time"))
        if start is None or not km or not secs:
            report.skipped_bad_rows += 1
            continue
        ascent = _num(row.get("Total Ascent"))
        run = Run(
            start=start, distance_km=round(km, 3), duration_s=secs,
            avg_hr=_num(row.get("Avg HR")), max_hr=_num(row.get("Max HR")),
            cadence_spm=_cadence(_num(row.get("Avg Run Cadence"))),
            elevation_gain_m=ascent * 0.3048 if ascent and units == "mi" else ascent,
            calories=_num(row.get("Calories")),
            activity_type=row.get("Activity Type", "Running"), source="garmin_csv",
        )
        if _valid(run):
            runs.append(run)
        else:
            report.skipped_bad_rows += 1
    return runs


# ---------------------------------------------------------------- FIT and GPX

def parse_fit(raw: bytes, report: ParseReport) -> list[Run]:
    from fitparse import FitFile

    try:
        fit = FitFile(io.BytesIO(raw))
        sessions = list(fit.get_messages("session"))
    except Exception as exc:  # fitparse raises many error types on bad files
        report.warnings.append(f"Could not read a .fit file ({type(exc).__name__})")
        report.skipped_bad_rows += 1
        return []
    runs = []
    for msg in sessions:
        v = msg.get_values()
        sport = str(v.get("sport") or "")
        if not _is_run(sport):
            report.skipped_non_runs += 1
            continue
        start = v.get("start_time")
        meters = v.get("total_distance")
        secs = v.get("total_timer_time") or v.get("total_elapsed_time")
        if not (start and meters and secs):
            report.skipped_bad_rows += 1
            continue
        cad = v.get("avg_running_cadence") or v.get("avg_cadence")
        run = Run(
            start=start, distance_km=round(meters / 1000, 3), duration_s=float(secs),
            avg_hr=v.get("avg_heart_rate"), max_hr=v.get("max_heart_rate"),
            cadence_spm=_cadence(float(cad) if cad else None),
            elevation_gain_m=v.get("total_ascent"), calories=v.get("total_calories"),
            activity_type="Run", source="fit",
        )
        if _valid(run):
            runs.append(run)
        else:
            report.skipped_bad_rows += 1
    return runs


def parse_gpx(text: str, report: ParseReport) -> list[Run]:
    import gpxpy

    try:
        gpx = gpxpy.parse(text)
    except Exception as exc:
        report.warnings.append(f"Could not read a .gpx file ({type(exc).__name__})")
        report.skipped_bad_rows += 1
        return []
    runs = []
    for track in gpx.tracks:
        if track.type and not _is_run(track.type):
            report.skipped_non_runs += 1
            continue
        meters = track.length_3d() or track.length_2d()
        moving = track.get_moving_data()
        secs = (moving.moving_time if moving and moving.moving_time else None) or track.get_duration()
        bounds = track.get_time_bounds()
        hrs = []
        for seg in track.segments:
            for pt in seg.points:
                for ext in pt.extensions:
                    for el in ext.iter():
                        if el.tag.lower().endswith("hr") and el.text and el.text.strip().isdigit():
                            hrs.append(int(el.text))
        up, _down = track.get_uphill_downhill()
        if not (bounds.start_time and meters and secs):
            report.skipped_bad_rows += 1
            continue
        run = Run(
            start=bounds.start_time.replace(tzinfo=None), distance_km=round(meters / 1000, 3),
            duration_s=float(secs), avg_hr=round(sum(hrs) / len(hrs), 1) if hrs else None,
            max_hr=float(max(hrs)) if hrs else None, elevation_gain_m=round(up, 1) if up else None,
            activity_type="Run", source="gpx",
        )
        if _valid(run):
            runs.append(run)
        else:
            report.skipped_bad_rows += 1
    return runs


# ---------------------------------------------------------------- dispatch

def _parse_csv(text: str, report: ParseReport, units: str) -> list[Run]:
    first_line = text.splitlines()[0] if text else ""
    if first_line.startswith("date,") and "resting_hr" in first_line:
        return []                              # Garmin-style daily wellness file, not activities
    if "Activity Date" in first_line:
        return parse_strava_csv(text, report)
    if "Activity Type" in first_line and "Date" in first_line:
        return parse_garmin_csv(text, report, units)
    report.warnings.append("CSV not recognized as a Strava or Garmin export")
    return []


def parse_bytes(name: str, raw: bytes, report: ParseReport, units: str = "km") -> list[Run]:
    """Parse one uploaded file by its extension. Zips recurse one level."""
    lower = name.lower()
    if len(raw) > MAX_FILE_BYTES:
        report.warnings.append(f"{Path(name).name}: file too large, skipped")
        return []
    if lower.endswith(".gz"):
        try:
            raw = gzip.decompress(raw)
        except OSError:
            report.warnings.append(f"{Path(name).name}: bad .gz file")
            return []
        lower = lower[:-3]
    report.files_read += 1
    if lower.endswith(".zip"):
        return _parse_zip(raw, report, units)
    if lower.endswith(".csv"):
        return _parse_csv(_decode(raw), report, units)
    if lower.endswith(".fit"):
        return parse_fit(raw, report)
    if lower.endswith(".gpx"):
        return parse_gpx(_decode(raw), report)
    report.files_read -= 1
    return []


def _parse_zip(raw: bytes, report: ParseReport, units: str) -> list[Run]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        report.warnings.append("Upload is not a valid .zip")
        return []
    names = [n for n in zf.namelist() if not n.endswith("/")][:MAX_FILES_IN_ZIP]
    csv_name = next((n for n in names if Path(n).name.lower() == "activities.csv"), None)
    if csv_name:                               # Strava export: the CSV has everything we need
        info = zf.getinfo(csv_name)
        if info.file_size > MAX_FILE_BYTES:
            report.warnings.append("activities.csv too large")
            return []
        report.files_read += 1
        return _parse_csv(_decode(zf.read(csv_name)), report, units)
    runs: list[Run] = []
    for n in names:
        if n.lower().endswith((".fit", ".gpx", ".fit.gz", ".gpx.gz", ".csv")):
            info = zf.getinfo(n)
            if info.file_size > MAX_FILE_BYTES:
                continue
            runs.extend(parse_bytes(n, zf.read(n), report, units))
    return runs


def dedupe(runs: list[Run], report: ParseReport) -> list[Run]:
    """Same run uploaded twice (e.g. Strava + Garmin): same start minute and ~same distance."""
    runs = sorted(runs, key=lambda r: r.start)
    out: list[Run] = []
    for r in runs:
        if out and abs((r.start - out[-1].start).total_seconds()) < 300 and abs(r.distance_km - out[-1].distance_km) < 0.3:
            report.duplicates_removed += 1
            continue
        out.append(r)
    return out


def parse_files(files: list[tuple[str, bytes]], units: str = "km") -> tuple[list[Run], ParseReport]:
    report = ParseReport()
    runs: list[Run] = []
    for name, raw in files:
        runs.extend(parse_bytes(name, raw, report, units))
    runs = dedupe(runs, report)
    report.runs_found = len(runs)
    report.strength_dates = sorted(set(report.strength_dates))
    return runs, report


def load_folder(folder: Path, units: str = "km") -> tuple[list[Run], ParseReport]:
    files = [(p.name, p.read_bytes()) for p in sorted(folder.iterdir())
             if p.is_file() and p.suffix.lower() in {".csv", ".zip", ".fit", ".gpx", ".gz"}]
    return parse_files(files, units)
