"use client";

import type { ToolTraceEntry } from "./Sidebar";

// Proof it's "not only LLM output" -- shows the actual tool calls and raw results behind an answer.
export function ToolTraceDisclosure({ trace }: { trace: ToolTraceEntry[] }) {
  if (trace.length === 0) return null;
  return (
    <details className="mt-2 text-xs">
      <summary
        className="cursor-pointer select-none"
        style={{ color: "var(--text-muted)" }}
      >
        {trace.length} deterministic tool call{trace.length > 1 ? "s" : ""} behind this answer
      </summary>
      <div className="mt-2 space-y-2">
        {trace.map((t, i) => (
          <div
            key={i}
            className="rounded border p-2"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
          >
            <p className="font-mono font-semibold" style={{ color: "var(--series-1)" }}>
              {t.name}({JSON.stringify(t.args)})
            </p>
            <pre
              className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono"
              style={{ color: "var(--text-secondary)" }}
            >
              {JSON.stringify(t.result, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
