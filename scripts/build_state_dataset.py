#!/usr/bin/env python3
"""Build a transparent state-level educational dataset from FEMA NRI county CSV data."""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

REQUIRED = {"STATE", "STATEABBRV", "POPULATION", "WFIR_EALT", "WFIR_RISKS"}

def number(value: str) -> float:
    try:
        return float((value or "").replace(",", ""))
    except ValueError:
        return 0.0

def band(score: float, values: list[float]) -> str:
    ordered = sorted(values)
    if not ordered:
        return "Not reported"
    low_cut = ordered[round((len(ordered) - 1) * .33)]
    high_cut = ordered[round((len(ordered) - 1) * .67)]
    return "High" if score >= high_cut else "Moderate" if score >= low_cut else "Low"

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source-version", required=True)
    parser.add_argument("--risk-data-as-of", required=True, help="Source release date shown in the dashboard.")
    args = parser.parse_args()
    with args.input.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"Missing FEMA NRI columns: {', '.join(sorted(missing))}")
        groups: dict[str, dict] = defaultdict(
            lambda: {"name": "", "abbr": "", "eal": 0.0, "weighted_score_sum": 0.0, "population": 0.0, "count": 0}
        )
        for row in reader:
            abbr = (row.get("STATEABBRV") or "").strip()
            if not abbr or abbr in {"PR", "VI", "GU", "AS", "MP"}:
                continue
            group = groups[abbr]
            group["name"] = (row.get("STATE") or abbr).title()
            group["abbr"] = abbr
            group["eal"] += number(row.get("WFIR_EALT", ""))
            population = number(row.get("POPULATION", ""))
            group["weighted_score_sum"] += number(row.get("WFIR_RISKS", "")) * population
            group["population"] += population
            group["count"] += 1
    scores = [item["weighted_score_sum"] / item["population"] for item in groups.values() if item["population"]]
    states = []
    for item in groups.values():
        if not item["population"]:
            continue
        score = item["weighted_score_sum"] / item["population"]
        states.append({
            "name": item["name"], "abbr": item["abbr"], "risk_band": band(score, scores),
            "wildfire_risk_score": round(score, 3), "wildfire_eal_total": f"${item['eal']:,.0f}",
            "counties_included": item["count"],
            "notes": "Population-weighted aggregation of county-level FEMA NRI wildfire relative-risk scores; not a real-time forecast."
        })
    states.sort(key=lambda item: item["name"])
    output = {"metadata": {"status": "verified", "title": "Wildfire Readiness Atlas", "source": args.source_version, "risk_data_as_of": args.risk_data_as_of, "updated_at": str(date.today()), "aggregation_method": "County FEMA wildfire relative-risk scores, weighted by FEMA county population.", "disclaimer": "Educational use only; do not use for emergency decisions."}, "states": states}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {len(states)} jurisdictions to {args.output}")

if __name__ == "__main__":
    main()
