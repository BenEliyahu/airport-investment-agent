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

// Minimal shape of the (non-standard, vendor-prefixed) Web Speech API --
// not in TypeScript's DOM lib, so declared locally rather than pulling in
// a types package for a few fields.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    SpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" strokeLinecap="round" />
      <line x1="8" y1="22" x2="16" y2="22" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="4,9 8,9 13,4 13,20 8,15 4,15" />
      {active ? (
        <path d="M17 8a5 5 0 0 1 0 8M20 5a9 9 0 0 1 0 14" strokeLinecap="round" />
      ) : (
        <line x1="17" y1="8" x2="22" y2="14" strokeLinecap="round" />
      )}
    </svg>
  );
}

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

  const [micSupported, setMicSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    // Deferred to an effect (not a lazy useState initializer) on purpose --
    // this must run after hydration so the SSR pass and first client render
    // match; the server never has these browser APIs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMicSupported(getSpeechRecognitionCtor() !== null);
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1][0].transcript;
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${last}` : last));
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
    setRecording(true);
    recognition.start();
  }

  function toggleSpeak(index: number, text: string) {
    if (!ttsSupported) return;
    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  }

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
            See{" "}
            <a
              href="https://github.com/BenEliyahu/airport-investment-agent/blob/main/DESIGN.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              DESIGN.md
            </a>{" "}
            for methodology.
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
                  <div className="flex items-start gap-2">
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.role === "assistant" && ttsSupported && (
                      <button
                        type="button"
                        onClick={() => toggleSpeak(i, m.content)}
                        aria-label={speakingIndex === i ? "Stop reading answer aloud" : "Read answer aloud"}
                        className="mt-0.5 flex-none rounded p-1"
                        style={{
                          color: speakingIndex === i ? "var(--series-1)" : "var(--text-muted)",
                        }}
                      >
                        <SpeakerIcon active={speakingIndex === i} />
                      </button>
                    )}
                  </div>
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
              placeholder={
                recording
                  ? "Listening…"
                  : "Ask about airport congestion, growth, or expansion candidacy…"
              }
              className="flex-1 rounded-md border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
            {micSupported && (
              <button
                type="button"
                onClick={toggleRecording}
                aria-label={recording ? "Stop voice input" : "Start voice input"}
                className={`rounded-md border px-3 py-2 ${recording ? "motion-safe:animate-pulse" : ""}`}
                style={{
                  borderColor: recording ? "var(--status-critical)" : "var(--border-hairline)",
                  color: recording ? "var(--status-critical)" : "var(--text-secondary)",
                  background: "var(--surface-1)",
                }}
              >
                <MicIcon />
              </button>
            )}
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
