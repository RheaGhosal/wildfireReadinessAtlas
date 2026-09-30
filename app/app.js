const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const TILE_POSITIONS = {
  AK:[1,8], HI:[2,9], WA:[2,1], OR:[3,1], CA:[4,1], ID:[2,2], NV:[3,2], AZ:[4,2],
  MT:[2,3], WY:[3,3], UT:[4,3], CO:[4,4], NM:[5,4], ND:[2,5], SD:[3,5], NE:[4,5],
  KS:[5,5], OK:[6,5], TX:[7,5], MN:[2,6], IA:[3,6], MO:[4,6], AR:[5,6], LA:[6,6],
  WI:[2,7], IL:[3,7], KY:[4,7], TN:[5,7], MS:[6,7], MI:[2,8], IN:[3,8], OH:[3,9],
  WV:[4,9], VA:[5,9], NC:[6,9], SC:[6,8], GA:[7,8], FL:[8,8], PA:[3,10], NY:[2,10],
  VT:[1,11], NH:[2,11], ME:[1,12], MA:[3,11], CT:[4,11], RI:[4,12], NJ:[4,10],
  DE:[5,10], MD:[5,11], DC:[5,12], AL:[7,7]
};
const map = document.querySelector("#state-map");
const concentrationList = document.querySelector("#concentration-list");
const detailName = document.querySelector("#detail-name");
const detailDescription = document.querySelector("#detail-description");
const detailMetrics = document.querySelector("#detail-metrics");
const countyPanel = document.querySelector("#county-panel");
const countyMap = document.querySelector("#county-map");
const countyTooltip = document.querySelector("#county-tooltip");
const closeCounty = document.querySelector("#close-county");
const countyEyebrow = document.querySelector("#county-eyebrow");
const countyTitle = document.querySelector("#county-title");
const countyIntro = document.querySelector("#county-intro");
const stateLoading = document.querySelector("#state-loading");
const loadingLabel = document.querySelector("#loading-label");
const loadingPercent = document.querySelector("#loading-percent");
const loadingBar = document.querySelector("#loading-bar");
const loadingTrack = document.querySelector(".loading-track");
const countyLayerCache = new Map();
const countyLoading = new Map();
let loadingTimer = null;
let activeStateAbbr = null;
let liveAlertController = null;
let liveAlertTimer = null;
let activeState = null;
let latestCountyLayer = null;
let latestCountyBounds = null;
let firmsTimer = null;

function openAtMap() {
  const panel = document.querySelector(".map-panel");
  if (!panel) return;
  window.scrollTo({ top: Math.max(0, panel.getBoundingClientRect().top + window.scrollY - 12), behavior: "auto" });
}

async function loadFirmsStatus() {
  const badge = document.querySelector("#firms-live-badge");
  try {
    const response = await fetch(`data/live/firms-status.json?cache=${Date.now()}`);
    if (!response.ok) throw new Error(`FIRMS status request failed (${response.status})`);
    const data = await response.json();
    const count = Number(data.detection_count) || 0;
    const updated = data.updated_at ? displayDate(data.updated_at, { dateStyle: "medium", timeStyle: "short" }) : "time unavailable";
    badge.innerHTML = `<span></span> LIVE NASA FIRMS · Updated ${updated} · ${count} retained U.S. heat detection${count === 1 ? "" : "s"} in the last 24 hours`;
  } catch (error) {
    badge.classList.add("is-unavailable");
    badge.innerHTML = "<span></span> NASA FIRMS live feed temporarily unavailable";
  }
}

function displayDate(value, options = { dateStyle: "medium" }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", options).format(date);
}

function riskColor(score, min, max) {
  const ratio = Math.max(0, Math.min(1, (score - min) / Math.max(1, max - min)));
  return `hsl(${112 - ratio * 105} 59% ${88 - ratio * 31}%)`;
}

function renderStateTiles(states, enabled) {
  map.innerHTML = "";
  const byAbbr = new Map(states.map((state) => [state.abbr, state]));
  const scores = states.map((state) => Number(state.wildfire_risk_score)).filter(Number.isFinite);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 1);
  STATES.forEach((abbr) => {
    const state = byAbbr.get(abbr);
    const button = document.createElement("button");
    button.className = "state-button";
    button.textContent = abbr;
    button.type = "button";
    const [row, column] = TILE_POSITIONS[abbr] || [9, 12];
    button.style.gridRow = row;
    button.style.gridColumn = column;
    button.setAttribute("aria-label", state ? `${state.name}: ${state.risk_band} wildfire risk context` : `${abbr}: data not loaded`);
    if (!enabled || !state) button.disabled = true;
    if (state) {
      button.dataset.band = state.risk_band;
      button.style.setProperty("--risk-color", riskColor(Number(state.wildfire_risk_score), min, max));
    }
    button.addEventListener("click", () => showState(state));
    map.append(button);
  });
}

function renderConcentration(states, enabled) {
  concentrationList.innerHTML = "";
  if (!enabled) {
    concentrationList.innerHTML = '<p class="empty-chart">The ranked comparison appears after a verified source import.</p>';
    return;
  }
  const ranked = [...states].sort((a, b) => Number(b.wildfire_risk_score) - Number(a.wildfire_risk_score)).slice(0, 12);
  const max = Math.max(...ranked.map((state) => Number(state.wildfire_risk_score)));
  ranked.forEach((state, index) => {
    const score = Number(state.wildfire_risk_score).toFixed(1);
    const row = document.createElement("button");
    row.className = "concentration-row";
    row.type = "button";
    row.setAttribute("aria-label", `${index + 1}. ${state.name}, population-weighted FEMA wildfire relative score ${score}`);
    row.innerHTML = `<span class="rank">${String(index + 1).padStart(2, "0")}</span><span class="chart-state">${state.name}</span><span class="bar-track"><span class="bar-fill" style="width:${(Number(state.wildfire_risk_score) / max) * 100}%"></span></span><strong>${score}</strong>`;
    row.addEventListener("click", () => showState(state));
    concentrationList.append(row);
  });
}

function setLoading(percent, label) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  stateLoading.hidden = false;
  loadingLabel.textContent = label;
  loadingPercent.textContent = `${value}%`;
  loadingBar.style.width = `${value}%`;
  loadingTrack.setAttribute("aria-valuenow", value);
}

function finishLoading() {
  setLoading(100, "State view ready");
  window.clearTimeout(loadingTimer);
  loadingTimer = window.setTimeout(() => { stateLoading.hidden = true; }, 550);
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function showState(state) {
  window.clearTimeout(loadingTimer);
  activeStateAbbr = state.abbr;
  activeState = state;
  setLoading(8, `Opening ${state.name}…`);
  await nextPaint();
  detailName.textContent = state.name;
  detailDescription.textContent = `FEMA NRI statewide aggregation. ${state.notes || "Use this context with local official sources."}`;
  detailMetrics.innerHTML = [
    ["Wildfire risk band", state.risk_band],
    ["Population-weighted relative score", state.wildfire_risk_score],
    ["County EAL total", state.wildfire_eal_total],
    ["Counties included", state.counties_included],
    ["FEMA risk baseline", state.risk_data_as_of || "December 2025"]
  ].map(([term, value]) => `<div><dt>${term}</dt><dd>${value ?? "Not reported"}</dd></div>`).join("");
  loadLiveAlerts(state);
  window.clearInterval(liveAlertTimer);
  liveAlertTimer = window.setInterval(() => {
    if (activeState) loadLiveAlerts(activeState);
  }, 5 * 60 * 1000);
  window.clearInterval(firmsTimer);
  firmsTimer = window.setInterval(() => {
    if (activeState && latestCountyLayer && latestCountyBounds) loadFirmsDetections(activeState, latestCountyLayer, latestCountyBounds);
  }, 5 * 60 * 1000);
  setLoading(55, `Preparing ${state.name} details…`);
  countyPanel.hidden = false;
  document.body.classList.add("county-open");
  countyEyebrow.textContent = `${state.name} county view`;
  countyTitle.textContent = "Wildfire risk concentration by county";
  countyIntro.textContent = `County boundaries are from the U.S. Census Bureau. Each ${state.name} county is colored from its FEMA National Risk Index wildfire relative-risk score: red is higher, gold is moderate, green is lower. This is not a current fire perimeter or evacuation map.`;
  countyMap.setAttribute("viewBox", "0 0 600 720");
  countyMap.setAttribute("aria-label", `${state.name} counties colored by FEMA wildfire relative risk`);
  countyTooltip.innerHTML = `<p class="eyebrow">County detail</p><h3>Hover or tap a county</h3><p>Its FEMA wildfire-risk context will appear here.</p>`;
  await loadCountyLayer(state);
  countyPanel.focus();
  finishLoading();
}

async function loadLiveAlerts(state) {
  const status = document.querySelector("#live-alert-status");
  const time = document.querySelector("#live-alert-time");
  if (liveAlertController) liveAlertController.abort();
  const controller = new AbortController();
  liveAlertController = controller;
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  status.textContent = `Checking active National Weather Service alerts for ${state.name}…`;
  time.textContent = "";
  try {
    const response = await fetch(`https://api.weather.gov/alerts/active?area=${state.abbr}`, {
      headers: { Accept: "application/geo+json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`NWS request failed (${response.status})`);
    const data = await response.json();
    if (activeStateAbbr !== state.abbr) return;
    const alerts = data.features || [];
    const wildfireAlerts = alerts.filter(({ properties = {} }) => /fire|red flag|smoke/i.test(`${properties.event || ""} ${properties.headline || ""} ${properties.description || ""}`));
    const count = alerts.length;
    const fireCount = wildfireAlerts.length;
    status.textContent = count === 0
      ? `No active NWS alerts are currently listed for ${state.name}. Check local agencies during an emergency.`
      : `${count} active NWS alert${count === 1 ? "" : "s"} for ${state.name}${fireCount ? `, including ${fireCount} fire, smoke, or Red Flag-related alert${fireCount === 1 ? "" : "s"}` : ""}.`;
    time.textContent = `Live check completed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}. Alerts can change at any time.`;
  } catch (error) {
    if (activeStateAbbr !== state.abbr) return;
    status.textContent = "Live alerts unavailable right now. Use local emergency management and official alerts.";
    time.textContent = "The National Weather Service check did not finish within 10 seconds.";
  } finally {
    window.clearTimeout(timeout);
  }
}

function closeCountyPanel() {
  countyPanel.hidden = true;
  document.body.classList.remove("county-open");
}

closeCounty.addEventListener("click", closeCountyPanel);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !countyPanel.hidden) closeCountyPanel();
});

function coordinatePairs(geometry) {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}

function pointInRing([longitude, latitude], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if ((y > latitude) !== (previousY > latitude) && longitude < ((previousX - x) * (latitude - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function pointInCountyLayer(point, layer) {
  return layer.features.some((feature) => coordinatePairs(feature.geometry).some((ring) => pointInRing(point, ring)));
}

function detectionPoint([longitude, latitude], bounds) {
  return {
    x: 28 + ((longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 544,
    y: 28 + ((bounds.maxLat - latitude) / (bounds.maxLat - bounds.minLat)) * 664,
  };
}

async function loadFirmsDetections(state, layer, bounds) {
  const status = document.querySelector("#firms-status");
  const time = document.querySelector("#firms-time");
  status.textContent = `Loading recent NASA FIRMS satellite detections for ${state.name}…`;
  try {
    const response = await fetch(`data/live/firms.geojson?cache=${Date.now()}`);
    if (!response.ok) throw new Error(`FIRMS cache request failed (${response.status})`);
    const data = await response.json();
    if (activeStateAbbr !== state.abbr) return;
    const detections = (data.features || []).filter((feature) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      return longitude >= bounds.minLon && longitude <= bounds.maxLon && latitude >= bounds.minLat && latitude <= bounds.maxLat && pointInCountyLayer([longitude, latitude], layer);
    });
    countyMap.querySelector("#firms-detections")?.remove();
    const dots = detections.map((feature) => {
      const point = detectionPoint(feature.geometry.coordinates, bounds);
      const props = feature.properties;
      const radius = Math.min(7, Math.max(3, 2 + Math.sqrt(Number(props.frp) || 0) / 3));
      return `<circle class="firms-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}"><title>NASA FIRMS satellite heat detection: ${props.acquired_date || "date unavailable"} ${props.acquired_time_utc || ""} UTC; FRP ${props.frp ?? "not reported"}</title></circle>`;
    }).join("");
    countyMap.insertAdjacentHTML("beforeend", `<g id="firms-detections" aria-label="${detections.length} NASA FIRMS satellite heat detections">${dots}</g>`);
    const updated = data.metadata?.generated_at ? displayDate(data.metadata.generated_at, { dateStyle: "medium", timeStyle: "short" }) : "time unavailable";
    status.textContent = detections.length ? `${detections.length} satellite heat detection${detections.length === 1 ? "" : "s"} in ${state.name} during the most recent 24-hour FIRMS window.` : `No retained NASA FIRMS satellite heat detections are currently shown in ${state.name}'s counties for the most recent 24-hour window.`;
    time.textContent = `Feed updated ${updated}. Orange dots are satellite heat detections—not confirmed fire perimeters or evacuation orders.`;
  } catch (error) {
    if (activeStateAbbr !== state.abbr) return;
    countyMap.querySelector("#firms-detections")?.remove();
    status.textContent = "Live satellite detections are temporarily unavailable. Check official local sources during an emergency.";
    time.textContent = "";
  }
}

function countyPath(feature, bounds) {
  return coordinatePairs(feature.geometry).map((ring) => ring.map(([lon, lat], index) => {
    const x = 28 + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 544;
    const y = 28 + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 664;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z").join(" ");
}

function showCounty(feature) {
  const props = feature.properties;
  countyTooltip.innerHTML = `<p class="eyebrow">County detail</p><h3>${props.NAME}</h3><p><strong>${props.risk_band} FEMA wildfire-risk context</strong></p><dl class="county-metrics"><div><dt>Relative score</dt><dd>${props.wildfire_risk_score}</dd></div><div><dt>Expected annual loss</dt><dd>$${Math.round(props.wildfire_eal_total).toLocaleString()}</dd></div></dl><p class="county-note">This is a long-term risk measure, not a current incident or evacuation instruction.</p>`;
}

async function loadCountyLayer(state) {
  if (countyLayerCache.has(state.abbr)) {
    renderCountyLayer(countyLayerCache.get(state.abbr));
    return;
  }
  if (!countyLoading.has(state.abbr)) countyLoading.set(state.abbr, fetchCountyLayer(state));
  try {
    const layer = await countyLoading.get(state.abbr);
    countyLayerCache.set(state.abbr, layer);
    if (activeStateAbbr === state.abbr) renderCountyLayer(layer);
  } finally {
    countyLoading.delete(state.abbr);
  }
}

async function fetchCountyLayer(state) {
  countyMap.innerHTML = `<text x="300" y="350" text-anchor="middle" class="map-loading">Loading ${state.name} county boundaries…</text>`;
  try {
    const response = await fetch(`data/counties/${state.abbr}.geojson`);
    if (!response.ok) throw new Error(`County layer request failed (${response.status})`);
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    setLoading(20, `Downloading ${state.name} county boundaries…`);
    let layer;
    if (response.body && totalBytes) {
      const reader = response.body.getReader();
      const chunks = [];
      let loadedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loadedBytes += value.length;
        setLoading(20 + (loadedBytes / totalBytes) * 62, `Downloading ${state.name} county boundaries…`);
      }
      const bytes = new Uint8Array(loadedBytes);
      let offset = 0;
      chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
      layer = JSON.parse(new TextDecoder().decode(bytes));
    } else {
      layer = await response.json();
      setLoading(82, `Reading ${state.name} county boundaries…`);
    }
    setLoading(88, `Drawing ${state.name} county map…`);
    return layer;
  } catch (error) {
    if (activeStateAbbr === state.abbr) {
      countyMap.innerHTML = '<text x="300" y="350" text-anchor="middle" class="map-loading">County layer could not be loaded. Please refresh and try again.</text>';
      setLoading(100, "County layer could not be loaded");
    }
    throw error;
  }
}

function renderCountyLayer(layer) {
  try {
    const points = layer.features.flatMap((feature) => coordinatePairs(feature.geometry).flat());
    const lons = points.map(([lon]) => lon), lats = points.map(([, lat]) => lat);
    const bounds = { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
    latestCountyLayer = layer;
    latestCountyBounds = bounds;
    const color = { High: "#c7522a", Moderate: "#d79735", Low: "#84aa84" };
    countyMap.innerHTML = layer.features.map((feature, index) => `<path class="county-path" tabindex="0" data-index="${index}" d="${countyPath(feature, bounds)}" fill="${color[feature.properties.risk_band]}" style="animation-delay:${Math.min(index * 24, 1200)}ms"><title>${feature.properties.NAME}: ${feature.properties.risk_band} risk context</title></path>`).join("");
    countyMap.querySelectorAll(".county-path").forEach((path) => {
      const feature = layer.features[Number(path.dataset.index)];
      path.addEventListener("mouseenter", () => showCounty(feature));
      path.addEventListener("focus", () => showCounty(feature));
      path.addEventListener("click", () => showCounty(feature));
    });
    if (activeState) loadFirmsDetections(activeState, layer, bounds);
    setLoading(98, "Finishing county map…");
    // Keep the status visible while the staggered county animation completes.
  } catch (error) {
    countyMap.innerHTML = '<text x="300" y="350" text-anchor="middle" class="map-loading">County layer could not be loaded. Please refresh and try again.</text>';
    setLoading(100, "County layer could not be loaded");
  }
}

async function boot() {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const response = await fetch("data/state-wildfire-risk.json");
    const dataset = await response.json();
    const ready = dataset.metadata.status === "verified" && dataset.states.length > 0;
    document.querySelector("#data-status-heading").textContent = ready ? "Verified FEMA data loaded" : "Dataset waiting for official FEMA import";
    document.querySelector("#source-status").textContent = dataset.metadata.source;
    const method = dataset.metadata.aggregation_method ? ` ${dataset.metadata.aggregation_method}` : "";
    document.querySelector("#risk-date").textContent = dataset.metadata.risk_data_as_of ? `Risk-data release: ${dataset.metadata.risk_data_as_of}. These scores are long-term baseline context, not live conditions.${method}` : `Risk-data release date not supplied.${method}`;
    document.querySelector("#updated-at").textContent = dataset.metadata.updated_at ? `Atlas refreshed ${displayDate(dataset.metadata.updated_at)}` : "No atlas refresh date yet";
    document.querySelector("#state-count").textContent = ready ? `${dataset.states.length} jurisdictions` : "50 + DC";
    const leading = ready ? [...dataset.states].sort((a, b) => Number(b.wildfire_risk_score) - Number(a.wildfire_risk_score))[0] : null;
    document.querySelector("#highest-band").textContent = leading ? leading.risk_band : "—";
    document.querySelector("#top-state").textContent = leading ? `${leading.name} · score ${leading.wildfire_risk_score}` : "Appears after source import";
    renderStateTiles(dataset.states, ready);
    renderConcentration(dataset.states, ready);
    loadFirmsStatus();
  } catch (error) {
    document.querySelector("#data-status-heading").textContent = "Dataset could not be loaded";
    document.querySelector("#source-status").textContent = "Use the documented FEMA import pipeline, then retry.";
    renderStateTiles([], false);
    renderConcentration([], false);
  }
}
boot();
