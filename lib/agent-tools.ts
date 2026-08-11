import "server-only";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getAirport, listAirports, listRegions, resolveRegion } from "./dataset";
import { scoreAirports } from "./scoring";
import { getLiveTrafficSnapshot } from "./opensky";

// The only surface the LLM can act through -- thin wrappers around
// lib/dataset.ts, lib/scoring.ts, lib/opensky.ts. It never computes a
// number itself, only calls these and narrates the result.

export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_supported_airports",
      description:
        "Lists every airport and region this tool has data for, with IATA codes. Call this first if you're unsure an airport/region the user mentioned is in scope -- this dataset intentionally covers a curated set (New England, LA Basin, SF Bay Area, Alaska, plus a national baseline set for ranking context), not every US airport.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_airport_profile",
      description:
        "Get full profile for one airport: physical infrastructure (runways), FAA passenger volume + hub classification, BTS on-time performance, long-haul destination share, and its deterministic scores (congestion, growth, capacity constraint, expansion candidacy/unmet-demand), each normalized against the full national dataset.",
      parameters: {
        type: "object",
        properties: {
          iata: { type: "string", description: "3-letter IATA airport code, e.g. SFO" },
        },
        required: ["iata"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_airports",
      description:
        "Side-by-side comparison of 2+ airports: raw metrics and deterministic scores (congestion, growth, capacity constraint, expansion candidacy), all normalized against the full national dataset so the numbers are meaningfully comparable.",
      parameters: {
        type: "object",
        properties: {
          iata_codes: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            description: "3-letter IATA codes to compare, e.g. [\"LAX\",\"SNA\"]",
          },
        },
        required: ["iata_codes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rank_airports",
      description:
        "Deterministically ranks airports by a chosen score. Restrict to a region (e.g. 'New England') or pass explicit iata_codes to control the peer group used for normalization -- ranking within a small region vs. against the full national baseline can produce different orderings, since scores are relative to whichever peer set is used.",
      parameters: {
        type: "object",
        properties: {
          region: {
            type: "string",
            description:
              "Region key or label to rank within, e.g. 'new-england', 'la-basin', 'sf-bay-area', 'alaska'. Omit to rank across the whole dataset.",
          },
          iata_codes: {
            type: "array",
            items: { type: "string" },
            description: "Explicit set of IATA codes to rank/normalize against, as an alternative to `region`.",
          },
          metric: {
            type: "string",
            enum: [
              "expansion_candidacy_score",
              "congestion_score",
              "growth_score",
              "capacity_constraint_score",
            ],
            description: "Which score to sort by. Defaults to expansion_candidacy_score.",
          },
          limit: { type: "number", description: "Max results to return. Defaults to all." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_live_traffic_snapshot",
      description:
        "Queries the OpenSky Network live flight-tracking API for a point-in-time count of aircraft currently airborne near an airport. This is a real-time supplementary signal, NOT part of the deterministic scoring model (which must stay reproducible) -- use it to add current color, not as a ranking input. May be unavailable due to anonymous API rate limits; handle that gracefully in your answer if so.",
      parameters: {
        type: "object",
        properties: {
          iata: { type: "string", description: "3-letter IATA airport code, e.g. ANC" },
        },
        required: ["iata"],
        additionalProperties: false,
      },
    },
  },
];

function scoredProfile(iata: string) {
  const airport = getAirport(iata);
  if (!airport) return null;
  const score = scoreAirports().get(iata.toUpperCase()) ?? null;
  return { airport, score };
}

export async function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_supported_airports": {
      return {
        regions: listRegions(),
        all_airports: listAirports().map((a) => ({
          iata: a.iata,
          name: a.name,
          city: a.city,
          state: a.state,
        })),
      };
    }

    case "get_airport_profile": {
      const iata = String(args.iata ?? "").toUpperCase();
      const result = scoredProfile(iata);
      if (!result) return { error: `No data for IATA code "${iata}". Call list_supported_airports to see what's covered.` };
      return result;
    }

    case "compare_airports": {
      const codes = (args.iata_codes as string[] | undefined)?.map((c) => c.toUpperCase()) ?? [];
      if (codes.length < 2) return { error: "Provide at least 2 iata_codes to compare." };
      const scores = scoreAirports();
      const results = codes.map((code) => {
        const airport = getAirport(code);
        if (!airport) return { iata: code, error: "No data for this code." };
        return { airport, score: scores.get(code) ?? null };
      });
      return { compared: results };
    }

    case "rank_airports": {
      let peerCodes: string[] | undefined;
      let regionInfo = null;
      if (args.region) {
        regionInfo = resolveRegion(String(args.region));
        if (!regionInfo) {
          return {
            error: `Unknown region "${args.region}". Call list_supported_airports to see valid region keys.`,
          };
        }
        peerCodes = regionInfo.airports;
      } else if (args.iata_codes) {
        peerCodes = (args.iata_codes as string[]).map((c) => c.toUpperCase());
      }

      const metric =
        (args.metric as string | undefined) ?? "expansion_candidacy_score";
      const limit = (args.limit as number | undefined) ?? undefined;

      const scores = scoreAirports(peerCodes);
      const airports = peerCodes
        ? peerCodes.map((c) => getAirport(c)).filter((a): a is NonNullable<typeof a> => !!a)
        : listAirports();

      const ranked = airports
        .map((a) => ({ airport: a, score: scores.get(a.iata)! }))
        .filter((r) => r.score && r.score[metric as keyof typeof r.score] != null)
        .sort((x, y) => {
          const xv = x.score[metric as keyof typeof x.score] as number;
          const yv = y.score[metric as keyof typeof y.score] as number;
          return yv - xv;
        });

      return {
        region: regionInfo ? { key: regionInfo.key, label: regionInfo.label } : null,
        peer_set_size: airports.length,
        metric,
        ranked: limit ? ranked.slice(0, limit) : ranked,
      };
    }

    case "get_live_traffic_snapshot": {
      const iata = String(args.iata ?? "").toUpperCase();
      const airport = getAirport(iata);
      if (!airport) return { error: `No data for IATA code "${iata}".` };
      return await getLiveTrafficSnapshot(iata, airport.lat, airport.lon);
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
