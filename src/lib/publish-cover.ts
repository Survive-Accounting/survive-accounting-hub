// YOUR OWN THUMBNAIL, kept with the video. Pure.
//
// Lee, 2026-09-11, getting his first five posted: "give me a way to upload my own thumbnail for
// each video." The post page only ever MADE covers (a frame of the take, or the drawn card) and
// handed back a PNG; nothing was kept per video. Now an image he uploads is stored in
// canvas-media and its address is kept on the video's own row.
//
// WHERE IT LIVES. set_publish_status.captions is a jsonb bag keyed by destination; the cover goes
// beside them as `captions.cover`. No migration: the column already exists and the four
// destinations are read by name, so an extra key is invisible to everything that reads copy.
// The two writes that touch the bag must respect each other: saving copy keeps a saved cover
// (keepCover), and saving a cover keeps the saved copy (withCover). Clearing the copy leaves
// the cover standing.

export interface PublishCover {
  /** The public address of the image in canvas-media. */
  url: string;
  /** The file's own name, as he picked it. */
  name: string;
  uploadedAt: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** The cover on a stored captions bag, or null. A hand-edited or partial value reads as none. */
export function coverOf(rawCaptions: unknown): PublishCover | null {
  if (!isRecord(rawCaptions)) return null;
  const c = rawCaptions.cover;
  if (!isRecord(c)) return null;
  const url = typeof c.url === "string" ? c.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    name: typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 200) : "thumbnail",
    uploadedAt: typeof c.uploadedAt === "string" ? c.uploadedAt : "",
  };
}

/** The bag to store when the COVER changes: the stored bag as it is, with the cover set, or
 *  removed when `cover` is null. Null when nothing at all is left. */
export function withCover(storedCaptions: unknown, cover: PublishCover | null): Record<string, unknown> | null {
  const next: Record<string, unknown> = isRecord(storedCaptions) ? { ...storedCaptions } : {};
  if (cover) next.cover = { url: cover.url, name: cover.name, uploadedAt: cover.uploadedAt };
  else delete next.cover;
  return Object.keys(next).length ? next : null;
}

/** The bag to store when the COPY changes: the new copy (or none), plus the cover already saved. */
export function keepCover(storedCaptions: unknown, newCopy: Record<string, unknown> | null): Record<string, unknown> | null {
  const cover = coverOf(storedCaptions);
  if (!cover) return newCopy;
  return { ...(newCopy ?? {}), cover: { url: cover.url, name: cover.name, uploadedAt: cover.uploadedAt } };
}
