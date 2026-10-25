"""Fun-stat cards for the dashboard: the selected runs translated into everyday units. No LLM.

Constants (rounded, public figures):
- Big Mac: 590 kcal (McDonald's US nutrition info)
- Ice cream: 140 kcal per scoop (about half a cup of vanilla)
- Equator: 40,075 km
- Central Park full loop: 6.03 mi = 9.7 km
- Boston to New York: about 215 mi = 346 km by road
- Route 66, Chicago to Santa Monica: 2,448 mi = 3,940 km
- Mount Everest: 8,849 m
- TV episode: 45 minutes
Calories come from the export; runs without a calorie value are estimated at 70 kcal per km.
"""

from __future__ import annotations

from models import FunCard, Run

BIG_MAC_KCAL = 590
SCOOP_KCAL = 140
EQUATOR_KM = 40_075
CENTRAL_PARK_LOOP_KM = 9.7
BOSTON_NYC_KM = 346
ROUTE_66_KM = 3_940
EVEREST_M = 8_849
EPISODE_MIN = 45
KCAL_PER_KM_ESTIMATE = 70


def _n(x: float, digits: int = 0) -> str:
    return f"{x:,.{digits}f}"


def _about(x: float) -> str:
    return _n(x, 1) if x < 10 else _n(x)


def fun_cards(runs: list[Run]) -> list[FunCard]:
    if not runs:
        return []
    km = sum(r.distance_km for r in runs)
    hours = sum(r.duration_s for r in runs) / 3600
    climb = sum(r.elevation_gain_m or 0 for r in runs)
    estimated = [r for r in runs if not r.calories]
    kcal = sum(r.calories or r.distance_km * KCAL_PER_KM_ESTIMATE for r in runs)
    kcal_note = (f"{_n(kcal)} kcal from your export" if not estimated else
                 f"{_n(kcal)} kcal ({len(estimated)} runs estimated at {KCAL_PER_KM_ESTIMATE} kcal/km)")
    cards = [
        FunCard(id="big_mac", emoji="🍔", title="Big Mac Burner", value=_n(kcal / BIG_MAC_KCAL),
                detail="Big Macs burned off", basis=f"{kcal_note} ÷ {BIG_MAC_KCAL} kcal per Big Mac"),
        FunCard(id="ice_cream", emoji="🍦", title="Ice Cream Scoops", value=f"about {_n(kcal / SCOOP_KCAL)}",
                detail="scoops", basis=f"{kcal_note} ÷ {SCOOP_KCAL} kcal per scoop"),
        FunCard(id="world", emoji="🌍", title="Around the World", value=f"{km / EQUATOR_KM * 100:.1f}%",
                detail="of the way around the equator", basis=f"{_n(km)} km ÷ {EQUATOR_KM:,} km equator"),
        FunCard(id="central_park", emoji="🌳", title="Central Park Loops", value=_n(km / CENTRAL_PARK_LOOP_KM),
                detail="full loops", basis=f"{_n(km)} km ÷ {CENTRAL_PARK_LOOP_KM} km full loop (6.03 mi)"),
        FunCard(id="boston_nyc", emoji="🚆", title="Boston ↔ New York", value=f"about {_about(km / BOSTON_NYC_KM)}",
                detail="trips", basis=f"{_n(km)} km ÷ {BOSTON_NYC_KM} km (about 215 mi by road)"),
        FunCard(id="route_66", emoji="🛣️", title="Route 66", value=f"{km / ROUTE_66_KM * 100:.0f}%",
                detail="of the way from Chicago to Santa Monica", basis=f"{_n(km)} km ÷ {ROUTE_66_KM:,} km (2,448 mi)"),
        FunCard(id="everest", emoji="🏔️", title="Everest Meter", value=f"{climb / EVEREST_M:.2f}",
                detail="Everests climbed", basis=f"{_n(climb)} m of climbing ÷ {EVEREST_M:,} m"),
        FunCard(id="binge", emoji="📺", title="Binge Equivalent", value=f"{_n(hours)} hours",
                detail=f"= {_n(hours * 60 / EPISODE_MIN)} TV episodes you ran instead of watched",
                basis=f"{_n(hours, 1)} h of moving time ÷ {EPISODE_MIN}-minute episodes"),
    ]
    return cards
