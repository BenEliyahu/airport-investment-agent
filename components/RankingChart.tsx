"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RankedRow {
  iata: string;
  city: string;
  value: number | null;
}

const METRIC_LABELS: Record<string, string> = {
  expansion_candidacy_score: "Expansion candidacy score",
  congestion_score: "Congestion score",
  growth_score: "Growth score",
  capacity_constraint_score: "Capacity constraint score",
};

export function RankingChart({
  rows,
  metric,
  peerLabel,
}: {
  rows: RankedRow[];
  metric: string;
  peerLabel: string;
}) {
  const data = rows
    .filter((r) => r.value != null)
    .map((r) => ({ ...r, label: `${r.iata}` }));

  if (data.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No scoreable data for this selection.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {METRIC_LABELS[metric] ?? metric}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Ranked within: {peerLabel}. Score is 0-100, normalized against this peer set.
        </p>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 36, left: 8, bottom: 4 }}
          barCategoryGap={10}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--gridline)"
            strokeDasharray="0"
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={44}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--gridline)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-hairline)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text-primary)",
            }}
            formatter={(value, _name, item) => [
              Number(value).toFixed(1),
              (item?.payload as { city?: string } | undefined)?.city ?? "score",
            ]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.iata} fill="var(--series-1)" />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: unknown) => Number(v).toFixed(0)}
              style={{ fill: "var(--text-secondary)", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
