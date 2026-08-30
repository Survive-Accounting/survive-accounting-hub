// ai.server.ts (B0) — THE ONE DOOR for Booth generation. Vercel AI SDK over
// the Vercel AI Gateway: one env key (AI_GATEWAY_API_KEY), provider-agnostic
// model strings from ai-registry.ts, unified spend. No direct provider SDKs
// anywhere else. Whisper transcription keeps its own pipeline — untouched.
//
// BEHAVIOR (the registry's contract):
//   · retries with backoff (2 attempts on the task's model);
//   · then ONE fallback attempt on the other registry entry;
//   · then throws a human-readable error the UI surfaces as retryable.
//   Generation NEVER blocks capture — callers fire-and-store, and every
//   result carries its token usage + cost for the studio cost line.
import { generateText } from "ai";

import { AI_REGISTRY, costOf, type AiTask, type AiUsage } from "@/lib/ai-registry";

export interface AiResult { text: string; usage: AiUsage }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOnce(task: AiTask, model: string, system: string, user: string, maxOutput: number): Promise<AiResult> {
  // The AI SDK routes plain "provider/model" strings through the Vercel AI
  // Gateway automatically when AI_GATEWAY_API_KEY is set.
  const res = await generateText({ model, system, prompt: user, maxOutputTokens: maxOutput });
  const inputTokens = res.usage?.inputTokens ?? 0;
  const outputTokens = res.usage?.outputTokens ?? 0;
  if (!res.text.trim()) throw new Error("empty completion");
  return { text: res.text, usage: { task, model, inputTokens, outputTokens, costUsd: costOf(task, model, inputTokens, outputTokens) } };
}

/** Run a registry task. Logs one line per call (model visibility is the QA
 *  hook for "swap the string → next generation uses it"). */
export async function runAiTask(task: AiTask, opts: { system: string; user: string; maxOutput?: number }): Promise<AiResult> {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
  const entry = AI_REGISTRY[task];
  const other: AiTask = task === "micro" ? "synthesis" : "micro";
  const maxOutput = Math.min(opts.maxOutput ?? entry.maxOutput, entry.maxOutput);
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callOnce(task, entry.model, opts.system, opts.user, maxOutput);
      console.log(`[ai] task=${task} model=${entry.model} in=${r.usage.inputTokens} out=${r.usage.outputTokens} cost=$${r.usage.costUsd.toFixed(4)}`);
      return r;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[ai] task=${task} model=${entry.model} attempt=${attempt + 1} failed: ${lastErr.message}`);
      await wait(600 * (attempt + 1));
    }
  }
  // One cross-registry fallback, then surface.
  try {
    const fb = AI_REGISTRY[other];
    const r = await callOnce(task, fb.model, opts.system, opts.user, Math.min(maxOutput, fb.maxOutput));
    console.log(`[ai] task=${task} FELL BACK to ${fb.model} in=${r.usage.inputTokens} out=${r.usage.outputTokens}`);
    return r;
  } catch (e) {
    const fbErr = e instanceof Error ? e : new Error(String(e));
    throw new Error(`generation failed on ${entry.model} (${lastErr?.message}) and the ${other} fallback (${fbErr.message}) — retry`);
  }
}
