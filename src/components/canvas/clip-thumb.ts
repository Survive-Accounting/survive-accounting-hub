// CLIP THUMB — one poster frame per clip for the timeline, grabbed once and
// cached by url+second. Decodes are QUEUED to one at a time: a 30-clip timeline
// must not spin up 30 simultaneous video decodes (that was how the old preview
// starved the machine). A failed grab (CORS-tainted canvas, decode error)
// rejects and the caller falls back to a labeled block — never a broken tile.

const cache = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();

export function clipThumb(url: string, atS: number, w = 112, h = 63): Promise<string> {
  const key = `${url}@${Math.round(atS * 10)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Promise<string>((resolve, reject) => {
    chain = chain.then(() => new Promise<void>((next) => {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "metadata";
      v.crossOrigin = "anonymous"; // Supabase public objects send CORS headers → canvas readback allowed
      v.src = url;
      let settled = false;
      const done = (r?: string, e?: unknown) => { if (settled) return; settled = true; try { v.src = ""; } catch { /* ignore */ } if (r) resolve(r); else reject(e); next(); };
      const timer = setTimeout(() => done(undefined, "thumb timeout"), 10_000);
      v.addEventListener("error", () => { clearTimeout(timer); done(undefined, "decode error"); }, { once: true });
      v.addEventListener("loadedmetadata", () => { v.currentTime = Math.min(Math.max(0, atS), Math.max(0, (v.duration || atS) - 0.05)); }, { once: true });
      v.addEventListener("seeked", () => {
        clearTimeout(timer);
        try {
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const g = c.getContext("2d");
          if (!g) return done(undefined, "no 2d context");
          g.drawImage(v, 0, 0, w, h);
          done(c.toDataURL("image/jpeg", 0.55));
        } catch (e) { done(undefined, e); }
      }, { once: true });
    }));
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
