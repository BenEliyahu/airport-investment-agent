// Resolves free-text Wikipedia destination names (e.g. "Chicago-O'Hare",
// "Paris-CDG") to IATA codes against the worldwide OurAirports index.
// Unresolved names are reported, not guessed -- see DESIGN.md.

const TYPE_RANK = { large_airport: 3, medium_airport: 2, small_airport: 1 };
const MIN_SUBSTRING_LEN = 5; // guard against short strings matching too broadly

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accent marks
    .replace(/['’.]/g, "") // drop apostrophes and periods (St. -> St)
    .replace(/[-/]/g, " ") // dual-city separators collapse to a space
    .replace(/\s+/g, " ")
    .trim();
}

export function buildResolver(globalCoords) {
  const byMuni = new Map();
  const byNameWord = new Map();
  const byCountry = new Map();
  const STOPWORDS = new Set([
    "international",
    "airport",
    "regional",
    "municipal",
    "field",
    "county",
    "national",
    "the",
    "of",
    "and",
  ]);

  const addTo = (map, key, entry) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  };

  for (const [iata, info] of Object.entries(globalCoords)) {
    const entry = { iata, ...info };

    const muniRaw = info.municipality || "";
    if (muniRaw) {
      addTo(byMuni, normalize(muniRaw), entry);
      for (const part of muniRaw.split(",")) {
        addTo(byMuni, normalize(part), entry);
      }
    }

    const nameWords = normalize(info.name || "")
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    for (const w of nameWords) addTo(byNameWord, w, entry);

    addTo(byCountry, info.country, entry);
  }

  const allMuniKeys = [...byMuni.keys()].filter((k) => k.length >= MIN_SUBSTRING_LEN);

  // Verified against the fetched dataset, not typed from memory: AUA/BDA are Aruba's/Bermuda's only scheduled airport.
  const COUNTRY_FALLBACK = { aruba: "AW", bermuda: "BM" };

  function pickBest(candidates) {
    if (!candidates || candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      const rankDiff = (TYPE_RANK[b.type] ?? 0) - (TYPE_RANK[a.type] ?? 0);
      if (rankDiff !== 0) return rankDiff;
      return (b.scheduled_service ? 1 : 0) - (a.scheduled_service ? 1 : 0);
    })[0];
  }

  function tryMuni(normQuery) {
    const direct = byMuni.get(normQuery);
    if (direct && direct.length) return pickBest(direct);
    return null;
  }

  function trySubstring(normQuery) {
    if (normQuery.length < MIN_SUBSTRING_LEN) return null;
    const matches = [];
    for (const key of allMuniKeys) {
      if (key.includes(normQuery) || normQuery.includes(key)) {
        matches.push(...byMuni.get(key));
      }
    }
    return pickBest(matches);
  }

  function tryNameWords(text) {
    const words = normalize(text)
      .split(" ")
      .filter((w) => w.length > 2);
    for (const w of words) {
      const matches = byNameWord.get(w);
      if (matches && matches.length) return pickBest(matches);
    }
    return null;
  }

  /** @returns {string|null} resolved IATA code, or null if no confident match */
  function resolve(raw) {
    if (!raw) return null;
    if (globalCoords[raw]) return raw; // already a valid IATA code

    let s = raw.trim().replace(/\s*\([^)]*\)\s*$/, "").trim(); // strip trailing "(XX)"
    const normFull = normalize(s);

    let best = tryMuni(normFull);
    if (best) return best.iata;

    if (/[-/]/.test(s)) {
      const rawParts = s.split(/[-/]/).map((p) => p.trim());

      // "Paris-CDG": second part is itself a valid IATA code.
      const lastPart = rawParts[rawParts.length - 1];
      if (/^[A-Z]{3}$/.test(lastPart) && globalCoords[lastPart]) return lastPart;

      for (const part of rawParts) {
        best = tryMuni(normalize(part));
        if (best) return best.iata;
      }
      // Suffix as an airport-name fragment, e.g. "O'Hare", "Pearson", "Dulles".
      best = tryNameWords(rawParts[rawParts.length - 1]);
      if (best) return best.iata;
    }

    // Handles "Frankfurt" ⊂ "Frankfurt am Main", "Honolulu" ⊂ "Honolulu, Oahu", etc.
    best = trySubstring(normFull);
    if (best) return best.iata;

    const countryCode = COUNTRY_FALLBACK[normFull];
    if (countryCode) {
      best = pickBest(byCountry.get(countryCode));
      if (best) return best.iata;
    }

    return null;
  }

  return { resolve };
}
