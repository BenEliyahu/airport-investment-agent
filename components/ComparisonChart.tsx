"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ComparedAirport {
  iata: string;
  city: string;
  traffic_intensity: number | null;
  delay_burden: number | null;
  growth_momentum: number | null;
  capacity_constraint: number | null;
}

const SERIES: { key: keyof ComparedAirport; label: string; color: string }[] = [
  { key: "traffic_intensity", label: "Traffic intensity", color: "var(--series-1)" },
  { key: "delay_burden", label: "Delay burden", color: "var(--series-2)" },
  { key: "growth_momentum", label: "Growth momentum", color: "var(--series-3)" },
  { key: "capacity_constraint", label: "Capacity constraint", color: "var(--series-4)" },
];

export function ComparisonChart({ airports }: { airports: ComparedAirport[] }) {
  if (airports.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        Score components by airport
      </p>
      <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        Each component is 0-100, normalized against the full national dataset.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(200, airports.length * 90)}>
        <BarChart
          data={airports}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--gridline)" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="iata"
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
            formatter={(value, name) => [
              value == null ? "n/a" : Number(value).toFixed(1),
              String(name),
            ]}
          />
          <Legend
            verticalAlign="top"
            height={28}
            wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }}
          />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[0, 4, 4, 0]}
              maxBarSize={16}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
