"""PaceLab streak nudges: Duolingo-style push notifications voiced by the Coaching Council.

Picked by plain code (nudge_engine.py), so they cost zero tokens.
Render rules are the same as agent_voices.json:
  {placeholder}  -> filled from plan/run data; skip the line if a value is missing
  {quote:<id>}   -> the quote text in curly quotes (ids from agent_voices.json); the line names the runner
Tone: passive-aggressive and funny on missed runs, never on illness or pain (see "paused").
Streak rule: a "plan streak" counts days the plan was kept. Rest days count, so the streak
rewards rest instead of daily running.
"""
import json
import re

M, W, T, K, G, S = "monk", "wallbreaker", "taper", "kickstarter", "guru", "whisperer"

N = {
    # ------------------------------------------------------------ missed runs & streaks
    "missed_1": [
        (M, "Yesterday's run is still waiting for you. It is very patient. Are you?"),
        (W, "Recruit {athlete}. Yesterday: 0 km. I'm not mad. I'm writing it down."),
        (T, "One missed run changes nothing. Two starts a pattern. Your call."),
        (K, "Act one: the hero skips a run. Classic. Now we need the comeback scene."),
        (G, "Your glutes filed a missing person report. Today's {workout} closes the case."),
        (S, "{race_name} is {weeks_until} weeks away. It didn't take yesterday off. Just saying."),
        (M, "One missed day is a pebble on the road. Step over it. Today: {workout}."),
        (W, "We had a plan. The plan had a run. The run had you in it. Today we fix that."),
        (T, "Statistically, today is the best day to get back on plan. I checked. Twice."),
        (S, "Kathrine Switzer said it: {quote:switzer_shoes} So… shoes?"),
    ],
    "missed_2": [
        (W, "Two days, zero km. Sgt. Wall-Breaker has stopped yelling. That should worry you."),
        (M, "Two days of stillness. The river is still a river. Come back to it: {workout}."),
        (T, "Two missed runs. Fitness lost so far: basically none. Excuses collected: several."),
        (K, "Plot twist: the hero vanishes for two days. The audience wants a return. Give them one."),
        (G, "Day 2 without you. I've started talking to the foam roller. It doesn't talk back."),
        (S, "Your usual loop asked where you went. I said 'busy'. It didn't buy it either."),
        (W, "Goggins: {quote:goggins_discipline} I'm just the messenger with a whistle."),
        (K, "Two rest days you didn't schedule. Bold. Let's not make it a trilogy."),
    ],
    "missed_3": [
        (M, "Three days. The plan bends; it does not break. Today, just {workout}. Nothing more."),
        (W, "Three days AWOL, {athlete}. Report to your shoes. That's an order. A gentle one."),
        (T, "Three missed runs. I trimmed this week to {cut_km} km so the comeback is easy. No guilt. Some guilt."),
        (K, "Act two needs its lead. The understudy is a couch cushion and the reviews are bad."),
        (G, "Three days off. Your hamstrings are tightening out of spite. Come stretch them."),
        (S, "Three days without a single start line, not even your front door. Let's change that."),
        (M, "Des Linden keeps it simple: {quote:linden_keep_showing_up} Today: {workout}."),
    ],
    "missed_week": [
        (T, "It's been {days} days. I rebuilt next week to restart gently. No catch-up miles, I promise."),
        (W, "A week. I did 4,000 push-ups waiting for you. Okay, 40. Come back."),
        (M, "A week of silence. The path is still here. So is your plan, reshaped for you."),
        (K, "The intermission has run long. The audience is checking their phones. Curtain up?"),
        (G, "A week off. Your muscles are fine. Your excuse muscles, however, are jacked."),
        (S, "{race_name} is {weeks_until} weeks out. Still doable. Tell me the plan is on."),
        (W, "These reminders don't seem to be working. I'll keep sending them anyway. Hi."),
    ],
    "gone_quiet": [
        (M, "We'll stop sending reminders for now. The door stays open. The kettle stays warm."),
        (W, "Fine. No more nudges. I'll just stand here. By your shoes. Silently."),
        (T, "{days} days off. Your plan is paused, not deleted. Restart whenever: easy first week, my rules."),
        (K, "Every great comeback starts with a 20-minute jog nobody films. Ready when you are."),
        (S, "Races aren't going anywhere. There are {count} within {radius} miles whenever you're back."),
        (G, "The foam roller and I have accepted it. We're fine. (We're not fine.)"),
    ],
    "missed_long_run": [
        (W, "Long run: skipped. The wall at mile 20 just got a little taller. Let's go knock it down."),
        (K, "You skipped the long run. That's the dress rehearsal. Nobody skips dress rehearsal."),
        (M, "The long run teaches patience. Skipping it teaches something too. It moves to {day}."),
        (T, "Missed long run. Don't stack it on top of a workout. I moved it to {day}. You're welcome."),
        (S, "Your {long_km} km route sat there all day. It looked lonely on the map."),
        (G, "No long run, no time on feet. Your calves were looking forward to complaining."),
    ],
    "missed_workout": [
        (K, "Skipped the speed session? A finishing kick isn't built on wishes. It's built on repeats."),
        (W, "Workout dodged. I respect the evasion skills. Wrong sport, though."),
        (T, "Missed the hard session. Don't make it up tomorrow: back-to-back hard days are my nightmare."),
        (M, "The fast day passed. Let it go. Next one is {day}. Arrive rested."),
        (K, "Prefontaine: {quote:pre_gift} Save the gift for {day}."),
        (G, "Speed day skipped. Your fast-twitch fibers are twitching. Impatiently."),
    ],
    "streak_at_risk": [
        (W, "{streak}-day streak on the line, {athlete}. {workout}. Clock's ticking. Move."),
        (K, "Your {streak}-day streak is in its final act. The ending is up to you. Tonight."),
        (M, "The day is not over. Neither is your {streak}-day streak. {workout}, one step at a time."),
        (T, "Your {streak}-day streak ends at midnight. Even a short easy run keeps it alive."),
        (G, "Your {streak}-day streak called. It sounded nervous. Go reassure it: {workout}."),
        (S, "The sun's going down. Your {streak}-day streak would love to watch it from a run."),
        (W, "{streak} days of discipline vs. one evening on the couch. I know who wins. Prove me right."),
        (K, "It's late. It's dramatic. {streak} days on the line. This is your kind of finish."),
    ],
    "streak_lost": [
        (M, "Your {lost_streak}-day streak has ended. It was beautiful. A new one begins today."),
        (W, "{lost_streak}-day streak: gone. I took it personally. Day 1 starts today, recruit."),
        (T, "Streak reset to 0. Fitness reset to… about the same. Breathe and run."),
        (K, "Tragedy! The {lost_streak}-day streak falls in act three. Sequels are usually better."),
        (G, "RIP {lost_streak}-day streak. We'll do squats in its honor. Then run."),
        (S, "Streaks end. Routes don't. Your favorite {km} km loop is waiting."),
        (M, "Kipchoge: {quote:kipchoge_free} Day 1 is the most disciplined day there is."),
    ],
    "comeback": [
        (W, "Look who's BACK. Streak: 1. Respect: restored. Mostly."),
        (M, "You returned. That is the whole lesson. Streak: 1."),
        (T, "Welcome back. Keep this week easy and leave the math to me. No heroics."),
        (K, "The comeback scene. Audiences love this part. Streak: 1 and climbing."),
        (G, "You ran! Your glutes have been notified. They're thrilled. Cautiously."),
        (S, "Back on the map! {race_name} just got a little closer."),
        (W, "{days} days off, and then you showed up. Showing up is the part that counts."),
    ],
    "streak_milestone": [
        (M, "{streak} days of keeping the plan. Quiet consistency is the loudest thing."),
        (W, "{streak}-day streak. I'd salute, but I'm busy adding a hill."),
        (T, "{streak} days on plan, rest days included. That's how runners last for decades."),
        (K, "{streak} days! Standing ovation. Now sit down; tomorrow's easy."),
        (G, "{streak} days. Your legs are getting sneaky strong. I can tell from here."),
        (S, "{streak} days in a row. {race_name} is starting to hear about you."),
    ],
    "rest_day_kept": [
        (T, "Yesterday you rested on purpose. Streak +1. That's how it works here."),
        (M, "Rest is training in quiet clothes. Streak: {streak}."),
        (W, "You rested like I told you to. Never tell anyone I said rest is good."),
        (G, "Rest day logged. Your muscles rebuilt overnight. Streak: {streak}."),
    ],
    # No guilt here, ever: shown instead of every other nudge while a check-in reports
    # illness, pain or a medical red flag.
    "paused": [
        (T, "You told us you're unwell. Nudges are paused. Rest is the whole plan right now."),
        (M, "Heal first. The road will wait. No reminders until you're ready."),
        (T, "Pain reported, so no guilt trips. If it isn't easing, see a doctor or physio."),
        (W, "Standing down. Even sergeants know when to stop yelling. Get well, recruit."),
    ],
    # ------------------------------------------------------------ daily reminders (morning)
    "morning_easy": [
        (M, "Today: {workout} at {pace}/km. Easy means easy. Slower than your ego wants."),
        (T, "Easy day: {km} km. If you can't hold a conversation, you're running Sgt. Wall-Breaker's run."),
        (W, "Easy run today. Yes, I said easy. Don't get used to it."),
        (K, "Today is the quiet scene before the big one. {km} km, gentle, no drama."),
        (G, "{km} km easy, then 10 minutes of mobility. Non-negotiable. Mostly."),
        (S, "{km} km easy. Try a street you've never run. Every street has a story."),
        (M, "Run the easy days easy. Today: {workout}."),
    ],
    "morning_long": [
        (W, "Long run day, recruit: {long_km} km. Pack fuel. Pack grit."),
        (K, "Long run = dress rehearsal. {long_km} km at {pace}/km. Practice your race-day breakfast."),
        (M, "{long_km} km today. The first kilometer is for the body. The last is for the mind."),
        (T, "{long_km} km at {pace}/km. A gel every 40 minutes or so, water at stops. Patience."),
        (S, "{long_km} km. Make it a tour: a route with a view and a coffee shop at the end."),
        (G, "Long run day. Glutes, this is your moment. Hamstrings, please behave."),
        (W, "Mile 20 doesn't care how you feel. That's why we visit it in training. {long_km} km."),
    ],
    "morning_tempo": [
        (K, "Tempo day: {workout}. Comfortably hard. Emphasis on hard. Okay, and on comfortably."),
        (W, "Tempo day. Find the pace that's uncomfortable and make friends with it: {pace}/km."),
        (M, "Today, run at the edge, not over it. {workout}."),
        (T, "Tempo at {pace}/km. If your heart rate climbs too early, ease off. I'll be watching. Politely."),
        (G, "Tempo today. Warm up those hips first or they'll file a complaint."),
        (S, "Tempo day. Find a flat stretch. Today is not for hill sightseeing."),
    ],
    "morning_intervals": [
        (K, "Interval day! {workout}. Every rep is a tiny race. Win them all. Then recover."),
        (W, "Repeats today. Each one hurts a little. Each one counts a lot."),
        (M, "Fast, rest, fast, rest. Breathe in the rest. Today: {workout}."),
        (T, "{workout}. Take the full recoveries. The rest is part of the workout, not a break from it."),
        (G, "Speed day. Drills first, strides second, glory third."),
        (K, "Zátopek's advice: {quote:zatopek_faster} Today's assignment: {workout}."),
    ],
    "morning_rest": [
        (T, "Rest day. Not 'a short one'. Not 'just 5K'. Rest. Your streak still counts it."),
        (M, "Today the training is stillness. It still counts."),
        (W, "Rest day. Orders are orders. Put the shoes DOWN."),
        (K, "Intermission. Hydrate. Gossip about your splits. Back on stage tomorrow."),
        (G, "Rest day! Optional: 10 minutes of stretching. Not optional: skipping the 'bonus' run."),
        (S, "Rest day. Spend it browsing races instead. Low effort, big dreams."),
    ],
    "morning_strength": [
        (G, "Strength day! Squats, single-leg work, calf raises. Next month's km will thank you."),
        (G, "Glute day. Every day is glute day, but today it's official."),
        (W, "Strength day. Iron today, miles tomorrow."),
        (T, "Strength work lowers injury risk. I'd prescribe it if I could. I basically can. Go."),
        (M, "A strong body carries an easy stride. Strength today."),
        (K, "Strength day. A kick needs legs. Go build some."),
    ],
    # ------------------------------------------------------------ daily reminders (evening)
    "evening_easy": [
        (M, "The easy run is still waiting. It won't rush you. The day might."),
        (W, "{km} km easy still on the board, recruit. Daylight's burning."),
        (T, "Still time for {km} easy km. Short on time? 20 minutes beats zero."),
        (K, "Tonight's show: {workout}. Tickets are free. Attendance is mandatory."),
        (G, "Your easy run is sitting there like an unopened protein shake."),
        (S, "Evening light is the best light. {km} km, any route."),
    ],
    "evening_long": [
        (W, "The long run isn't done and the sun is dropping. Choices, recruit."),
        (T, "Long run still pending. Can't fit {long_km} km? Do what you can. Don't pile it onto tomorrow's workout."),
        (M, "The long road waits. Even half of it is a gift."),
        (K, "Dress rehearsal tonight? The theater closes at midnight."),
    ],
    "evening_workout": [
        (K, "Workout not done. Speed doesn't build itself. I've checked."),
        (W, "Hard session still open. Close it, recruit."),
        (T, "Too tired for the workout? Swap it for an easy run and tell me. Better than skipping."),
        (M, "Do the work while the day is still yours."),
    ],
    "evening_strength": [
        (G, "Strength session not logged. The dumbbells are getting dusty. And judgmental."),
        (G, "20 minutes. Squats, bridges, calf raises. Your glutes are waiting by the door."),
        (W, "No iron today? Five sets of excuses don't count."),
        (T, "Even 15 minutes of strength helps. I'm not asking for a bodybuilding show."),
    ],
    "evening_rest_broken": [
        (T, "Was that a run? On a rest day? I saw that. It's on my clipboard now."),
        (M, "You ran on a rest day. The rest day is sad. Tomorrow, be easy."),
        (W, "Unauthorized km detected. I respect it. Now follow the plan, soldier."),
        (G, "Bonus run on a rest day? Your muscles were mid-rebuild. Tsk."),
        (K, "An unscheduled performance. The director (Dr. Taper) is not amused."),
    ],
}

TRIGGERS = {
    "missed_1": "Morning after the first missed planned run",
    "missed_2": "Morning after 2 missed planned runs in a row",
    "missed_3": "Morning after 3+ missed planned runs in a row",
    "missed_week": "8–14 days since the last run",
    "gone_quiet": "15+ days since the last run; last nudge, then quiet (Duolingo's 'we'll stop')",
    "missed_long_run": "Morning after a missed long run (first miss)",
    "missed_workout": "Morning after a missed tempo or interval session (first miss)",
    "streak_at_risk": "Evening, today's run not done, streak of 3+ days",
    "streak_lost": "Morning after a missed run broke a streak of 7+ days (outranks the long-run/workout nudge)",
    "comeback": "Morning after the first run following 2+ missed planned runs",
    "streak_milestone": "Morning when the streak hits 3, 7, 14, 21, 30, 50, 75, 100, 150, 200 or 365",
    "rest_day_kept": "Morning after a planned rest day (streak +1)",
    "paused": "A check-in reports illness, pain or a medical red flag: no other nudges",
    "morning_easy": "Morning reminder: easy or recovery run today",
    "morning_long": "Morning reminder: long run today",
    "morning_tempo": "Morning reminder: tempo run today",
    "morning_intervals": "Morning reminder: intervals today",
    "morning_rest": "Morning reminder: rest day",
    "morning_strength": "Morning reminder: strength day",
    "evening_easy": "Evening: today's easy run not done (streak under 3)",
    "evening_long": "Evening: today's long run not done (streak under 3)",
    "evening_workout": "Evening: today's tempo/intervals not done (streak under 3)",
    "evening_strength": "Evening: today's strength session not logged",
    "evening_rest_broken": "Evening: a run was logged on a rest day",
}

PLACEHOLDERS = {
    "athlete": "first name or nickname",
    "workout": "today's (or next) session in words, e.g. '8 km easy'",
    "km": "today's planned km",
    "long_km": "planned long-run km",
    "pace": "target pace for today's session, e.g. '5:40'",
    "streak": "current plan streak in days",
    "lost_streak": "length of the streak that just ended",
    "days": "days since the last run",
    "day": "weekday the missed session moves to (next session of that type)",
    "race_name": "goal race name",
    "weeks_until": "weeks until the goal race",
    "cut_km": "this week's trimmed volume (from the Physio's revision)",
    "count": "races found near the athlete",
    "radius": "search radius in miles",
}

MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365]
BANNED = {"damn", "hell", "shit", "crap", "ass", "kill", "die", "stupid", "lazy", "fat"}
MAX_CHARS = 130  # push-notification friendly, with a quote counted as 60 chars


def validate():
    voices = json.load(open("agent_voices.json"))
    qids = {q["id"] for q in voices["quotes"]}
    personas = {p["id"] for p in voices["personas"]}
    problems, seen = [], set()
    assert set(N) == set(TRIGGERS), set(N) ^ set(TRIGGERS)
    for trig, lines in N.items():
        if len({w for w, _ in lines}) < min(3, len(lines)) and trig not in {"evening_strength", "morning_strength", "paused"}:
            problems.append(f"{trig}: needs at least 3 personas")
        for who, text in lines:
            where = f"{trig}/{who}"
            if who not in personas:
                problems.append(f"{where}: unknown persona")
            if text in seen:
                problems.append(f"{where}: duplicate line")
            seen.add(text)
            for tok in re.findall(r"\{([^}]+)\}", text):
                if tok.startswith("quote:"):
                    if tok[6:] not in qids:
                        problems.append(f"{where}: unknown quote {tok}")
                elif tok not in PLACEHOLDERS:
                    problems.append(f"{where}: unknown placeholder {{{tok}}}")
            if set(re.findall(r"[a-z']+", text.lower())) & BANNED:
                problems.append(f"{where}: non-PG or shaming word")
            if len(re.sub(r"\{quote:[^}]+\}", "Q" * 60, text)) > MAX_CHARS:
                problems.append(f"{where}: too long")
            if trig == "paused" and re.search(r"skip|excuse|streak", text.lower()):
                problems.append(f"{where}: guilt in a paused nudge")
    return problems


def main():
    problems = validate()
    if problems:
        print("\n".join(problems))
        raise SystemExit(1)
    out = {
        "version": "1.0",
        "render_rules": {
            "placeholder": "{name} is filled from plan/run data; skip the line if any value is missing",
            "quote_token": "{quote:id} renders as the quote text (from agent_voices.json) in curly quotes",
            "selection": "random line for the trigger; skip lines used in the last 10 nudges; "
                         "avoid the persona that sent the previous nudge when possible",
            "title": "'<emoji> <persona name>' from agent_voices.json personas",
            "streak": "plan streak: consecutive days the plan was kept; rest days count",
            "safety": "while a check-in reports illness, pain or a red flag, only 'paused' nudges are sent",
        },
        "triggers": TRIGGERS,
        "milestones": MILESTONES,
        "placeholders": PLACEHOLDERS,
        "nudges": {t: [{"id": f"{t}_{i + 1:02d}", "persona": w, "text": s} for i, (w, s) in enumerate(lines)]
                   for t, lines in N.items()},
    }
    with open("nudges.json", "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    total = sum(len(v) for v in N.values())
    per = {}
    for lines in N.values():
        for w, _ in lines:
            per[w] = per.get(w, 0) + 1
    print(f"OK: {total} nudges across {len(N)} triggers")
    print(per)


if __name__ == "__main__":
    main()
