import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Dataset } from "./types";

let cached: Dataset | null = null;

// Cached per server process -- only changes when the ingest/build scripts re-run.
export function loadDataset(): Dataset {
  if (cached) return cached;
  const path = join(process.cwd(), "data", "airport-dataset.json");
  const raw = readFileSync(path, "utf8");
  cached = JSON.parse(raw) as Dataset;
  return cached;
}

export function getAirport(iata: string) {
  const dataset = loadDataset();
  return dataset.airports[iata.toUpperCase()] ?? null;
}

export function listAirports() {
  const dataset = loadDataset();
  return Object.values(dataset.airports);
}

export function resolveRegion(query: string) {
  const dataset = loadDataset();
  const q = query.trim().toLowerCase();
  for (const [key, region] of Object.entries(dataset.regions)) {
    if (
      key === q ||
      region.label.toLowerCase() === q ||
      region.label.toLowerCase().includes(q) ||
      q.includes(key.replace(/-/g, " "))
    ) {
      return { key, ...region };
    }
  }
  return null;
}

export function listRegions() {
  const dataset = loadDataset();
  return Object.entries(dataset.regions).map(([key, r]) => ({ key, ...r }));
}
