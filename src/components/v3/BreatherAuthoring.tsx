// /v3/breathers — AUTHOR BREATHERS (Lee, 2026-09-14: "I want the ability to create my own … preview
// them and then post them so I can see what's going on, and have more control over when and where
// these show up"). Pick a set; its posted videos are listed in order with a gap between each pair.
// Click a gap to put a breather there, type it, drag it to another gap (or use ▲▼), preview it at
// phone size, and switch it Live when it's ready. Nothing reaches students until it's Live, has
// text, and is saved. The spacing rules show as warnings, never blocks.
import { useEffect, useMemo, useState } from "react";

import { BreatherCard } from "@/components/learn/BreatherCard";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { BREATHER_BODY_MAX, breatherPosition, breatherWarnings, moveBreather, newBreather, type Breather } from "@/lib/breathers";
import { listBreatherSets, loadBreathers, saveBreathers, type SequenceVideo } from "@/lib/breathers.functions";
import { setLearnOrder } from "@/lib/learn-admin.functions";

import { clock } from "./quick-post";

const MINT = "#7BD3A8", RED = "#FF8A7A", AMBER = "#FFC46B";
const btn = (strong = false): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 8, border: `1px solid ${strong ? V3_GOLD : V3_EDGE}`, background: strong ? V3_GOLD : "transparent", color: strong ? "#14213D" : V3_CREAM, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" });
const field: React.CSSProperties = { background: "rgba(0,0,0,0.28)", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 8, padding: "7px 9px", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

export function BreatherAuthoring() {
  const [sets, setSets] = useState<Awaited<ReturnType<typeof listBreatherSets>> | null>(null);
  const [setId, setSetId] = useState("deck-e1s-2-1");
  const [videos, setVideos] = useState<SequenceVideo[]>([]);
  const [saved, setSaved] = useState<Breather[]>([]);
  const [draft, setDraft] = useState<Breather[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => { void listBreatherSets().then(setSets).catch((e) => setErr(String(e?.message ?? e))); }, []);
  const load = async (id: string) => {
    setErr(null); setNote(null);
    try {
      const r = await loadBreathers({ data: { setId: id } });
      if (!r) { setErr("That set isn't in the bank."); return; }
      setVideos(r.videos); setSaved(r.breathers); setDraft(r.breathers); setSel(r.breathers[0]?.id ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { void load(setId); }, [setId]);
  // THE ORDER ON THE SITE (Lee, 2026-09-16): ▲ ▼ on a video moves it for students right away — no Save needed
  // (the breathers below keep their gaps by video, so they travel with it).
  const moveVideo = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= videos.length) return;
    const takeIndexes = videos.map((v) => v.takeIndex);
    [takeIndexes[i], takeIndexes[j]] = [takeIndexes[j], takeIndexes[i]];
    setBusy(true); setErr(null);
    try { await setLearnOrder({ data: { setId, takeIndexes } }); await load(setId); setNote("Order saved · live on /learn"); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const order = videos.map((v) => v.pubKey);
  const warnings = useMemo(() => breatherWarnings(order, draft), [order, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const selected = draft.find((b) => b.id === sel) ?? null;
  const selIndex = selected ? order.indexOf(selected.afterPubKey) : -1;

  const patch = (id: string, p: Partial<Breather>) => setDraft((d) => d.map((b) => (b.id === id ? { ...b, ...p, updatedAt: new Date().toISOString() } : b)));
  const addAfter = (pubKey: string) => { const b = newBreather(pubKey); setDraft((d) => [...d, b]); setSel(b.id); };
  const remove = (id: string) => { setDraft((d) => d.filter((b) => b.id !== id)); if (sel === id) setSel(null); };
  const shift = (b: Breather, dir: -1 | 1) => {
    const i = order.indexOf(b.afterPubKey) + dir;
    if (i >= 0 && i < order.length - 1) setDraft((d) => moveBreather(d, b.id, order[i]));
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await saveBreathers({ data: { setId, breathers: draft } });
      if (!r.ok) { setErr(r.error); return; }
      setSaved(draft);
      const live = draft.filter((b) => b.live && b.body.trim()).length;
      setNote(live ? `Saved · ${live} live for students` : "Saved · none live yet");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ color: V3_CREAM }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, margin: 0 }}>Breathers</h1>
        <select value={setId} onChange={(e) => setSetId(e.target.value)} style={{ ...field, width: "auto", minWidth: 260 }} disabled={dirty && busy}>
          {!sets?.some((s) => s.id === setId) && <option value={setId}>{setId}</option>}
          {sets?.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.videos} videos{s.breathers ? ` · ${s.breathers} breathers` : ""}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {note && !dirty && <span style={{ fontSize: 12.5, color: MINT }}>{note}</span>}
        {dirty && <span style={{ fontSize: 12.5, color: AMBER }}>Unsaved changes</span>}
        <button type="button" style={{ ...btn(true), opacity: busy || !dirty ? 0.55 : 1 }} disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
      </div>
      <p style={{ fontSize: 13, color: V3_MUTED, maxWidth: 720, margin: "0 0 14px", lineHeight: 1.5 }}>
        Click a gap between two videos to add a breather. Students see it for about 2.5 seconds after the video above ends, then the next video plays; a tap skips it. It only shows once it has text, is switched <b style={{ color: V3_CREAM }}>Live</b>, and you've saved.
      </p>
      {err && <div style={{ color: RED, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {warnings.length > 0 && (
        <div style={{ border: `1px solid ${AMBER}55`, borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 12.5, color: AMBER, display: "flex", flexDirection: "column", gap: 3 }}>
          {warnings.map((w, i) => <div key={i}>⚠ {w.message}</div>)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 22, alignItems: "start" }}>
        <div>
          {videos.map((v, i) => {
            const here = draft.filter((b) => b.afterPubKey === v.pubKey);
            const last = i === videos.length - 1;
            return (
              <div key={v.pubKey}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: `1px solid ${V3_EDGE}`, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                  <span style={{ width: 22, textAlign: "right", fontWeight: 900, color: V3_MUTED }}>{i + 1}</span>
                  {v.coverUrl ? <img src={v.coverUrl} alt="" style={{ width: 30, height: 53, objectFit: "cover", borderRadius: 4 }} /> : <span style={{ width: 30, height: 53, borderRadius: 4, background: "#000" }} />}
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{v.title}</span>
                  <span style={{ fontSize: 12, color: V3_MUTED }}>{clock(v.durationS)}</span>
                  <button type="button" style={{ ...btn(), padding: "2px 8px" }} disabled={busy || i === 0} onClick={() => void moveVideo(i, -1)} title="Play this video earlier on /learn">▲</button>
                  <button type="button" style={{ ...btn(), padding: "2px 8px" }} disabled={busy || last} onClick={() => void moveVideo(i, 1)} title="Play this video later on /learn">▼</button>
                </div>
                {!last && (
                  <div onDragOver={(e) => { if (dragId) e.preventDefault(); }} onDrop={() => { if (dragId) { setDraft((d) => moveBreather(d, dragId, v.pubKey)); setDragId(null); } }}
                    style={{ padding: "6px 0 6px 32px", minHeight: 18, borderLeft: `2px dashed ${dragId ? V3_GOLD : "transparent"}`, marginLeft: 20 }}>
                    {here.map((b) => (
                      <div key={b.id} draggable onDragStart={() => setDragId(b.id)} onDragEnd={() => setDragId(null)} onClick={() => setSel(b.id)}
                        style={{ border: `1px solid ${sel === b.id ? V3_GOLD : V3_EDGE}`, borderRadius: 10, padding: "8px 10px", marginBottom: 6, background: "rgba(252,163,17,0.05)", cursor: "grab" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span title="Drag to another gap" style={{ color: V3_MUTED }}>⠿</span>
                          <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: V3_GOLD }}>Breather</span>
                          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: b.live ? MINT : V3_MUTED }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={b.live} onChange={(e) => patch(b.id, { live: e.target.checked })} /> Live
                          </label>
                          <span style={{ flex: 1 }} />
                          <button type="button" style={{ ...btn(), padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); shift(b, -1); }} disabled={order.indexOf(b.afterPubKey) === 0} title="Move up a gap">▲</button>
                          <button type="button" style={{ ...btn(), padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); shift(b, 1); }} disabled={order.indexOf(b.afterPubKey) >= order.length - 2} title="Move down a gap">▼</button>
                          <button type="button" style={{ ...btn(), padding: "2px 8px", color: RED }} onClick={(e) => { e.stopPropagation(); remove(b.id); }}>Delete</button>
                        </div>
                        <input value={b.heading} onChange={(e) => patch(b.id, { heading: e.target.value })} onFocus={() => setSel(b.id)} placeholder="You just learned" style={{ ...field, marginTop: 6, fontSize: 13, fontWeight: 700 }} />
                        <textarea value={b.body} onChange={(e) => patch(b.id, { body: e.target.value })} onFocus={() => setSel(b.id)} rows={2} placeholder="The one thing to keep from this video — ideally the wrong intuition it corrects."
                          style={{ ...field, marginTop: 6, resize: "vertical" }} />
                        <div style={{ fontSize: 11.5, textAlign: "right", color: b.body.trim().length > BREATHER_BODY_MAX ? RED : V3_MUTED }}>{b.body.trim().length}/{BREATHER_BODY_MAX}</div>
                      </div>
                    ))}
                    <button type="button" onClick={() => addAfter(v.pubKey)} style={{ ...btn(), borderStyle: "dashed", color: V3_MUTED, padding: "3px 10px", fontSize: 12 }}>+ breather after {i + 1}</button>
                  </div>
                )}
              </div>
            );
          })}
          {!videos.length && !err && <div style={{ color: V3_MUTED }}>Loading…</div>}
        </div>

        <div style={{ position: "sticky", top: 16 }}>
          <div style={{ fontSize: 12, color: V3_MUTED, marginBottom: 6 }}>{selected ? `Preview · after video ${selIndex + 1}${selected.live ? "" : " · draft"}` : "Pick a breather to preview it"}</div>
          <div style={{ position: "relative", width: 320, height: 568, borderRadius: 22, overflow: "hidden", border: `6px solid #000`, background: "#000", containerType: "inline-size" }}>
            {selected
              ? <BreatherCard heading={selected.heading || "You just learned"} body={selected.body} position={breatherPosition(Math.max(0, selIndex), videos.length)} preview />
              : <div style={{ display: "grid", placeItems: "center", height: "100%", color: V3_MUTED, fontSize: 13 }}>No breather selected</div>}
          </div>
          <div style={{ fontSize: 11.5, color: V3_MUTED, marginTop: 8, lineHeight: 1.5, maxWidth: 320 }}>Phone size, as students see it. The gold line counts the 2.5 seconds down (it loops here).</div>
        </div>
      </div>
    </div>
  );
}
