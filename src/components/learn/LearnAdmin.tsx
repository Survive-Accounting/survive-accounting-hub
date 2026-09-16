// /admin/learn — the posted videos, fixed in place. Lee, 2026-09-16: "I'd love a /learn?admin or something where I
// can just drag/drop each video from there to reorder… normalize audio across all videos… select a video and
// tweak with sync offset… mark a video as good or needs redo with a 'why' response. Let me talk those out or
// text them."
//
// Fixes are cut from the part's ORIGINAL file on the render worker (one input, the whole file, the audio slid
// and/or normalized), then re-posted to the same part — students see the fixed video on their next load, and the
// order, review and offset stay on the part (site-publish.functions resolveSitePost keeps them).
import { useEffect, useMemo, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { useDictation } from "@/lib/use-dictation";
import { listLearnAdminSets, noteLearnFix, setLearnOrder, setLearnReview, type AdminPart, type AdminSet } from "@/lib/learn-admin.functions";
import { resolveWorkerRender, startDissectStitch, workerPreflight } from "@/lib/render-worker.functions";
import { resolveSitePost, startSitePost } from "@/lib/site-publish.functions";

const BG = "#0B1220", PANEL = "#111C33", EDGE = "#2A3A5E", CREAM = "#F5EFE6", MUTED = "#93A3C2", GOLD = "#FCA311", MINT = "#3BF5A0", RED = "#EF4B3F", SKY = "#7DD3FC";
const LOUD_TARGET = -16;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (s: number | null) => (s == null ? "–:––" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const thumb = (pid: string | null) => (pid ? `https://image.mux.com/${pid}/thumbnail.jpg?width=160&time=1` : undefined);

async function wake(say: (n: string) => void) {
  say("waking the video worker…");
  for (let tries = 0; ; tries++) {
    const h = await workerPreflight().catch((e) => ({ configured: true, healthy: false, detail: e instanceof Error ? e.message : String(e) }));
    if (!h.configured) throw new Error("The video worker isn't set up on the site.");
    if (h.healthy) return;
    if (tries >= 5) throw new Error(`The video worker didn't wake up: ${h.detail}.`);
    await wait(5000);
  }
}
/** Cut the part's original file with the fix applied; returns the new file's URL. */
async function renderFix(part: AdminPart, fix: { audioOffsetMs?: number; normalize?: boolean; sampleS?: number }, say: (n: string) => void): Promise<string> {
  const src = part.originalUrl ?? part.sourceUrl;
  if (!src) throw new Error("This part has no source file to cut from — it was posted another way.");
  const end = fix.sampleS ?? Math.max(1, (part.durationS ?? 600) + 1);
  const job = await startDissectStitch({ data: { urls: [src], trims: [{ start: 0, end }], gapMs: 0, gapJitterMs: 0, vertical: true, ...(fix.normalize ? { loudI: LOUD_TARGET } : {}), ...(fix.audioOffsetMs ? { audioOffsetMs: fix.audioOffsetMs } : {}) } });
  let misses = 0;
  for (;;) {
    await wait(2500);
    const r = await resolveWorkerRender({ data: { jobId: job.jobId, path: job.path, machineId: job.machineId } }).catch((e) => { if (++misses > 8) throw e; return null; });
    if (!r) continue;
    misses = 0;
    if (r.state === "done" && r.fileUrl) return r.fileUrl;
    if (r.state === "error") throw new Error(r.error ?? "The worker failed.");
    say(`cutting · ${r.state}`);
  }
}
/** Post the fixed file over the same part. */
async function repost(setId: string, part: AdminPart, fileUrl: string, say: (n: string) => void): Promise<void> {
  say("sending to the video host…");
  const { assetId } = await startSitePost({ data: { videoUrl: fileUrl, pubKey: part.pubKey } });
  const started = Date.now();
  while (Date.now() - started < 20 * 60_000) {
    await wait(4000);
    const r = await resolveSitePost({ data: { assetId, setId, pubKey: part.pubKey, takeIndex: part.takeIndex, takeName: part.name, title: part.name, videoUrl: fileUrl, ledger: false } });
    if (r.state === "posted") return;
    if (r.state === "error") { if (/changed while posting/i.test(r.error)) { await wait(1500); continue; } throw new Error(r.error); }
    say("the video host is processing…");
  }
  throw new Error("The video host is still processing — check /learn in a few minutes.");
}

export function LearnAdmin() {
  const [sets, setSets] = useState<AdminSet[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [setId, setSetId] = useState<string>("");
  const reload = () => listLearnAdminSets().then((s) => { setSets(s); setSetId((cur) => cur || s[0]?.setId || ""); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  useEffect(() => { void reload(); }, []);
  const set = useMemo(() => sets?.find((s) => s.setId === setId) ?? null, [sets, setId]);
  const [parts, setParts] = useState<AdminPart[]>([]);
  useEffect(() => { setParts(set?.parts ?? []); }, [set]);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const say = (key: string) => (note: string) => setBusy((b) => ({ ...b, [key]: note }));
  const done = (key: string) => setBusy((b) => { const { [key]: _g, ...rest } = b; return rest; });
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(null);
  const take = (next: AdminPart[]) => { setParts(next); setSets((all) => (all ?? []).map((s) => (s.setId === setId ? { ...s, parts: next } : s))); };

  // DRAG TO REORDER — saved on drop
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const drop = async (toIdx: number) => {
    if (dragging == null || dragging === toIdx) { setDragging(null); setOver(null); return; }
    const next = [...parts];
    const [m] = next.splice(dragging, 1);
    next.splice(toIdx, 0, m);
    setDragging(null); setOver(null);
    take(next);
    try { take(await setLearnOrder({ data: { setId, takeIndexes: next.map((p) => p.takeIndex) } })); setFlash({ text: "Order saved — /learn shows it on its next load." }); }
    catch (e) { setFlash({ text: e instanceof Error ? e.message : String(e), bad: true }); }
  };

  // FIXES
  const applySync = async (part: AdminPart, ms: number) => {
    const key = `sync:${part.pubKey}`;
    try {
      await wake(say(key));
      say(key)("cutting the audio into place…");
      const url = await renderFix(part, { audioOffsetMs: ms, normalize: !!part.normalizedAt }, say(key));
      await repost(setId, part, url, say(key));
      take(await noteLearnFix({ data: { setId, takeIndex: part.takeIndex, audioOffsetMs: ms } }));
      setFlash({ text: `#${part.takeIndex + 1} re-posted with the audio ${ms > 0 ? "later" : "earlier"} by ${Math.abs(ms)} ms.` });
    } catch (e) { setFlash({ text: e instanceof Error ? e.message : String(e), bad: true }); }
    finally { done(key); }
  };
    /** One video: cut from its original with the loudness pass (the worker applies it to every stitch now), re-post. */
  const normalizeOne = async (sid: string, part: AdminPart, key: string) => {
    await wake(say(key));
    say(key)("normalizing…");
    const url = await renderFix(part, { normalize: true, audioOffsetMs: part.audioOffsetMs }, say(key));
    await repost(sid, part, url, say(key));
    const next = await noteLearnFix({ data: { setId: sid, takeIndex: part.takeIndex, normalized: true } });
    if (sid === setId) take(next); else setSets((all) => (all ?? []).map((s) => (s.setId === sid ? { ...s, parts: next } : s)));
  };
  const normalizeAll = async () => {
    if (!window.confirm(`Normalize every video in "${set?.name}" to ${LOUD_TARGET} LUFS and re-post them? About a minute each, one at a time.`)) return;
    for (const part of parts) {
      const key = `norm:${part.pubKey}`;
      try { await normalizeOne(setId, part, key); }
      catch (e) { setFlash({ text: `#${part.takeIndex + 1}: ${e instanceof Error ? e.message : String(e)}`, bad: true }); done(key); return; }
      done(key);
    }
    setFlash({ text: "Every video normalized and re-posted." });
  };
  // EVERYTHING POSTED, EVERY SET (Lee, 2026-09-16: "Go into each video I've already posted, and normalize the audio").
  // Videos already stamped normalized are skipped unless asked; the loop is sequential so the worker never
  // renders two at once. Leave the tab open.
  const [everyNote, setEveryNote] = useState<string | null>(null);
  const normalizeEverything = async (again: boolean) => {
    const todo = (sets ?? []).flatMap((s) => s.parts.filter((p) => (again || !p.normalizedAt) && (p.originalUrl || p.sourceUrl)).map((p) => ({ sid: s.setId, name: s.name, part: p })));
    if (!todo.length) { setFlash({ text: "Every posted video is already normalized." }); return; }
    if (!window.confirm(`Normalize ${todo.length} posted video${todo.length === 1 ? "" : "s"} across ${new Set(todo.map((t) => t.sid)).size} set(s) to ${LOUD_TARGET} LUFS and re-post each one? About a minute each — keep this tab open.`)) return;
    let n = 0;
    for (const t of todo) {
      const key = `norm:${t.part.pubKey}`;
      setEveryNote(`${n + 1} of ${todo.length} · ${t.name} · #${t.part.takeIndex + 1}`);
      try { await normalizeOne(t.sid, t.part, key); n++; }
      catch (e) { setFlash({ text: `${t.name} #${t.part.takeIndex + 1}: ${e instanceof Error ? e.message : String(e)}`, bad: true }); done(key); setEveryNote(null); return; }
      done(key);
    }
    setEveryNote(null);
    setFlash({ text: `${n} video${n === 1 ? "" : "s"} normalized and re-posted.` });
  };

  const btn = (strong = false, tone = GOLD): React.CSSProperties => ({ font: "inherit", fontSize: 12, fontWeight: 800, padding: "6px 11px", borderRadius: 8, cursor: "pointer", border: `1px solid ${strong ? tone : EDGE}`, background: strong ? tone : "transparent", color: strong ? "#14213D" : CREAM, whiteSpace: "nowrap" });

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "18px 20px 60px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontFamily: "'League Spartan', 'Rubik', sans-serif", fontSize: 24 }}>/learn · the videos</b>
          <a href="/learn" target="_blank" rel="noreferrer" style={{ color: SKY, fontSize: 12.5, fontWeight: 700 }}>open /learn ↗</a>
          <span style={{ flex: 1 }} />
          {sets && (
            <select value={setId} onChange={(e) => setSetId(e.target.value)} style={{ font: "inherit", fontSize: 13, fontWeight: 700, background: PANEL, color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, padding: "6px 10px" }}>
              {sets.map((s) => <option key={s.setId} value={s.setId}>{s.name} · {s.parts.length}</option>)}
            </select>
          )}
                    <button type="button" style={btn(true)} disabled={!parts.length || Object.keys(busy).some((k) => k.startsWith("norm:"))} onClick={() => void normalizeAll()}>Normalize audio · this set</button>
          <button type="button" style={btn(false)} disabled={!sets?.length || Object.keys(busy).some((k) => k.startsWith("norm:"))} onClick={(e) => void normalizeEverything(e.shiftKey)} title="Every posted video not yet normalized, across every set. Shift-click to redo them all.">Normalize every posted video</button>
        </div>
        {everyNote && <div style={{ fontSize: 12.5, color: GOLD, fontWeight: 700 }}>Normalizing everything · {everyNote}</div>}
        <div style={{ fontSize: 12.5, color: MUTED }}>New stitches are normalized automatically (−16 LUFS, two-pass) — these buttons are for videos posted before that.</div>
        <div style={{ fontSize: 12.5, color: MUTED }}>Drag a row to reorder — it saves on drop. Good / Needs redo take a why, typed or talked. Sync slides the sound against the picture: preview 8 seconds, then apply to re-post the whole video.</div>
        {err && <div style={{ color: RED }}>{err}</div>}
        {flash && <div role="status" style={{ color: flash.bad ? RED : MINT, fontWeight: 700, fontSize: 13 }}>{flash.text}</div>}
        {!sets && !err && <div style={{ color: MUTED }}>Loading the posted videos…</div>}
        {sets && !parts.length && <div style={{ color: MUTED }}>No posted videos yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {parts.map((p, i) => (
            <PartRow key={p.pubKey} part={p} n={i + 1} setId={setId} busy={busy[`sync:${p.pubKey}`] ?? busy[`norm:${p.pubKey}`] ?? null}
              dragging={dragging === i} over={over === i && dragging != null && dragging !== i}
              onDragStart={() => setDragging(i)} onDragOver={() => setOver(i)} onDrop={() => void drop(i)} onDragEnd={() => { setDragging(null); setOver(null); }}
              onReview={async (verdict, why) => { try { take(await setLearnReview({ data: { setId, takeIndex: p.takeIndex, verdict, why } })); } catch (e) { setFlash({ text: e instanceof Error ? e.message : String(e), bad: true }); } }}
              onSync={(ms) => void applySync(p, ms)} say={say(`sync:${p.pubKey}`)} clear={() => done(`sync:${p.pubKey}`)} onFlash={(t, bad) => setFlash({ text: t, bad })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PartRow({ part, n, setId, busy, dragging, over, onDragStart, onDragOver, onDrop, onDragEnd, onReview, onSync, say, clear, onFlash }: {
  part: AdminPart; n: number; setId: string; busy: string | null; dragging: boolean; over: boolean;
  onDragStart: () => void; onDragOver: () => void; onDrop: () => void; onDragEnd: () => void;
  onReview: (verdict: "good" | "redo" | null, why: string) => Promise<void>;
  onSync: (ms: number) => void; say: (n: string) => void; clear: () => void; onFlash: (t: string, bad?: boolean) => void;
}) {
  const [open, setOpen] = useState<null | "review" | "sync">(null);
  const [why, setWhy] = useState(part.review?.why ?? "");
  const [verdict, setVerdict] = useState<"good" | "redo" | null>(part.review?.verdict ?? null);
  useEffect(() => { setWhy(part.review?.why ?? ""); setVerdict(part.review?.verdict ?? null); }, [part.review?.why, part.review?.verdict]);
  const [interim, setInterim] = useState("");
  const mic = useDictation((final, live) => { setInterim(live); if (final.trim()) setWhy((w) => `${w} ${final}`.trim()); });
  const [ms, setMs] = useState(part.audioOffsetMs);
  useEffect(() => setMs(part.audioOffsetMs), [part.audioOffsetMs]);
  const [sample, setSample] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);
  const preview = async () => {
    setSampling(true); setSample(null);
    try { await wake(say); say("cutting an 8-second sample…"); setSample(await renderFix(part, { audioOffsetMs: ms, normalize: !!part.normalizedAt, sampleS: 8 }, say)); }
    catch (e) { onFlash(e instanceof Error ? e.message : String(e), true); }
    finally { setSampling(false); clear(); }
  };
  const small = (strong = false, tone = GOLD): React.CSSProperties => ({ font: "inherit", fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, cursor: "pointer", border: `1px solid ${strong ? tone : EDGE}`, background: strong ? tone : "transparent", color: strong ? "#14213D" : CREAM, whiteSpace: "nowrap" });
  const tone = part.review?.verdict === "good" ? MINT : part.review?.verdict === "redo" ? RED : EDGE;
  return (
    <div draggable onDragStart={onDragStart} onDragOver={(e) => { e.preventDefault(); onDragOver(); }} onDrop={(e) => { e.preventDefault(); onDrop(); }} onDragEnd={onDragEnd}
      style={{ background: PANEL, border: `1px solid ${tone}`, borderRadius: 12, padding: 10, opacity: dragging ? 0.5 : 1, boxShadow: over ? `inset 0 3px 0 0 ${GOLD}` : "none", cursor: "grab" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ color: MUTED, fontSize: 14 }}>⠿</span>
        <span style={{ width: 22, textAlign: "right", fontWeight: 900, color: MUTED }}>{n}</span>
        <div style={{ width: 44, aspectRatio: "9/16", borderRadius: 6, background: "#000", overflow: "hidden", flex: "none" }}>{thumb(part.playbackId) && <img src={part.coverUrl ?? thumb(part.playbackId)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{part.name || `Video ${part.takeIndex + 1}`}</div>
          <div style={{ fontSize: 11.5, color: MUTED }}>
            {clock(part.durationS)} · filmed as #{part.takeIndex + 1}
            {part.audioOffsetMs ? ` · audio ${part.audioOffsetMs > 0 ? "+" : ""}${part.audioOffsetMs} ms` : ""}{part.normalizedAt ? " · normalized" : ""}
            {part.review && <span style={{ color: tone, fontWeight: 800 }}> · {part.review.verdict === "good" ? "GOOD" : "NEEDS REDO"}{part.review.why ? ` — ${part.review.why}` : ""}</span>}
          </div>
          {busy && <div style={{ fontSize: 11.5, color: GOLD, fontWeight: 700 }}>⚡ {busy}</div>}
        </div>
        <a href={`/learn?set=${encodeURIComponent(setId)}&part=${part.takeIndex + 1}`} target="_blank" rel="noreferrer" style={{ ...small(), textDecoration: "none" }}>▶ Watch</a>
        <button type="button" style={small(open === "review")} onClick={() => setOpen(open === "review" ? null : "review")}>Good / Redo</button>
        <button type="button" style={small(open === "sync")} onClick={() => setOpen(open === "sync" ? null : "sync")}>Sync</button>
      </div>
      {open === "review" && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, paddingLeft: 40 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={small(verdict === "good", MINT)} onClick={() => setVerdict("good")}>✓ Good</button>
            <button type="button" style={small(verdict === "redo", RED)} onClick={() => setVerdict("redo")}>↺ Needs redo</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <textarea value={mic.on && interim ? `${why} ${interim}`.trim() : why} onChange={(e) => { setInterim(""); setWhy(e.target.value); }} rows={2} placeholder="Why? (say it or type it)"
              style={{ flex: 1, font: "inherit", fontSize: 13, background: "rgba(0,0,0,0.35)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, padding: "6px 9px", resize: "vertical" }} />
            {mic.supported && <button type="button" style={small(mic.on, RED)} onClick={() => { if (mic.on) { mic.stop(); setInterim(""); } else mic.start(); }}>{mic.on ? "● stop" : "🎙 talk"}</button>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={small(true)} disabled={!verdict} onClick={() => { void onReview(verdict, why); setOpen(null); }}>Save</button>
            {part.review && <button type="button" style={small()} onClick={() => { void onReview(null, ""); setOpen(null); }}>Clear</button>}
          </div>
        </div>
      )}
      {open === "sync" && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, paddingLeft: 40 }}>
          <div style={{ fontSize: 12, color: MUTED }}>Slide the sound against the picture. Mouth moves before the words? Move the audio <b style={{ color: CREAM }}>earlier</b>. Words before the mouth? <b style={{ color: CREAM }}>Later</b>.</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: MUTED }}>earlier</span>
            <input type="range" min={-600} max={600} step={20} value={ms} onChange={(e) => setMs(Number(e.target.value))} style={{ flex: 1, accentColor: GOLD }} />
            <span style={{ fontSize: 11.5, color: MUTED }}>later</span>
            <b style={{ width: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ms > 0 ? "+" : ""}{ms} ms</b>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={small()} disabled={sampling || !!busy} onClick={() => void preview()}>{sampling ? "Cutting…" : "Preview 8 s"}</button>
            <button type="button" style={small(true)} disabled={!!busy || ms === part.audioOffsetMs} onClick={() => onSync(ms)}>Apply to the video</button>
            <span style={{ fontSize: 11.5, color: MUTED }}>Apply re-cuts the whole video from the original and re-posts it (about a minute).</span>
          </div>
          {sample && <video src={sample} controls autoPlay playsInline style={{ width: 200, aspectRatio: "9/16", background: "#000", borderRadius: 10 }} />}
        </div>
      )}
      <span hidden>{getAdminWho()}</span>
    </div>
  );
}
