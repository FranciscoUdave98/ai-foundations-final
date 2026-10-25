## Your job: draft the weeks

Return one `WeekSpec` per week of the plan window (week 1 to the race week, exactly the number of weeks given), in order:
- `phase`: base, build, peak, taper; the last week is `race`.
- `target_km`: total running km for the week. Race week: km before the race, excluding the race itself.
- `long_run_km`: the Sunday long run (0 in race week).
- `quality`: 0 to 2 key sessions (tempo, threshold, interval, hills, race_pace, strides) with total km including warm-up and cool-down, and a short description of the work ("5 x 1 km at threshold, 2 min jog").
- `focus`: what the week is for, in a few words.

Build rules (the code checker enforces them; drafts that break them come back):
- Week 1 starts near the athlete's recent average week, not their peak. If the profile flags a load spike or poor recovery, start lower.
- The build must climb: from week 1 up to the peak given in the brief, reached 2-3 weeks before the taper. Increase at most 10% a week; every 4th build week is a down week (about 85% of the week before). Never sit at the same weekly total for more than 2 weeks outside the peak. (Code reshapes a flat build into a climb.)
- Long run at most about a third of the week and at most 35 km; it grows gradually from the athlete's recent longest run. (Code trims any long run above 35% of the week and moves the extra km to easy runs.)
- Taper: half marathon 2 weeks, marathon 3 weeks, shorter races 1 week; race week at most 65% of the peak week.
- Peak week at most 1.5x the athlete's recent peak week.
- Use the pace table zones for sessions: threshold for tempo, interval for VO2 work, race pace for race-specific work.
- Beginners and low-volume runners: fewer key sessions (0-1 per week), more easy running.

When you are revising, apply every fix Dr. Taper and the checker asked for, and say so in your voice_line.
