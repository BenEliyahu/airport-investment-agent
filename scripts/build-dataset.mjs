// Merges data/airports.json + data/faa-bts-raw.json + data/iata-coords-global.json
// into data/airport-dataset.json (what the app reads at runtime). Run with:
// node scripts/build-dataset.mjs
// Build-time, not request-time -- FAA/BTS/Wikipedia have no free query API,
// see DESIGN.md. Only OpenSky is fetched live, see lib/opensky.ts.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildResolver } from "./resolve-destination.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

// Distance-based threshold, not flight duration -- a documented simplification, see DESIGN.md.
const LONG_HAUL_THRESHOLD_MI = 2000;

function loadJson(name, fallback) {
  const path = join(DATA_DIR, name);
  if (!existsSync(path)) {
    console.warn(`WARNING: ${name} not found, using fallback.`);
    return fallback;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function greatCircleMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeLongHaulShare(originLat, originLon, destinations, globalCoords, resolver) {
  if (!destinations || destinations.length === 0) {
    return { pct: null, resolved: 0, unresolved: [], total: 0 };
  }
  let longHaulCount = 0;
  let resolved = 0;
  const unresolved = [];
  for (const raw of destinations) {
    const code = resolver.resolve(raw);
    const dest = code ? globalCoords[code] : null;
    if (!dest) {
      unresolved.push(raw);
      continue;
    }
    resolved += 1;
    const dist = greatCircleMiles(originLat, originLon, dest.lat, dest.lon);
    if (dist >= LONG_HAUL_THRESHOLD_MI) longHaulCount += 1;
  }
  return {
    pct: resolved > 0 ? Number(((longHaulCount / resolved) * 100).toFixed(1)) : null,
    resolved,
    unresolved,
    total: destinations.length,
  };
}

function main() {
  const physical = loadJson("airports.json", { airports: [] });
  const stats = loadJson("faa-bts-raw.json", { airports: {} });
  const coordsFile = loadJson("iata-coords-global.json", { coords: {} });
  const regions = loadJson("regions.json", { regions: {} });

  const physicalByIata = new Map(physical.airports.map((a) => [a.iata, a]));
  const globalCoords = coordsFile.coords;
  const resolver = buildResolver(globalCoords);

  const allCodes = new Set([
    ...Object.keys(stats.airports || {}),
    ...Object.values(regions.regions).flatMap((r) => r.airports),
  ]);

  const merged = {};
  const missingPhysical = [];
  const missingStats = [];

  for (const code of allCodes) {
    const phys = physicalByIata.get(code);
    const s = (stats.airports || {})[code];
    if (!phys) {
      missingPhysical.push(code);
      continue;
    }
    if (!s) missingStats.push(code);

    const longHaul = s?.nonstop_destinations
      ? computeLongHaulShare(phys.lat, phys.lon, s.nonstop_destinations, globalCoords, resolver)
      : { pct: null, resolved: 0, unresolved: [], total: 0 };

    merged[code] = {
      iata: code,
      icao: phys.icao,
      name: phys.name,
      city: phys.city,
      state: phys.state,
      lat: phys.lat,
      lon: phys.lon,
      runway_count: phys.runway_count,
      longest_runway_ft: phys.longest_runway_ft,
      airport_type: phys.type,

      annual_enplanements: s?.annual_enplanements ?? null,
      enplanements_year: s?.enplanements_year ?? null,
      prior_year_enplanements: s?.prior_year_enplanements ?? null,
      yoy_change_pct: s?.yoy_change_pct ?? null,
      faa_hub_classification: s?.faa_hub_classification ?? null,

      ontime_departure_pct: s?.ontime_departure_pct ?? null,
      avg_departure_delay_min: s?.avg_departure_delay_min ?? null,
      ontime_period: s?.ontime_period ?? null,

      long_haul_share_pct: longHaul.pct,
      long_haul_destinations_resolved: longHaul.resolved,
      long_haul_destinations_total: longHaul.total,
      long_haul_destinations_unresolved: longHaul.unresolved,
      long_haul_threshold_mi: LONG_HAUL_THRESHOLD_MI,

      source_notes: s?.notes ?? null,
      destinations_source_note: s?.destinations_source_note ?? null,
    };
  }

  const outPath = join(DATA_DIR, "airport-dataset.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        built_at: new Date().toISOString(),
        long_haul_threshold_mi: LONG_HAUL_THRESHOLD_MI,
        regions: regions.regions,
        airports: merged,
      },
      null,
      2
    )
  );

  console.log(`Wrote merged dataset for ${Object.keys(merged).length} airports to ${outPath}`);
  if (missingPhysical.length) {
    console.warn(`Missing OurAirports physical data for: ${missingPhysical.join(", ")}`);
  }
  if (missingStats.length) {
    console.warn(`No FAA/BTS stats found (yet) for: ${missingStats.join(", ")}`);
  }
}

main();
