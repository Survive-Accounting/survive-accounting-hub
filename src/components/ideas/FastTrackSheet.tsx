// FAST TRACK — Ctrl+F on any internal page. A request in a sentence or two, the page captured,
// the guidelines beside it, the day's allowance, which model builds it, whether the build
// machine is up, and THE LOG of what's been sent (when · ~cost · time to build · 👍/👎 · a
// line). No new prompt until the last one is checked out (everyone but Lee).
import { useCallback, useEffect, useRef, useState } from "react";

import { getAdminWho } from "@/components/AdminGate";
import { FAST_TRACK_GUIDELINES, fmtBuildTime, fmtCost } from "@/lib/fast-track";
import { buildFastTrackBriefMessages, parseFastTrackBrief, type FastTrackBrief } from "@/lib/fast-track-brief";
import { fastTrackAllowanceFn, listFastTrackLog, rateFastTrack, submitFastTrack, type Allowance, type LogRow } from "@/lib/fast-track.functions";
import { runMicro } from "@/lib/talkthrough.functions";
import { uploadIdeaFile } from "@/components/ideas/upload";
import type { Attachment } from "@/components/ideas/model";

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.14)", INK = "#0B0F1E", MINT = "#3BF5A0", ORANGE = "#FF9F43", SKY = "#7DD3FC";

export function FastTrackSheet({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const who = getAdminWho() ?? "lee";
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [a, setA] = useState<Allowance | null>(null);
  const [view, setView] = useState<"ask" | "log">("ask");
  const [log, setLog] = useState<LogRow[] | null>(null);
  // SCREENSHOTS (Lee, 2026-09-05: "fast track needs a way to add screenshots" — "make the
  // camera bigger on my slides" is exactly the kind of request a picture makes unambiguous).
  // Paste (Win+Shift+S / Cmd+Shift+4 lands on the clipboard) or pick a file; up to 3.
  const [shots, setShots] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // THE BRIEF (Lee, 2026-09-05: "make fast track work similar to illustration. Just talk in
  // plain language about what you want... It will convert it into a prompt to send claude
  // code. Only for UI/UX changes.") — say it, prep it, confirm or revise, then send exactly
  // what was confirmed, never the raw words.
  const [brief, setBrief] = useState<FastTrackBrief | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [revision, setRevision] = useState("");

  const refresh = useCallback(() => {
    fastTrackAllowanceFn({ data: { who } }).then(setA).catch(() => setA(null));
    listFastTrackLog({ data: { who } }).then((r) => setLog(r.rows)).catch(() => setLog([]));
  }, [who]);
  useEffect(() => { if (open) { setSent(null); setErr(null); setView("ask"); setShots([]); setBrief(null); setRevision(""); refresh(); } }, [open, refresh]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;

  const left = a?.left;
  const checkout = a?.checkout ?? null;
  const online = a?.runnerOnline ?? null;
  const blocked = !!checkout || left === 0;

  const addShot = async (file: File) => {
    if (shots.length >= 3) { setErr("Three screenshots is plenty — remove one first."); return; }
    setUploading(true); setErr(null);
    try { const up = await uploadIdeaFile(file); setShots((v) => [...v, up]); }
    catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); }
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const img = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (!img) return; // plain text paste — let it through normally
    e.preventDefault();
    const file = img.getAsFile();
    if (file) void addShot(file);
  };

  const pageTitle = typeof document !== "undefined" ? document.title : "";

  async function draft(revise: boolean) {
    if (!text.trim()) { setErr("Say what should change first."); return; }
    setDrafting(true); setErr(null);
    try {
      const m = buildFastTrackBriefMessages({
        brainstorm: text, path: pathname, pageTitle, hasScreenshot: shots.length > 0,
        previous: revise && brief ? { title: brief.title, prompt: brief.prompt } : null,
        revision: revise ? revision.trim() || null : null,
      });
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 500 } });
      const b = parseFastTrackBrief(r.text);
      if (!b) throw new Error("The draft didn't come back clean — try once more, or say it a little differently.");
      setBrief(b); setRevision(""); setShowPrompt(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setDrafting(false); }
  }

  const send = async () => {
    if (!brief || brief.outOfScope) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitFastTrack({ data: { who, text: brief.prompt, path: pathname, pageTitle, attachments: shots } });
      if (!r.ok) { setErr(r.error); refresh(); return; }
      setText(""); setShots([]); setBrief(null);
      setSent(r.runnerOnline
        ? `Sent. The build machine picks it up on its next pass (within 3 minutes) and usually takes 10–40 minutes. You'll get an email now and another when it's built — with a cancel link and then a revert link.`
        : `Saved to the list. The build machine is off right now — it builds when the machine is back, and you'll get the emails then. Nothing else to do.`);
      refresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Fast track a small change" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147483001, background: "rgba(5,8,16,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", background: INK, color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 16, padding: 18, fontFamily: "'Rubik', system-ui, sans-serif", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>⚡ Fast track</div>
          <div style={{ fontSize: 12, color: MUTED }}>a small change, built by the machine</div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setView(view === "log" ? "ask" : "log")} style={{ ...btn, padding: "4px 10px", fontSize: 12, color: view === "log" ? GOLD : CREAM }}>
            {view === "log" ? "← new request" : `Log${log ? ` · ${log.length}` : ""}`}
          </button>
          <div style={{ fontSize: 12, color: left === 0 ? ORANGE : MUTED }}>
            {left === undefined ? "" : left === null ? "no daily limit" : `${left} of 10 left today`}
          </div>
        </div>
        {/* THE MACHINE + THE MODEL — said up front, every time. */}
        <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: MUTED, alignItems: "center" }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: online === null ? MUTED : online ? MINT : ORANGE, marginRight: 6, verticalAlign: "middle" }} />
            {online === null ? "checking the build machine…" : online ? "build machine is up" : `build machine is off${a?.runnerSeenAt ? ` — last seen ${new Date(a.runnerSeenAt).toLocaleString()}` : ""} — requests save to the list and build when it's back`}</span>
          <span>· builds on <b style={{ color: CREAM }}>{a?.modelLabel ?? "Claude Sonnet 5"}</b></span>
          {a?.playground && <span>· your changes land on <code style={{ color: CREAM }}>{a.playground}</code> (the playground — /v2 is never touched)</span>}
        </div>

        {view === "log" ? (
          <Log rows={log} who={who} onRated={refresh} />
        ) : sent ? (
          <div style={{ marginTop: 14, padding: "12px 14px", border: `1px solid ${GOLD}66`, borderRadius: 10, fontSize: 13.5, lineHeight: 1.5 }}>
            {sent}
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setView("log")} style={{ ...btn, background: GOLD, color: INK }}>See the log</button>
              <button type="button" onClick={onClose} style={btn}>Close</button>
            </div>
          </div>
        ) : (
          <>
            {/* THE CHECKOUT GATE — rate the last one, or wait for it, before the next. */}
            {checkout && checkout.kind === "rate" && (
              <div style={{ marginTop: 12, padding: "10px 12px", border: `1px solid ${ORANGE}88`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: ORANGE }}>Check out your last one first</div>
                <div style={{ fontSize: 12.5, color: CREAM, marginTop: 2 }}>“{checkout.title}” — {checkout.state === "failed" ? "it stopped" : "it's built"}. How did it go?</div>
                <RateForm id={checkout.id} onDone={refresh} />
              </div>
            )}
            {checkout && checkout.kind === "wait" && (
              <div style={{ marginTop: 12, padding: "10px 12px", border: `1px solid ${SKY}66`, borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 }}>
                <b style={{ color: SKY }}>One at a time.</b> “{checkout.title}” is still {checkout.state === "building" ? "building" : "in the queue"}. The next request opens when it's built and you've rated it. Watch it on <a href="/buildqueue" style={{ color: GOLD }}>/buildqueue</a>.
              </div>
            )}
            <textarea autoFocus={!blocked} value={text} onChange={(e) => { setText(e.target.value); setBrief(null); }} onPaste={onPaste} rows={4} disabled={blocked}
              placeholder={blocked ? "" : `Say what should change, in your own words — copy, a label, a color, a size. Paste a screenshot (Win+Shift+S) if a picture says it faster.`}
              style={{ marginTop: 12, width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(255,255,255,0.04)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 10, padding: "10px 12px", font: "inherit", fontSize: 14, lineHeight: 1.45, opacity: blocked ? 0.5 : 1 }} />
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: MUTED }}>Page: <code style={{ color: CREAM }}>{pathname}</code> · captured automatically</span>
              <span style={{ flex: 1 }} />
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void addShot(f); e.target.value = ""; }} />
              {!blocked && shots.length < 3 && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btn, padding: "3px 10px", fontSize: 11.5, opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? "Uploading…" : "📷 Add screenshot"}
                </button>
              )}
            </div>
            {shots.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {shots.map((s, i) => (
                  <div key={s.id} style={{ position: "relative" }}>
                    <img src={s.url} alt={s.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${EDGE}`, display: "block" }} />
                    <button type="button" onClick={() => setShots((v) => v.filter((_, k) => k !== i))} title="Remove"
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: "none", background: ORANGE, color: INK, fontSize: 11, fontWeight: 800, lineHeight: "18px", cursor: "pointer", padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: GOLD, fontWeight: 600 }}>What fits on the fast track</summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: CREAM, lineHeight: 1.5, opacity: 0.9 }}>
                {FAST_TRACK_GUIDELINES.map((g, i) => <li key={i} style={{ margin: "3px 0" }}>{g}</li>)}
              </ul>
            </details>

            {/* THE BRIEF — a title, two or three bullets, the actual prompt behind a toggle. */}
            {brief && !brief.outOfScope && (
              <div style={{ marginTop: 12, border: `1px solid ${GOLD}55`, borderRadius: 10, padding: "8px 10px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: CREAM }}>{brief.title}</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: CREAM, lineHeight: 1.45, opacity: 0.92 }}>
                  {brief.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
                <details open={showPrompt} onToggle={(e) => setShowPrompt((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>the exact instruction to Claude Code</summary>
                  <div style={{ marginTop: 4, fontSize: 12, color: CREAM, opacity: 0.85, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{brief.prompt}</div>
                </details>
                <div className="flex" style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="or: what to change…" onKeyDown={(e) => { if (e.key === "Enter" && revision.trim()) void draft(true); }}
                    style={{ flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, color: CREAM, font: "inherit" }} />
                  <button type="button" disabled={drafting || !revision.trim()} onClick={() => void draft(true)} style={{ ...btn, padding: "5px 10px", fontSize: 12, opacity: drafting || !revision.trim() ? 0.5 : 1 }}>Revise</button>
                </div>
              </div>
            )}
            {brief?.outOfScope && (
              <div style={{ marginTop: 12, padding: "10px 12px", border: `1px solid ${ORANGE}88`, borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 }}>
                <b style={{ color: ORANGE }}>Not a fast-track change.</b> {brief.outOfScopeReason} Fast track is UI/UX only — send this through Ctrl+I to the Idea Bank instead.
              </div>
            )}

            {err && <div style={{ marginTop: 10, fontSize: 12.5, color: ORANGE }}>{err}</div>}
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {brief && !brief.outOfScope ? (
                <button type="button" disabled={busy} onClick={() => void send()} style={{ ...btn, background: GOLD, color: INK, opacity: busy ? 0.5 : 1 }}>
                  {busy ? "Sending…" : online === false ? "✓ Looks good — save to the list" : "✓ Looks good — send"}
                </button>
              ) : (
                <button type="button" disabled={drafting || uploading || blocked || text.trim().length < 8} onClick={() => void draft(false)}
                  style={{ ...btn, background: GOLD, color: INK, opacity: drafting || uploading || blocked || text.trim().length < 8 ? 0.5 : 1 }}>
                  {drafting ? "Prepping…" : "Prep the request"}
                </button>
              )}
              <button type="button" onClick={onClose} style={btn}>Cancel</button>
              <span style={{ flex: 1 }} />
              <a href="/buildqueue" style={{ fontSize: 12, color: MUTED, textDecoration: "underline", textUnderlineOffset: 3 }}>the queue</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 👍 / 👎 + a line. Both are the checkout; the line is required. */
function RateForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!rating) { setErr("Thumbs up or down first."); return; }
    if (note.trim().length < 3) { setErr("A line on how it went — what worked, what didn't."); return; }
    setBusy(true); setErr(null);
    try { await rateFastTrack({ data: { id, rating, note: note.trim() } }); onDone(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const thumb = (v: "up" | "down", label: string) => (
    <button type="button" onClick={() => setRating(v)} aria-pressed={rating === v} title={v === "up" ? "It did what I asked" : "Not what I asked, or it broke something"}
      style={{ ...btn, padding: "6px 12px", background: rating === v ? (v === "up" ? MINT : ORANGE) : "transparent", color: rating === v ? INK : CREAM, borderColor: rating === v ? "transparent" : EDGE }}>
      {label}
    </button>
  );
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>{thumb("up", "👍 good")}{thumb("down", "👎 not right")}</div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="One line: what worked, what didn't, what you'd change."
        style={{ marginTop: 8, width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(255,255,255,0.04)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 13 }} />
      {err && <div style={{ marginTop: 6, fontSize: 12, color: ORANGE }}>{err}</div>}
      <button type="button" disabled={busy} onClick={() => void save()} style={{ ...btn, marginTop: 8, background: GOLD, color: INK, opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save the checkout"}</button>
    </div>
  );
}

const STATE_COLOR: Record<LogRow["state"], string> = { queued: MUTED, building: SKY, built: MINT, failed: ORANGE, done: MUTED };

/** THE LOG — date/time · state · ~cost · time to build · rating · comment, newest first. */
function Log({ rows, who, onRated }: { rows: LogRow[] | null; who: string; onRated: () => void }) {
  const [rating, setRating] = useState<string | null>(null);
  if (!rows) return <div style={{ marginTop: 14, fontSize: 12.5, color: MUTED }}>Loading the log…</div>;
  if (rows.length === 0) return <div style={{ marginTop: 14, fontSize: 12.5, color: MUTED }}>Nothing sent yet{who === "lee" ? "" : " by you"}.</div>;
  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r) => {
        const word = r.cancelled ? "cancelled" : r.reverted ? "reverted" : r.state === "built" ? "built" : r.state === "building" ? "building" : r.state === "failed" ? "stopped" : r.state === "done" ? "live" : "queued";
        const color = r.cancelled || r.reverted ? MUTED : STATE_COLOR[r.state];
        const canRate = (r.state === "built" || r.state === "failed") && !r.rating && !r.cancelled && !r.reverted;
        return (
          <div key={r.id} style={{ border: `1px solid ${EDGE}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color, whiteSpace: "nowrap" }}>{word}</span>
              <span style={{ fontWeight: 600, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.title}>{r.title}</span>
              <span style={{ color: MUTED, whiteSpace: "nowrap" }}>{r.sentStamp}</span>
            </div>
            <div style={{ marginTop: 4, display: "flex", gap: 12, color: MUTED, fontSize: 11.5, flexWrap: "wrap", alignItems: "center" }}>
              {who === "lee" && <span>by {r.by}</span>}
              <span title="estimated cost of the build">~{fmtCost(r.costUsd)}</span>
              <span title="time to build">{fmtBuildTime(r.buildSeconds)}</span>
              {r.rating && <span style={{ color: r.rating === "up" ? MINT : ORANGE }}>{r.rating === "up" ? "👍" : "👎"}{r.ratingNote ? ` “${r.ratingNote}”` : ""}</span>}
              {r.previewUrl && <a href={r.previewUrl} target="_blank" rel="noreferrer" style={{ color: GOLD }}>preview</a>}
              {canRate && <button type="button" onClick={() => setRating(rating === r.id ? null : r.id)} style={{ ...btn, padding: "2px 8px", fontSize: 11 }}>rate it</button>}
            </div>
            {r.attachments.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                {r.attachments.map((s) => <a key={s.id} href={s.url} target="_blank" rel="noreferrer"><img src={s.url} alt={s.name} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: `1px solid ${EDGE}` }} /></a>)}
              </div>
            )}
            {rating === r.id && <RateForm id={r.id} onDone={() => { setRating(null); onRated(); }} />}
          </div>
        );
      })}
    </div>
  );
}

const btn: React.CSSProperties = { font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" };
