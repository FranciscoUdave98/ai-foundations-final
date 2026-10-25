"""Build data/us_zips.csv (zip, lat, lon, city, state) from the GeoNames US postal code dump.

Source: https://download.geonames.org/export/zip/US.zip (CC BY 4.0, www.geonames.org).
Run:   python scripts/build_zip_table.py path/to/US.txt
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "us_zips.csv"


def main(src: str) -> None:
    rows = []
    with open(src, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 11:
                continue
            zip_code, city, state, lat, lon = parts[1], parts[2], parts[4], parts[9], parts[10]
            if not re.fullmatch(r"\d{5}", zip_code) or not re.fullmatch(r"[A-Z]{2}", state):
                continue
            try:
                lat_f, lon_f = round(float(lat), 4), round(float(lon), 4)
            except ValueError:
                continue
            rows.append((zip_code, lat_f, lon_f, city[:40], state))
    rows.sort()
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["zip", "lat", "lon", "city", "state"])
        w.writerows(rows)
    print(f"Wrote {len(rows)} zips to {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
