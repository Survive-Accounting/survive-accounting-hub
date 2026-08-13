// suggest-visual.functions.ts — Vercel server function behind the canvas
// "✨ Suggest visual" button. Given ONE frame's teaching context it asks the AI
// Gateway to recommend a World background + a layout template, then returns a
// SAFE, clamped suggestion (invalid ids → null). Mirrors the infra every other
// server fn here uses: process.env.AI_GATEWAY_API_KEY + the OpenAI-compatible
// gateway endpoint. The model is env-overridable (SUGGEST_VISUAL_MODEL) so Lee
// can pin a Haiku slug or fall back to the repo default without a code change.
//
// Additive + read-only: it only READS the frame context the client passes and
// RETURNS a suggestion. Applying it is the client's existing, undoable action.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { buildSuggestMessages, parseVisualSuggestion, type FrameContext, type VisualSuggestion } from "@/components/canvas/suggest-visual";

const AI_TIMEOUT_MS = 30_000;
// Default to a Haiku slug (Lee's preference); every other server fn here uses
// "google/gemini-2.5-flash", so that's the known-good fallback if the slug drifts.
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

// Strip code fences + slice to the outermost JSON object (models love to wrap).
function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) return {};
  try { return JSON.parse(cleaned.slice(a, b + 1)) as Record<string, unknown>; } catch { return {}; }
}

const frameSchema = z.object({
  title: z.string().optional(),
  beat: z.string(),
  entry: z.string().optional(),
  beats: z.string().optional(),
  exit: z.string().optional(),
  cardKinds: z.array(z.string()).default([]),
});

export const suggestVisualForFrame = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => frameSchema.parse(d))
  .handler(async ({ data }): Promise<{ suggestion: VisualSuggestion }> => {
    const aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!aiKey) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
    const model = process.env.SUGGEST_VISUAL_MODEL || DEFAULT_MODEL;

    const { system, user } = buildSuggestMessages(data as FrameContext);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const parsed = extractJson(json.choices?.[0]?.message?.content ?? "{}");
      return { suggestion: parseVisualSuggestion(parsed) };
    } finally {
      clearTimeout(timer);
    }
  });
