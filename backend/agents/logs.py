"""Log files: usage (tokens + dollars), safety log, trap calls, audit trail.

Every write is atomic (write a temp file, then os.replace), so a crash can never leave
half a JSON file behind.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "output"
LOGS_DIR = ROOT / "logs"

USAGE_LOG = LOGS_DIR / "usage.jsonl"
SAFETY_LOG = OUTPUT_DIR / "safety_log.json"
TRAP_LOG = OUTPUT_DIR / "trap_calls.json"
AUDIT_LOG = OUTPUT_DIR / "audit_trail.json"

_lock = threading.Lock()


def append_json(path: Path, entry: dict) -> None:
    """Append one entry to a JSON list file."""
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        entries = read_json(path)
        entries.append(entry)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(entries, indent=2, default=str), encoding="utf-8")
        os.replace(tmp, path)


def read_json(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def append_jsonl(path: Path, entry: dict) -> None:
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def safety_event(layer: str, kind: str, source: str, detail: str, excerpt: str = "", action: str = "") -> dict:
    """Record a defense doing its job. layer: code | design | prompt | output."""
    entry = {
        "time": datetime.now().isoformat(timespec="seconds"),
        "layer": layer,
        "kind": kind,
        "source": source,
        "detail": detail,
        "excerpt": excerpt[:200],
        "action": action,
    }
    append_json(SAFETY_LOG, entry)
    return entry
