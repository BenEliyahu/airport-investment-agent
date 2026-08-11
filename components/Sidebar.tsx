"use client";

import { RankingChart, type RankedRow } from "./RankingChart";
import { ComparisonChart, type ComparedAirport } from "./ComparisonChart";

export interface ToolTraceEntry {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

// Picks the latest visual-worthy tool call so the chat UI doesn't need chart internals.
export function Sidebar({ trace }: { trace: ToolTraceEntry[] }) {
  const last = [...trace].reverse().find((t) =>
    ["rank_airports", "compare_airports", "get_airport_profile", "get_live_traffic_snapshot"].includes(
      t.name
    )
  );

  if (!last) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-lg border p-6 text-center text-sm"
        style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}
      >
        Ask about a region, a comparison, or a specific airport and the
        underlying ranking/comparison data will show up here.
      </div>
    );
  }

  const result = last.result as Record<string, unknown>;

  if (last.name === "rank_airports" && Array.isArray(result?.ranked)) {
    const metric = (result.metric as string) ?? "expansion_candidacy_score";
    const rows: RankedRow[] = (
      result.ranked as { airport: { iata: string; city: string }; score: Record<string, number | null> }[]
    ).map((r) => ({
      iata: r.airport.iata,
      city: r.airport.city,
      value: r.score?.[metric] ?? null,
    }));
    const region = result.region as { label?: string } | null;
    const peerLabel = region?.label ?? `${result.peer_set_size ?? rows.length} airports (national dataset)`;
    return (
      <SidebarFrame title="Ranking">
        <RankingChart rows={rows} metric={metric} peerLabel={peerLabel} />
      </SidebarFrame>
    );
  }

  if (last.name === "compare_airports" && Array.isArray(result?.compared)) {
    const compared = result.compared as {
      airport?: { iata: string; city: string };
      iata?: string;
      score?: {
        components: { key: string; normalized_0_100: number | null }[];
      } | null;
    }[];
    const rows: ComparedAirport[] = compared
      .filter((c) => c.airport && c.score)
      .map((c) => {
        const byKey = new Map(
          c.score!.components.map((comp) => [comp.key, comp.normalized_0_100])
        );
        return {
          iata: c.airport!.iata,
          city: c.airport!.city,
          traffic_intensity: byKey.get("traffic_intensity") ?? null,
          delay_burden: byKey.get("delay_burden") ?? null,
          growth_momentum: byKey.get("growth_momentum") ?? null,
          capacity_constraint: byKey.get("capacity_constraint") ?? null,
        };
      });
    return (
      <SidebarFrame title="Comparison">
        <ComparisonChart airports={rows} />
      </SidebarFrame>
    );
  }

  if (last.name === "get_airport_profile" && result?.airport) {
    const airport = result.airport as Record<string, unknown>;
    const score = result.score as
      | { components: { key: string; normalized_0_100: number | null }[]; expansion_candidacy_score: number | null; data_completeness_pct: number }
      | null;
    const rows: ComparedAirport[] = score
      ? [
          {
            iata: airport.iata as string,
            city: airport.city as string,
            traffic_intensity:
              score.components.find((c) => c.key === "traffic_intensity")?.normalized_0_100 ?? null,
            delay_burden:
              score.components.find((c) => c.key === "delay_burden")?.normalized_0_100 ?? null,
            growth_momentum:
              score.components.find((c) => c.key === "growth_momentum")?.normalized_0_100 ?? null,
            capacity_constraint:
              score.components.find((c) => c.key === "capacity_constraint")?.normalized_0_100 ?? null,
          },
        ]
      : [];
    return (
      <SidebarFrame title={`${airport.name as string}`}>
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <Stat label="Hub class" value={(airport.faa_hub_classification as string) ?? "n/a"} />
          <Stat
            label="Enplanements"
            value={
              airport.annual_enplanements
                ? `${Number(airport.annual_enplanements).toLocaleString()} (${airport.enplanements_year})`
                : "n/a"
            }
          />
          <Stat
            label="Long-haul share"
            value={airport.long_haul_share_pct != null ? `${airport.long_haul_share_pct}%` : "n/a"}
          />
          <Stat
            label="Data completeness"
            value={score ? `${score.data_completeness_pct}%` : "n/a"}
          />
        </div>
        {rows.length > 0 && <ComparisonChart airports={rows} />}
      </SidebarFrame>
    );
  }

  if (last.name === "get_live_traffic_snapshot") {
    return (
      <SidebarFrame title="Live traffic snapshot">
        <p className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          {result.aircraft_in_vicinity != null ? String(result.aircraft_in_vicinity) : "n/a"}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          aircraft airborne nearby, right now (OpenSky Network)
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {String(result.note ?? "")}
        </p>
      </SidebarFrame>
    );
  }

  return null;
}

function SidebarFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="font-medium" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
