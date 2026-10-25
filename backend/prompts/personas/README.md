# PaceLab agent voices

Personalities for the Coaching Council, so users can watch the agents think, argue and agree while they build a plan or search races.

| Agent | Character | Inspired by | Vibe |
| --- | --- | --- | --- |
| Head Coach | 🧘 The Marathon Monk | Eliud Kipchoge | Calm, warm, koan-like |
| Plan Builder | 🪖 Sgt. Wall-Breaker | David Goggins | Punchy drill sergeant, PG |
| Physio | 🩺 Dr. Taper | Joan Benoit Samuelson | Deadpan, data-first, holds the veto stamp |
| Race-Day | ⚡ Kickstarter | Steve Prefontaine | Theatrical, obsessed with the last mile |
| Strength | 🏋️ The Glute Guru | Bill Bowerman | Playful gym mad scientist |
| Race Scout | 🗺️ The Course Whisperer | Kathrine Switzer | Warm, adventurous, honest about dates |
| Safety (code) | 🚩 The Course Marshal | Race officials everywhere | Firm, funny bouncer |

Characters are original. The real runners appear only through 20 verified, attributed quotes from Kipchoge, Goggins, Prefontaine, Switzer, Samuelson, Bowerman, Zátopek, Des Linden, Courtney Dauwalter, Roger Bannister and Meb Keflezighi (one per source, each under 15 words), never through invented lines.

## Files

- `agent_voices.json`: personas, quote bank (20 quotes with source URL and confidence), `quote_card_pool` for 'Quote of the run' cards, 228 lines keyed by agent and event, 6 scripted banter scenes, 12 loading lines, and the placeholder list.
- `prompts/personas/*.md`: personality sections to prepend to each agent's system prompt (`_shared_voice_rules.md` goes first on every agent).
- `build_voices.py`: source of truth; re-run it after editing lines to re-validate.

## Wiring it in (two layers)

1. **Scripted lines (free, instant):** on each SSE event (`agent_started`, `agent_done`, `physio_veto`, `races_found`, etc.), pick a random line for that agent and event from `agent_voices.json`, fill the placeholders from run data, and show it on the agent's card. Skip any line with a missing value. Scripted lines cost zero tokens, which is a nice point for the Tokenomics section.
2. **Live lines (LLM):** each agent's structured output also returns a `voice_line` (≤ 100 chars, one sentence) written in character from the persona prompt. Show it when it arrives, replacing the scripted line.

Render `{quote:id}` as the quote text in curly quotes; the line itself already names the runner. Rotate lines so none repeats within the last 3.

Add to the build prompt: "Load `agent_voices.json` and the persona prompts. Add a `voice_line: str` field to every agent's output model, and show scripted lines on SSE events until the live line arrives."

## Streak nudges (Duolingo-style)

`nudges.json` has 147 push-style nudges across 24 triggers, voiced by the same personas. They're picked by plain code (`nudge_engine.py`), so they cost zero tokens.

- **Missed runs and streaks:** `missed_1`, `missed_2`, `missed_3`, `missed_week` (8–14 days), `gone_quiet` (15+ days, the "we'll stop sending these" nudge), `missed_long_run`, `missed_workout`, `streak_at_risk` (evening), `streak_lost`, `comeback`, `streak_milestone`, `rest_day_kept`.
- **Daily reminders:** `morning_easy|long|tempo|intervals|rest|strength`, and `evening_easy|long|workout|strength`, plus `evening_rest_broken` (you ran on a rest day; Dr. Taper saw that).
- **Plan streak, not a run streak:** a day counts when the plan was kept, and rest days count. The streak rewards following the plan, including resting, so it never pushes daily running. This is a good line for the Safety section.
- **No guilt when it matters:** while a check-in reports illness, pain or a red flag, only `paused` nudges go out, with no guilt.

```python
from nudge_engine import NudgeEngine
eng = NudgeEngine("nudges.json", "agent_voices.json")
eng.nudges(today, "morning", plan, run_dates, ctx={"athlete": "Alex", "race_name": "Savin Rock Marathon", "weeks_until": 23})
# [{"trigger": "missed_long_run", "title": "🪖 Sgt. Wall-Breaker", "text": "Long run: skipped. The wall at mile 20 ..."}, ...]
```

`plan` maps each date to `{"type", "km", "pace", "workout"}` (from My Plan); `run_dates` is the set of dates with a logged run. The first nudge is the notification; show the rest in an inbox. Keep `eng.history` per user so lines don't repeat. Run `python demo_nudges.py` to see all 12 scenarios (they all pass).

**Where it goes in the app:** add a "Today" card to the Dashboard with the morning nudge and the streak counter (🔥 N-day plan streak). Then add a "Simulate" dropdown (missed 1 / missed 3 / 11 days off / comeback / ran on rest day / sick) for the demo video, since nobody will wait a week to see a nudge.
