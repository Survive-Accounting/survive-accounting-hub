// THE ILLUSTRATION PROVIDER — Recraft, behind a thin interface so a second provider can be
// added without touching the slide system. SERVER-ONLY (".server.ts", dynamic-imported by the
// server fn): the key is read here, per call, from process.env and never leaves the server.
//
// Contract: docs/RECRAFT-API.md (fetched from the official docs and the live OpenAPI spec on
// 2026-09-04). Raster first. Generated on a black ground with the house palette; the boil is
// ours, not theirs. Recraft's URLs expire in ~24 h, so the bytes are pulled immediately.

export interface IllustrationRequest {
  prompt: string;
  model: string;
  size: string;
  seed?: number;
  controls?: { background_color?: { rgb: [number, number, number] }; colors?: { rgb: [number, number, number] }[] };
  /** A Recraft custom style id; when present the model becomes recraftv4_styles + precise. */
  styleId?: string | null;
}

export interface IllustrationResult {
  bytes: Uint8Array;
  contentType: string;
  providerAssetId: string | null;
  revisedPrompt: string | null;
  /** What the provider billed for this call, in its own units (Recraft: API units, 1000 = $1). */
  credits: number | null;
  model: string;
}

export interface IllustrationProvider {
  id: string;
  /** True when the server holds a key for this provider. Never reveals the key. */
  configured(): boolean;
  /** A free round-trip that proves the key: Recraft's /users/me. Never reveals the key. */
  check(signal?: AbortSignal): Promise<{ ok: boolean; credits?: number; email?: string; error?: string }>;
  generate(req: IllustrationRequest, signal?: AbortSignal): Promise<IllustrationResult>;
}

const RECRAFT_BASE = "https://external.api.recraft.ai/v1";

function keyOf(): string | null {
  const k = process.env.RECRAFT_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

/** A readable error for the editor. Recraft's body is JSON with a message most of the time. */
async function recraftError(res: Response): Promise<Error> {
  let detail = "";
  try { const j = await res.json() as { message?: string; error?: string; code?: string }; detail = j.message || j.error || j.code || ""; }
  catch { try { detail = (await res.text()).slice(0, 300); } catch { detail = ""; } }
  if (res.status === 401 || res.status === 403) return new Error("Recraft rejected the API key. Check RECRAFT_API_KEY on the server.");
  if (res.status === 402) return new Error("Recraft says the account is out of API units. Top up at app.recraft.ai.");
  if (res.status === 429) return new Error("Recraft is rate-limiting right now. Wait a minute and try again — your prompt is kept.");
  return new Error(`Recraft ${res.status}${detail ? ": " + detail : ""}`);
}

export const recraftProvider: IllustrationProvider = {
  id: "recraft",
  configured() { return keyOf() !== null; },
  async check(signal) {
    const key = keyOf();
    if (!key) return { ok: false, error: "no RECRAFT_API_KEY on this server" };
    try {
      const res = await fetch(`${RECRAFT_BASE}/users/me`, { headers: { Authorization: `Bearer ${key}` }, signal });
      if (!res.ok) return { ok: false, error: (await recraftError(res)).message };
      const j = await res.json() as { credits?: number; email?: string };
      return { ok: true, credits: j.credits, email: j.email };
    } catch (e) { return { ok: false, error: `could not reach Recraft: ${(e as Error).message}` }; }
  },
  async generate(req, signal) {
    const key = keyOf();
    if (!key) throw new Error("RECRAFT_API_KEY is not configured on the server — set it in .env (local) and in Vercel's environment variables.");
    const useStyle = !!req.styleId;
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      model: useStyle ? "recraftv4_styles" : req.model,
      size: req.size,
      n: 1,
      response_format: "url",
      ...(req.seed !== undefined ? { random_seed: req.seed } : {}),
      ...(req.controls ? { controls: req.controls } : {}),
      ...(useStyle ? { style_id: req.styleId, style_match: "precise" } : {}),
    };
    const res = await fetch(`${RECRAFT_BASE}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await recraftError(res);
    const json = await res.json() as { credits?: number; data?: { image_id?: string; url?: string; revised_prompt?: string }[] };
    const first = json.data?.[0];
    if (!first?.url) throw new Error("Recraft returned no image URL.");
    // The URL is signed and expires in ~24 h — take the bytes now.
    const img = await fetch(first.url, { signal });
    if (!img.ok) throw new Error(`Could not download the generated image (${img.status}).`);
    const bytes = new Uint8Array(await img.arrayBuffer());
    const contentType = img.headers.get("content-type")?.split(";")[0].trim() || "image/png";
    // Server-side breadcrumb for debugging, never the key, never the prompt in full.
    console.info(`[recraft] ok ${bytes.length}B ${contentType} credits=${json.credits ?? "?"} model=${body.model}`);
    return { bytes, contentType, providerAssetId: first.image_id ?? null, revisedPrompt: first.revised_prompt ?? null, credits: json.credits ?? null, model: String(body.model) };
  },
};

/** Provider #1 and the only one today. A second provider is another object here and a
 *  `provider` string on the preset — nothing in the slide system changes. */
export function providerFor(id: string): IllustrationProvider {
  if (id === "recraft") return recraftProvider;
  throw new Error(`Unknown illustration provider: ${id}`);
}
