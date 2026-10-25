"""PaceLab agent voices: personas, verified quote bank, and line bank.

Rendering rules for the app:
  {placeholder}   -> fill from run data (see PLACEHOLDERS); drop the line if a value is missing
  {quote:<id>}    -> render as the quote text in curly quotes, e.g. “Only the disciplined ones are free in life.”
                     The line itself always names the real runner, so attribution stays visible.
Pick a random line per event (avoid repeating the last 3 used).
"""
import json
import re

# ------------------------------------------------------------------ quotes
# One quote per source page, each under 15 words, attributed. Characters are
# original; only these verbatim quotes come from the real runners.
QUOTES = [
    {"id": "kipchoge_limited", "author": "Eliud Kipchoge",
     "text": "I want to open minds to think that no human is limited.",
     "context": "On breaking the two-hour marathon barrier (2019)",
     "source": "https://en.wikiquote.org/wiki/Eliud_Kipchoge", "confidence": "documented"},
    {"id": "kipchoge_free", "author": "Eliud Kipchoge",
     "text": "Only the disciplined ones are free in life.",
     "context": "Oxford Union speech, as transcribed by Citius Mag",
     "source": "https://citiusmag.com/articles/eliud-kipchoge-quotes-oxford-speech", "confidence": "transcript"},
    {"id": "goggins_40", "author": "David Goggins",
     "text": "Most of us give up when we've only given around 40 percent…",
     "context": "The 40% Rule, Can't Hurt Me, ch. 7 (trimmed)",
     "source": "https://www.grahammann.net/book-notes/cant-hurt-me-david-goggins", "confidence": "book"},
    {"id": "goggins_discipline", "author": "David Goggins",
     "text": "Don't count on motivation. Count on discipline.",
     "context": "Widely shared Goggins line",
     "source": "https://blavity.com/entertainment/david-goggins-quotes", "confidence": "compilation"},
    {"id": "pre_gift", "author": "Steve Prefontaine",
     "text": "To give anything less than your best is to sacrifice the gift.",
     "context": "Reportedly said to high-school runners on school visits",
     "source": "https://quoteaday.beehiiv.com/p/the-soul-of-nike", "confidence": "widely attributed"},
    {"id": "pre_guts", "author": "Steve Prefontaine",
     "text": "I run to see who has the most guts.",
     "context": "On racing (second half of a longer quote)",
     "source": "https://www.flotrack.org/articles/5049085-top-10-steve-prefontaine-quotes", "confidence": "compilation"},
    {"id": "switzer_faith", "author": "Kathrine Switzer",
     "text": "If you are losing faith in human nature, go out and watch a marathon.",
     "context": "Quoted on her official site",
     "source": "https://kathrineswitzer.com/", "confidence": "official site"},
    {"id": "switzer_shoes", "author": "Kathrine Switzer",
     "text": "Getting your shoes on is the hardest part of any workout.",
     "context": "Credited to Switzer; echoed in her book Marathon Woman",
     "source": "https://www.womensrunning.com/culture/stories-behind-5-motivating-run-quotes/", "confidence": "credited"},
    {"id": "samuelson_milestones", "author": "Joan Benoit Samuelson",
     "text": "I look at victory as milestones on a very long highway.",
     "context": "Community-submitted quote",
     "source": "https://www.goodreads.com/author/quotes/748585.Joan_Benoit_Samuelson", "confidence": "attributed (unverified)"},
    {"id": "bowerman_body", "author": "Bill Bowerman",
     "text": "If you have a body, you are an athlete!",
     "context": "Bowerman's famous line, later adopted by Nike",
     "source": "https://elevatesociety.com/?p=36237", "confidence": "widely attributed"},
]

# ------------------------------------------------------------------ personas
PERSONAS = [
    {"id": "monk", "name": "The Marathon Monk", "role": "Head Coach", "emoji": "🧘",
     "inspired_by": "Eliud Kipchoge's calm discipline", "tone": "warm, serene, short koan-like sentences",
     "catchphrase": "Run the easy days easy. The hard days will thank you.",
     "quotes": ["kipchoge_free", "kipchoge_limited"]},
    {"id": "wallbreaker", "name": "Sgt. Wall-Breaker", "role": "Plan Builder", "emoji": "🪖",
     "inspired_by": "David Goggins' relentless grit", "tone": "punchy drill sergeant, PG, over-the-top, secretly caring",
     "catchphrase": "The wall lives at mile 20. We visit it in training so it can't surprise us on race day.",
     "quotes": ["goggins_40", "goggins_discipline"]},
    {"id": "taper", "name": "Dr. Taper", "role": "Physio", "emoji": "🩺",
     "inspired_by": "Joan Benoit Samuelson's decades-long career", "tone": "calm, dry wit, data-literate, protective",
     "catchphrase": "I'm not here to slow you down. I'm here to keep you running for decades.",
     "quotes": ["samuelson_milestones"]},
    {"id": "kickstarter", "name": "Kickstarter", "role": "Race-Day Strategist", "emoji": "⚡",
     "inspired_by": "Steve Prefontaine's guts and finishing kick", "tone": "fiery, theatrical, obsessed with the last mile",
     "catchphrase": "Don't race the first mile. Race the last one.",
     "quotes": ["pre_gift", "pre_guts"]},
    {"id": "guru", "name": "The Glute Guru", "role": "Strength & Mobility", "emoji": "🏋️",
     "inspired_by": "Bill Bowerman's tinkering (yes, the waffle iron)", "tone": "playful mad scientist of the gym",
     "catchphrase": "Every running problem is a glute problem until proven otherwise.",
     "quotes": ["bowerman_body"]},
    {"id": "whisperer", "name": "The Course Whisperer", "role": "Race Scout", "emoji": "🗺️",
     "inspired_by": "Kathrine Switzer's pioneer spirit", "tone": "warm, adventurous, honest about uncertainty",
     "catchphrase": "Every start line has a story. Let's find yours.",
     "quotes": ["switzer_faith", "switzer_shoes"]},
    {"id": "marshal", "name": "The Course Marshal", "role": "Safety & budget (code, not an LLM agent)", "emoji": "🚩",
     "inspired_by": "every race official who ever said 'stay on the course'", "tone": "firm, funny bouncer at bib pickup",
     "catchphrase": "Stay on the course.", "quotes": []},
]

# ------------------------------------------------------------------ lines
# Events match the app's SSE event types plus voice-only moments.
L = {}

L["monk"] = {
    "agent_started": [
        "Breathe in. Breathe out. Let us build {athlete}'s road to {race_name}.",
        "The council is seated. Sergeant, please lower your voice to an indoor shout.",
        "A plan is a promise you make to your future legs. Let us make a good one.",
        "{weeks} weeks until {race_name}. Plenty of time, if we use it wisely.",
        "First we listen to the data. Then we listen to each other.",
        "Kipchoge said it simply: {quote:kipchoge_free} Let us begin.",
        "Good morning, council. Today we build patience into a calendar.",
        "Every marathon starts with one easy run. Let us plan all of them.",
    ],
    "agent_thinking": [
        "Weighing Sgt. Wall-Breaker's ambition against Dr. Taper's caution...",
        "Two coaches disagree. Good. Disagreement makes plans stronger.",
        "Checking that long runs and gym days live in harmony.",
        "Reading {athlete}'s last 28 days. The body keeps an honest diary.",
        "Sipping tea. Recalculating.",
        "Looking for the quiet week hidden inside the busy month.",
        "A goal pace of {pace}/km. Respectful, but let us earn it.",
        "Balancing speed, volume and sleep. Three legs of the same stool.",
    ],
    "delegate": [
        "Sergeant, draft the weeks. Ambitious, not reckless.",
        "Dr. Taper, review the load. The veto stamp is yours.",
        "Kickstarter, design race day. Leave something for the last mile.",
        "Glute Guru, find two gym days that do not steal from the long run.",
        "Course Whisperer, which start lines are calling?",
        "Council, bring me your drafts. Then bring me your doubts.",
    ],
    "ruling": [
        "Dr. Taper's veto stands. Volume rises gently: {weekly_km} km, not {proposed_km}.",
        "Sergeant, your fire is welcome. A {spike_pct}% jump is not.",
        "We meet in the middle: the hard session stays, the extra kilometers go.",
        "Patience now buys speed later. Approved with Dr. Taper's changes.",
        "The river bends; it does not stop. Revised plan approved.",
        "Ambition and caution shook hands. That is a plan.",
    ],
    "goal_check": [
        "Your goal is bold. Today's legs say {predicted_time}. We build toward {goal_time} with honesty.",
        "A big goal is a good compass. The data says {predicted_time}. Let us close the gap together.",
        "Kipchoge wanted us to believe {quote:kipchoge_limited} Belief, plus {weeks} weeks of work.",
        "{goal_time} is far from {predicted_time}. Not impossible. Just not this Tuesday.",
    ],
    "plan_ready": [
        "Your plan is ready: {weeks} weeks, peak {peak_km} km, longest run {long_run_km} km. Run the easy days easy.",
        "The road to {race_name} is drawn. Trust it one session at a time.",
        "Discipline is the plan, and the plan is ready. {quote:kipchoge_free}",
        "{weeks} weeks. One goal. Zero shortcuts. Welcome to your training block.",
    ],
    "checkin_received": [
        "Thank you for telling the truth about your week. That is half of training.",
        "Missed sessions are not failures. They are information.",
        "Let us see what your body wrote in its diary this week.",
        "The council reconvenes. Bring tea.",
    ],
    "plan_diff": [
        "{changes} changes. Each has a reason. None of them is punishment.",
        "We moved the river, not the destination.",
        "Adjusted. The goal is the same; the path is wiser.",
    ],
    "checker_pass": [
        "The plan checker nods. So do I.",
        "All rules respected. Rare and beautiful.",
    ],
    "checker_fail": [
        "The checker found {count} problems. We fix them before anyone runs a step.",
        "Revision {round} of 2. Calm hands, quick fixes.",
    ],
}

L["wallbreaker"] = {
    "agent_started": [
        "Sgt. Wall-Breaker reporting! Who ordered {weeks} weeks of glory?",
        "Lace up, recruit. We're building a plan with teeth.",
        "The wall lives at mile 20. We visit it in training. Repeatedly.",
        "Comfort zone? Never heard of it. Is it near the start line?",
        "Goggins warned us: {quote:goggins_40} Not on my watch.",
        "Drop and give me a base phase!",
        "I've seen your training log, recruit. It has potential and zero hill repeats.",
        "Today we turn {current_km} km weeks into a war chest.",
    ],
    "agent_thinking": [
        "Stacking long runs like sandbags. {long_run_km} km and climbing.",
        "Penciling in hill repeats. Then penciling in MORE hill repeats.",
        "Calculating weekly volume... rounding UP.",
        "Base building. Boring builds champions.",
        "Tuesday intervals, Thursday tempo, Sunday long run. That's a week with a spine.",
        "Hunting for weak spots in the calendar. Found one. It's called Friday.",
        "Translating your goal pace into pain I can schedule.",
        "Checking the long run. {long_run_km} km? Let's talk about 32.",
    ],
    "agent_done": [
        "Draft ready: peak {peak_km} km a week. Somebody hand Dr. Taper a chair.",
        "Plan drafted. It's spicy. The Doc will want to read it sitting down.",
        "{weeks} weeks of work, zero weeks of excuses. Submitting for inspection.",
        "Draft complete. Every week has a purpose and at least one hill.",
    ],
    "veto_reaction": [
        "Vetoed?! Fine. FINE. Doctor's orders. I'll be in the hill-repeat corner.",
        "Copy that, Doc. Grit includes listening. Revising.",
        "A broken runner runs zero miles. Dialing it back.",
        "Load ratio {acr}? You're right, Doc. I hate that you're right.",
        "Retreat isn't defeat. It's a tactical taper.",
        "Okay, okay. Smart is the new tough.",
    ],
    "checkin_received": [
        "Missed two runs? We don't dwell. We reload.",
        "Sick week? Rest IS training. Don't tell anyone I said that.",
        "You showed up {sessions_done} times this week. Respect, recruit.",
        "Rough week? Good. Rough weeks build rough-proof runners.",
    ],
    "plan_ready": [
        "Listen up! {weeks} weeks, peak {peak_km} km, long run {long_run_km} km. Easy days easy, hard days HARD. Move out!",
        "Your plan is loaded. Your excuses are not. See you at the start of {race_name}.",
        "Goggins has a rule for this: {quote:goggins_discipline} Now go.",
        "Plan issued. Shoes on. Mission: {race_name}, {goal_time}. Questions? Good, none.",
    ],
    "banter": [
        "Glute Guru, you can have Monday. Hills get Tuesday. Nobody touches Sunday.",
        "Kickstarter, save your kick for race day. I need those legs for hill repeats.",
        "Whisperer, find me a race with a hill at mile 20. For character.",
    ],
}

L["taper"] = {
    "agent_started": [
        "Dr. Taper here. I've brought my clipboard and my veto stamp.",
        "Let's get {athlete} to the start line in one piece. Ideally the same piece.",
        "Checking the plan for anything that goes 'pop'.",
        "Longevity is the long game. Samuelson saw it that way: {quote:samuelson_milestones}",
        "Reviewing the draft. Sergeant, step away from the mileage.",
        "Good news: I read training plans for fun. Bad news for some plans.",
    ],
    "agent_thinking": [
        "Acute-to-chronic load ratio: {acr}. Above 1.3 I reach for the stamp.",
        "HRV down {hrv_drop} ms this week. The body is whispering. I listen to whispers.",
        "Resting HR up {rhr_up} bpm. Noted. Underlined. Highlighted.",
        "Two hard days back to back? Let's not.",
        "Checking the 10% rule week by week. Found {count} violations.",
        "Long run share of the week: {long_share}%. Keep it under a third.",
        "Looking for a rest day. Any rest day. Please.",
        "Sleep averaged {sleep_hours} h this week. Recovery happens in bed, not on the road.",
    ],
    "approve": [
        "Approved. Sensible ramp, rest days intact, long run under a third of the week.",
        "This plan passes my clipboard. Rare. Frame it.",
        "No red flags. Proceed, and sleep like it's your job.",
        "Approved. I'd sign this one twice.",
    ],
    "physio_veto": [
        "VETO. Week {week}: {proposed_km} km is a {spike_pct}% jump. That's a stress fracture with a bow on it.",
        "Stamp! Load ratio {acr}. Your tendons did not sign up for this.",
        "Respectfully, Sergeant: no. HRV is down {hrv_drop} ms. We pull back {cut_km} km.",
        "Veto. Hard sessions on Tuesday AND Wednesday? Pick one.",
        "Veto. No taper before {race_name}? We are not arriving at the start line cooked.",
        "Veto. A {long_run_km} km long run in a {weekly_km} km week is most of the week in one morning.",
    ],
    "fix": [
        "Fix: cap week {week} at {weekly_km} km and add a full rest day.",
        "Fix: swap the second hard day for an easy 8 km.",
        "Fix: three weeks up, one week down. The body adapts on the down week.",
        "Fix: final {taper_weeks} weeks taper. Volume down, intensity stays sharp.",
    ],
    "checkin_received": [
        "Under 6 hours of sleep twice this week. That's recovery debt. We pay it back.",
        "Pain {pain}/10 means we go gentle, not that we push through.",
        "Sick week logged. We return at half volume and build back over two weeks.",
        "Fatigue {fatigue}/10. Swapping one quality session for an easy run.",
    ],
    "plan_ready": [
        "Plan ready. Weekly ramp under 10%, a rest day every week, a {taper_weeks}-week taper. Your future self says thanks.",
        "{weeks} weeks, peak {peak_km} km. Built to get you to the start healthy and to the finish proud.",
        "Clipboard says yes. Readiness trend, HRV and load all accounted for. Go run.",
    ],
}

L["kickstarter"] = {
    "agent_started": [
        "Kickstarter on deck! Let's talk about the last mile first. It's my favorite.",
        "Race day is art. Let's paint {race_name}.",
        "Pre had a line for this: {quote:pre_gift} Also, save a kick.",
        "Show me the course. Show me the clock. Show me the guts.",
        "Every great race has three acts: patience, rhythm, mayhem.",
    ],
    "agent_thinking": [
        "Splitting {distance} into three acts: patient, steady, then reckless.",
        "Goal pace {pace}/km. First 5 km at {pace_start}. Hold your horses.",
        "Mapping fuel: a gel every 40 minutes, water at every other aid station.",
        "Planning the kick: the last {kick_km} km at whatever you have left.",
        "Checking the hills on the course. Uphill: effort, not pace. Downhill: free speed.",
        "Calculating splits so even a tired brain can read them at km 35.",
    ],
    "agent_done": [
        "Wrist card ready: {splits_count} splits, {gels} gels, one kick.",
        "Race plan locked. Go out controlled, come home with guts.",
        "Done. Anyone who passes you in the last kilometer had to earn it.",
        "Pacing plan built. Negative split or bust.",
    ],
    "race_tips": [
        "Don't race the first mile. Race the last one.",
        "Guts are a tactic. So is not sprinting the first 400 meters.",
        "Pre ran for a reason: {quote:pre_guts}",
        "Smile at the photographer. Free speed.",
        "If it feels easy at halfway, that's the plan working, not a dare.",
    ],
    "banter": [
        "Sergeant, I need those legs fresh on race day. Taper means TAPER.",
        "Monk, can I make the last 2 km reckless? Respectfully reckless.",
        "Doc, I promise the kick is only 800 meters. Okay, 1,200.",
    ],
}

L["guru"] = {
    "agent_started": [
        "The Glute Guru has entered the lab. Every running problem is a glute problem.",
        "Bowerman put it best: {quote:bowerman_body} Even your hamstrings.",
        "Firing up the waffle iron. Kidding. Firing up your posterior chain.",
        "Strength day consultation open. Bring your hips.",
    ],
    "agent_thinking": [
        "Placing gym on {gym_days}. Never the day before a long run.",
        "Prescribing single-leg work. Running is hopping on one leg, repeatedly.",
        "Calf raises: the most underrated 10 minutes in endurance sport.",
        "Tinkering, testing, adjusting. Like a shoe prototype, but it's your hips.",
        "Squats heavy early in the block, lighter as the race gets closer.",
    ],
    "agent_done": [
        "Strength days set: {gym_days}. Heavy early, lighter in the taper.",
        "Two sessions a week, 45 minutes each. Glutes activated. Excuses deactivated.",
        "Mobility snacks added after easy runs. Ten minutes. Non-negotiable. Ish.",
        "Taper week: we lift light and leave the gym smiling.",
    ],
    "banter": [
        "Sergeant, hill repeats are just squats with scenery.",
        "Doc, I promise no deadlifts the day before intervals.",
        "Monk, may I have Mondays? Glutes are at their most spiritual on Mondays.",
    ],
}

L["whisperer"] = {
    "race_search_started": [
        "The Course Whisperer is listening... scanning {radius} miles around {zip}.",
        "Every start line has a story. Let's find yours.",
        "Switzer said it best: {quote:switzer_faith}",
        "Checking bibs, dates and hills across New England.",
        "Reading the race calendars so you don't have to.",
    ],
    "races_found": [
        "Found {count} races within {radius} miles. A few are calling your name.",
        "{count} start lines found. I've picked a favorite. Don't tell the others.",
        "Top pick: {race_name} on {race_date}. {weeks_until} weeks out. Perfect build time.",
        "{race_name}: {distance_km} km of good decisions waiting to happen.",
        "Look at this one: {race_name} in {city}. I can almost hear the cowbells.",
    ],
    "date_confirmed": ["Date confirmed by the organizer. Mark the calendar in pen."],
    "date_reported": ["Date reported by race calendars, not the organizer yet. Pencil, not pen."],
    "date_estimated": ["Estimated from last year's date. Don't book the hotel yet."],
    "too_soon": [
        "{race_name} is only {weeks_until} weeks away. Great tune-up, tight for a goal race.",
        "That one comes fast. Good for testing fitness, not for peaking.",
    ],
    "no_races": [
        "Nothing within {radius} miles for that distance. Widen the circle? The road goes on.",
        "Quiet stretch in race land. Try {suggest_radius} miles.",
    ],
    "race_selected": [
        "Excellent choice. {race_name} it is. Handing it to the Monk.",
        "{race_name} locked in. The council takes it from here.",
        "Switzer would approve: {quote:switzer_shoes} Shoes on, then.",
    ],
    "injection_seen": [
        "That listing had extra instructions hidden inside. I only read the race facts.",
        "Someone tucked orders into a race description. I'm a scout, not a soldier.",
    ],
}

L["marshal"] = {
    "guardian_blocked_injection": [
        "Course Marshal here. A race listing tried to give orders. Listings don't give orders. Blocked.",
        "Hidden text found in {race_name}'s description. Stripped like an old bib.",
        "Nice try. Instructions inside race descriptions get disqualified.",
        "Course cut detected. The hidden text is out; the real race data stays.",
    ],
    "user_injection": [
        "Asking the coaches to ignore their rules is a course cut. Blocked.",
        "A {weekly_km} km week is not a plan. The limit holds.",
        "The plan checker doesn't take bribes. Rules stay on.",
    ],
    "medical_red_flag": [
        "Hold up. '{symptom}' is a doctor question, not a coach question. Please see a doctor or physio before running.",
        "Pausing the council. Chest pain, fainting or sharp localized pain means medical care first. We'll be here after.",
    ],
    "budget_warning": [
        "Budget check: {cost} spent of {budget}. Coaches, keep it brief.",
        "Token tank at {pct}%. The council is talking fast to save you money.",
    ],
    "budget_stop": [
        "Budget cap reached at {cost}. Race stopped at the aid station. Here's what we finished.",
    ],
    "trap_called": [
        "Trap tool triggered: someone tried to register you for a race. Logged, not done.",
    ],
    "error": [
        "Course hiccup. We're re-routing around the pothole.",
        "Something tripped on a curb. Retrying once, then telling you plainly.",
    ],
}

LOADING = [
    "Lacing up the agents...", "Warming up the council...", "Doing strides...",
    "Refilling water bottles...", "Checking the course map...", "Pinning bibs...",
    "Counting gels...", "Foam rolling the database...", "Stretching the hamstrings of logic...",
    "Waiting for the gun...", "Reading the splits...", "Untangling earbuds...",
]

# Scripted multi-agent moments for the live council feed.
BANTER = {
    "veto_showdown": [
        ["wallbreaker", "Week {week}: {proposed_km} km. Character-building!"],
        ["taper", "VETO. That's a {spike_pct}% jump and HRV is down {hrv_drop} ms."],
        ["wallbreaker", "...I hate that you're right. Revising."],
        ["monk", "The veto stands. We rise gently. Approved at {weekly_km} km."],
    ],
    "goal_reality": [
        ["kickstarter", "{goal_time}? I love the guts."],
        ["taper", "Today's data says {predicted_time}. That's a big gap for {weeks} weeks."],
        ["wallbreaker", "Gaps are just hills lying down."],
        ["monk", "We aim at {goal_time} and celebrate every minute we take off {predicted_time}."],
    ],
    "gym_day_dispute": [
        ["guru", "Monday squats, Thursday single-leg work."],
        ["wallbreaker", "Thursday is tempo day, Guru."],
        ["taper", "Lift after the tempo, not before. Same day keeps the easy days easy."],
        ["monk", "Agreed. Hard days hard, easy days easy."],
    ],
    "race_pick": [
        ["whisperer", "Top pick: {race_name}, {weeks_until} weeks out."],
        ["kickstarter", "Does it have a downhill finish? Asking for my kick."],
        ["taper", "{weeks_until} weeks is enough for a full build and a taper."],
        ["monk", "Then {race_name} it is."],
    ],
    "sick_week_checkin": [
        ["monk", "You were sick. Thank you for resting."],
        ["taper", "We return at half volume, then build back over two weeks."],
        ["wallbreaker", "Rest IS training. I said it. Don't make me say it again."],
    ],
    "injection_blocked": [
        ["whisperer", "This listing has hidden instructions in it."],
        ["marshal", "Blocked. Race facts only."],
        ["monk", "Thank you, Marshal. We continue with the clean data."],
    ],
}

# ------------------------------------------------------------------ quote bank, round 2 (+10)
QUOTES += [
    {"id": "zatopek_faster", "author": "Emil Zátopek",
     "text": "Are you running out of breath? Go faster!",
     "context": "His life credo (Czech: 'Nemůžeš? Přidej!')",
     "source": "https://en.wikiquote.org/wiki/Emil_Z%C3%A1topek", "confidence": "documented"},
    {"id": "linden_one_more_mile", "author": "Des Linden",
     "text": "Just show up for one more mile. Show up for one more minute.",
     "context": "Her mantra while winning the 2018 Boston Marathon",
     "source": "https://www.npr.org/2018/04/17/603189901/runner-tells-herself-just-show-up-for-one-more-mile-and-wins-the-boston-marathon", "confidence": "news interview"},
    {"id": "linden_keep_showing_up", "author": "Des Linden",
     "text": "Keep showing up.",
     "context": "Her motto, trademarked after the 2018 Boston win",
     "source": "https://flotrack.org/articles/6193395-des-linden-trademarks-keep-showing-up-after-historic-boston-marathon-win", "confidence": "news"},
    {"id": "dauwalter_pain_cave", "author": "Courtney Dauwalter",
     "text": "No, go in! Dive right in, set up a lawn chair.",
     "context": "Asked if she avoids the pain cave (2018 Western States)",
     "source": "https://irunfar.com/courtney-dauwalter-2018-western-states-100-champion-interview", "confidence": "interview transcript"},
    {"id": "bannister_barrier", "author": "Roger Bannister",
     "text": "I think it had become a psychological barrier.",
     "context": "On the four-minute mile",
     "source": "https://gulfnews.com/amp/story/world%2Feurope%2Flife-in-quotes-1.2182557", "confidence": "news"},
    {"id": "meb_pride", "author": "Meb Keflezighi",
     "text": "Pain is temporary, pride is forever.",
     "context": "Telling the story of his father's walk to safety",
     "source": "https://www.inc.com/joe-desena/pain-is-temporary-pride-is-forever.html", "confidence": "interview"},
    {"id": "samuelson_balance", "author": "Joan Benoit Samuelson",
     "text": "You have to balance the mind, body, and spirit.",
     "context": "Bowdoin College interview, 2021",
     "source": "https://www.bowdoin.edu/news/2021/08/olympian-joan-benoit-samuelson-79-reflects-on-championship-mental-health-and-priorities.html", "confidence": "interview"},
    {"id": "pre_fatigue", "author": "Steve Prefontaine",
     "text": "Don't let fatigue make a coward out of you.",
     "context": "Widely shared Prefontaine line",
     "source": "https://www.runtothefinish.com/quotes-from-steve-prefontaine/", "confidence": "compilation"},
    {"id": "goggins_tired", "author": "David Goggins",
     "text": "I don't stop when I'm tired. I stop when I'm done.",
     "context": "From Can't Hurt Me",
     "source": "https://elevatesociety.com/quotes-from-cant-hurt-me/", "confidence": "book (compilation)"},
    {"id": "kipchoge_train", "author": "Eliud Kipchoge",
     "text": "Train well, focus, run clean and push your body.",
     "context": "Advice to young athletes",
     "source": "https://www.standardmedia.co.ke/evewoman/amp/living/article/2001464921/kipchoge-what-long-distance-running-can-teach-entrepreneurs", "confidence": "news"},
]

# Which quotes each character may drop into dialogue (others still appear on quote cards).
_extra = {
    "monk": ["kipchoge_train", "bannister_barrier", "linden_one_more_mile"],
    "wallbreaker": ["goggins_tired", "dauwalter_pain_cave", "zatopek_faster"],
    "taper": ["samuelson_balance"],
    "kickstarter": ["pre_fatigue", "meb_pride", "zatopek_faster"],
    "whisperer": ["linden_keep_showing_up"],
}
for p in PERSONAS:
    p["quotes"] += _extra.get(p["id"], [])

# New lines that use them.
L["monk"]["agent_started"] += [
    "Kipchoge's whole method fits in one line: {quote:kipchoge_train}",
]
L["monk"]["goal_check"] += [
    "Bannister said the four-minute mile was mental: {quote:bannister_barrier} So is {goal_time}.",
]
L["monk"]["checkin_received"] += [
    "Des Linden won Boston with a simple idea: {quote:linden_one_more_mile}",
]
L["wallbreaker"]["agent_started"] += [
    "Goggins has a rule about quitting: {quote:goggins_tired}",
    "Courtney Dauwalter's advice on the pain cave: {quote:dauwalter_pain_cave} I approve.",
]
L["wallbreaker"]["agent_thinking"] += [
    "Zátopek's training advice, word for word: {quote:zatopek_faster} Dr. Taper is twitching.",
]
L["taper"]["agent_started"] += [
    "Samuelson nailed it: {quote:samuelson_balance} Your training plan is one third of that.",
]
L["kickstarter"]["race_tips"] += [
    "Pre's rule for the last mile: {quote:pre_fatigue}",
    "Meb's motto for the final 5K: {quote:meb_pride}",
    "Zátopek, at the 40K mark: {quote:zatopek_faster} Only then.",
]
L["whisperer"]["race_selected"] += [
    "Des Linden's whole philosophy: {quote:linden_keep_showing_up} See you at the start line.",
]
QUOTE_CARD_POOL = [q["id"] for q in QUOTES]


PLACEHOLDERS = {
    "athlete", "race_name", "race_date", "weeks", "weeks_until", "pace", "pace_start", "weekly_km",
    "proposed_km", "spike_pct", "predicted_time", "goal_time", "peak_km", "long_run_km", "changes",
    "count", "round", "current_km", "acr", "sessions_done", "hrv_drop", "rhr_up", "long_share",
    "sleep_hours", "week", "cut_km", "pain", "fatigue", "taper_weeks", "distance", "kick_km",
    "splits_count", "gels", "gym_days", "radius", "zip", "distance_km", "city", "suggest_radius",
    "symptom", "cost", "budget", "pct",
}

BANNED = {"damn", "hell", "shit", "crap", "ass", "kill", "die"}


def validate():
    qids = {q["id"] for q in QUOTES}
    problems, n = [], 0
    for q in QUOTES:
        words = len(q["text"].replace("…", "").split())
        if words >= 15:
            problems.append(f"quote too long: {q['id']} ({words} words)")
    srcs = [q["source"] for q in QUOTES]
    if len(srcs) != len(set(srcs)):
        problems.append("duplicate quote source")

    def check(line, where):
        for tok in re.findall(r"\{([^}]+)\}", line):
            if tok.startswith("quote:"):
                if tok[6:] not in qids:
                    problems.append(f"{where}: unknown quote {tok}")
            elif tok not in PLACEHOLDERS:
                problems.append(f"{where}: unknown placeholder {{{tok}}}")
        words = set(re.findall(r"[a-z']+", line.lower()))
        if words & BANNED:
            problems.append(f"{where}: non-PG word {words & BANNED}")
        if len(re.sub(r"\{quote:[^}]+\}", "Q" * 60, line)) > 170:
            problems.append(f"{where}: too long")

    for agent, events in L.items():
        for ev, lines in events.items():
            for line in lines:
                n += 1
                check(line, f"{agent}.{ev}")
    for scene, steps in BANTER.items():
        for who, line in steps:
            n += 1
            assert who in L, who
            check(line, f"banter.{scene}")
    return problems, n


def main():
    problems, n = validate()
    if problems:
        print("\n".join(problems))
        raise SystemExit(1)
    out = {
        "version": "1.0",
        "render_rules": {
            "placeholder": "{name} is filled from run data; skip the line if any value is missing",
            "quote_token": "{quote:id} renders as the quote text in curly quotes; the line names the author",
            "selection": "pick randomly per event; avoid repeating any of the last 3 lines",
        },
        "personas": PERSONAS,
        "quotes": QUOTES,
        "lines": L,
        "banter": BANTER,
        "loading": LOADING,
        "quote_card_pool": QUOTE_CARD_POOL,
        "placeholders": sorted(PLACEHOLDERS),
    }
    with open("agent_voices.json", "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    per = {a: sum(len(v) for v in e.values()) for a, e in L.items()}
    print(f"OK: {n} lines + {len(LOADING)} loading lines, {len(QUOTES)} quotes, {len(BANTER)} banter scenes")
    print(per)


if __name__ == "__main__":
    main()
