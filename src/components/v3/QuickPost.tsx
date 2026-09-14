// /v3/quick-post — POST A BATCH OF VIDEOS TO A SET, FAST. See quick-post.ts for Lee's words.
//
// Drop the files, check the order against the titles, press Post. Per video: its cover is drawn
// from the brand kit's art (ThumbnailArt, the Series batch look — one kicker, one title size across
// the set) and uploaded as its thumbnail, the file goes straight to storage, and the normal site
// post (startSitePost → resolveSitePost) puts it on the set at its position. No captions, no
// transcript, no plan splits. Video N replaces the set's old video N; old videos past the end of
// the new list can be removed from here.
import { useEffect, useMemo, useRef, useState } from "react";

import { ThumbnailArt } from "@/components/brand-kit/ThumbnailArt";
import { useKitFontsReady } from "@/components/brand-kit/use-kit-fonts";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { uploadCover, uploadTake } from "@/components/v3/take-burn";
import { useBank } from "@/components/v3/use-bank";
import { renderSvgToBlob } from "@/lib/brand-kit/export-png";
import { measureText } from "@/lib/brand-kit/measure";
import { defaultThumbSpec, seriesTitleCap, SITE_EXPORT, TITLE_TRACKING, type ThumbSpec } from "@/lib/brand-kit/thumbnail";
import { colorwayFor, KIT, NEUTRAL_COLORWAY_ID } from "@/lib/brand-kit/tokens";
import { setPublishCover } from "@/lib/publish-queue.functions";
import { listSitePosts, removeSitePosts, type SitePostView } from "@/lib/quick-post.functions";
import { resolveSitePost, startSitePost } from "@/lib/site-publish.functions";

import { clock, coverFor, EASY_POINTS_ORDER, EASY_POINTS_SET_ID, filmingOrder, leftovers, lengthStats, parseTitles, quickPubKey } from "./quick-post";

const MINT = "#7BD3A8";
const RED = "#FF8A7A";

type RowState =
  | { s: "idle" } | { s: "cover" } | { s: "upload"; frac: number } | { s: "processing" }
  | { s: "posted" } | { s: "error"; error: string };

interface Clip { file: File; url: string; duration: number | null }

const btn = (strong = false): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 8, border: `1px solid ${strong ? V3_GOLD : V3_EDGE}`, cursor: "pointer",
  background: strong ? V3_GOLD : "transparent", color: strong ? "#14213D" : V3_CREAM, fontWeight: 800, fontSize: 13,
});
const field: React.CSSProperties = { background: "rgba(0,0,0,0.25)", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit" };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function QuickPost() {
  useKitFontsReady();
  const bank = useBank();
  const [setId, setSetId] = useState(EASY_POINTS_SET_ID);
  const [titlesText, setTitlesText] = useState(EASY_POINTS_ORDER.join("\n"));
  const [kicker, setKicker] = useState("TYPES OF ACCOUNTS");
  const [part, setPart] = useState("Easy Points");
  const [clips, setClips] = useState<Clip[]>([]);
  const [states, setStates] = useState<RowState[]>([]);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ setName: string; posts: SitePostView[] } | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const art = useRef<(SVGSVGElement | null)[]>([]);

  const titles = parseTitles(titlesText);
  const sets = useMemo(() => (bank.topics ?? []).flatMap((t) => t.sets.filter((s) => !s.lane).map((s) => ({ id: s.id, label: `${t.name} · ${s.name}` }))), [bank.topics]);

  const refreshLive = async (id = setId) => {
    setLiveErr(null);
    try {
      const r = await listSitePosts({ data: { setId: id } });
      if (r.ok) setLive({ setName: r.setName, posts: r.posts }); else { setLive(null); setLiveErr(r.error); }
    } catch (e) { setLiveErr(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void refreshLive(setId); }, [setId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clips.forEach((c) => URL.revokeObjectURL(c.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const vids = [...list].filter((f) => /^video\//.test(f.type) || /\.(mp4|mov|mkv|webm)$/i.test(f.name));
    setClips((prev) => {
      const have = new Set(prev.map((c) => `${c.file.name}|${c.file.size}`));
      const fresh = vids.filter((f) => !have.has(`${f.name}|${f.size}`)).map((file) => ({ file, url: URL.createObjectURL(file), duration: null }));
      return filmingOrder([...prev.map((c) => ({ ...c, name: c.file.name })), ...fresh.map((c) => ({ ...c, name: c.file.name }))]).map(({ file, url, duration }) => ({ file, url, duration }));
    });
    setStates([]);
  };
  const move = (i: number, d: -1 | 1) => setClips((c) => {
    const j = i + d; if (j < 0 || j >= c.length) return c;
    const n = c.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const drop = (i: number) => setClips((c) => { URL.revokeObjectURL(c[i].url); return c.filter((_, k) => k !== i); });
  const setDuration = (url: string, d: number) => setClips((c) => c.map((x) => (x.url === url && x.duration == null ? { ...x, duration: d } : x)));

  // THE COVERS: one spec per title, one shared title size so the set reads as a set.
  const base = defaultThumbSpec({ exam: 1, part, kicker, visualType: "concept", concept: { kind: "bolt", text: "" } });
  const measure = (t: string, s: number) => measureText(t, s, 900, KIT.display, TITLE_TRACKING);
  const covers = titles.map((t) => coverFor(t));
  const cap = seriesTitleCap(covers.map((c) => ({ ...base, title: c.title })), measure);
  const specs: ThumbSpec[] = covers.map((c) => ({ ...base, title: c.title, variant: c.variant, titleCap: cap }));
  const cw = colorwayFor(NEUTRAL_COLORWAY_ID);

  const rows = titles.length;
  const stats = lengthStats(clips.slice(0, rows).map((c) => c.duration));
  const liveStats = lengthStats((live?.posts ?? []).map((p) => p.durationS));
  const extra = live ? leftovers(live.posts, rows) : [];
  const mismatch = clips.length && clips.length !== rows ? `${clips.length} file${clips.length === 1 ? "" : "s"} and ${rows} title${rows === 1 ? "" : "s"} — every title needs a file.` : null;
  const setState = (i: number, st: RowState) => setStates((prev) => { const n = prev.slice(); n[i] = st; return n; });

  const postAll = async () => {
    if (busy) return;
    setBusy(true);
    setStates(titles.map(() => ({ s: "idle" })));
    const polls: Promise<void>[] = [];
    for (let i = 0; i < rows; i++) {
      if (skip.has(i)) continue;
      const clip = clips[i];
      const title = titles[i];
      const pubKey = quickPubKey(setId, i);
      try {
        setState(i, { s: "cover" });
        const svg = art.current[i];
        if (!svg) throw new Error("The cover art isn't on the page yet.");
        const blob = await renderSvgToBlob(svg, { width: SITE_EXPORT.w, height: SITE_EXPORT.h, type: SITE_EXPORT.type, quality: SITE_EXPORT.quality });
        const coverName = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webp`;
        const coverUrl = await uploadCover(new File([blob], coverName, { type: SITE_EXPORT.type }));
        const c = await setPublishCover({ data: { setId: pubKey, cover: { url: coverUrl, name: coverName } } });
        if (!c.ok) throw new Error(`Thumbnail: ${c.error ?? "not saved"}`);
        setState(i, { s: "upload", frac: 0 });
        const videoUrl = await uploadTake(clip.file, (frac) => setState(i, { s: "upload", frac }));
        const { assetId } = await startSitePost({ data: { videoUrl, pubKey } });
        setState(i, { s: "processing" });
        polls.push((async () => {
          const started = Date.now();
          while (Date.now() - started < 30 * 60_000) {
            await wait(5000);
            try {
              const r = await resolveSitePost({ data: { assetId, setId, pubKey, takeIndex: i, takeName: title, title, videoUrl, ledger: false } });
              if (r.state === "posted") { setState(i, { s: "posted" }); return; }
              if (r.state === "error") {
                // Several videos land on the one scene at once; a lost compare-and-set just goes again.
                if (/changed while posting/i.test(r.error)) { await wait(1000 + Math.random() * 3000); continue; }
                setState(i, { s: "error", error: r.error }); return;
              }
            } catch (e) { setState(i, { s: "error", error: e instanceof Error ? e.message : String(e) }); return; }
          }
          setState(i, { s: "error", error: "Still processing after 30 minutes — press Post again for this one." });
        })());
      } catch (e) {
        setState(i, { s: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }
    await Promise.all(polls);
    setBusy(false);
    void refreshLive();
  };

  const removeExtra = async () => {
    if (!extra.length || removing) return;
    if (!window.confirm(`Take these ${extra.length} old video${extra.length === 1 ? "" : "s"} off the site?\n\n${extra.map((p) => `• ${p.title || p.pubKey}`).join("\n")}`)) return;
    setRemoving(true);
    try {
      const r = await removeSitePosts({ data: { setId, pubKeys: extra.map((p) => p.pubKey) } });
      if (!r.ok) setLiveErr(r.error);
      await refreshLive();
    } finally { setRemoving(false); }
  };

  const done = states.filter((s) => s?.s === "posted").length;
  const failed = states.filter((s) => s?.s === "error").length;
  const blocked = !rows ? "Add at least one title." : !clips.length ? "Drop the video files in." : mismatch;

  return (
    <div style={{ color: V3_CREAM, maxWidth: 1100 }}>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, margin: "0 0 4px" }}>Quick post</h1>
      <div style={{ fontSize: 13, color: V3_MUTED, marginBottom: 16, maxWidth: 680, lineHeight: 1.5 }}>
        Videos go onto a set in this order, each with a brand-kit thumbnail. No captions, no transcript, no splits.
        Video 1 replaces the set's old video 1, and so on.
      </div>

      {/* THE SET + WHAT'S ON THE SITE NOW */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: V3_MUTED, minWidth: 320 }}>
          Set
          <select value={setId} onChange={(e) => setSetId(e.target.value)} style={field} disabled={busy}>
            {!sets.some((s) => s.id === setId) && <option value={setId}>{live?.setName ?? setId}</option>}
            {sets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <div style={{ flex: "1 1 360px", fontSize: 12.5, border: `1px solid ${V3_EDGE}`, borderRadius: 10, padding: "8px 12px" }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>On the site now{live ? ` · ${live.posts.length} video${live.posts.length === 1 ? "" : "s"}` : ""}{liveStats.average != null ? ` · average ${clock(liveStats.average)}` : ""}</div>
          {liveErr && <div style={{ color: RED }}>{liveErr}</div>}
          {live && !live.posts.length && <div style={{ color: V3_MUTED }}>Nothing posted on this set yet.</div>}
          {live?.posts.map((p) => (
            <div key={p.pubKey} style={{ color: p.takeIndex >= rows ? V3_GOLD : V3_MUTED }}>
              {p.takeIndex + 1}. {p.title || "(untitled)"} · {clock(p.durationS)}{p.takeIndex < rows ? ` → replaced by “${titles[p.takeIndex]}”` : " → not replaced"}
            </div>
          ))}
          {extra.length > 0 && (
            <button type="button" onClick={() => void removeExtra()} disabled={removing || busy} style={{ ...btn(), marginTop: 8, borderColor: RED, color: RED }}>
              {removing ? "Removing…" : `Remove the ${extra.length} not replaced`}
            </button>
          )}
        </div>
      </div>

      {/* TITLES + COVER TEXT */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: V3_MUTED, flex: "0 0 300px" }}>
          Titles, in order · one per line ({rows})
          <textarea value={titlesText} onChange={(e) => { setTitlesText(e.target.value); setStates([]); }} rows={Math.min(16, Math.max(6, rows + 1))} style={{ ...field, resize: "vertical" }} disabled={busy} />
          <span>“… cheat code” gets the Cheat Code cover.</span>
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "0 0 240px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: V3_MUTED }}>
            Cover kicker
            <input value={kicker} onChange={(e) => setKicker(e.target.value)} style={field} disabled={busy} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: V3_MUTED }}>
            Series (EXAM 1 · …)
            <input value={part} onChange={(e) => setPart(e.target.value)} style={field} disabled={busy} />
          </label>
          <label style={{ ...btn(), textAlign: "center" }}>
            + Add video files
            <input type="file" accept="video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} disabled={busy} />
          </label>
          <div style={{ fontSize: 12, color: V3_MUTED, lineHeight: 1.5 }}>Files line up in filming order (by file name). Use ▲▼ to fix any.</div>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (!busy) addFiles(e.dataTransfer.files); }}
          style={{ flex: "1 1 260px", minHeight: 150, border: `2px dashed ${V3_EDGE}`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: V3_MUTED, textAlign: "center", padding: 12 }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: V3_CREAM }}>Drop the videos here</div>
          <div>{clips.length} file{clips.length === 1 ? "" : "s"}{stats.count ? ` · ${clock(stats.total)} total` : ""}</div>
          <div style={{ fontSize: 22, fontFamily: V3_DISPLAY, color: V3_GOLD }}>{stats.average != null ? `average ${clock(stats.average)}` : "average —"}</div>
          {stats.count > 0 && stats.count < Math.min(rows, clips.length) && <div>reading lengths… {stats.count} of {Math.min(rows, clips.length)}</div>}
        </div>
      </div>

      {/* THE ROWS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {titles.map((title, i) => {
          const clip = clips[i];
          const st = states[i] ?? { s: "idle" };
          const off = skip.has(i);
          return (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", border: `1px solid ${st.s === "error" ? RED : st.s === "posted" ? MINT : V3_EDGE}`, borderRadius: 10, padding: 8, opacity: off ? 0.45 : 1 }}>
              <div style={{ width: 26, textAlign: "right", fontWeight: 900, fontFamily: V3_DISPLAY, fontSize: 18 }}>{i + 1}</div>
              <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${V3_EDGE}`, flex: "0 0 auto" }}>
                <ThumbnailArt ref={(el) => { art.current[i] = el; }} spec={specs[i]} colorway={cw} mode="social" width={72} />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                {clip ? (
                  <video src={clip.url} preload="metadata" muted controls style={{ width: 96, height: 170, background: "#000", borderRadius: 6, objectFit: "cover" }}
                    onLoadedMetadata={(e) => setDuration(clip.url, e.currentTarget.duration)} />
                ) : (
                  <div style={{ width: 96, height: 170, borderRadius: 6, border: `1px dashed ${V3_EDGE}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: V3_MUTED, textAlign: "center" }}>no file</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
                <div style={{ fontSize: 12, color: V3_MUTED, overflowWrap: "anywhere" }}>
                  {clip ? `${clip.file.name} · ${clock(clip.duration)} · ${(clip.file.size / 1048576).toFixed(0)} MB` : "Add a file for this one."}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4, color: st.s === "error" ? RED : st.s === "posted" ? MINT : V3_GOLD }}>
                  {st.s === "cover" && "Making the thumbnail…"}
                  {st.s === "upload" && `Uploading ${Math.round(st.frac * 100)}%`}
                  {st.s === "processing" && "Processing on the video host…"}
                  {st.s === "posted" && "✓ On the site"}
                  {st.s === "error" && st.error}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 auto" }}>
                <button type="button" style={btn()} onClick={() => move(i, -1)} disabled={busy || !clip || i === 0} title="Swap this file with the one above">▲</button>
                <button type="button" style={btn()} onClick={() => move(i, 1)} disabled={busy || !clips[i + 1]} title="Swap this file with the one below">▼</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 0 auto", alignItems: "flex-end" }}>
                <label style={{ fontSize: 12, color: V3_MUTED, display: "flex", gap: 5, alignItems: "center" }}>
                  <input type="checkbox" checked={!off} disabled={busy} onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} /> post
                </label>
                {clip && <button type="button" style={{ ...btn(), fontSize: 11, padding: "3px 8px" }} onClick={() => drop(i)} disabled={busy}>remove file</button>}
              </div>
            </div>
          );
        })}
        {clips.slice(rows).map((c, k) => (
          <div key={c.url} style={{ fontSize: 12.5, color: RED, border: `1px dashed ${RED}`, borderRadius: 10, padding: 8, display: "flex", gap: 10, alignItems: "center" }}>
            Extra file with no title: {c.file.name} · {clock(c.duration)}
            <button type="button" style={{ ...btn(), fontSize: 11, padding: "3px 8px" }} onClick={() => drop(rows + k)} disabled={busy}>remove file</button>
          </div>
        ))}
      </div>

      {/* POST */}
      <div style={{ position: "sticky", bottom: 0, marginTop: 16, padding: "12px 0", background: "linear-gradient(transparent, #14213D 30%)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => void postAll()} disabled={busy || !!blocked} style={{ ...btn(true), fontSize: 15, padding: "10px 20px", opacity: busy || blocked ? 0.55 : 1 }}>
          {busy ? `Posting… ${done} of ${rows - skip.size} on the site` : `Post ${rows - skip.size} to ${live?.setName ?? "the set"}`}
        </button>
        {blocked && <span style={{ fontSize: 13, color: V3_GOLD }}>{blocked}</span>}
        {!busy && done > 0 && <span style={{ fontSize: 13, color: MINT }}>{done} posted.</span>}
        {!busy && failed > 0 && <span style={{ fontSize: 13, color: RED }}>{failed} didn't post — untick the ones that did, then press Post again.</span>}
      </div>
    </div>
  );
}
