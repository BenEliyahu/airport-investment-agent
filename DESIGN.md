# Design & Architecture — Airport Investment Intelligence Agent

A conversational agent that ranks and compares US airports for terminal/runway
expansion investment potential, backed by a deterministic scoring engine and
public aviation data.

## 1. What this is, in one diagram

```
 User (chat UI)
      │
      ▼
 app/api/chat/route.ts  ──────────────►  OpenAI (gpt-4.1-mini, function calling)
      │  ▲                                        │
      │  │ tool_calls                              │ decides which tool(s) to call,
      │  │                                          │ then narrates the results
      │  ▼                                          ▼
 lib/agent-tools.ts  (thin dispatcher, no reasoning of its own)
      │
      ├──► lib/dataset.ts     — reads data/airport-dataset.json (pre-built)
      ├──► lib/scoring.ts     — deterministic scoring, pure functions
      └──► lib/opensky.ts     — live OpenSky Network API call (request-time)

 data/airport-dataset.json is produced OFFLINE by:
      scripts/fetch-ourairports.mjs   — live pull, OurAirports (physical/runway data)
      scripts/build-dataset.mjs       — merges in data/faa-bts-raw.json (FAA/BTS/
                                         Wikipedia curated stats) + computes
                                         long-haul share via great-circle distance
```

The key design decision: **the LLM never computes a number.** It calls tools,
the tools run real arithmetic over real data, and the LLM's job is to decide
*which* tool to call and *how to explain* the result in plain English. This is
what the assignment asks for ("deterministic scoring or ranking logic, not
only LLM output") and it's also just good practice — a ranking an investment
committee relies on shouldn't be an LLM's guess.

## 2. Scoring methodology

All scoring logic lives in `lib/scoring.ts` (~150 lines, no dependencies,
directly readable). It computes four independent components per airport, each
min-max normalized to 0–100 **relative to whichever peer set is being
scored** (a region, an explicit list, or the whole dataset):

| Component | Raw input | What it captures |
|---|---|---|
| **Traffic intensity** | annual enplanements ÷ runway count | How hard the existing physical plant is being worked |
| **Delay burden** | 100 − on-time departure % (or avg departure delay, min, if that's what's available) | Whether that intensity is actually showing up as operational pain |
| **Growth momentum** | year-over-year enplanement change % | Whether demand is still rising — a strained-but-flat airport is a different story than strained-and-growing |
| **Capacity constraint** | inverse of (runway count, longest runway length) | How much physical headroom already exists to absorb growth without new construction |

Two composite scores are derived from these:

- **Congestion score** = 0.5 × traffic intensity + 0.5 × delay burden.
  Used for direct "how busy/strained is X vs Y" comparisons.
- **Expansion candidacy score** (also referenced as "unmet demand score" in
  narrative answers — it's the same number) =
  0.30 × traffic intensity + 0.25 × delay burden + 0.25 × growth momentum +
  0.20 × capacity constraint.
  This is the top-line ranking metric: an airport scores high when it's
  heavily used *and* that shows up in delays *and* demand is still climbing
  *and* it doesn't have a lot of spare runway capacity to absorb that growth
  organically. That combination — not any single metric — is what makes a
  capital project (new runway, new terminal, more gates) the right lever
  versus, say, better scheduling.

**Why these weights and not others:** they're a defensible starting point,
not a fitted model — there's no historical "did the investment pay off"
outcome data to calibrate against in a one-day scope. Traffic intensity gets
the largest weight because it's the most direct physical-capacity signal;
delay burden and growth momentum are weighted equally as the two ways demand
pressure actually manifests (current pain vs. future trajectory); capacity
constraint gets the smallest weight because it's a modifier (how much of the
strain is "solvable" by existing headroom) rather than a demand signal
itself. **The weights are named constants in `lib/scoring.ts`** — changing
the investment thesis (e.g., weighting growth more heavily for a
growth-focused fund) is a one-line change, not a rewrite.

**Handling missing data:** BTS on-time performance isn't tracked for every
small field (Bangor, Juneau, Long Beach, etc.), and small airports may lack a
reliable YoY figure. Rather than imputing a value, a missing raw input drops
that component from the weighted average and the remaining weights are
renormalized to sum to 1. Every score carries a `data_completeness_pct` and
per-component `missing` flags, and the agent is instructed (system prompt) to
surface low completeness rather than presenting a partial score with false
confidence.

**Peer-set sensitivity (an intentional, surfaced tradeoff):** normalization
is relative. Ranking "New England" airports against each other produces a
different ordering than ranking them against the full national baseline set,
because min/max shift with the peer group. The agent is instructed to state
which peer set it used. This is a real tradeoff, not a bug: a regional
analyst usually wants "who's the standout in this region," while a portfolio
analyst wants "how does this region compare nationally" — both are valid
questions, so the tool exposes the peer set as a parameter rather than
hard-coding one.

**Long-haul share** (`long_haul_share_pct`) is not part of the scoring model
— it's a descriptive metric for questions like "what % of flights out of
Anchorage are long-haul." It's computed in `scripts/build-dataset.mjs` from
each airport's public list of nonstop scheduled destinations (see §4), by
great-circle distance to each destination, with a 2,000-statute-mile
long-haul threshold (a documented simplification — see §5).

## 3. Where AI is used (and where it deliberately isn't)

| Layer | AI? |
|---|---|
| Deciding *which* tool(s) to call for a given question | Yes — LLM function-calling (OpenAI, `gpt-4.1-mini` by default) |
| Computing scores, rankings, comparisons, long-haul %, distances | **No** — pure TypeScript arithmetic in `lib/scoring.ts` / `scripts/build-dataset.mjs` |
| Narrating results in plain English, holding conversational context across follow-ups | Yes — LLM, but constrained by a system prompt that forbids inventing numbers and requires citing tool output |
| Resolving region names ("New England") to airport lists | **No** — a hand-curated lookup table (`data/regions.json`), not LLM geography knowledge, so it's reproducible and can't silently drift |
| Gathering the underlying FAA/BTS/destination data that seeds the dataset | A research pass (this was done once, offline, to produce `data/faa-bts-raw.json`) — not part of the running app, and not LLM-generated numbers, just LLM-assisted *retrieval* of real published figures with citations in `data/SOURCES.md` |

The system prompt (`app/api/chat/route.ts`) is the main lever constraining
model behavior: it explicitly forbids estimating numbers, requires stating
data completeness and peer-set caveats, and requires walking through the
actual score-component breakdown rather than a generic explanation when
asked "why."

## 4. Data sources

| Source | What it provides | How it's fetched | Freshness |
|---|---|---|---|
| [OurAirports](https://ourairports.com/data/) (public domain CSV) | Runway count/length, coordinates, airport type | Live HTTP fetch at build time (`scripts/fetch-ourairports.mjs`) | Re-run anytime; OurAirports updates continuously |
| FAA CY Primary Airport enplanement tables | Annual enplanements, YoY change, hub classification | Curated once via a research pass into `data/faa-bts-raw.json`, cited in `data/SOURCES.md` | Snapshot, dated |
| BTS (Bureau of Transportation Statistics) on-time performance | On-time departure %, avg departure delay | Same curated pass, best-effort — not tracked for every small field | Snapshot, dated |
| Wikipedia "Airlines and destinations" tables | Nonstop destination lists (used to derive long-haul share) | Same curated pass | Snapshot, dated, and inherently can lag real schedules |
| [OpenSky Network](https://openskynetwork.github.io/opensky-api/rest.html) REST API | Live count of aircraft currently airborne near an airport | **Live**, at request time, via `lib/opensky.ts`, no API key | Real-time (anonymous access, rate-limited) |

### Why static-curated FAA/BTS data instead of a live query at request time

FAA and BTS don't expose a simple, free, key-less REST endpoint for
enplanements/on-time performance the way OpenSky does for live flight
positions — the real sources are bulk annual tables (FAA) and a
monthly-report / bulk-download portal (BTS transtats.bts.gov) not meant for
per-request querying. Hitting them on every chat message would be slow,
fragile, and pointless (the underlying numbers don't change intra-day
anyway). So this data is fetched once via a documented research/ingest pass
and cached as JSON; only the genuinely time-sensitive signal (current
airborne traffic) is queried live. This is a standard "batch what's
slow-changing, stream what's fast-changing" tradeoff — see §5 for its
limitations.

## 5. Assumptions, uncertainty, and scoping (read this before trusting a number)

- **Coverage is curated, not exhaustive.** The dataset covers New England (6
  airports), the LA Basin (5), the SF Bay Area (3), Alaska (3), and 11
  national-baseline major hubs for ranking context — chosen to cover the
  assignment's example questions plus enough peers for the scores to be
  meaningful. It is *not* all US commercial airports. The agent is instructed
  to say so (via `list_supported_airports`) rather than guess about an
  airport outside this set. (An earlier draft also included Burlington, VT,
  but it was dropped from the New England peer group because it lacked
  FAA/BTS coverage — see "Handling missing data" below for why a
  mostly-missing-data airport shouldn't be left to rank based on one
  surviving component.)
- **Long-haul share is a route-count proxy, not a traffic-weighted metric.**
  It's "% of *listed nonstop destinations* beyond 2,000 miles," not "% of
  *flights* or *seats*" — a destination served once a week counts the same as
  one served ten times a day. Getting true flight-frequency-weighted
  stage-length data would require BTS T-100 segment data, which isn't
  practically fetchable as a live/simple source within this scope. The 2,000
  statute-mile threshold is also a simplification — real industry usage
  sometimes defines "long-haul" by flight duration (~6h+) rather than pure
  distance. Both the threshold and the caveat are surfaced in tool output and
  the system prompt requires the agent to state it when answering.
- **BTS on-time data has real gaps**, especially for smaller New England and
  Alaska fields. Where missing, the agent is instructed to say so rather than
  substitute a regional average or omit the caveat.
- **Scoring weights are a reasoned starting point, not a calibrated model.**
  There's no historical ground truth ("did the $200M terminal expansion at X
  actually pay off") to fit weights against in a one-day scope. Treat the
  ranking as a structured way to prioritize *where to look first*, not a
  finished investment recommendation.
- **OpenSky's live snapshot is a point-in-time count**, sensitive to time of
  day and anonymous-tier rate limits (~400 req/day). It's shown as
  supplementary color, explicitly excluded from the deterministic composite
  scores so those stay reproducible.
- **FAA/BTS/Wikipedia figures are a dated snapshot** (see `data/SOURCES.md`
  for exact retrieval dates and URLs per field) — re-run
  `scripts/build-dataset.mjs` after refreshing `data/faa-bts-raw.json` to
  update.

## 6. Key tradeoffs

- **Batch-curated stats + one live API, vs. all-live.** Discussed in §4 —
  chosen for reliability and speed over "everything live."
- **Min-max normalization relative to a chosen peer set, vs. a fixed global
  scale.** Chosen because "how does this airport compare to its actual
  peers" is usually the more useful question than an arbitrary fixed 0–100
  scale that would compress all the interesting variation among, say, three
  small New England fields into a narrow band near zero if scored against
  ATL and ORD.
- **Tool-calling chat loop (non-streaming), vs. token-streaming UI.** A
  streaming UI feels more responsive, but this app's answers depend on
  multiple sequential tool calls (e.g. rank, then look up two profiles) that
  need to resolve before the final narration is coherent — streaming
  intermediate tool-calling turns adds UI complexity without adding
  information. The tradeoff taken here: show the full deterministic tool
  trace (inputs/outputs) alongside the final answer instead, which is more
  useful for an investment-analysis tool than a token-by-token typing effect.
- **A single composite ranking score, vs. multiple unreconciled scores.**
  Early design considered separate "congestion," "unmet demand," and
  "expansion candidacy" composites with different weights. They were
  collapsed into one clearly-named formula (expansion candidacy = unmet
  demand) plus a separate, simpler congestion score, specifically to avoid
  the failure mode of an investment tool presenting two different numbers for
  what a reviewer would reasonably assume is the same underlying question.

## 7. Running it

```bash
npm install
node scripts/fetch-ourairports.mjs   # refresh physical/runway data (optional, already checked in)
node scripts/build-dataset.mjs       # rebuild the merged dataset (optional, already checked in)
cp .env.local.example .env.local     # add your OPENAI_API_KEY
npm run dev
```

See `README.md` for more.
