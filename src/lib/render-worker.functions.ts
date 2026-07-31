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
    }).parse(d))
  .handler(async ({ data }): Promise<{ jobId: string; path: string }> => {
    const c = cfg();
    if (c.state !== "on") throw new Error(c.state === "partial" ? `Render worker half-configured — ${c.missing} is missing.` : "Render worker not configured (RENDER_WORKER_URL / RENDER_WORKER_TOKEN).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `ceq-stitch/${Date.now()}-${data.mode}.mp4`;
    const { data: signed, error } = await supabaseAdmin.storage.from("canvas-media").createSignedUploadUrl(path);
    if (error || !signed?.signedUrl) throw new Error(`signed upload URL failed: ${error?.message ?? "no url"}`);
    const inputs = data.urls.map((url, i) => ({ id: `c${i}`, url }));
    const body = {
      v: 1,
      inputs,
      stages: [{ kind: "concat", inputs: inputs.map((i) => i.id), ...(data.crossfadeMs != null ? { crossfadeMs: data.crossfadeMs } : {}) }],
      output: { putUrl: signed.signedUrl, contentType: "video/mp4" },
    };
    const res = await workerFetch(c, "/render", { method: "POST", body: JSON.stringify(body) });
    if (typeof res.jobId !== "string") throw new Error("render worker returned no jobId");
    return { jobId: res.jobId, path };
  });

/** POLL a render job; when done, hand back the public URL Auphonic will read. */
export const resolveWorkerRender = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), path: z.string().min(5) }).parse(d))
  .handler(async ({ data }): Promise<{ state: "queued" | "downloading" | "rendering" | "uploading" | "done" | "error"; note: string; fileUrl: string | null; error: string | null }> => {
    const c = cfg();
    if (c.state !== "on") throw new Error("Render worker not (fully) configured.");
    const res = await workerFetch(c, `/jobs/${data.jobId}`);
    const state = String(res.state ?? "error") as "queued" | "downloading" | "rendering" | "uploading" | "done" | "error";
    if (state === "done") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pub } = supabaseAdmin.storage.from("canvas-media").getPublicUrl(data.path);
      if (!pub?.publicUrl) throw new Error("rendered file has no public URL");
      return { state, note: String(res.note ?? ""), fileUrl: pub.publicUrl, error: null };
    }
    return { state, note: String(res.note ?? ""), fileUrl: null, error: res.error ? String(res.error) : null };
  });
