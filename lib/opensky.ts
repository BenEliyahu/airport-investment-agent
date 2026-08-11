import "server-only";

// Live OpenSky Network client (no key, rate-limited ~400/day). Deliberately
// excluded from lib/scoring.ts -- scores must stay reproducible, not
// dependent on a live feed or time of day. See DESIGN.md.

const OPEN_SKY_STATES_URL = "https://opensky-network.org/api/states/all";
const BOX_DEGREES = 0.35; // ~20-25nm at mid-latitudes, a rough terminal-area box
const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 60_000;

export interface LiveTrafficSnapshot {
  iata: string;
  queried_at: string;
  aircraft_in_vicinity: number | null;
  source: string;
  note: string;
}

const cache = new Map<string, { expires: number; value: LiveTrafficSnapshot }>();

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function getLiveTrafficSnapshot(
  iata: string,
  lat: number,
  lon: number
): Promise<LiveTrafficSnapshot> {
  const key = iata.toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const params = new URLSearchParams({
    lamin: String(lat - BOX_DEGREES),
    lamax: String(lat + BOX_DEGREES),
    lomin: String(lon - BOX_DEGREES),
    lomax: String(lon + BOX_DEGREES),
  });

  const snapshot: LiveTrafficSnapshot = {
    iata: key,
    queried_at: new Date().toISOString(),
    aircraft_in_vicinity: null,
    source: "OpenSky Network REST API (opensky-network.org/api/states/all), anonymous/unauthenticated",
    note: "",
  };

  try {
    const res = await fetchWithTimeout(
      `${OPEN_SKY_STATES_URL}?${params.toString()}`,
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) {
      snapshot.note = `OpenSky returned HTTP ${res.status} (likely anonymous rate limit -- ~400 req/day). Live traffic unavailable for this query; falling back to static/scored data only.`;
    } else {
      const data = (await res.json()) as { states?: unknown[] | null };
      snapshot.aircraft_in_vicinity = data.states ? data.states.length : 0;
      snapshot.note = `Count of aircraft transmitting ADS-B position within roughly ${(
        BOX_DEGREES * 69
      ).toFixed(0)} miles of the airport at query time. This is a point-in-time snapshot, not an average -- treat as directional, not a KPI input.`;
    }
  } catch (err) {
    snapshot.note = `OpenSky request failed or timed out (${
      err instanceof Error ? err.message : "unknown error"
    }). Live traffic unavailable for this query; falling back to static/scored data only.`;
  }

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value: snapshot });
  return snapshot;
}
