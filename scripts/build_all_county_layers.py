#!/usr/bin/env python3
"""Create small per-state county risk layers from FEMA NRI and Census geometry."""
from __future__ import annotations

import csv
import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parents[1]
FEMA = ROOT / "data/raw/nri_counties.csv"
BOUNDARIES = ROOT / "data/cb_2024_us_county_500k.zip"
OUTPUT_DIR = ROOT / "app/data/counties"


def risk_band(score: float, scores: list[float]) -> str:
    ordered = sorted(scores)
    low_cut = ordered[round((len(ordered) - 1) * 0.33)]
    high_cut = ordered[round((len(ordered) - 1) * 0.67)]
    return "High" if score >= high_cut else "Moderate" if score >= low_cut else "Low"


with FEMA.open(encoding="utf-8-sig", newline="") as file:
    fema_rows = list(csv.DictReader(file))

fema_by_fips = {row["STCOFIPS"]: row for row in fema_rows if row.get("WFIR_RISKS")}
dashboard_states = {row["STATEABBRV"] for row in fema_rows if row.get("STATEABBRV")}
boundaries = gpd.read_file(BOUNDARIES)
boundaries = boundaries[boundaries["STUSPS"].isin(dashboard_states)]
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

for state_abbr, county_frame in boundaries.groupby("STUSPS"):
    records = []
    source_rows = [fema_by_fips.get(geoid) for geoid in county_frame["GEOID"]]
    source_rows = [row for row in source_rows if row is not None]
    if not source_rows:
        continue
    scores = [float(row["WFIR_RISKS"]) for row in source_rows]
    for _, county in county_frame.iterrows():
        row = fema_by_fips.get(county["GEOID"])
        if row is None:
            continue
        score = float(row["WFIR_RISKS"])
        # 1:500k Census geometry is already generalized; one final small
        # simplification keeps individual browser downloads responsive.
        geometry = county.geometry.simplify(0.003, preserve_topology=True)
        records.append({
            "type": "Feature",
            "properties": {
                "GEOID": county["GEOID"],
                "NAME": county["NAME"],
                "state": state_abbr,
                "wildfire_risk_score": round(score, 3),
                "wildfire_eal_total": round(float(row["WFIR_EALT"] or 0), 2),
                "risk_band": risk_band(score, scores),
                "source": "FEMA National Risk Index v1.20 (December 2025)",
            },
            "geometry": mapping(geometry),
        })
    payload = {
        "type": "FeatureCollection",
        "metadata": {
            "state": state_abbr,
            "boundary_source": "U.S. Census Bureau 2024 Cartographic Boundary File (counties, 1:500,000)",
            "risk_source": "FEMA National Risk Index v1.20 (December 2025)",
        },
        "features": records,
    }
    (OUTPUT_DIR / f"{state_abbr}.geojson").write_text(
        json.dumps(payload, separators=(",", ":")), encoding="utf-8"
    )
    print(f"{state_abbr}: {len(records)} county records")

