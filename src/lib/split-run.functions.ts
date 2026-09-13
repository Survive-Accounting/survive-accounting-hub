// split-run.functions.ts — the server call behind the Editor's "✂ Split this".
//
// Lee, 2026-09-12: "we build the SPLIT first, we keep going to split it down further and further …
// We let AI help us with this, arranging it." The panel hands one Reel over with whatever he just
// said about it; this asks the gateway to propose the finer split and hands back a CLAMPED
// proposal (components/blastoff/split-run.ts owns both the prompt and the parse, so the rules live
// with the tests rather than in a server file).
//
// Same infra as every other server fn here: AI_GATEWAY_API_KEY + the OpenAI-compatible endpoint,
// model overridable by env. Read-only — it proposes; the Editor's "Build it" is what writes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildSplitMessages, parseSplitProposal, type SplitProposal } from "@/components/blastoff/split-run";

const AI_TIMEOUT_MS = 45_000;
// THE CHEAP PASS (Studio prompt 3, 2026-09-13): the split is proposed at split time and re-run
// freely, so the default is the fast, cheap model; SPLIT_RUN_MODEL overrides it.
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

/** Strip code fences + slice to the outermost JSON object (models love to wrap). */
function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) return {};
  try { return JSON.parse(cleaned.slice(a, b + 1)) as Record<string, unknown>; } catch { return {}; }
}

const inputSchema = z.object({
  topicName: z.string().max(200),
  setName: z.string().max(200),
  reelTitle: z.string().max(200),
  // Room for a whole unsplit set (5 Types of Accounts is 49 cards / 219 slides).
  slides: z.array(z.object({ kind: z.string().max(40), words: z.string().max(600) })).max(300),
  cards: z.array(z.object({ id: z.string().max(40), stem: z.string().max(600), speed: z.boolean().optional() })).max(120),
  note: z.string().max(4000),
  mode: z.enum(["split", "one"]).optional(),
});

export const proposeSplitRun = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<{ proposal: SplitProposal; model: string }> => {
    const aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!aiKey) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
    const model = process.env.SPLIT_RUN_MODEL || DEFAULT_MODEL;
    const { system, user } = buildSplitMessages(data);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { proposal: parseSplitProposal(extractJson(json.choices?.[0]?.message?.content ?? "{}")), model };
    } finally {
      clearTimeout(timer);
    }
  });
