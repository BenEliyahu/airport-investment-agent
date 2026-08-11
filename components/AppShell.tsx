"use client";

import { useState, useRef, useEffect } from "react";
import { Sidebar, type ToolTraceEntry } from "./Sidebar";
import { ToolTraceDisclosure } from "./ToolTraceDisclosure";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTraceEntry[];
}

const SUGGESTIONS = [
  "Which airports in New England are strong candidates for terminal expansion?",
  "Compare LA and Santa Ana airport congestion levels.",
  "What is the percentage of long haul flights out of Anchorage airport?",
  "What is the unmet flight demand in SFO airport and why?",
];

export function AppShell() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I'm an airport investment intelligence agent. I can rank and compare US airports (New England, LA Basin, SF Bay Area, Alaska, plus major national hubs) for terminal/runway expansion potential, using deterministic scoring over FAA, BTS, OurAirports, and live OpenSky data. Ask me something, or try a suggestion below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const lastAssistantTrace =
    [...messages].reverse().find((m) => m.role === "assistant" && m.toolTrace?.length)
      ?.toolTrace ?? [];

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message, toolTrace: data.toolTrace },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-6xl flex-col p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Airport Investment Intelligence Agent
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Deterministic scoring + conversational reasoning over public airport data.
            See <a href="/DESIGN.md" className="underline">DESIGN.md</a> for methodology.
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_360px]">
        <div
          className="flex min-h-0 flex-col rounded-lg border"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-left text-sm ${
                    m.role === "user" ? "" : ""
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "var(--series-1)", color: "#ffffff" }
                      : { background: "var(--background)", color: "var(--text-primary)" }
                  }
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.role === "assistant" && m.toolTrace && (
                    <ToolTraceDisclosure trace={m.toolTrace} />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Thinking…
              </p>
            )}
            {error && (
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 border-t p-3" style={{ borderColor: "var(--border-hairline)" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1 text-xs transition-colors"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t p-3"
            style={{ borderColor: "var(--border-hairline)" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about airport congestion, growth, or expansion candidacy…"
              className="flex-1 rounded-md border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--series-1)" }}
            >
              Send
            </button>
          </form>
        </div>

        <aside className="min-h-0 overflow-y-auto">
          <Sidebar trace={lastAssistantTrace} />
        </aside>
      </div>
    </div>
  );
}
