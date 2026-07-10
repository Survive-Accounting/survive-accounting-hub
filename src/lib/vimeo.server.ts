// Vimeo API helpers. SERVER-ONLY (reads VIMEO_ACCESS_TOKEN). Used by the
// migration script and, dynamically, by server functions.
//
// The token is a personal access token from vimeo.com/settings/apps with the
// "private" + "video_files" scopes (video_files is required for the per-file
// `download` links).

const API = "https://api.vimeo.com";

export interface VimeoDownloadFile {
  quality?: string; // "source" | "hd" | "sd" | "hls" | ...
  type?: string;
  width?: number;
  height?: number;
  size?: number;
  link: string;
}

export interface VimeoVideo {
  uri: string; // "/videos/123456789"
  name?: string;
  description?: string | null;
  duration?: number; // seconds
  created_time?: string;
  download?: VimeoDownloadFile[];
}

function token(): string {
  const t = process.env.VIMEO_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      "VIMEO_ACCESS_TOKEN not set. Create a personal token at vimeo.com/settings/apps " +
        'with scopes "private" and "video_files", then set it in .env / Vercel.',
    );
  }
  return t;
}

async function vget(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    },
  });
}

/** Numeric video id from a Vimeo uri ("/videos/123" -> "123"). */
export function vimeoIdFromUri(uri: string): string {
  const m = uri.match(/\/videos\/(\d+)/);
  return m ? m[1] : uri;
}

/** List every video on the account, paginating 100/page. */
export async function listAllVideos(): Promise<VimeoVideo[]> {
  const fields = "uri,name,description,duration,created_time,download";
  const out: VimeoVideo[] = [];
  let page = 1;
  for (;;) {
    const res = await vget(`/me/videos?per_page=100&page=${page}&fields=${encodeURIComponent(fields)}`);
    if (!res.ok) throw new Error(`Vimeo list page ${page}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data?: VimeoVideo[]; paging?: { next?: string | null } };
    const batch = json.data ?? [];
    out.push(...batch);
    if (!json.paging?.next || batch.length === 0) break;
    page += 1;
  }
  return out;
}

/** Highest-quality downloadable source file link, or null if downloads unavailable. */
export function pickBestDownload(files: VimeoDownloadFile[] | undefined): VimeoDownloadFile | null {
  if (!files || files.length === 0) return null;
  const usable = files.filter((f) => f.link && f.quality !== "hls");
  if (usable.length === 0) return null;
  const source = usable.find((f) => f.quality === "source");
  if (source) return source;
  // Otherwise the largest by pixel area, then by byte size.
  return usable.sort((a, b) => {
    const areaA = (a.width ?? 0) * (a.height ?? 0);
    const areaB = (b.width ?? 0) * (b.height ?? 0);
    if (areaB !== areaA) return areaB - areaA;
    return (b.size ?? 0) - (a.size ?? 0);
  })[0];
}

/** WebVTT of the video's auto/uploaded transcript (English preferred), or null. */
export async function getTranscriptVtt(videoId: string): Promise<{ vtt: string; language: string } | null> {
  const res = await vget(`/videos/${videoId}/texttracks`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { active?: boolean; type?: string; language?: string; link?: string }[];
  };
  const tracks = (json.data ?? []).filter((t) => t.link);
  if (tracks.length === 0) return null;
  const en = tracks.find((t) => (t.language ?? "").toLowerCase().startsWith("en"));
  const active = tracks.find((t) => t.active);
  const track = en ?? active ?? tracks[0];
  if (!track?.link) return null;
  const vttRes = await fetch(track.link);
  if (!vttRes.ok) return null;
  return { vtt: await vttRes.text(), language: track.language ?? "en" };
}

/** Strip WEBVTT header, cue indices, and timestamp lines down to plain transcript text. */
export function vttToPlainText(vtt: string): string {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "WEBVTT" || line.startsWith("NOTE") || line.startsWith("STYLE")) continue;
    if (/^\d+$/.test(line)) continue; // cue number
    if (/-->/.test(line)) continue; // timestamp
    out.push(line.replace(/<[^>]+>/g, "")); // strip inline tags
  }
  // Collapse consecutive duplicates (VTT often repeats rolling captions).
  const dedup: string[] = [];
  for (const l of out) if (l !== dedup[dedup.length - 1]) dedup.push(l);
  return dedup.join(" ").replace(/\s+/g, " ").trim();
}
