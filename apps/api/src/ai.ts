import Groq from "groq-sdk";
import { CATEGORIES } from "@finos/engine";

export const client = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
export const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export const aiEnabled = () => client !== null;

/** Categorize descriptions the rules could not. Returns {description: category}. Falls back to {} on any failure. */
export async function aiCategorize(descriptions: string[]): Promise<Record<string, string>> {
  if (!client || !descriptions.length) return {};
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Categorize bank transaction descriptions. Allowed categories: ${CATEGORIES.join(", ")}. Reply with JSON: {"results": [{"description": "...", "category": "..."}]}. Use "Other" if unsure.`,
        },
        { role: "user", content: JSON.stringify(descriptions) },
      ],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    const out: Record<string, string> = {};
    for (const r of parsed.results ?? [])
      if (typeof r?.description === "string" && (CATEGORIES as readonly string[]).includes(r.category)) out[r.description] = r.category;
    return out;
  } catch (e) {
    console.warn("Groq categorize failed:", (e as Error).message);
    return {};
  }
}

/** Plain-language explanation grounded strictly in numbers computed by the engine. */
export async function aiExplain(topic: string, facts: unknown): Promise<string> {
  if (!client) return "AI explanations are disabled (set GROQ_API_KEY).";
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
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
    return res.choices[0]?.message?.content?.trim() ?? "No explanation generated.";
  } catch (e) {
    return `Explanation unavailable: ${(e as Error).message}`;
  }
}

/** Answers a free-form money question using only the supplied facts. */
export async function aiAsk(question: string, facts: unknown): Promise<string> {
  if (!client) return "AI answers are off. Add GROQ_API_KEY to the API environment to turn them on.";
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
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
    return res.choices[0]?.message?.content?.trim() ?? "I couldn't produce an answer. Try rephrasing the question.";
  } catch (e) {
    return `I couldn't reach the AI service (${(e as Error).message}). Try again in a moment.`;
  }
}
