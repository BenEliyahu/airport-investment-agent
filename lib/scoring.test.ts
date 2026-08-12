import { afterEach, describe, expect, it, vi } from "vitest";
import { scoreAirports, scoreAirport } from "./scoring";
import type { AirportRecord } from "./types";

describe("determinism", () => {
  it("scoreAirports() returns identical results across repeated calls with identical inputs", () => {
    const first = scoreAirports();
    const second = scoreAirports();
    expect(Object.fromEntries(second)).toEqual(Object.fromEntries(first));
  });

  it("scoreAirports() is deterministic for an explicit peer subset too, not just the full dataset", () => {
    const peers = ["BOS", "PWM", "PVD", "BDL", "BGR", "MHT"];
    const first = scoreAirports(peers);
    const second = scoreAirports(peers);
    expect(Object.fromEntries(second)).toEqual(Object.fromEntries(first));
  });
});

describe("directional sanity (real shipped data)", () => {
  it("an airport with more traffic, worse on-time performance, and more growth outranks one with less of all three, within the same region", () => {
    // Real New England pair, both fully scored (100% data completeness) in
    // the shipped dataset -- see data/airport-dataset.json.
    // BOS: 21.09M enplanements / 6 runways, 78.76% on-time, +5.65% YoY
    // MHT: 0.63M enplanements / 2 runways, 84.60% on-time, -1.84% YoY
    const peers = ["BOS", "PWM", "PVD", "BDL", "BGR", "MHT"];
    const scores = scoreAirports(peers);
    const bos = scores.get("BOS")!;
    const mht = scores.get("MHT")!;

    expect(bos.expansion_candidacy_score).not.toBeNull();
    expect(mht.expansion_candidacy_score).not.toBeNull();
    expect(bos.expansion_candidacy_score!).toBeGreaterThan(mht.expansion_candidacy_score!);

    const bosTraffic = bos.components.find((c) => c.key === "traffic_intensity")!;
    const mhtTraffic = mht.components.find((c) => c.key === "traffic_intensity")!;
    expect(bosTraffic.normalized_0_100!).toBeGreaterThan(mhtTraffic.normalized_0_100!);

    const bosDelay = bos.components.find((c) => c.key === "delay_burden")!;
    const mhtDelay = mht.components.find((c) => c.key === "delay_burden")!;
    expect(bosDelay.normalized_0_100!).toBeGreaterThan(mhtDelay.normalized_0_100!);

    const bosGrowth = bos.components.find((c) => c.key === "growth_momentum")!;
    const mhtGrowth = mht.components.find((c) => c.key === "growth_momentum")!;
    expect(bosGrowth.normalized_0_100!).toBeGreaterThan(mhtGrowth.normalized_0_100!);
  });
});

describe("peer-set sensitivity", () => {
  it("the same airport's score differs when normalized against its region vs. the full national dataset (documented tradeoff, not a bug)", () => {
    const regionScore = scoreAirports([
      "BOS", "PWM", "PVD", "BDL", "BGR", "MHT",
    ]).get("BOS")!;
    const nationalScore = scoreAirports().get("BOS")!;

    expect(regionScore.expansion_candidacy_score).not.toEqual(
      nationalScore.expansion_candidacy_score
    );

    const regionTraffic = regionScore.components.find((c) => c.key === "traffic_intensity")!;
    const nationalTraffic = nationalScore.components.find((c) => c.key === "traffic_intensity")!;
    // BOS is the biggest airport in New England but far from the biggest
    // nationally (ATL, ORD, DFW, JFK, etc. dwarf it), so its normalized
    // traffic-intensity score should drop in the larger peer set.
    expect(nationalTraffic.normalized_0_100!).toBeLessThan(regionTraffic.normalized_0_100!);
  });
});

// The two tests below need an airport missing a raw scoring input. As of
// this dataset snapshot all 28 shipped airports have complete FAA/BTS data
// (see data/SOURCES.md) -- there's no real example of the missing-data case
// to test against. This is the one place we fall back to a fixture, per the
// "unless a test genuinely can't be written otherwise" exception: the
// function under test (scoreAirports, imported fresh below) is completely
// real and unmodified, only its data source (lib/dataset.ts) is swapped for
// two airports with runway/traffic numbers realistic in shape, one with its
// delay data stripped to exercise the renormalization branch.
describe("weight renormalization and completeness reporting on missing data (fixture, see comment above)", () => {
  const FULL: AirportRecord = {
    iata: "TSTA",
    icao: "KTST",
    name: "Test Fixture Airport A",
    city: "Fixtureville",
    state: "ZZ",
    lat: 40,
    lon: -90,
    runway_count: 4,
    longest_runway_ft: 12000,
    airport_type: "large_airport",
    annual_enplanements: 1_000_000,
    enplanements_year: 2024,
    prior_year_enplanements: 990_000,
    yoy_change_pct: 1.0,
    faa_hub_classification: "Medium Hub",
    ontime_departure_pct: 90,
    avg_departure_delay_min: null,
    ontime_period: "fixture",
    long_haul_share_pct: null,
    long_haul_destinations_resolved: 0,
    long_haul_destinations_total: 0,
    long_haul_destinations_unresolved: [],
    long_haul_threshold_mi: 2000,
    source_notes: "fixture",
    destinations_source_note: null,
  };

  const MISSING_DELAY: AirportRecord = {
    ...FULL,
    iata: "TSTB",
    icao: "KTSB",
    name: "Test Fixture Airport B",
    runway_count: 2,
    longest_runway_ft: 6000,
    annual_enplanements: 9_000_000,
    prior_year_enplanements: 8_000_000,
    yoy_change_pct: 9.0,
    ontime_departure_pct: null,
    avg_departure_delay_min: null,
    ontime_period: null,
  };

  afterEach(() => {
    vi.doUnmock("./dataset");
    vi.resetModules();
  });

  async function scoreFixture() {
    vi.resetModules();
    vi.doMock("./dataset", () => ({
      listAirports: () => [FULL, MISSING_DELAY],
    }));
    const fresh = await import("./scoring");
    return fresh.scoreAirports();
  }

  it("an airport missing on-time data still produces a valid score, with the surviving weights renormalized to sum to 1", async () => {
    const scores = await scoreFixture();
    const missing = scores.get("TSTB")!;

    const delay = missing.components.find((c) => c.key === "delay_burden")!;
    expect(delay.missing).toBe(true);
    expect(delay.normalized_0_100).toBeNull();

    const present = missing.components.filter((c) => !c.missing);
    expect(present.map((c) => c.key).sort()).toEqual(
      ["capacity_constraint", "growth_momentum", "traffic_intensity"].sort()
    );
    const renormalizedWeightSum = present.reduce(
      (sum, c) => sum + c.weight / present.reduce((s, cc) => s + cc.weight, 0),
      0
    );
    expect(renormalizedWeightSum).toBeCloseTo(1, 10);

    // TSTB is the higher-traffic, higher-growth, more-runway-constrained
    // airport on every present metric, so each normalizes to 100 against
    // the 2-airport fixture peer set -- expected renormalized composite:
    // (100*0.30 + 100*0.25 + 100*0.20) / 0.75 = 100.
    expect(missing.expansion_candidacy_score).toBeCloseTo(100, 5);
  });

  it("data_completeness_pct is lower for the airport with a missing component than for a fully-populated one", async () => {
    const scores = await scoreFixture();
    const full = scores.get("TSTA")!;
    const missing = scores.get("TSTB")!;

    expect(full.data_completeness_pct).toBe(100);
    expect(missing.data_completeness_pct).toBe(75);
    expect(missing.data_completeness_pct).toBeLessThan(full.data_completeness_pct);

    const missingDelayFlag = missing.components.find((c) => c.key === "delay_burden")!.missing;
    expect(missingDelayFlag).toBe(true);
  });
});

describe("scoreAirport", () => {
  it("returns the same result as looking the code up in scoreAirports() for the same peer set", () => {
    const peers = ["BOS", "PWM", "PVD", "BDL", "BGR", "MHT"];
    const fromMap = scoreAirports(peers).get("BOS");
    const direct = scoreAirport("BOS", peers);
    expect(direct).toEqual(fromMap);
  });
});
