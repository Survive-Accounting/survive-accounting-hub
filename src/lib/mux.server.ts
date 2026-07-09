// Mux API helpers. SERVER-ONLY (reads MUX_* env + uses node:crypto for signed
// playback JWTs). Import dynamically inside server-fn handlers — never at the top
// of a route file / *.functions.ts (node:crypto would break the client build).
//
// API auth: Basic MUX_TOKEN_ID:MUX_TOKEN_SECRET.
// Signed playback: RS256 JWT signed with MUX_SIGNING_KEY_ID + MUX_SIGNING_PRIVATE_KEY
// (the private key is base64-encoded PEM, per Mux's convention).
import crypto from "node:crypto";

const API = "https://api.mux.com";

function apiAuth(): string {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error("MUX_TOKEN_ID / MUX_TOKEN_SECRET not set in this environment.");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export interface MuxTrack {
  id: string;
  type: string; // "video" | "audio" | "text"
  text_type?: string; // "subtitles"
  text_source?: string; // "generated_vtt" | "uploaded"
  language_code?: string;
  status?: string; // "preparing" | "ready" | "errored"
  name?: string;
}

export interface MuxAsset {
  id: string;
  status: string; // "preparing" | "ready" | "errored"
  duration?: number; // seconds (float), present once ready
  playback_ids?: { id: string; policy: string }[];
  tracks?: MuxTrack[];
  errors?: unknown;
}

async function muxFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: apiAuth(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mux ${init?.method ?? "GET"} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * Create a Mux asset from a URL input, signed playback, with auto-generated
 * English subtitles and a 1080p max resolution tier.
 */
export async function createAssetFromUrl(url: string): Promise<MuxAsset> {
  const body = {
    input: [{ url, generated_subtitles: [{ language_code: "en", name: "English" }] }],
    playback_policy: ["signed"],
    max_resolution_tier: "1080p",
    video_quality: "basic",
  };
  const json = await muxFetch("/video/v1/assets", { method: "POST", body: JSON.stringify(body) });
  return json.data as MuxAsset;
}

export async function getAsset(assetId: string): Promise<MuxAsset> {
  const json = await muxFetch(`/video/v1/assets/${assetId}`);
  return json.data as MuxAsset;
}

// ── signed playback ──────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Mint an RS256 Mux playback JWT. `aud`: "v" = video/HLS playback (also covers
 * subtitle tracks), "t" = thumbnail, "s" = storyboard, "g" = gif.
 */
export function signPlaybackToken(playbackId: string, opts: { aud?: string; expSec?: number } = {}): string {
  const kid = process.env.MUX_SIGNING_KEY_ID;
  const b64key = process.env.MUX_SIGNING_PRIVATE_KEY;
  if (!kid || !b64key) {
    throw new Error("MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY not set — needed for signed playback URLs.");
  }
  const privateKeyPem = Buffer.from(b64key, "base64").toString("utf8");
  const aud = opts.aud ?? "v";
  const exp = Math.floor(Date.now() / 1000) + (opts.expSec ?? 3600);
  const header = { alg: "RS256", typ: "JWT", kid };
  const payload = { sub: playbackId, aud, exp };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKeyPem);
  return `${signingInput}.${b64url(signature)}`;
}

/** URLs for the "Watch" modal: a hosted Mux player iframe + the raw HLS stream. */
export function signedPlaybackUrls(playbackId: string, expSec = 3600): { player: string; hls: string } {
  const token = signPlaybackToken(playbackId, { aud: "v", expSec });
  return {
    player: `https://player.mux.com/${playbackId}?playback-token=${token}`,
    hls: `https://stream.mux.com/${playbackId}.m3u8?token=${token}`,
  };
}

/** Fetch the generated English subtitle VTT for a ready asset, or null. */
export async function getGeneratedTranscriptVtt(playbackId: string, tracks: MuxTrack[] | undefined): Promise<string | null> {
  const track = (tracks ?? []).find(
    (t) => t.type === "text" && t.status === "ready" && (t.language_code ?? "").toLowerCase().startsWith("en"),
  );
  if (!track) return null;
  const token = signPlaybackToken(playbackId, { aud: "v" });
  const res = await fetch(`https://stream.mux.com/${playbackId}/text/${track.id}.vtt?token=${token}`);
  if (!res.ok) return null;
  return res.text();
}
