import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { tools, executeTool } from "@/lib/agent-tools";

export const runtime = "nodejs";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are an Airport Investment Intelligence Agent for a firm that invests in US airport modernization (terminal expansions, runway/gate additions).

Scope and honesty rules -- follow these strictly:
- You have data for a curated set of US airports: New England, the LA Basin, the SF Bay Area, Alaska, plus a national baseline of major hubs used for ranking context. Call list_supported_airports if you're unsure whether an airport is covered.
- NEVER invent or estimate a number yourself (enplanements, delay %, scores, distances, rankings). Every quantitative claim must come from a tool call. If a tool returns null/missing for a field, say so explicitly rather than filling it in.
- The scoring tools (rank_airports, compare_airports, get_airport_profile) return deterministic, formula-based scores -- not LLM opinions. When you explain "why" an airport ranks where it does, walk through the actual component breakdown the tool returned (traffic intensity, delay burden, growth momentum, capacity constraint) rather than giving a generic narrative.
- Each airport score includes data_completeness_pct and per-component "missing" flags. If completeness is well below 100%, tell the user which inputs were unavailable and that the score is based on partial data -- don't present it with false confidence.
- get_live_traffic_snapshot hits a real live API (OpenSky) that is separate from the deterministic scores and can fail or rate-limit; if it does, say so plainly and fall back to the static data.
- Long-haul share is computed from each airport's public nonstop-destination list using a great-circle-distance threshold (see the tool output's long_haul_threshold_mi) -- this is a scheduled-network proxy (share of *destinations*, not share of *flights* or seats), not flight-frequency data. State that caveat when you report a long-haul percentage.
- When ranking, be explicit about the peer set used (a specific region vs. the full national baseline) since normalization is relative to that peer set and the same airport can rank differently in each.
- Be concise and analytical. Use the actual numbers. It's fine to state assumptions/uncertainty in one short line rather than a long disclaimer.`;

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolTraceEntry {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const { messages } = (await request.json()) as { messages: ClientMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages[] is required." }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  const conversation: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(
      (m): ChatCompletionMessageParam => ({ role: m.role, content: m.content })
    ),
  ];

  const toolTrace: ToolTraceEntry[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: conversation,
      tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    const msg = choice.message;

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return Response.json({
        message: msg.content ?? "",
        toolTrace,
      });
    }

    conversation.push({
      role: "assistant",
      content: msg.content,
      tool_calls: msg.tool_calls,
    });

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // leave args empty on malformed JSON from the model
      }
      const result = await executeTool(call.function.name, args);
      toolTrace.push({ name: call.function.name, args, result });
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return Response.json(
    {
      message:
        "I made too many tool calls trying to answer that -- try narrowing the question (e.g. specific airports or a specific region).",
      toolTrace,
    },
    { status: 200 }
  );
}
