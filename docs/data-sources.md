# Data sources and responsible use

## Publication dataset (required)

| Source | Purpose | Fields used | Refresh | Notes |
| --- | --- | --- | --- | --- |
| FEMA National Risk Index (county-level) | Statewide wildfire-risk context | `STATE`, `STATEABBRV`, `POPULATION`, `WFIR_EALT`, `WFIR_RISKS`, `SOVI_SCORE`, `RESL_SCORE` | When FEMA releases a new version | State relative-risk scores use a county-population-weighted mean; retain source version and date. FEMA's NRI describes risk context, not a real-time incident forecast. |
| U.S. Census state boundaries | Map geometry, if a true polygon map is added | state name and FIPS | Annual | Use Census cartographic boundary files; do not use GADM in the public dashboard without a separate license review. |
| NASA FIRMS | Optional current satellite hotspot layer | location, acquisition time, confidence, FRP | Daily or more often | Requires an authorized MAP_KEY for the Area API; never commit keys or run this layer as emergency guidance. |
| AirNow | Optional air-quality education layer | AQI, category, timestamp | Hourly | Show source time and the official AirNow link; not an exposure or health diagnosis tool. |
| CDC/ATSDR Social Vulnerability Index | Optional equity context | SVI theme/overall values | At source release | Never present vulnerability as an individual or community deficit. Use it to ask where accessible communication and support may be needed. |

## Dashboard score

The first release should show **two separate measures**, not one invented "safety score":

1. FEMA NRI wildfire risk rating/relative score, aggregated to each state with county population weights.
2. An educational readiness checklist selected by a student, school, or family.

The dashboard must not imply that a state is safe because a readiness checklist is complete. Scores are grouped only after the underlying official source is imported and verified.

## Equity and youth-literacy framing

Every state panel includes these questions:

- What does this map show, and what does it not show?
- Which families may need smoke-safe spaces, language access, transportation support, or disability-accessible evacuation information?
- Which local emergency-management, school, and health resources should be checked before an emergency?

## Pre-publication checklist

- [ ] FEMA source version, download date, and field definitions recorded.
- [ ] All 50 states and DC have valid output; territories are either included with appropriate data or explicitly excluded.
- [ ] No data gap is silently converted into a low-risk value.
- [ ] Map and page include the emergency-use disclaimer and links to official local alerts.
- [ ] A second reviewer checks the source log and dashboard labels.
