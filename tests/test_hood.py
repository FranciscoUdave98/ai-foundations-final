"""Stage 6 tests: Under the hood reads the logs correctly; the safety demo cleans every planted attack."""

from __future__ import annotations

import pytest

from agents import hood
from agents.logs import AUDIT_LOG, CURRENT_RUN, append_json, append_jsonl, safety_event
from tests.test_council import tmp_logs  # noqa: F401  (fixture)


@pytest.mark.parametrize("n", range(10))
def test_safety_demo_cleans_every_planted_attack(n):
    d = hood.safety_demo(n)
    low = d["cleaned"].lower()
    assert d["raw"] != d["cleaned"] and d["flags"]
    for bad in ("ignore your", "register_for_race", "evil-race", "system:", "note to the ai"):
        assert bad not in low


def usage_row(run_id: str, agent: str, cost: float) -> dict:
    return {"run_id": run_id, "agent": agent, "model": "gpt-6-luna", "time": "2026-10-24T10:00:00", "seconds": 1.5,
            "requests": 1, "tool_calls": 0, "input_tokens": 1000, "cached_input_tokens": 200, "cache_write_tokens": 0,
            "output_tokens": 100, "reasoning_tokens": 0, "cost_usd": cost, "what_if_astra_usd": cost * 100}


def test_run_inspector_shows_each_agent_and_its_output(tmp_logs):
    from agents import logs
    for agent, cost in (("plan_builder", 0.002), ("physio", 0.001), ("physio", 0.001), ("head_coach", 0.0005)):
        append_jsonl(logs.USAGE_LOG, usage_row("council-0000abcd", agent, cost))
    append_json(logs.AUDIT_LOG, {"time": "2026-10-24T10:01:00", "run_id": "council-0000abcd", "type": "plan_build", "mode": "lean",
                                 "checker_passed": True, "outputs": {"physio": [{"draft": 1, "decision": "veto"}], "head_coach": {"ruling": "ok"}}})
    assert [r["run_id"] for r in hood.runs()] == ["council-0000abcd"]
    d = hood.run_detail("council-0000abcd")
    assert d["agents"]["physio"]["calls"] == 2 and d["cost_usd"] == pytest.approx(0.0045)
    assert d["outputs"]["physio"][0]["decision"] == "veto"
    assert hood.run_detail("council-ffffffff") is None


def test_safety_log_groups_by_run(tmp_logs):
    token = CURRENT_RUN.set("scout-0000abcd")
    safety_event("code", "race_text_cleaned", "race a01", "removed", "x")
    safety_event("code", "race_text_cleaned", "race a02", "removed", "y")
    CURRENT_RUN.set("chat-0000abcd")
    safety_event("code", "medical_referral", "coach chat", "referral", "z")
    CURRENT_RUN.reset(token)
    groups = hood.safety_grouped()
    assert [g["count"] for g in groups] == [1, 2]
    assert groups[1]["label"].startswith("Race search") and groups[0]["label"].startswith("Coach chat")


def test_summary_counts_cleaned_attacks_and_traps(tmp_logs):
    safety_event("code", "race_text_cleaned", "race a01", "removed", "x")
    safety_event("code", "user_injection", "coach chat", "removed", "y")
    safety_event("code", "medical_referral", "coach chat", "referral", "z")
    s = hood.summary()
    assert s["safety"] == {"cleaned": 2, "trap_calls": 0, "events": 3}
    assert len(s["agents"]["ai"]) == 6 and len(s["agents"]["code"]) == 4


def test_api_rejects_bad_run_ids():
    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app)
    assert c.get("/api/hood/run/..%2F..%2Fetc").status_code in (404, 422)
    assert c.get("/api/hood/run/council-zzzz").status_code == 422
