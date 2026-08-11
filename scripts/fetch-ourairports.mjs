// Live pull from OurAirports (no key) -> data/airports.json. Run with:
// node scripts/fetch-ourairports.mjs
// Build-time, not request-time -- OurAirports is a bulk CSV dump with no
// query API, see DESIGN.md.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const AIRPORTS_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";
const RUNWAYS_URL =
  "https://davidmegginson.github.io/ourairports-data/runways.csv";

// Force-included even if OurAirports marks them unscheduled -- these are the
// airports the assignment's example questions and scoring dataset depend on.
const MUST_INCLUDE_IATA = new Set([
  "BOS", "PVD", "BDL", "MHT", "PWM", "BGR",
  "LAX", "SNA", "BUR", "LGB", "ONT",
  "SFO", "OAK", "SJC",
  "ANC", "FAI", "JNU",
  "ATL", "ORD", "DFW", "DEN", "JFK", "SEA", "MIA", "PHX", "MCO", "LAS", "CLT",
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj;
  });
}

async function main() {
  console.log("Fetching OurAirports airports.csv ...");
  const airportsCsv = await (await fetch(AIRPORTS_URL)).text();
  const airportRows = parseCsv(airportsCsv);

  console.log("Fetching OurAirports runways.csv ...");
  const runwaysCsv = await (await fetch(RUNWAYS_URL)).text();
  const runwayRows = parseCsv(runwaysCsv);

  const runwaysByIdent = new Map();
  for (const r of runwayRows) {
    if (r.closed === "1") continue;
    const ident = r.airport_ident;
    const lengthFt = Number(r.length_ft) || 0;
    if (!runwaysByIdent.has(ident)) {
      runwaysByIdent.set(ident, { count: 0, longestFt: 0 });
    }
    const agg = runwaysByIdent.get(ident);
    agg.count += 1;
    agg.longestFt = Math.max(agg.longestFt, lengthFt);
  }

  const usAirports = airportRows.filter((r) => {
    if (r.iso_country !== "US") return false;
    if (r.type === "closed") return false;
    if (MUST_INCLUDE_IATA.has(r.iata_code)) return true;
    return r.scheduled_service === "yes" && r.iata_code;
  });

  const result = usAirports.map((r) => {
    const rw = runwaysByIdent.get(r.ident) ?? { count: 0, longestFt: 0 };
    return {
      iata: r.iata_code || null,
      icao: r.ident,
      name: r.name,
      city: r.municipality,
      state: (r.iso_region || "").replace(/^US-/, ""),
      lat: Number(r.latitude_deg),
      lon: Number(r.longitude_deg),
      elevation_ft: r.elevation_ft ? Number(r.elevation_ft) : null,
      type: r.type,
      scheduled_service: r.scheduled_service === "yes",
      runway_count: rw.count,
      longest_runway_ft: rw.longestFt || null,
    };
  });

  // A few idents share an IATA code (joint civil/military fields) -- prefer the one with more runway data.
  const byIata = new Map();
  for (const a of result) {
    if (!a.iata) continue;
    const existing = byIata.get(a.iata);
    if (!existing || a.runway_count > existing.runway_count) {
      byIata.set(a.iata, a);
    }
  }

  const final = Array.from(byIata.values()).sort((a, b) =>
    a.iata.localeCompare(b.iata)
  );

  mkdirSync(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, "airports.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        source: "https://ourairports.com/data/ (OurAirports open data, public domain)",
        fetched_at: new Date().toISOString(),
        count: final.length,
        airports: final,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${final.length} US airports to ${outPath}`);

  // Worldwide (not US-only) iata -> coords, needed since destinations can be anywhere on earth.
  const globalCoords = {};
  for (const r of airportRows) {
    if (!r.iata_code) continue;
    if (r.type === "closed") continue;
    const lat = Number(r.latitude_deg);
    const lon = Number(r.longitude_deg);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    globalCoords[r.iata_code] = {
      lat,
      lon,
      name: r.name,
      municipality: r.municipality || "",
      country: r.iso_country,
      type: r.type,
      scheduled_service: r.scheduled_service === "yes",
    };
  }
  const coordsPath = join(DATA_DIR, "iata-coords-global.json");
  writeFileSync(
    coordsPath,
    JSON.stringify(
      {
        source: "https://ourairports.com/data/ (OurAirports open data, public domain)",
        fetched_at: new Date().toISOString(),
        count: Object.keys(globalCoords).length,
        coords: globalCoords,
      },
      null,
      2
    )
  );
  console.log(
    `Wrote ${Object.keys(globalCoords).length} global IATA coordinates to ${coordsPath}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
