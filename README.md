# Wildfire Readiness Atlas

An educational U.S. dashboard that helps students, families, and educators interpret wildfire-risk information and turn it into practical preparedness questions. It is **not** a fire prediction system and must not be used for evacuation or emergency-response decisions.

## What is included

- A static, accessible state-level dashboard (`app/`) that can run on GitHub Pages or a small VM.
- A source-controlled data pipeline (`scripts/build_state_dataset.py`) that aggregates FEMA National Risk Index county data to states.
- A Kaggle-ready notebook (`notebooks/wildfire_readiness_atlas.ipynb`) for building the public dashboard dataset without publishing a secret key.
- A data manifest with the required source, field, license, and use restrictions (`docs/data-sources.md`).
- Docker and Nginx deployment files for an always-on VM (`deploy/`).

## Important data rule

The dashboard intentionally begins in **data-not-loaded** mode. Do not insert estimated state scores by hand. Run the pipeline from an official FEMA National Risk Index county export, inspect the output, and record the source version and date before publishing.

## Local preview

```bash
cd app
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Data build

1. Download the current FEMA National Risk Index county CSV from the FEMA NRI data portal.
2. Put it in `data/raw/` with the name `nri_counties.csv`.
3. Run:

```bash
python3 scripts/build_state_dataset.py \
  --input data/raw/nri_counties.csv \
  --output app/data/state-wildfire-risk.json \
  --source-version "FEMA NRI <version/date>" \
  --risk-data-as-of "<source release date>"
```

4. Review the output and then deploy the static `app/` folder.

The Kaggle notebook performs these same steps after the official FEMA CSV is attached as a Kaggle input dataset.

## Deployment

For this static first version, GitHub Pages is simpler than a VM. If you want the learning experience of an always-on server, use the Docker/Nginx files in `deploy/` on an Oracle Cloud Always Free Ubuntu VM. See `deploy/README.md`.
