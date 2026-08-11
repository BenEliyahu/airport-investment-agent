# Sources — Airport Investment Intelligence Agent data

All data below was retrieved on **2026-08-11**. Figures are used exactly as published by the cited agency/page unless noted as "computed" (i.e., derived by simple arithmetic from two published figures).

## 1. FAA passenger enplanements + hub classification

**Primary source (covers all 28 airports in one table):**

- **FAA, "Cy2024 Enplanements at All Commercial Service Airports (by Rank)"** — Source line on the document reads "Source: CY2024 ACAIS ... 9/15/2025" (i.e., FAA's Air Carrier Activity Information System, final CY2024 data, published 9/15/2025).
  - Publisher: Federal Aviation Administration (FAA), Office of Airports Planning & Programming
  - Landing page: https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger
  - Direct PDF: https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/arp-cy2024-commercial-service-enplanements.pdf
  - Retrieved: 2026-08-11
  - Fields used: `annual_enplanements` (CY24 Enplanements column), `prior_year_enplanements` (CY23 Enplanements column), `yoy_change_pct` (% Change column, as published — not computed), `faa_hub_classification` (Hub column: L=Large Hub, M=Medium Hub, S=Small Hub, N=Nonhub; all 28 requested airports are classified as Primary "P" service-level airports in this table, so none required the "Nonprimary" fallback category)
  - Note: Also cross-referenced against the companion table "CY2024 Enplanements at All Airports (Primary, Non-primary Commercial Service, and General Aviation) by State" (https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger/ARP-cy2024-all-enplanements.pdf) to confirm classification of the smaller New England/Alaska/LA-basin fields (BGR, FAI, JNU, LGB) — all four ARE present in the primary/commercial-service table with real hub classifications, contrary to the initial assumption that they might be nonprimary/GA-only fields.

## 2. BTS on-time performance

Two distinct BTS/DOT tables were used, both drawn from the Bureau of Transportation Statistics' Air Travel Consumer Report (ATCR) program (14 CFR Part 234 airline-reported data):

**2a. Full-year 2024 figures — "Core 30" largest US airports only (14 of our 28 airports qualify: ATL, ORD, DFW, DEN, JFK, SEA, MIA, PHX, MCO, LAS, CLT, BOS, LAX, SFO):**

- **BTS, "Table 6: Ranking of Major Airport On-Time Departure Performance, Year-to-date thru December 2024"** (workbook covering 2003–2024, sheet "2024")
  - Publisher: Bureau of Transportation Statistics (BTS), U.S. DOT
  - Page: https://www.bts.gov/annual-time-departure-performance
  - File: https://www.bts.gov/sites/bts.dot.gov/files/2025-03/Table%206%20Ranking%20of%20Major%20Airport%20On-Time%20Departure%20Performance%20Year-to-date%20December%202003-Dec%202024.xlsx
  - Retrieved: 2026-08-11 (bts.gov blocks direct automated downloads with a 403; file was retrieved via the Internet Archive Wayback Machine mirror of the same URL, https://web.archive.org, snapshot from 2025)
  - Field used: `ontime_departure_pct` for the 14 Core-30 airports listed above, period = "Jan 1 – Dec 31, 2024"
  - Companion arrival table (used only for cross-checking, not stored): "Table 4: Ranking of Major Airport On-Time Arrival Performance, Year-to-date thru December 2024" at https://www.bts.gov/sites/bts.dot.gov/files/2025-03/Table%204%20Ranking%20of%20Major%20Airport%20On-Time%20Arrival%20Performance%20Year-to-date%20through%20December%202003-Dec%202024.xlsx

**2b. October 2024 monthly figures — remaining 14 smaller/regional airports (PVD, BDL, MHT, PWM, BGR, SNA, BUR, LGB, ONT, OAK, SJC, ANC, FAI, JNU):**

- **DOT/BTS, "Air Travel Consumer Report," issued December 2024 (covers October 2024 flight-delay data), Table 5 — "On-Time Arrival and Departure Percentage, by Airport, by Reporting Operating Carrier"**
  - Publisher: U.S. Department of Transportation, Office of Aviation Consumer Protection, using data collected by BTS
  - Landing page: https://www.bts.gov/newsroom/air-travel-consumer-report-december-2024-full-year-2024-numbers
  - Direct PDF: https://www.transportation.gov/sites/dot.gov/files/2025-01/December%202024%20ATCR.pdf
  - Retrieved: 2026-08-11 (transportation.gov also blocks direct automated downloads with a 403; file was retrieved via the Internet Archive Wayback Machine mirror)
  - Field used: `ontime_departure_pct` (DEP column of Table 5) for the 14 smaller airports, period = "October 2024" — this table lists on-time % for 200+ US airports for a single month, which is the finest-grained coverage available for these smaller fields. A full-year, airport-level on-time series does not appear to be published by BTS/DOT for airports outside the "Core 30."
  - `avg_departure_delay_min` is **null for all 28 airports**: neither the Core-30 annual ranking tables nor the ATCR Table 5 report an average-delay-in-minutes metric — both report only "percent on-time" (flights departing/arriving within 15 minutes of schedule). BTS does publish delay-cause data by airport (transtats.bts.gov "OT_DelayCause"), but that interactive query tool could not be retrieved via automated fetch in this session (also blocked by bot protection) and was not used to avoid guessing/estimating a figure.

## 3. Nonstop scheduled destinations

- **Source:** English Wikipedia, "Airlines and destinations" section/table of each airport's article.
- **Publisher:** Wikipedia (en.wikipedia.org), community-maintained, sourced by editors from airline schedules; content reflects whatever is currently published on each article and can be **stale, incomplete, or include seasonal/charter/cargo routes not clearly separated from mainline scheduled passenger service.** Several large-hub articles (SFO, ATL, ORD, DFW, JFK, SEA, MIA, MCO) are very long, and standard page fetches were truncated before reaching or completing the destinations table; for those, the specific "Passenger" wiki-section was retrieved directly via the MediaWiki API (`action=parse&section=N&prop=wikitext`) to get a more complete list. MIA and MCO's sections were large enough (MIA's Passenger section alone is roughly 100KB of wikitext) that even the section-level fetch may have truncated a small number of destinations near the end of the airline list (flagged per-airport in `faa-bts-raw.json`).
- **Retrieved:** 2026-08-11, for all 28 airports. Individual article URLs (as fetched):
  - BOS: https://en.wikipedia.org/wiki/Logan_International_Airport
  - PVD: https://en.wikipedia.org/wiki/Rhode_Island_T._F._Green_International_Airport
  - BDL: https://en.wikipedia.org/wiki/Bradley_International_Airport
  - MHT: https://en.wikipedia.org/wiki/Manchester%E2%80%93Boston_Regional_Airport
  - PWM: https://en.wikipedia.org/wiki/Portland_International_Jetport
  - BGR: https://en.wikipedia.org/wiki/Bangor_International_Airport
  - LAX: https://en.wikipedia.org/wiki/Los_Angeles_International_Airport
  - SNA: https://en.wikipedia.org/wiki/John_Wayne_Airport
  - BUR: https://en.wikipedia.org/wiki/Hollywood_Burbank_Airport
  - LGB: https://en.wikipedia.org/wiki/Long_Beach_Airport
  - ONT: https://en.wikipedia.org/wiki/Ontario_International_Airport
  - SFO: https://en.wikipedia.org/wiki/San_Francisco_International_Airport
  - OAK: https://en.wikipedia.org/wiki/Oakland_International_Airport
  - SJC: https://en.wikipedia.org/wiki/San_Jose_International_Airport (Norman Y. Mineta San José International Airport)
  - ANC: https://en.wikipedia.org/wiki/Ted_Stevens_Anchorage_International_Airport
  - FAI: https://en.wikipedia.org/wiki/Fairbanks_International_Airport
  - JNU: https://en.wikipedia.org/wiki/Juneau_International_Airport
  - ATL: https://en.wikipedia.org/wiki/Hartsfield%E2%80%93Jackson_Atlanta_International_Airport
  - ORD: https://en.wikipedia.org/wiki/O%27Hare_International_Airport
  - DFW: https://en.wikipedia.org/wiki/Dallas_Fort_Worth_International_Airport (redirected from "Dallas/Fort Worth International Airport")
  - DEN: https://en.wikipedia.org/wiki/Denver_International_Airport
  - JFK: https://en.wikipedia.org/wiki/John_F._Kennedy_International_Airport
  - SEA: https://en.wikipedia.org/wiki/Seattle%E2%80%93Tacoma_International_Airport
  - MIA: https://en.wikipedia.org/wiki/Miami_International_Airport
  - PHX: https://en.wikipedia.org/wiki/Phoenix_Sky_Harbor_International_Airport
  - MCO: https://en.wikipedia.org/wiki/Orlando_International_Airport
  - LAS: https://en.wikipedia.org/wiki/Harry_Reid_International_Airport
  - CLT: https://en.wikipedia.org/wiki/Charlotte_Douglas_International_Airport

## Known limitations / caveats

1. **On-time data is not apples-to-apples across airports.** The 14 largest airports have a genuine full-year (Jan–Dec 2024) on-time departure percentage from BTS's official annual "Core 30" ranking. The other 14 smaller/regional airports only have a single-month (October 2024) snapshot from the ATCR Table 5, because BTS does not publish an airport-level annual on-time series for airports outside the Core 30. This is flagged per-airport in the `ontime_period` field of `faa-bts-raw.json` — do not treat these two figures as directly comparable without accounting for seasonality (October is a relatively favorable month for weather-related delays at most of these airports).
2. **`avg_departure_delay_min` is null for all 28 airports** — this metric was not found in any bulk BTS source that could be retrieved; only percent-on-time was available. Not guessed or estimated.
3. **bts.gov and transportation.gov both return HTTP 403 to direct automated requests** (Akamai bot protection). All BTS/DOT files were ultimately retrieved via the Internet Archive Wayback Machine's cached copies of the same official URLs — the underlying files are identical to what BTS/DOT published, just accessed through a mirror rather than the live site.
4. **Wikipedia destination lists are a snapshot of a crowd-sourced, frequently-changing source** and may include seasonal, charter, or (in a few cases where the source table wasn't clearly separated) cargo-only routes; two of the largest airports' lists (MIA, MCO) may be missing a small number of destinations at the tail end of a very long alphabetical airline list due to tool-side truncation on an unusually large source table. These are noted per-airport in `destinations_source_note` / `notes`.
5. Four airports the task brief flagged as *possibly* too small to have FAA/BTS data (BGR, FAI, JNU, LGB) **do** appear in the FAA CY2024 primary-airport enplanement table with real hub classifications (BGR/JNU: Nonhub; FAI/LGB: Small Hub) and **do** appear in the BTS ATCR Table 5 October 2024 on-time list — so no fields were nulled out for these four. ANC also turned out to have full data (Medium Hub, on-time data present) contrary to a similar concern.
