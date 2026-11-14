import { CATEGORIES } from "@finos/engine";

/**
 * AI provider: Groq or Google Gemini, both called through their OpenAI-compatible
 * chat-completions endpoints. Pick one with AI_PROVIDER=groq|gemini; if unset,
 * whichever API key is present is used (Groq first).
 */
type Provider = { name: "groq" | "gemini"; url: string; key: string; model: string };

function pickProvider(): Provider | null {
  const groq: Provider | null = process.env.GROQ_API_KEY
    ? { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" }
    : null;
  const gemini: Provider | null = process.env.GEMINI_API_KEY
    ? { name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-2.5-flash" }
    : null;
  const wanted = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (wanted === "gemini") return gemini;
  if (wanted === "groq") return groq;
  return groq ?? gemini;
}

export const provider = pickProvider();
export const MODEL = provider?.model ?? "";
export const aiEnabled = () => provider !== null;
const KEY_HINT = "set GROQ_API_KEY or GEMINI_API_KEY (and optionally AI_PROVIDER) in apps/api/.env";

if (provider) console.log(`AI provider: ${provider.name} (${provider.model})`);
else console.warn(`AI is off: ${KEY_HINT}.`);

export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: unknown; tool_call_id?: string };
export type ChatReply = { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };

/** One chat-completions call against the configured provider. Throws on HTTP or network errors. */
export async function chat(opts: {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  json?: boolean;
  tools?: readonly unknown[];
}): Promise<ChatReply> {
  if (!provider) throw new Error(`AI is off: ${KEY_HINT}`);
  const body: Record<string, unknown> = { model: provider.model, messages: opts.messages, temperature: opts.temperature ?? 0.2 };
  if (opts.max_tokens) body.max_tokens = opts.max_tokens;
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.tools) Object.assign(body, { tools: opts.tools, tool_choice: "auto" });
  if (provider.name === "gemini") {
    // Gemini 2.5 "thinks" by default and those tokens count against max_tokens; keep it light and leave headroom.
    body.reasoning_effort = "low";
    if (opts.max_tokens) body.max_tokens = opts.max_tokens + 1024;
  }
  const r = await fetch(provider.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${provider.name} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = (await r.json()) as { choices?: { message?: ChatReply }[] };
  return data.choices?.[0]?.message ?? { content: null };
}

/** Categorize descriptions the rules could not. Returns {description: category}. Falls back to {} on any failure. */
export async function aiCategorize(descriptions: string[]): Promise<Record<string, string>> {
  if (!provider || !descriptions.length) return {};
  try {
    const m = await chat({
      temperature: 0,
      json: true,
      messages: [
        {
          role: "system",
          content: `Categorize bank transaction descriptions. Allowed categories: ${CATEGORIES.join(", ")}. Reply with JSON: {"results": [{"description": "...", "category": "..."}]}. Use "Other" if unsure.`,
        },
        { role: "user", content: JSON.stringify(descriptions) },
      ],
    });
    const parsed = JSON.parse(m.content ?? "{}");
    const out: Record<string, string> = {};
    for (const r of parsed.results ?? [])
      if (typeof r?.description === "string" && (CATEGORIES as readonly string[]).includes(r.category)) out[r.description] = r.category;
    return out;
  } catch (e) {
    console.warn("AI categorize failed:", (e as Error).message);
    return {};
  }
}

/** Plain-language explanation grounded strictly in numbers computed by the engine. */
export async function aiExplain(topic: string, facts: unknown): Promise<string> {
  if (!provider) return `AI explanations are disabled (${KEY_HINT}).`;
  try {
    const m = await chat({
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You are a careful financial explainer. Explain the given analysis in 3-5 short sentences for a non-expert. Use ONLY the numbers in the data; never invent figures. State the uncertainty plainly (probabilities are estimates, not guarantees). End with one concrete suggested action. You are not a licensed financial advisor.",
        },
        { role: "user", content: `Topic: ${topic}\nData: ${JSON.stringify(facts)}` },
      ],
    });
    return m.content?.trim() || "No explanation generated.";
  } catch (e) {
    return `Explanation unavailable: ${(e as Error).message}`;
  }
}

/** Answers a free-form money question using only the supplied facts. */
export async function aiAsk(question: string, facts: unknown): Promise<string> {
  if (!provider) return `AI answers are off. To turn them on, ${KEY_HINT}.`;
  try {
    const m = await chat({
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You answer questions about one person's finances using ONLY the JSON facts provided. Amounts are Indian rupees. Be concise (under 120 words), concrete, and cite the numbers you use. If the facts cannot answer the question, say what is missing. Never invent numbers. Forecast probabilities are estimates, not guarantees. You are not a licensed financial advisor.",
        },
        { role: "user", content: `Facts: ${JSON.stringify(facts)}\n\nQuestion: ${question}` },
      ],
    });
    return m.content?.trim() || "I couldn't produce an answer. Try rephrasing the question.";
  } catch (e) {
    return `I couldn't reach the AI service (${(e as Error).message}). Try again in a moment.`;
  }
}
