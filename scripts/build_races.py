"""Build PaceLab's real race dataset: NYC + New England, 5K to marathon,
2026-10-24 to 2027-10-24. Outputs races_cache.json and races.csv.

date_status:
  confirmed  = official race/organizer page, or the race's own RunSignup listing
  reported   = third-party race calendar(s); not yet confirmed by the organizer
  estimated  = 2027 date projected from the race's usual weekend; not announced yet
Coordinates are approximate town/park centroids (for radius filtering only).
"""
import csv
import json
from datetime import date

KM = {"5K": 5.0, "4M": 6.44, "4.737M": 7.62, "5M": 8.05, "7M": 11.27, "7.8M": 12.55, "5.3M": 8.53, "8M": 12.87, "6.9M": 11.10,
      "10K": 10.0, "15K": 15.0, "10M": 16.09, "20K": 20.0, "Half": 21.1, "Marathon": 42.2}

NYRR = "https://www.nyrr.org/run/events-calendar"
RSU = "RunSignup listing"

# (name, date, status, city, state, zip, lat, lon, distances, price_usd, terrain, url, source, description)
R = [
    # ---------------- NYC ----------------
    ("TCS New York City Marathon", "2026-11-01", "confirmed", "New York", "NY", "10024", 40.772, -73.974, ["Marathon"], None, "road", "https://www.nyrr.org/tcsnycmarathon", "NYRR / first Sunday of November", "Five-borough World Marathon Major from Staten Island to Central Park; entry by lottery, 9+1, charity or time qualifier."),
    ("NYRR Cross Country Series #3", "2026-11-15", "reported", "Bronx", "NY", "10471", 40.889, -73.886, ["5K"], 21.15, "cross-country", NYRR, "gotrail.run", "Scored 5K cross-country race on Van Cortlandt Park trails."),
    ("NYRR Race to Deliver 4M", "2026-11-22", "reported", "New York", "NY", "10024", 40.782, -73.966, ["4M"], None, "road", NYRR, "runguides.com", "Pre-Thanksgiving 4-miler in Central Park benefiting meal delivery."),
    ("NYRR Ted Corbitt 15K", "2026-12-05", "reported", "New York", "NY", "10024", 40.782, -73.966, ["15K"], None, "road", NYRR, "endorphinsrunning.com, hdsports.org", "Late-season scored 15K on rolling Central Park loops; counts toward 9+1."),
    ("NYRR Midnight Run", "2026-12-31", "confirmed", "New York", "NY", "10024", 40.782, -73.966, ["4M"], None, "road", NYRR, "NYRR (held every New Year's Eve)", "4-miler that starts at midnight on New Year's Eve with fireworks in Central Park."),
    ("NYRR Joe Kleinerman 10K", "2027-01-09", "confirmed", "New York", "NY", "10024", 40.782, -73.966, ["10K"], 37.01, "road", "https://www.nyrr.org/races-and-events/2027/nyrr-joe-kleinerman-10k", "nyrr.org", "Season-opening Central Park 10K; sold out."),
    ("NYRR Fred Lebow Half", "2027-01-24", "confirmed", "New York", "NY", "10024", 40.782, -73.966, ["Half"], 47.58, "road", "https://www.nyrr.org/run/events-calendar", "nyrr.org", "Two loops of Central Park in winter; sold out."),
    ("NYRR Manhattan 10K", "2027-01-31", "confirmed", "New York", "NY", "10024", 40.782, -73.966, ["10K"], 47.58, "road", "https://www.nyrr.org/races-and-events/2027/nyrr-manhattan-10k", "nyrr.org", "Full hilly Central Park loop; opens the Five-Borough Series; sold out."),
    ("NYRR Al Gordon 5K", "2027-02-27", "confirmed", "Brooklyn", "NY", "11215", 40.660, -73.969, ["5K"], None, "road", "https://www.nyrr.org/run/race-registration-launch-timeline", "nyrr.org", "Winter 5K in Prospect Park; sold out."),
    ("United Airlines NYC Half", "2027-03-14", "reported", "Brooklyn", "NY", "11238", 40.666, -73.970, ["Half"], None, "road", NYRR, "projectpurple.org, mybestruns.com (one calendar lists Mar 21)", "Prospect Park to Central Park via the Manhattan Bridge and Times Square; lottery entry."),
    ("RBC Brooklyn Half", "2027-05-15", "estimated", "Brooklyn", "NY", "11238", 40.666, -73.970, ["Half"], None, "road", NYRR, "2026 edition was Sat May 16", "Largest US half marathon, from Prospect Park to the Coney Island boardwalk."),
    ("NYRR New York Mini 10K", "2027-06-05", "estimated", "New York", "NY", "10023", 40.770, -73.981, ["10K"], None, "road", NYRR, "2026 edition was Sat Jun 6", "Historic women-only 10K in Central Park."),
    ("Citizens Queens 10K", "2027-06-19", "estimated", "Queens", "NY", "11368", 40.740, -73.840, ["10K"], None, "road", NYRR, "2026 edition mid-June (NYRR pages list Jun 13 and Jun 20)", "Flat 10K in Flushing Meadows Corona Park; Five-Borough Series."),
    ("NYRR Grete's Great Gallop 10K", "2027-08-21", "estimated", "New York", "NY", "10024", 40.782, -73.966, ["10K"], None, "road", NYRR, "2026 edition was Sat Aug 22", "Late-summer Central Park 10K honoring Grete Waitz."),
    ("New Balance Bronx 10 Mile", "2027-09-18", "estimated", "Bronx", "NY", "10451", 40.827, -73.923, ["10M"], None, "road", NYRR, "2026 edition was Sat Sep 19", "Ten miles along the Grand Concourse; Five-Borough Series."),
    ("NYRR Staten Island Half", "2027-10-10", "estimated", "Staten Island", "NY", "10301", 40.643, -74.076, ["Half"], None, "road", NYRR, "2026 edition was Sun Oct 11", "Waterfront half closing the Five-Borough Series, about four weeks before the NYC Marathon."),

    # ---------------- Connecticut ----------------
    ("5K for Ballet", "2026-10-25", "confirmed", "East Hampton", "CT", "06424", 41.575, -72.502, ["5K"], 25.0, "road", "https://runsignup.com/Race/CT/EastHampton/5KForBallet", RSU, "Small charity 5K on country roads with a Halloween costume contest; registration closed Oct 24."),
    ("Milford Trick or Trot 5K", "2026-10-31", "confirmed", "Milford", "CT", "06460", 41.222, -73.057, ["5K"], 40.0, "road", "https://runsignup.com/Race/CT/Milford/10thAnnualMilford5KTrickorTrotRunWalk", RSU, "Halloween-morning 5K on the Milford waterfront benefiting a local shelter."),
    ("Colony Grill Hot Oil 5K", "2026-11-08", "confirmed", "Fairfield", "CT", "06824", 41.141, -73.264, ["5K"], 45.0, "road", "https://runsignup.com/Race/CT/Fairfield/ColonyGrillHotOil5K", RSU, "Popular Fairfield 5K starting at the Colony Grill; capped at about 2,100 runners."),
    ("Honor Our Veterans 5K", "2026-11-11", "confirmed", "Westport", "CT", "06880", 41.117, -73.335, ["5K"], 35.0, "road", "https://runsignup.com/Race/CT/Westport/HonorOurVeterans5k", RSU, "Veterans Day 5K at Sherwood Island State Park supporting veterans' housing."),
    ("A Good Run 5K", "2026-11-15", "confirmed", "New Haven", "CT", "06512", 41.285, -72.893, ["5K"], None, "road", "", RSU, "Flat, beginner-friendly shoreline 5K at East Shore Park benefiting Parkinson's research."),
    ("Manchester Road Race", "2026-11-26", "confirmed", "Manchester", "CT", "06040", 41.776, -72.521, ["4.737M"], None, "road", "https://www.manchesterroadrace.com/", "manchesterroadrace.com", "90th running of the classic Thanksgiving Day 4.737-mile race; elite field and big crowds."),
    ("Southbury Turkey Trot 5K", "2026-11-26", "confirmed", "Southbury", "CT", "06488", 41.481, -73.213, ["5K"], 30.0, "road", "https://runsignup.com/Race/CT/Southbury/SouthburyTurkeyTrot5K", RSU, "Flat, USATF-certified Thanksgiving 5K benefiting local food and fuel banks."),
    ("O'BRiley 5K Turkey Trot", "2026-11-26", "confirmed", "Collinsville", "CT", "06022", 41.813, -72.921, ["5K"], 25.0, "road", "https://runsignup.com/Race/CT/Collinsville/VIRTUAL9thAnnualOBRiley5KTurkeyTrot", RSU, "Thanksgiving 5K on the rail trail in historic Collinsville."),
    ("Jingle Bell Run Connecticut", "2026-12-05", "confirmed", "North Haven", "CT", "06473", 41.391, -72.860, ["5K"], 40.0, "road", "https://runsignup.com/Race/CT/NorthHaven/JingleBellRunMadisonCT", RSU, "Festive timed 5K for the Arthritis Foundation, 15 minutes from New Haven."),
    ("NIA Jingle Bell Run", "2026-12-05", "confirmed", "Trumbull", "CT", "06611", 41.243, -73.201, ["5K"], 32.0, "road", "https://runsignup.com/Race/CT/Trumbull/NIAJingleBellRun", RSU, "Rolling community 5K with a fast downhill final mile."),
    ("Norwalk Jingle Bell 5K", "2026-12-12", "confirmed", "Norwalk", "CT", "06851", 41.083, -73.395, ["5K"], 35.0, "road", "https://runsignup.com/Race/CT/Norwalk/NorwalkJingleBell5K", RSU, "Certified holiday 5K from Calf Pasture Beach."),
    ("Roseland Park Christmas Run", "2026-12-12", "confirmed", "Woodstock", "CT", "06281", 41.948, -71.974, ["5K", "5M"], 25.0, "road", "https://runsignup.com/Race/CT/Woodstock/RoselandParkChristmasRun", RSU, "Holiday 5K and 5-miler in the Quiet Corner; sold out last year."),
    ("Lake Waramaug Polar Bear Run", "2027-02-28", "confirmed", "Warren", "CT", "06777", 41.710, -73.373, ["7.8M"], 36.0, "road", "https://runsignup.com/Race/CT/Warren/LakeWaramaugPolarBearRun", RSU, "Winter 7.8-mile loop around Lake Waramaug for Guiding Eyes for the Blind."),
    ("Shamrock & Roll 5K", "2027-03-07", "confirmed", "New Haven", "CT", "06511", 41.311, -72.928, ["5K"], 30.0, "road", "https://runsignup.com/Race/CT/NewHaven/ShamRockRoll5K", RSU, "Flat downtown New Haven 5K starting at Toad's Place; capped at 1,500."),
    ("Savin Rock Marathon & Half", "2027-04-03", "reported", "West Haven", "CT", "06516", 41.259, -72.947, ["Half", "Marathon"], None, "road", "https://www.runguides.com/connecticut/runs/marathon/all", "runguides.com", "Flat shoreline marathon and half on the West Haven boardwalk, next door to New Haven."),
    ("Deer Lake 5 Mile Trail Run", "2027-04-25", "confirmed", "Killingworth", "CT", "06419", 41.380, -72.570, ["5M"], 30.0, "trail", "https://runsignup.com/Race/CT/Killingworth/DeerLakeTrailRun", RSU, "Technical 5-mile trail race with about 500 ft of climbing."),
    ("Granby Road Race", "2027-05-01", "confirmed", "Granby", "CT", "06035", 41.954, -72.789, ["5K", "10K"], 40.0, "road", "https://runsignup.com/Race/CT/Granby/GranbyRoadRace", RSU, "One of Connecticut's oldest road races; the 10K runs through the McLean Game Refuge."),
    ("Nutmeg State Marathon & Half", "2027-05-08", "reported", "Hartford", "CT", "06106", 41.764, -72.682, ["Half", "Marathon"], None, "road", "https://www.runguides.com/connecticut/runs/marathon/all", "runguides.com", "Small Boston-qualifier marathon weekend in Hartford."),
    ("Rossiter Run 5K", "2027-05-16", "confirmed", "Washington Depot", "CT", "06794", 41.637, -73.320, ["5K"], 25.0, "road", "https://runsignup.com/Race/CT/WashingtonDepot/RossiterRun", RSU, "Scenic 5K along the Shepaug River in Steep Rock Preserve."),
    ("Weston Memorial Day 5K", "2027-05-29", "confirmed", "Weston", "CT", "06883", 41.223, -73.379, ["5K"], 35.0, "road", "https://runsignup.com/Race/CT/Weston/WestonCTMemorialDay5KRoadRace", RSU, "USATF-certified tree-lined 5K with wave starts."),
    ("Saybrook Point 5K", "2027-08-21", "confirmed", "Old Saybrook", "CT", "06475", 41.284, -72.354, ["5K"], 30.0, "road", "https://runsignup.com/Race/CT/OldSaybrook/SaybrookPoint5KRoadRace", RSU, "Late-summer shoreline 5K funding local scholarships."),
    ("Faxon Law New Haven Road Race", "2027-09-06", "estimated", "New Haven", "CT", "06510", 41.308, -72.925, ["5K", "20K", "Half"], None, "road", "https://newhavenroadrace.org", "Held every Labor Day (Sep 6, 2027)", "Labor Day classic on the New Haven Green; hosts the USATF 20K championships."),
    ("Eversource Hartford Marathon", "2027-10-09", "estimated", "Hartford", "CT", "06106", 41.764, -72.682, ["5K", "Half", "Marathon"], None, "road", "https://www.hartfordmarathon.com/eversource-hartford-marathon/", "hdsports.org (2026 edition was Sat Oct 10)", "Connecticut's biggest race weekend; flat loop course and a Boston qualifier."),
    ("Brookfield Halloween 5K", "2027-10-17", "confirmed", "Brookfield", "CT", "06804", 41.482, -73.410, ["5K"], 30.0, "road", "https://runsignup.com/Race/CT/Brookfield/AnnualHalloween5KAndKidsFunRun", RSU, "35th annual certified, chip-timed costume 5K."),

    # ---------------- Massachusetts ----------------
    ("Boston Half", "2026-11-08", "reported", "Boston", "MA", "02121", 42.304, -71.087, ["Half"], None, "road", "https://www.baa.org/races/", "hdsports.org", "B.A.A.'s fall half through Franklin Park and the Emerald Necklace."),
    ("Hyannis Marathon & Half", "2027-02-28", "estimated", "Hyannis", "MA", "02601", 41.652, -70.283, ["Half", "Marathon"], None, "road", "https://www.hdsports.org/running/massachusetts-races-running-calendar", "hdsports.org (2026 edition was Mar 1)", "Late-winter Cape Cod marathon and half; a popular early-season BQ attempt."),
    ("New Bedford Half Marathon", "2027-03-14", "estimated", "New Bedford", "MA", "02740", 41.636, -70.934, ["Half"], None, "road", "https://www.hdsports.org/running/massachusetts-races-running-calendar", "hdsports.org (2026 edition was Mar 15)", "Classic hilly March half and a key Boston tune-up race."),
    ("Boston 5K", "2027-04-17", "reported", "Boston", "MA", "02116", 42.350, -71.078, ["5K"], None, "road", "https://baa.org/races/baa-5k", "marathons.com, wokeey.com", "Marathon-weekend 5K through Back Bay that crosses the Boston finish line."),
    ("Boston Marathon", "2027-04-19", "confirmed", "Boston", "MA", "02116", 42.350, -71.078, ["Marathon"], 270.0, "road", "https://www.baa.org/races/boston-marathon", "B.A.A. via boston25news.com, marathontours.com", "131st Boston Marathon, Hopkinton to Boylston Street; qualifier entry fee $270."),
    ("B.A.A. 10K", "2027-06-27", "estimated", "Boston", "MA", "02116", 42.355, -71.065, ["10K"], None, "road", "https://www.baa.org/races/", "Held in late June", "Summer 10K through Back Bay and Beacon Hill from Boston Common."),
    ("Falmouth Road Race", "2027-08-15", "reported", "Falmouth", "MA", "02540", 41.551, -70.615, ["7M"], None, "road", "https://give.brighamandwomens.org/falmouth-road-race/", "Mass General Brigham charity team page", "Iconic 7-mile seaside race on Cape Cod with an international elite field."),
    ("Cape Cod Marathon Weekend", "2027-10-10", "estimated", "Falmouth", "MA", "02540", 41.551, -70.615, ["5K", "Half", "Marathon"], None, "road", "https://www.runguides.com/boston/runs/marathon/all", "2026 marathon was Sun Oct 11", "Scenic coastal marathon, half and 5K out of Falmouth."),
    ("Baystate Marathon & Half", "2027-10-17", "estimated", "Lowell", "MA", "01852", 42.639, -71.315, ["Half", "Marathon"], None, "road", "https://www.runguides.com/boston/runs/marathon/all", "2026 edition was Sun Oct 18", "Flat, fast fall marathon popular with Boston qualifiers."),

    # ---------------- New Hampshire ----------------
    ("Manchester City Marathon", "2026-11-08", "reported", "Manchester", "NH", "03101", 42.991, -71.463, ["5K", "Half", "Marathon"], None, "road", "https://halfruns.com/races/new-hampshire/manchester-city-marathon-manchester-nh", "halfruns.com, runguides.com", "Rolling late-fall marathon, half and 5K in New Hampshire's largest city."),
    ("The Cheap Marathon & Half", "2027-04-03", "reported", "Derry", "NH", "03038", 42.881, -71.327, ["Half", "Marathon"], None, "road", "https://www.findtherun.com/races/manchester-center-vt/marathon", "findtherun.com, runguides.com", "No-frills, low-cost spring marathon and half."),
    ("Granite State Marathon", "2027-05-08", "reported", "Nashua", "NH", "03060", 42.765, -71.468, ["Half", "Marathon"], None, "road", "https://www.runguides.com/connecticut/runs/marathon/all", "runguides.com", "Spring marathon and half in southern New Hampshire."),

    # ---------------- Maine ----------------
    ("Maine Coast Marathon", "2027-05-02", "reported", "Wells", "ME", "04090", 43.322, -70.581, ["5K", "Half", "Marathon"], None, "road", "https://findmymarathon.com/calendar-state.php?state=Maine", "findmymarathon.com, runguides.com", "Flat coastal course from Kennebunk to Wells past marshes and beaches."),
    ("Sugarloaf Marathon & 15K", "2027-05-16", "confirmed", "Carrabassett Valley", "ME", "04947", 45.031, -70.313, ["15K", "Marathon"], 105.0, "road", "https://www.sugarloaf.com/events/marathon", "sugarloaf.com", "Net-downhill mountain-valley course, one of the fastest BQ marathons in the East; 1,500 cap."),
    ("Moosehead Marathon", "2027-06-13", "reported", "Greenville", "ME", "04441", 45.460, -69.590, ["Half", "Marathon"], None, "road", "https://findmymarathon.com/calendar-state.php?state=Maine", "findmymarathon.com, runguides.com", "Small lakeside marathon and half in the North Woods."),
    ("TD Beach to Beacon 10K", "2027-07-31", "reported", "Cape Elizabeth", "ME", "04107", 43.564, -70.200, ["10K"], None, "road", "https://en.wikipedia.org/wiki/Beach_to_Beacon_10K", "marathons.com (race is usually the first Saturday of August)", "Joan Benoit Samuelson's coastal 10K finishing at Portland Head Light; registration fills fast."),
    ("Maine Marathon & Half", "2027-10-03", "reported", "Portland", "ME", "04101", 43.659, -70.257, ["Half", "Marathon"], None, "road", "https://www.hdsports.org/running/maine-races-running-calendar", "hdsports.org", "Portland's fall marathon and half along Casco Bay."),
    ("Mount Desert Island Marathon", "2027-10-17", "estimated", "Bar Harbor", "ME", "04609", 44.388, -68.204, ["Half", "Marathon"], None, "road", "https://www.hdsports.org/running/maine-races-running-calendar", "hdsports.org", "Hilly, spectacular point-to-point course by Acadia National Park."),

    # ---------------- Vermont ----------------
    ("Vermont City Marathon", "2027-05-30", "reported", "Burlington", "VT", "05401", 44.476, -73.212, ["Marathon"], None, "road", "https://www.findtherun.com/races/manchester-center-vt/marathon", "findtherun.com", "Memorial Day weekend marathon along Lake Champlain."),

    # ---------------- Rhode Island ----------------
    ("Providence Rhode Races", "2027-05-02", "confirmed", "East Providence", "RI", "02914", 41.814, -71.370, ["5K", "Half", "Marathon"], 95.95, "road", "https://runsignup.com/Race/RI/EastProvidence/ProvidenceRhodeRaces", RSU, "Spring marathon and half through Providence and East Bay."),
    ("Newport Marathon & Half", "2027-10-10", "estimated", "Newport", "RI", "02840", 41.490, -71.313, ["Half", "Marathon"], None, "road", "https://www.runguides.com/boston/runs/marathon/all", "2026 edition was Sun Oct 11", "Ocean-view course around Newport's mansions and coastline."),
]

U = "https://runsignup.com/Race/"
R += [
    # ---------------- Massachusetts (RunSignup) ----------------
    ("Flutie 5K for Autism", "2026-10-25", "confirmed", "Natick", "MA", "01760", 42.283, -71.348, ["5K"], 32.0, "road", U + "MA/Natick/TheFlutie5KForAutism", RSU, "Large charity 5K with an adaptive division, supporting autism programs."),
    ("Lawrence Vietnam Memorial 5K", "2026-10-25", "confirmed", "Lawrence", "MA", "01843", 42.707, -71.163, ["5K"], 25.0, "road", U + "MA/Lawrence/25thAnnualLawrenceVietnamMemorialRunorWalk4MileRace", RSU, "Long-running memorial 5K honoring local Vietnam veterans."),
    ("Devin's Dash 5K", "2026-11-01", "confirmed", "Framingham", "MA", "01701", 42.279, -71.416, ["5K"], 35.0, "road", U + "MA/Framingham/DevinsDash", RSU, "10th-anniversary family 5K in Framingham."),
    ("Home of the Brave 5K", "2026-11-07", "confirmed", "Sturbridge", "MA", "01566", 42.108, -72.079, ["5K"], 25.0, "road", U + "MA/Sturbridge/HomeOfTheBrave5K", RSU, "Veterans fundraiser 5K with discounted entry for service members."),
    ("5 Miles Home", "2026-11-08", "confirmed", "Raynham", "MA", "02767", 41.949, -71.073, ["5M"], 20.0, "road", U + "MA/Raynham/5MilesHome", RSU, "Low-cost 5-mile road race south of Boston."),
    ("GFRC Busa Bushwhack Trail Races", "2026-11-15", "confirmed", "Framingham", "MA", "01701", 42.279, -71.416, ["5.3M", "10M"], 25.0, "trail", U + "MA/Framingham/AnnualGFRCBusaBushwhackTrailRaces", RSU, "Club-run 5.3- and 10-mile trail races through Callahan State Park."),
    ("Hopedale Gobble Wobble 5K", "2026-11-26", "confirmed", "Hopedale", "MA", "01747", 42.130, -71.541, ["5K"], 40.0, "road", U + "MA/Hopedale/HopedaleGobbleWobble", RSU, "Thanksgiving 5K organized by the town's fire and police departments."),
    ("Stuffing the Pantry 5K", "2026-11-26", "confirmed", "East Longmeadow", "MA", "01028", 42.065, -72.513, ["5K"], 35.0, "road", U + "MA/EastLongmeadow/StuffingthePantry5k", RSU, "Thanksgiving 5K collecting for the local food pantry."),
    ("Gobble Gobble Gobble 4 Miler", "2026-11-26", "confirmed", "Somerville", "MA", "02144", 42.388, -71.100, ["4M"], 40.0, "road", U + "MA/Somerville/25thAnnualGobbleGobbleGobble", RSU, "30th annual Thanksgiving 4-miler just outside Boston."),
    ("Dreamcatcher Classic Road Race", "2026-11-26", "confirmed", "Weymouth", "MA", "02190", 42.218, -70.941, ["5M"], 30.0, "road", U + "MA/Weymouth/DreamcatcherClassicRoadRace", RSU, "34th annual Thanksgiving 5-miler on the South Shore."),
    ("Middleton Turkey Trot 5K", "2026-11-26", "confirmed", "Middleton", "MA", "01949", 42.595, -71.016, ["5K"], 30.0, "road", U + "MA/Middleton/VirtualMiddletonTurkeyTrot", RSU, "North Shore Thanksgiving 5K."),
    ("Jingle Bell Run Central MA", "2026-12-05", "confirmed", "Worcester", "MA", "01604", 42.263, -71.802, ["5K"], 40.0, "road", U + "MA/Worcester/JingleBellRunCentralMass", RSU, "Festive timed 5K in Worcester for the Arthritis Foundation."),
    ("Resolution Run to Kick Cancer 5K", "2027-01-09", "confirmed", "Lexington", "MA", "02421", 42.447, -71.225, ["5K"], 40.0, "road", U + "MA/Lexington/ResolutionRunToKickCancer", RSU, "18th annual January 5K raising money for cancer research."),
    ("AAPI 5K Run 'n' Walk", "2027-05-09", "confirmed", "Lexington", "MA", "02421", 42.447, -71.225, ["5K"], 40.0, "road", U + "MA/Lexington/AAPI5kRunnWalkLexington", RSU, "Community 5K celebrating Asian American and Pacific Islander heritage."),
    ("Katie's Grace + Grit 5K", "2027-05-15", "confirmed", "Milton", "MA", "02186", 42.250, -71.066, ["5K"], 50.0, "road", U + "MA/Milton/KatiesGraceGrit5K", RSU, "Spring memorial 5K south of Boston."),
    ("5K for Justice", "2027-10-03", "confirmed", "Jamaica Plain", "MA", "02130", 42.310, -71.120, ["5K"], 25.0, "road", U + "MA/JamaicaPlain/5kforJustice", RSU, "Fall 5K around Jamaica Pond."),

    # ---------------- Rhode Island (RunSignup) ----------------
    ("Ocean State Rhode Races", "2026-10-25", "confirmed", "Narragansett", "RI", "02882", 41.450, -71.449, ["5K", "Half", "Marathon"], 55.0, "road", U + "RI/Narragansett/OceanState", RSU, "Coastal fall marathon, half and 5K along Narragansett Bay."),
    ("Burrillville Bronco 5K", "2026-11-01", "confirmed", "Harrisville", "RI", "02830", 41.966, -71.674, ["5K"], 35.0, "road", U + "RI/Harrisville/BurrillvilleBronco5k", RSU, "Small-town 5K with discounted entry for first responders and teachers."),
    ("Pawtuxet River 5K: Run of the Mills", "2026-11-07", "confirmed", "Coventry", "RI", "02816", 41.700, -71.683, ["5K"], 35.0, "road", U + "RI/Coventry/PawtuxetRiver5k", RSU, "5K past the historic mills along the Pawtuxet River."),
    ("Li'l Rhody Runaround Trail Run", "2026-11-15", "confirmed", "Charlestown", "RI", "02813", 41.383, -71.642, ["4M", "8M"], 30.0, "trail", U + "RI/Charlestown/LilRhodyRunaround", RSU, "4- and 8-mile trail races in southern Rhode Island."),
    ("I'd Rather Be Indoors 5K", "2026-11-22", "confirmed", "Bristol", "RI", "02809", 41.677, -71.266, ["5K"], 25.0, "road", U + "RI/Bristol/IdRatherBeInside5k", RSU, "Late-fall 5K on the Bristol waterfront."),
    ("NCYMCA Pie Run", "2026-11-26", "confirmed", "Middletown", "RI", "02842", 41.545, -71.291, ["5M"], 41.0, "road", U + "RI/Middletown/NCYMCAThanksgivingDayPieRun", RSU, "Thanksgiving 5-mile competitive run on Aquidneck Island."),
    ("Downtown Jingle 5K", "2026-12-13", "confirmed", "Pawtucket", "RI", "02860", 41.879, -71.383, ["5K"], 50.0, "road", U + "RI/Pawtucket/DowntownJingle5K", RSU, "Holiday 5K that includes entry to the RI Holiday Lights Festival."),
    ("Hangover Classic 5 Miler", "2027-01-01", "confirmed", "Bristol", "RI", "02809", 41.677, -71.266, ["5M"], 30.0, "road", U + "RI/Bristol/HangoverClassic", RSU, "New Year's Day 5-miler in Bristol."),
    ("Jameson Irish 5K", "2027-03-06", "confirmed", "Pawtucket", "RI", "02860", 41.879, -71.383, ["5K"], 34.0, "road", U + "RI/Pawtucket/GuinnessIrish5kRace1TourdePatrick", RSU, "First race of the March Tour de Patrick series."),
    ("Newport Rhode Races", "2027-04-17", "confirmed", "Newport", "RI", "02840", 41.490, -71.313, ["Half", "Marathon"], 84.95, "road", U + "RI/Newport/NewportRhodeRaces", RSU, "Spring marathon and half along Newport's Ocean Drive."),
    ("Independence Rhode Race", "2027-06-26", "confirmed", "Bristol", "RI", "02809", 41.677, -71.266, ["Half"], 55.0, "road", U + "RI/Bristol/IndependenceRhodeRace", RSU, "Summer half marathon in America's most patriotic small town."),

    # ---------------- New Hampshire (RunSignup) ----------------
    ("Donut Dash 5K", "2026-10-31", "confirmed", "Claremont", "NH", "03743", 43.377, -72.347, ["5K"], 25.0, "road", U + "NH/Claremont/DonutDashNHSneakerBrigade", RSU, "Fun 5K with donuts at the finish."),
    ("Dan Healy Memorial 5K", "2026-11-01", "confirmed", "Exeter", "NH", "03833", 42.981, -70.948, ["5K"], 35.0, "road", U + "NH/Exeter/DanHealyMemorial5K", RSU, "Memorial 5K in downtown Exeter."),
    ("MDS Run Walk Smile", "2026-11-07", "confirmed", "Keene", "NH", "03431", 42.934, -72.278, ["5K", "10K"], 32.0, "road", U + "NH/Keene/11thAnnualMDSRunWalkSmile", RSU, "5K and 10K Chapman Challenge supporting people with Down syndrome."),
    ("Novemberfest Race", "2026-11-22", "confirmed", "Nashua", "NH", "03060", 42.765, -71.468, ["4M"], 25.0, "road", U + "NH/Nashua/NovemberfestRace", RSU, "28th annual 4-miler for the Nashua Children's Home."),
    ("Bow Turkey Trot", "2026-11-26", "confirmed", "Bow", "NH", "03304", 43.132, -71.540, ["5K"], 40.0, "road", U + "NH/Bow/BowAthleticClubTurkeyTrot", RSU, "18th annual Thanksgiving 5K by the athletic club and police department."),
    ("Keene Wobble Gobble 4 Miler", "2026-11-26", "confirmed", "Keene", "NH", "03431", 42.934, -72.278, ["4M"], 30.0, "road", U + "NH/Keene/KeeneWobbleGobbleRun", RSU, "Thanksgiving 4-mile run through Keene."),
    ("Brookline Turkey Fun Run", "2026-11-26", "confirmed", "Brookline", "NH", "03033", 42.735, -71.658, ["5K"], 20.0, "road", U + "NH/Brookline/BrooklineTurkeyFunRunWalk", RSU, "Low-key Thanksgiving 5K fun run."),
    ("Jingle Bell Run New Hampshire", "2026-12-06", "confirmed", "Concord", "NH", "03302", 43.208, -71.538, ["5K"], 40.0, "road", U + "NH/Concord/JingleBellRunNewHampshire", RSU, "Festive timed 5K in the state capital."),
    ("Freeze Your Buns Winter 5K Series", "2027-01-03", "confirmed", "Nashua", "NH", "03062", 42.765, -71.468, ["5K"], 6.0, "road", U + "NH/Nashua/FreezeYourBuns", RSU, "Five-race winter 5K series; $6 per race or $25 for the series."),
    ("Fox Point Sunset Road Race", "2027-05-01", "confirmed", "Newington", "NH", "03801", 43.100, -70.834, ["5K", "5M"], 30.0, "road", U + "NH/Newington/FoxPoint5Miler", RSU, "Evening 5K and 5-miler on the Great Bay seacoast."),
    ("Cirque Series Cannon Mountain", "2027-06-12", "confirmed", "Franconia", "NH", "03580", 44.227, -71.748, ["6.9M"], 99.0, "trail", U + "NH/Franconia/CirqueSeriesCannonMountainNH", RSU, "Steep 6.9-mile mountain race up and down Cannon Mountain."),
    ("4 on the 4th Road Race", "2027-07-04", "confirmed", "Keene", "NH", "03431", 42.934, -72.278, ["4M"], 30.0, "road", U + "NH/Keene/4onthe4", RSU, "Independence Day 4-miler in Keene."),
    ("Baklava Blowout 5K", "2027-10-02", "confirmed", "Newport", "NH", "03773", 43.365, -72.173, ["5K"], 30.0, "road", U + "NH/Newport/BaklavaBlowout2026", RSU, "Small-town fall 5K with a baklava finish."),
    ("Friends of the Poor 5K", "2027-10-02", "confirmed", "New Ipswich", "NH", "03071", 42.748, -71.854, ["5K"], 25.0, "road", U + "NH/NewIpswich/Friendsofthepoor5k1", RSU, "Charity 5K supporting families in need."),
    ("Howl-O-Ween 5K", "2027-10-16", "confirmed", "Manchester", "NH", "03101", 42.991, -71.463, ["5K"], 45.0, "road", U + "NH/Manchester/HowlOWeek5K", RSU, "Halloween 5K benefiting the Animal Rescue League of NH."),
]


def build():
    races = []
    for i, (name, d, status, city, st, zp, lat, lon, dists, price, terrain, url, source, desc) in enumerate(R, 1):
        races.append({
            "id": f"r{i:03d}",
            "name": name,
            "date": d,
            "date_status": status,
            "city": city,
            "state": st,
            "zip": zp,
            "lat": lat,
            "lon": lon,
            "distances": dists,
            "distance_km": [KM[x] for x in dists],
            "price_usd": price,
            "terrain": terrain,
            "url": url,
            "source": source,
            "description": desc,
        })
    races.sort(key=lambda r: (r["date"], r["name"]))
    for i, r in enumerate(races, 1):
        r["id"] = f"r{i:03d}"
    return races


def main():
    races = build()
    lo, hi = date(2026, 10, 24), date(2027, 10, 24)
    bad = [r["name"] for r in races if not (lo <= date.fromisoformat(r["date"]) <= hi)]
    assert not bad, f"outside window: {bad}"
    assert all(5.0 <= km <= 42.2 for r in races for km in r["distance_km"])
    payload = {
        "generated": "2026-10-24",
        "window": {"start": "2026-10-24", "end": "2027-10-24"},
        "region": "NYC + Connecticut, Massachusetts, Rhode Island, New Hampshire, Vermont, Maine",
        "distance_range": "5K to marathon (no ultras)",
        "date_status_legend": {
            "confirmed": "official race or organizer page, or the race's own RunSignup listing",
            "reported": "third-party race calendar(s); not yet confirmed by the organizer",
            "estimated": "projected from the race's usual weekend; date not announced yet",
        },
        "coords_note": "lat/lon are approximate town or park centroids, good enough for radius search",
        "count": len(races),
        "races": races,
    }
    with open("races_cache.json", "w") as f:
        json.dump(payload, f, indent=2)
    cols = ["id", "name", "date", "date_status", "city", "state", "zip", "lat", "lon",
            "distances", "distance_km", "price_usd", "terrain", "url", "source", "description"]
    with open("races.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in races:
            row = dict(r)
            row["distances"] = "; ".join(r["distances"])
            row["distance_km"] = "; ".join(str(x) for x in r["distance_km"])
            w.writerow(row)
    from collections import Counter
    print(len(races), "races")
    print("by state:", dict(Counter(r["state"] for r in races)))
    print("by status:", dict(Counter(r["date_status"] for r in races)))


if __name__ == "__main__":
    main()
