#!/usr/bin/env python3
"""Join FEMA NRI county wildfire fields to official Census California boundaries."""
from __future__ import annotations

import csv
import json
from pathlib import Path

from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/nri_counties.csv"
BOUNDARIES = ROOT / "data/california-counties.geojson"
OUTPUT = ROOT / "app/data/california-county-wildfire-risk.geojson"

with RAW.open(encoding="utf-8-sig", newline="") as file:
    source = {
        row["STCOFIPS"]: row
        for row in csv.DictReader(file)
        if row.get("STATEABBRV") == "CA"
    }

with BOUNDARIES.open(encoding="utf-8") as file:
    layer = json.load(file)

scores = [float(row["WFIR_RISKS"]) for row in source.values()]
low_cut = sorted(scores)[round((len(scores) - 1) * .33)]
high_cut = sorted(scores)[round((len(scores) - 1) * .67)]

for feature in layer["features"]:
    row = source.get(feature["properties"]["GEOID"])
    if row is None:
        raise SystemExit(f"No FEMA record for Census GEOID {feature['properties']['GEOID']}")
    score = float(row["WFIR_RISKS"])
    feature["properties"].update({
        "wildfire_risk_score": round(score, 3),
        "wildfire_eal_total": round(float(row["WFIR_EALT"]), 2),
        "risk_band": "High" if score >= high_cut else "Moderate" if score >= low_cut else "Low",
        "source": "FEMA National Risk Index v1.20 (December 2025)"
    })
    # The original TIGERweb geometry is excellent for GIS analysis but too
    # detailed for a browser learning map. Preserve county outlines while
    # reducing the transfer from roughly 10 MB to a fast-loading asset.
    geometry = shape(feature["geometry"]).simplify(0.003, preserve_topology=True)
    feature["geometry"] = mapping(geometry)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(layer, separators=(",", ":")), encoding="utf-8")
print(f"Wrote {len(layer['features'])} California counties to {OUTPUT}")
