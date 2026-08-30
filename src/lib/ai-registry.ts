// AI MODEL REGISTRY (B0) — task → model string. CONFIG, NOT CODE: swapping a
// model is an edit to this map (or an env override), never a code change.
// Client-safe: strings + pricing only; the caller lives in ai.server.ts.
//
// Model strings are Vercel AI Gateway ids (provider/model). Chosen 2026-08-29
// from the Gateway catalog by the prompt's criteria — see BUILD-NOTES.md:
//   micro     = cheapest tier from a top provider with solid instruction-
//               following. Haiku 4.5: already this repo's proven micro model
//               (suggest-visual), $1/$5 per Mtok.
//   synthesis = current flagship class with ≥100k context for the transcript +
//               METHOD + Production Manual + Bible payload. Sonnet 4.5: 200k
//               context, the booth's pass has run on it in production since
//               v1, $3/$15 per Mtok.
//
// PRICING is for the studio cost line only (approximate, per million tokens);
// it never gates anything.

export type AiTask = "micro" | "synthesis";

export interface AiModelEntry {
  model: string;
  /** USD per 1M input / output tokens — cost-line arithmetic, nothing more. */
  inPerM: number;
  outPerM: number;
  maxOutput: number;
}

export const AI_REGISTRY: Record<AiTask, AiModelEntry> = {
  micro: {
    model: (typeof process !== "undefined" && process.env?.AI_MODEL_MICRO) || "anthropic/claude-haiku-4.5",
    inPerM: 1, outPerM: 5, maxOutput: 2_000,
  },
  synthesis: {
    model: (typeof process !== "undefined" && process.env?.AI_MODEL_SYNTHESIS) || "anthropic/claude-sonnet-4.5",
    inPerM: 3, outPerM: 15, maxOutput: 16_000,
  },
};

export interface AiUsage {
  task: AiTask;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export const costOf = (task: AiTask, model: string, inputTokens: number, outputTokens: number): number => {
  const e = AI_REGISTRY[task];
  return (inputTokens * e.inPerM + outputTokens * e.outPerM) / 1_000_000;
};

/** Sum usage stamps (payload._usage on generated items) into a session line. */
export const sumUsage = (usages: AiUsage[]): { calls: number; inputTokens: number; outputTokens: number; costUsd: number } =>
  usages.reduce((a, u) => ({ calls: a.calls + 1, inputTokens: a.inputTokens + u.inputTokens, outputTokens: a.outputTokens + u.outputTokens, costUsd: a.costUsd + u.costUsd }), { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
