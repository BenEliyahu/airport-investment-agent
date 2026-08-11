import "server-only";
import type { AirportRecord, AirportScore, ScoreComponent } from "./types";
import { listAirports } from "./dataset";

// Deterministic scoring, no LLM -- see DESIGN.md for the weight rationale.
// A missing raw input drops that component and renormalizes the rest,
// rather than defaulting to a guessed value.

const WEIGHTS = {
  trafficIntensity: 0.3,
  delayBurden: 0.25,
  growthMomentum: 0.25,
  capacityConstraint: 0.2,
};

function minMaxNormalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function stats(values: number[]) {
  return { min: Math.min(...values), max: Math.max(...values) };
}

interface RawInputs {
  trafficIntensityRaw: number | null;
  delayBurdenRaw: number | null;
  delayBurdenSource: "ontime_pct" | "avg_delay_min" | null;
  growthMomentumRaw: number | null;
  headroomRaw: number | null;
}

function computeRawInputs(a: AirportRecord): RawInputs {
  const trafficIntensityRaw =
    a.annual_enplanements != null && a.runway_count > 0
      ? a.annual_enplanements / a.runway_count
      : null;

  let delayBurdenRaw: number | null = null;
  let delayBurdenSource: RawInputs["delayBurdenSource"] = null;
  if (a.ontime_departure_pct != null) {
    delayBurdenRaw = 100 - a.ontime_departure_pct;
    delayBurdenSource = "ontime_pct";
  } else if (a.avg_departure_delay_min != null) {
    delayBurdenRaw = a.avg_departure_delay_min;
    delayBurdenSource = "avg_delay_min";
  }

  const growthMomentumRaw = a.yoy_change_pct;

  const headroomRaw =
    a.longest_runway_ft != null && a.runway_count > 0
      ? a.runway_count * 0.5 + (a.longest_runway_ft / 1000) * 0.5
      : a.runway_count > 0
        ? a.runway_count
        : null;

  return { trafficIntensityRaw, delayBurdenRaw, delayBurdenSource, growthMomentumRaw, headroomRaw };
}

// Normalization is relative to peerSetIata -- ranking a region vs. the
// national baseline can give different orderings, see DESIGN.md.
export function scoreAirports(peerSetIata?: string[]): Map<string, AirportScore> {
  const all = listAirports();
  const peers = peerSetIata
    ? all.filter((a) => peerSetIata.includes(a.iata))
    : all;

  const rawByIata = new Map(peers.map((a) => [a.iata, computeRawInputs(a)]));

  const trafficValues = peers
    .map((a) => rawByIata.get(a.iata)!.trafficIntensityRaw)
    .filter((v): v is number => v != null);
  const delayValues = peers
    .map((a) => rawByIata.get(a.iata)!.delayBurdenRaw)
    .filter((v): v is number => v != null);
  const growthValues = peers
    .map((a) => rawByIata.get(a.iata)!.growthMomentumRaw)
    .filter((v): v is number => v != null);
  const headroomValues = peers
    .map((a) => rawByIata.get(a.iata)!.headroomRaw)
    .filter((v): v is number => v != null);

  const trafficStats = trafficValues.length ? stats(trafficValues) : null;
  const delayStats = delayValues.length ? stats(delayValues) : null;
  const growthStats = growthValues.length ? stats(growthValues) : null;
  const headroomStats = headroomValues.length ? stats(headroomValues) : null;

  const results = new Map<string, AirportScore>();

  for (const airport of peers) {
    const raw = rawByIata.get(airport.iata)!;

    const trafficNorm =
      raw.trafficIntensityRaw != null && trafficStats
        ? minMaxNormalize(raw.trafficIntensityRaw, trafficStats.min, trafficStats.max)
        : null;
    const delayNorm =
      raw.delayBurdenRaw != null && delayStats
        ? minMaxNormalize(raw.delayBurdenRaw, delayStats.min, delayStats.max)
        : null;
    const growthNorm =
      raw.growthMomentumRaw != null && growthStats
        ? minMaxNormalize(raw.growthMomentumRaw, growthStats.min, growthStats.max)
        : null;
    const headroomNorm =
      raw.headroomRaw != null && headroomStats
        ? minMaxNormalize(raw.headroomRaw, headroomStats.min, headroomStats.max)
        : null;
    const constraintNorm = headroomNorm != null ? 100 - headroomNorm : null;

    const components: ScoreComponent[] = [
      {
        key: "traffic_intensity",
        label: "Traffic intensity (enplanements per runway)",
        raw_value: raw.trafficIntensityRaw,
        normalized_0_100: trafficNorm,
        weight: WEIGHTS.trafficIntensity,
        missing: trafficNorm == null,
      },
      {
        key: "delay_burden",
        label:
          raw.delayBurdenSource === "avg_delay_min"
            ? "Delay burden (avg departure delay, min)"
            : "Delay burden (100 - on-time departure %)",
        raw_value: raw.delayBurdenRaw,
        normalized_0_100: delayNorm,
        weight: WEIGHTS.delayBurden,
        missing: delayNorm == null,
      },
      {
        key: "growth_momentum",
        label: "Growth momentum (YoY enplanement change %)",
        raw_value: raw.growthMomentumRaw,
        normalized_0_100: growthNorm,
        weight: WEIGHTS.growthMomentum,
        missing: growthNorm == null,
      },
      {
        key: "capacity_constraint",
        label: "Capacity constraint (inverse of runway count/length headroom)",
        raw_value: raw.headroomRaw,
        normalized_0_100: constraintNorm,
        weight: WEIGHTS.capacityConstraint,
        missing: constraintNorm == null,
      },
    ];

    const availableWeight = components
      .filter((c) => !c.missing)
      .reduce((sum, c) => sum + c.weight, 0);

    const expansionCandidacyScore =
      availableWeight > 0
        ? Number(
            (
              components.reduce(
                (sum, c) => sum + (c.missing ? 0 : (c.normalized_0_100! * c.weight)),
                0
              ) / availableWeight
            ).toFixed(1)
          )
        : null;

    const congestionScore =
      trafficNorm != null && delayNorm != null
        ? Number((0.5 * trafficNorm + 0.5 * delayNorm).toFixed(1))
        : trafficNorm != null
          ? Number(trafficNorm.toFixed(1))
          : delayNorm != null
            ? Number(delayNorm.toFixed(1))
            : null;

    const dataCompletenessPct = Number(
      ((components.filter((c) => !c.missing).length / components.length) * 100).toFixed(0)
    );

    results.set(airport.iata, {
      iata: airport.iata,
      data_completeness_pct: dataCompletenessPct,
      components,
      congestion_score: congestionScore,
      growth_score: growthNorm != null ? Number(growthNorm.toFixed(1)) : null,
      capacity_constraint_score: constraintNorm != null ? Number(constraintNorm.toFixed(1)) : null,
      unmet_demand_score: expansionCandidacyScore,
      expansion_candidacy_score: expansionCandidacyScore,
    });
  }

  return results;
}

export function scoreAirport(iata: string, peerSetIata?: string[]): AirportScore | null {
  return scoreAirports(peerSetIata).get(iata.toUpperCase()) ?? null;
}
