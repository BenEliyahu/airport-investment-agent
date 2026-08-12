# Airport Investment Intelligence Agent

**Live demo: [airportinvestmentagent.vercel.app](https://airportinvestmentagent.vercel.app/)**

A conversational agent that helps identify which US airports are strong
candidates for terminal/runway expansion investment, backed by a
deterministic scoring engine over public FAA/BTS/OurAirports data plus a
live OpenSky Network feed.

See **[DESIGN.md](./DESIGN.md)** for the scoring methodology, key tradeoffs,
where AI is used, and — importantly — the assumptions/uncertainty/scoping
notes you should read before trusting any number out of this tool.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in OPENAI_API_KEY
npm run dev
```

Open http://localhost:3000 and try one of the suggested prompts, e.g.:

- "Which airports in New England are strong candidates for terminal expansion?"
- "Compare LA and Santa Ana airport congestion levels."
- "What is the percentage of long haul flights out of Anchorage airport?"
- "What is the unmet flight demand in SFO airport and why?"

Every assistant reply has a collapsible "N deterministic tool calls behind
this answer" disclosure — expand it to see exactly which scoring functions
ran and what raw data they returned.

Voice input (mic button, fills the input for you to review before sending)
and read-aloud (per-message speaker icon) are supported in Chromium-based
browsers (Chrome, Edge) via the Web Speech API; both are feature-detected
and hidden entirely elsewhere.

## Project layout

```
app/
  api/chat/route.ts      Chat endpoint: OpenAI function-calling loop over lib/agent-tools.ts
  page.tsx, layout.tsx    App shell
components/
  AppShell.tsx            Chat UI + layout
  Sidebar.tsx              Picks the latest tool result and renders the matching chart
  RankingChart.tsx, ComparisonChart.tsx   Recharts visualizations
  ToolTraceDisclosure.tsx  Transparency: shows raw tool calls/results per answer
lib/
  agent-tools.ts          Tool definitions (OpenAI schema) + dispatcher -- the only thing the LLM can call
  scoring.ts               Deterministic scoring engine (pure functions, no LLM)
  dataset.ts               Loads the pre-built data/airport-dataset.json
  opensky.ts                Live OpenSky Network API client (request-time)
  geo.ts                    Great-circle distance helper
  types.ts                  Shared types
scripts/
  fetch-ourairports.mjs    Live pull of OurAirports CSV -> data/airports.json, data/iata-coords-global.json
  build-dataset.mjs        Merges physical + curated FAA/BTS data -> data/airport-dataset.json
data/
  airport-dataset.json     What the app actually reads at runtime (pre-built, checked in)
  faa-bts-raw.json         Curated FAA/BTS/Wikipedia figures (see SOURCES.md for citations)
  SOURCES.md               Citations + retrieval dates for every curated figure
  regions.json             Hand-curated region -> airport-code groupings
```

## Regenerating the dataset

The app reads a pre-built `data/airport-dataset.json` at runtime -- it does
not re-fetch FAA/BTS/OurAirports data on every request (see DESIGN.md §4 for
why). To refresh it:

```bash
node scripts/fetch-ourairports.mjs   # re-pulls live OurAirports data (physical/runway facts)
node scripts/build-dataset.mjs       # re-merges with data/faa-bts-raw.json, recomputes long-haul share
```

To update the curated FAA/BTS/destination figures themselves, edit
`data/faa-bts-raw.json` (schema documented at the top of
`scripts/build-dataset.mjs`) and re-run the build step.

## Tests

```bash
npm test
```

`lib/scoring.test.ts` verifies the scoring engine is actually deterministic
(not just asserted to be in DESIGN.md), that a missing raw input renormalizes
the remaining weights correctly and lowers `data_completeness_pct`, and that
peer-set sensitivity produces genuinely different scores for the same
airport -- against the real shipped dataset wherever the shipped data can
exercise the case, with a documented fixture for the missing-data path since
all 28 airports currently have complete data.

## Tech stack

Next.js (App Router, TypeScript), Tailwind CSS, Recharts, OpenAI SDK (Chat
Completions + function calling), Vitest. No database -- the dataset is a
static, versioned JSON snapshot with documented provenance.

## Known limitations

Coverage is a curated 28-airport set, not every US airport; BTS on-time data
has real gaps for smaller fields; long-haul share is a route-count proxy, not
flight-frequency-weighted. Full list in DESIGN.md §5.
