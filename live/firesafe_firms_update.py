#!/usr/bin/env python3
"""Fetch recent NASA FIRMS satellite detections and publish a safe public GeoJSON cache.

The FIRMS key is read only from /etc/firesafe-atlas/firms.env and is never copied
into the web directory or sent to browsers.
"""
import csv
import io
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

SECRETS_FILE = Path("/etc/firesafe-atlas/firms.env")
OUTPUT = Path("/var/www/firesafe-atlas/data/live/firms.geojson")
STATUS = Path("/var/www/firesafe-atlas/data/live/firms-status.json")
SOURCE = "VIIRS_NOAA20_NRT"
# Lower 48, Alaska, and Hawaii. The country endpoint is unavailable for large
# countries, so observations are later filtered to the site's U.S. counties.
AREAS = ("-125,24,-66,50", "-171,51,-129,72", "-161,18,-154,23")
COUNTY_LAYER_DIR = Path("/var/www/firesafe-atlas/data/counties")


def read_key():
    for line in SECRETS_FILE.read_text().splitlines():
        if line.startswith("FIRMS_MAP_KEY="):
            return line.partition("=")[2].strip()
    raise RuntimeError("FIRMS_MAP_KEY is missing from /etc/firesafe-atlas/firms.env")


def fetch_csv(map_key, area):
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{SOURCE}/{area}/1"
    request = Request(url, headers={"User-Agent": "FireSafeAtlas/1.0 (educational project)"})
    with urlopen(request, timeout=90) as response:
        return list(csv.DictReader(io.TextIOWrapper(response, encoding="utf-8", errors="replace")))


def as_float(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def to_feature(row):
    confidence = str(row.get("confidence", "")).lower()
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [as_float(row.get("longitude")), as_float(row.get("latitude"))]},
        "properties": {
            "acquired_date": row.get("acq_date"),
            "acquired_time_utc": str(row.get("acq_time", "")).zfill(4),
            "confidence": confidence,
            "frp": as_float(row.get("frp")),
            "satellite": row.get("satellite"),
            "instrument": row.get("instrument"),
        },
    }


def rings(geometry):
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    return [ring for polygon in geometry["coordinates"] for ring in polygon]


def point_in_ring(longitude, latitude, ring):
    inside = False
    previous_x, previous_y = ring[-1]
    for x, y in ring:
        if (y > latitude) != (previous_y > latitude) and longitude < (previous_x - x) * (latitude - y) / (previous_y - y) + x:
            inside = not inside
        previous_x, previous_y = x, y
    return inside


def load_county_shapes():
    shapes = []
    for layer_file in COUNTY_LAYER_DIR.glob("*.geojson"):
        if layer_file.name.startswith("._"):
            continue
        for feature in json.loads(layer_file.read_text(encoding="utf-8", errors="replace"))["features"]:
            feature_rings = rings(feature["geometry"])
            points = [point for ring in feature_rings for point in ring]
            longitudes, latitudes = zip(*points)
            shapes.append((min(longitudes), min(latitudes), max(longitudes), max(latitudes), feature_rings))
    return shapes


def within_us_counties(longitude, latitude, county_shapes):
    for west, south, east, north, feature_rings in county_shapes:
        if west <= longitude <= east and south <= latitude <= north and any(point_in_ring(longitude, latitude, ring) for ring in feature_rings):
            return True
    return False


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as temp:
        json.dump(data, temp, separators=(",", ":"))
        temp.write("\n")
        temp_name = temp.name
    os.replace(temp_name, path)
    # The web server needs to read only the processed cache. The secret remains
    # in /etc/firesafe-atlas/firms.env with mode 600.
    os.chmod(path, 0o644)


def main():
    map_key = read_key()
    rows = [row for area in AREAS for row in fetch_csv(map_key, area)]
    county_shapes = load_county_shapes()
    # FIRMS classifies lower-confidence observations as "l". Keep normal/high detections
    # so this public educational view remains usable during active periods.
    features = [to_feature(row) for row in rows if str(row.get("confidence", "")).lower() != "l" and within_us_counties(as_float(row.get("longitude")), as_float(row.get("latitude")), county_shapes)]
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "generated_at": now,
            "source": "NASA FIRMS VIIRS NOAA-20 Near Real-Time",
            "window": "Most recent 24 hours",
            "disclaimer": "Satellite heat detections are not confirmed fire perimeters, evacuation orders, or emergency guidance.",
        },
        "features": features,
    }
    atomic_write(OUTPUT, collection)
    atomic_write(STATUS, {"status": "ok", "updated_at": now, "detection_count": len(features), "source": collection["metadata"]["source"]})
    print(f"Published {len(features)} FIRMS detections at {now}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FIRMS update failed: {error}", file=sys.stderr)
        sys.exit(1)
