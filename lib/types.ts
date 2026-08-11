export interface AirportRecord {
  iata: string;
  icao: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  runway_count: number;
  longest_runway_ft: number | null;
  airport_type: string;

  annual_enplanements: number | null;
  enplanements_year: number | null;
  prior_year_enplanements: number | null;
  yoy_change_pct: number | null;
  faa_hub_classification: string | null;

  ontime_departure_pct: number | null;
  avg_departure_delay_min: number | null;
  ontime_period: string | null;

  long_haul_share_pct: number | null;
  long_haul_destinations_resolved: number;
  long_haul_destinations_total: number;
  long_haul_destinations_unresolved: string[];
  long_haul_threshold_mi: number;

  source_notes: string | null;
  destinations_source_note: string | null;
}

export interface RegionInfo {
  label: string;
  states: string[];
  airports: string[];
}

export interface Dataset {
  built_at: string;
  long_haul_threshold_mi: number;
  regions: Record<string, RegionInfo>;
  airports: Record<string, AirportRecord>;
}

// Kept alongside raw_value so the agent can explain "why", not just cite a score.
export interface ScoreComponent {
  key: string;
  label: string;
  raw_value: number | null;
  normalized_0_100: number | null;
  weight: number;
  missing: boolean;
}

export interface AirportScore {
  iata: string;
  data_completeness_pct: number;
  components: ScoreComponent[];
  congestion_score: number | null;
  growth_score: number | null;
  capacity_constraint_score: number | null;
  unmet_demand_score: number | null;
  expansion_candidacy_score: number | null;
}
