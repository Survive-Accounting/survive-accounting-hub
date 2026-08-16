// RENDER WORKER BRIDGE — server fns the Studio publish calls to render the
// stitch on the Fly.io ffmpeg worker (worker/ in this repo) instead of Mux
// multi-input concat. The worker uploads its result straight into the public
// `canvas-media` bucket via a signed upload URL created here, so the existing
// Auphonic → Mux pipeline consumes it exactly like any staged file.
//
// Env (server-only, Vercel): RENDER_WORKER_URL + RENDER_WORKER_TOKEN. Both
// unset ⇒ the worker is "not configured" and publish falls back to the legacy
// Mux concat (loudly noted). Configured-but-unreachable ⇒ preflight blocks —
// never a silent fallback once Lee has opted into worker rendering.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Env tri-state. "partial" (one of the two set) is NOT a fallback — it's a
 *  misconfiguration that must block, or a typo'd Vercel env would silently
 *  publish through the legacy Mux path after Lee opted into the worker. */
const cfg = (): { state: "off" } | { state: "partial"; missing: string } | { state: "on"; url: string; token: string } => {
  const url = process.env.RENDER_WORKER_URL?.replace(/\/+$/, "");
  const token = process.env.RENDER_WORKER_TOKEN;
  if (url && token) return { state: "on", url, token };
  if (!url && !token) return { state: "off" };
  return { state: "partial", missing: url ? "RENDER_WORKER_TOKEN" : "RENDER_WORKER_URL" };
};

const workerFetch = async (c: { url: string; token: string }, path: string, init?: RequestInit) => {
  const res = await fetch(`${c.url}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`render worker ${path}: HTTP ${res.status} ${String(body.error ?? "")}`.trim());
  return body;
};

/** PREFLIGHT — is the worker configured, and if so, is it alive? Distinguishes
 *  the three states the combo checklist needs: fallback / healthy / blocked. */
export const workerPreflight = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ configured: boolean; healthy: boolean; detail: string }> => {
    const c = cfg();
    if (c.state === "off") return { configured: false, healthy: false, detail: "not configured — publishes use the legacy Mux concat" };
    if (c.state === "partial") return { configured: true, healthy: false, detail: `half-configured — ${c.missing} is missing; set both env vars (or unset both)` };
    try {
      const res = await fetch(`${c.url}/healthz`, { signal: AbortSignal.timeout(6000) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; ffmpeg?: string };
      if (!res.ok || !body.ok) return { configured: true, healthy: false, detail: `worker unhealthy: ${body.ffmpeg ?? `HTTP ${res.status}`}` };
      // TOKEN probe — /healthz is unauthenticated, so also hit an authed route:
      // 404 = token accepted (job just unknown); 401 = wrong token. Catches a
      // mismatched RENDER_WORKER_TOKEN here instead of at submit time.
      const auth = await fetch(`${c.url}/jobs/00000000-0000-0000-0000-000000000000`, { headers: { authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(3000) });
      if (auth.status === 401) return { configured: true, healthy: false, detail: "worker up but the token is rejected — RENDER_WORKER_TOKEN ≠ the worker's WORKER_TOKEN" };
      return { configured: true, healthy: true, detail: body.ffmpeg ?? "ok" };
    } catch (e) {
      return { configured: true, healthy: false, detail: `worker unreachable: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
);

/** START a stitch render: signed upload slot in canvas-media → job on the worker.
 *  `urls` are the ordered clip URLs (Mux static renditions / staged files). */
export const startWorkerRender = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      urls: z.array(z.string().url()).min(1).max(64),
      mode: z.enum(["free", "full", "test"]),
      crossfadeMs: z.number().int().min(0).max(2000).optional(),
      // WARP INTRO — when present, urls[0] (the intro clip) is run through the
      // warp_intro stage (reversed tail + white-flash snap + forward clip + music
      // bed) before the concat; an optional front clip (slogan/bolt) prepends it.
      warp: z.object({
        bedUrl: z.string().url(),
        frontUrl: z.string().url().optional(),
        reversedTailS: z.number().min(0.1).max(10).optional(),
        flashMs: z.number().int().min(0).max(2000).optional(),
        musicBedDb: z.number().min(-60).max(0).optional(),
        musicFadeS: z.number().min(0).max(10).optional(),
      }).optional(),
    }).parse(d))
  .handler(async ({ data }): Promise<{ jobId: string; path: string; machineId: string | null }> => {
    const c = cfg();
    if (c.state !== "on") throw new Error(c.state === "partial" ? `Render worker half-configured — ${c.missing} is missing.` : "Render worker not configured (RENDER_WORKER_URL / RENDER_WORKER_TOKEN).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `ceq-stitch/${Date.now()}-${data.mode}.mp4`;
    const { data: signed, error } = await supabaseAdmin.storage.from("canvas-media").createSignedUploadUrl(path);
    if (error || !signed?.signedUrl) throw new Error(`signed upload URL failed: ${error?.message ?? "no url"}`);
    const inputs: { id: string; url: string }[] = data.urls.map((url, i) => ({ id: `c${i}`, url }));
    const cf = data.crossfadeMs != null ? { crossfadeMs: data.crossfadeMs } : {};
    let stages: Record<string, unknown>[];
    if (data.warp) {
      // WARP: intro clip (c0) → warp_intro(__stage0), then concat [front?, __stage0,
      // c1..cN]. The bed + front are extra inputs the concat never names directly.
      const w = data.warp;
      inputs.push({ id: "bed", url: w.bedUrl });
      if (w.frontUrl) inputs.push({ id: "front", url: w.frontUrl });
      const warpStage = {
        kind: "warp_intro", input: "c0", bed: "bed",
        ...(w.reversedTailS != null ? { reversedTailS: w.reversedTailS } : {}),
        ...(w.flashMs != null ? { flashMs: w.flashMs } : {}),
        ...(w.musicBedDb != null ? { musicBedDb: w.musicBedDb } : {}),
        ...(w.musicFadeS != null ? { musicFadeS: w.musicFadeS } : {}),
      };
      const concatIds = [...(w.frontUrl ? ["front"] : []), "__stage0", ...data.urls.slice(1).map((_, i) => `c${i + 1}`)];
      stages = [warpStage, { kind: "concat", inputs: concatIds, ...cf }];
    } else {
      stages = [{ kind: "concat", inputs: inputs.map((i) => i.id), ...cf }];
    }
    const body = { v: 1, inputs, stages, output: { putUrl: signed.signedUrl, contentType: "video/mp4" } };
    const res = await workerFetch(c, "/render", { method: "POST", body: JSON.stringify(body) });
    if (typeof res.jobId !== "string") throw new Error("render worker returned no jobId");
    // machineId pins every poll to the machine holding this in-memory job —
    // with >1 Fly machine, an unpinned poll load-balances to the wrong one and
    // 404s ("unknown job"). Null on old workers / local runs (no pinning).
    return { jobId: res.jobId, path, machineId: typeof res.machineId === "string" ? res.machineId : null };
  });

/** POLL a render job; when done, hand back the public URL Auphonic will read. */
/** SMART STITCH (dissect): enqueue one CEQ's moment clips → ONE stitched asset.
 *  Sources stay in storage untouched; the job's result carries the chapters
 *  manifest (per-clip start offsets + resolved trims). Poll with
 *  resolveWorkerRender — its `result` passes the manifest through. */
export interface DissectStitchResult {
  clips: { startS: number; durS: number }[];
  totalS: number;
  gapsS: number[];
  roomTone: boolean;
  trims: { start: number; end: number }[];
}

export const startDissectStitch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      urls: z.array(z.string().url()).min(1).max(12),
      roomToneUrl: z.string().url().optional(),
      silenceDb: z.number().min(-80).max(-10).optional(),
      heads: z.array(z.number().min(0).max(120).nullable()).optional(),
      gapMs: z.number().int().min(0).max(2000).optional(),
      gapJitterMs: z.number().int().min(0).max(500).optional(),
      loudI: z.number().min(-31).max(-9).optional(),
      pads: z.array(z.object({ headMs: z.number().int().min(0).max(5000).optional(), tailMs: z.number().int().min(0).max(5000).optional() }).nullable()).optional(),
      trims: z.array(z.object({ start: z.number().min(0), end: z.number().min(0) }).nullable()).optional(),
    }).parse(d))
  .handler(async ({ data }): Promise<{ jobId: string; path: string; machineId: string | null }> => {
    const c = cfg();
    if (c.state !== "on") throw new Error(c.state === "partial" ? `Render worker half-configured — ${c.missing} is missing.` : "Render worker not configured (RENDER_WORKER_URL / RENDER_WORKER_TOKEN).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `dissect-stitch/${Date.now()}.mp4`;
    const { data: signed, error } = await supabaseAdmin.storage.from("canvas-media").createSignedUploadUrl(path);
    if (error || !signed?.signedUrl) throw new Error(`signed upload URL failed: ${error?.message ?? "no url"}`);
    const inputs: { id: string; url: string }[] = data.urls.map((url, i) => ({ id: `c${i}`, url }));
    if (data.roomToneUrl) inputs.push({ id: "rt", url: data.roomToneUrl });
    const stage = {
      kind: "dissect_stitch",
      inputs: data.urls.map((_, i) => `c${i}`),
      ...(data.roomToneUrl ? { roomTone: "rt" } : {}),
      ...(data.silenceDb != null ? { silenceDb: data.silenceDb } : {}),
      ...(data.heads ? { heads: data.heads } : {}),
      ...(data.gapMs != null ? { gapMs: data.gapMs } : {}),
      ...(data.gapJitterMs != null ? { gapJitterMs: data.gapJitterMs } : {}),
      ...(data.loudI != null ? { loudI: data.loudI } : {}),
      ...(data.pads ? { pads: data.pads } : {}),
      ...(data.trims ? { trims: data.trims } : {}),
    };
    const body = { v: 1, inputs, stages: [stage], output: { putUrl: signed.signedUrl, contentType: "video/mp4" } };
    const res = await workerFetch(c, "/render", { method: "POST", body: JSON.stringify(body) });
    if (!res.jobId) throw new Error(`worker refused the job: ${JSON.stringify(res).slice(0, 300)}`);
    return { jobId: String(res.jobId), path, machineId: res.machineId ? String(res.machineId) : null };
  });

export const resolveWorkerRender = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), path: z.string().min(5), machineId: z.string().max(64).nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<{ state: "queued" | "downloading" | "rendering" | "uploading" | "done" | "error"; note: string; fileUrl: string | null; error: string | null; result?: DissectStitchResult | null }> => {
    const c = cfg();
    if (c.state !== "on") throw new Error("Render worker not (fully) configured.");
    // pin to the job's machine (see startWorkerRender) — Fly routes the request
    // to that instance instead of load-balancing to one that never saw the job.
    const res = await workerFetch(c, `/jobs/${data.jobId}`, data.machineId ? { headers: { "fly-force-instance-id": data.machineId } } : undefined);
    const state = String(res.state ?? "error") as "queued" | "downloading" | "rendering" | "uploading" | "done" | "error";
    if (state === "done") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pub } = supabaseAdmin.storage.from("canvas-media").getPublicUrl(data.path);
      if (!pub?.publicUrl) throw new Error("rendered file has no public URL");
      return { state, note: String(res.note ?? ""), fileUrl: pub.publicUrl, error: null, result: (res.result as DissectStitchResult | undefined) ?? null };
    }
    return { state, note: String(res.note ?? ""), fileUrl: null, error: res.error ? String(res.error) : null };
  });
