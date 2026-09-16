// film-names.functions.ts — "✨ Name them" in the Stitch Room's post queue (Lee, 2026-09-16: "when it comes to
// titling videos in the future… I want to have AI generate some on queue to post"). Given what each queued
// video covers (its first slide, last slide and every question — the same brief the room shows under a title),
// the AI Gateway returns one short name per video: distinct, thumbnail-sized, in the video's own words.
// Read-only on the server; the client writes the names it likes through renameFilmStitch.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AI_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const videoSchema = z.object({
  id: z.string().min(1).max(80),
  takeIndex: z.number().int().min(0).max(199),
  first: z.string().max(200).default(""),
  last: z.string().max(200).default(""),
  stems: z.array(z.string().max(200)).max(40).default([]),
});
const input = z.object({
  setName: z.string().max(200),
  topicName: z.string().max(200).default(""),
  videos: z.array(videoSchema).min(1).max(40),
});

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("["), b = cleaned.lastIndexOf("]");
  if (a === -1 || b === -1 || b <= a) return [];
  try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { return []; }
}

/** One name per video, as the model offered it — trimmed, capped, never empty, and unique across the batch. */
export function cleanNames(raw: unknown, ids: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw as Array<{ id?: unknown; name?: unknown }>) {
    const id = typeof row?.id === "string" ? row.id : "";
    let name = typeof row?.name === "string" ? row.name.replace(/\s+/g, " ").replace(/^["'“”]+|["'“”.]+$/g, "").trim() : "";
    if (!ids.includes(id) || !name) continue;
    if (name.length > 40) name = name.slice(0, 40).replace(/\s+\S*$/, "").trim() || name.slice(0, 40);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out[id] = name;
  }
  return out;
}

export const suggestStitchNames = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ names: Record<string, string> }> => {
    const aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!aiKey) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
    const model = process.env.SUGGEST_NAMES_MODEL || process.env.SUGGEST_VISUAL_MODEL || DEFAULT_MODEL;
    const system = [
      "You name short accounting cram videos for college students. Each name goes on a thumbnail and in a playlist.",
      "Rules: 2 to 4 words. Title Case. Distinct from every other name in the batch. Name the ONE idea the video teaches,",
      "in the video's own words when the slides give them (a cheat code, a question, a phrase). No numbering, no",
      "'Video', no 'Part', no colon, no emoji, no exclamation marks, no hype, nothing cringe. A question mark is fine",
      "when the video is a question. Never repeat the set's name.",
      "Reply with JSON only: [{\"id\": \"...\", \"name\": \"...\"}] — one entry per video, in the order given.",
    ].join(" ");
    const user = [
      `Set: ${data.setName}${data.topicName ? ` (topic: ${data.topicName})` : ""}`,
      "",
      ...data.videos.map((v) => [
        `id: ${v.id} · video ${v.takeIndex + 1}`,
        v.first ? `  opens on: ${v.first}` : "",
        v.last ? `  ends on: ${v.last}` : "",
        v.stems.length ? `  questions: ${v.stems.join(" | ")}` : "",
      ].filter(Boolean).join("\n")),
    ].join("\n");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { names: cleanNames(extractJson(json.choices?.[0]?.message?.content ?? "[]"), data.videos.map((v) => v.id)) };
    } finally {
      clearTimeout(timer);
    }
  });
