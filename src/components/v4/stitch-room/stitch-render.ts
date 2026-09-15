// THE STITCH ROOM'S WORKER CALLS — trims, the social version, downloads, and posting a queued video. None of
// these need the takes (they work from files already on the worker's storage), so the popout runs them itself.
import { renderSvgToBlob } from "@/lib/brand-kit/export-png";
import { downloadName, isTrimmed, type StitchRecord } from "@/lib/film-stitch";
import { markFilmStitchPosted, setFilmStitchTrim } from "@/lib/film-stitch.functions";
import { setPublishCover, setPublishEndCta } from "@/lib/publish-queue.functions";
import { resolveWorkerRender, startDissectStitch, startWorkerRender, workerPreflight } from "@/lib/render-worker.functions";
import { resolveSitePost, startSitePost } from "@/lib/site-publish.functions";
import { partKey } from "@/lib/student-shorts";
import { uploadCover } from "@/components/v3/take-burn";
import { SITE_EXPORT } from "@/lib/brand-kit/thumbnail";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The one filmed outro (punch-in keeps it in this browser — the popout is the same browser). */
export interface OutroClip { url: string; durationS: number; file: string; at: number }
export function readOutroClip(): OutroClip | null {
  try {
    const v = JSON.parse(localStorage.getItem("sa-punch-outro-clip") ?? "null") as OutroClip | null;
    return v && typeof v.url === "string" && typeof v.durationS === "number" && v.durationS > 0 ? v : null;
  } catch { return null; }
}

async function wake(say: (n: string) => void) {
  say("waking the video joiner…");
  for (let tries = 0; ; tries++) {
    const h = await workerPreflight().catch((e) => ({ configured: true, healthy: false, detail: e instanceof Error ? e.message : String(e) }));
    if (!h.configured) throw new Error("The video joiner isn't set up on the site.");
    if (h.healthy) return;
    if (tries >= 5) throw new Error(`The video joiner didn't wake up: ${h.detail}.`);
    await wait(5000);
  }
}

async function follow(job: { jobId: string; path: string; machineId: string | null }, say: (n: string) => void, label: string): Promise<string> {
  let misses = 0;
  for (;;) {
    await wait(3000);
    const r = await resolveWorkerRender({ data: job }).catch((e) => { if (++misses > 8) throw e; return null; });
    if (!r) continue;
    misses = 0;
    if (r.state === "done" && r.fileUrl) return r.fileUrl;
    if (r.state === "error") throw new Error(r.error ?? `${label} failed.`);
    say(`${label} · ${r.state}`);
  }
}

/** A cut of one file: [start, end] of it, nothing else touched. */
async function cut(parts: { url: string; start: number; end: number }[], say: (n: string) => void, label: string): Promise<string> {
  const job = await startDissectStitch({ data: { urls: parts.map((p) => p.url), trims: parts.map((p) => ({ start: p.start, end: p.end })), gapMs: 0, gapJitterMs: 0, vertical: true } }).catch(async (e) => {
    if (!/unknown stage/i.test(e instanceof Error ? e.message : String(e))) throw e;
    if (parts.length === 1) throw new Error("Trimming needs the video joiner's update deployed.");
    // the old worker: a plain join, trims not applied
    return startWorkerRender({ data: { urls: parts.map((p) => p.url), mode: "full" } });
  });
  return follow(job, say, label);
}

/** SAVE THE TRIMS: the site file (cut from the untouched stitch) and, with an outro clip, the social version. */
export async function applyTrims(r: StitchRecord, t: { startS: number; endS: number; outroTrimS: number; withSocial: boolean }, say: (n: string) => void): Promise<StitchRecord> {
  await wake(say);
  const dur = r.durationS ?? t.endS;
  const trimmed = isTrimmed({ trimStartS: t.startS, trimEndS: t.endS, durationS: dur });
  const fileUrl = trimmed ? await cut([{ url: r.sourceUrl, start: t.startS, end: t.endS }], say, "trimming the video") : r.sourceUrl;
  let socialUrl: string | null = null;
  const outro = t.withSocial ? readOutroClip() : null;
  if (outro) {
    const outroEnd = Math.max(0.5, outro.durationS - t.outroTrimS);
    socialUrl = await cut([{ url: r.sourceUrl, start: t.startS, end: t.endS }, { url: outro.url, start: 0, end: outroEnd }], say, "adding the outro");
  }
  say("saving…");
  return setFilmStitchTrim({ data: { id: r.id, trimStartS: t.startS, trimEndS: t.endS, outroTrimS: t.outroTrimS, fileUrl, socialUrl } });
}

/** DOWNLOAD a file to this computer (a new tab when the browser won't hand it over). */
export async function downloadVideo(url: string, name: string, social: boolean) {
  try {
    const blob = await (await fetch(url)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = downloadName(name, social);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch { window.open(url, "_blank", "noopener"); }
}

/** POST ONE QUEUED VIDEO to the site: its brand thumbnail (drawn in `svg`), the end button, the video host. The
 *  same steps punch-in's Post always took. */
export async function postStitch(r: StitchRecord, svg: SVGSVGElement, say: (n: string) => void): Promise<StitchRecord> {
  const pubKey = partKey(r.setId, r.takeIndex);
  say("making the thumbnail…");
  const blob = await renderSvgToBlob(svg, { width: SITE_EXPORT.w, height: SITE_EXPORT.h, type: SITE_EXPORT.type, quality: SITE_EXPORT.quality });
  const name = `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "video"}.webp`;
  const coverUrl = await uploadCover(new File([blob], name, { type: SITE_EXPORT.type }));
  const c = await setPublishCover({ data: { setId: pubKey, cover: { url: coverUrl, name } } });
  if (!c.ok) throw new Error(`Thumbnail: ${c.error ?? "not saved"}`);
  const e = await setPublishEndCta({ data: { setId: pubKey, cta: r.endCta } });
  if (!e.ok) throw new Error(`End button: ${e.error ?? "not saved"}`);
  say("sending to the video host…");
  const { assetId } = await startSitePost({ data: { videoUrl: r.fileUrl, pubKey } });
  const started = Date.now();
  while (Date.now() - started < 30 * 60_000) {
    await wait(5000);
    const s = await resolveSitePost({ data: { assetId, setId: r.setId, pubKey, takeIndex: r.takeIndex, takeName: r.name, title: r.name, videoUrl: r.fileUrl } });
    if (s.state === "posted") return markFilmStitchPosted({ data: { id: r.id, link: s.link } });
    if (s.state === "error") { if (/changed while posting/i.test(s.error)) { await wait(2000); continue; } throw new Error(s.error); }
    say("processing on the video host…");
  }
  throw new Error("Still processing after 30 minutes — post it again.");
}
