// /v3/learn's PIECES — the cram card, the offshoot card under it, the practice card at the end of
// a row, the request sheet, and the admin strip. Blackboard look (learn-theme.ts): black ground,
// portrait shorts, the school's accent. Student copy here never says offshoot, run, blast or
// pledge; the student word for an offshoot is OFFSHOOT_STUDENT_LABEL ("Take it to an A").
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { INK } from "@/components/learn/learn-theme";
import { muxThumb } from "@/components/learn/cram-media";
import { OFFSHOOT_STUDENT_LABEL } from "@/lib/deck-lane";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { submitIntake } from "@/lib/intake.functions";
import { PUBLISH_DESTINATIONS, type PublishDestination, type SetPublishStatus } from "@/lib/publish-queue.functions";

/** The branches' reveal — Lee: "expands kind of slowly, a nice animation that shows the
 *  branches". Each item waits 40 ms longer than the one above it (the route sets the delay). */
export const LEARN_V3_CSS = `
.lk-col { display: flex; flex-direction: column; align-items: stretch; flex-shrink: 0; width: 152px; }
.lk-stem { width: 2px; height: 14px; margin: 0 auto; background: var(--lk-acc); opacity: 0.7; }
@keyframes lk-branch-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
.lk-branch { animation: lk-branch-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.lk-off { display: flex; flex-direction: column; gap: 3px; width: 100%; box-sizing: border-box; text-align: left; border-radius: 10px; padding: 9px 10px; background: var(--lk-surface); border: 1px solid var(--lk-border); color: var(--lk-text); cursor: pointer; font-family: inherit; }
.lk-off[data-made="false"] { opacity: 0.55; border-style: dashed; }
.lk-off[data-made="false"]:hover { opacity: 0.85; }
.lk-off[data-made="true"]:hover { border-color: var(--lk-acc); }
.lk-free { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 3px 9px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; background: var(--lk-acc); color: var(--lk-acc-ink); }
.lk-toggle { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 7px 14px; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; border: 1px solid var(--lk-border); background: transparent; color: var(--lk-text); cursor: pointer; font-family: inherit; transition: background 140ms, color 140ms; }
.lk-toggle[data-on="true"] { background: var(--lk-acc); color: var(--lk-acc-ink); border-color: var(--lk-acc); }
.lk-strip { display: flex; align-items: center; gap: 5px; margin-top: 5px; font-size: 9.5px; font-weight: 800; letter-spacing: 0.04em; color: var(--lk-muted); }
.lk-strip a { color: var(--lk-acc); text-decoration: none; margin-left: auto; }
@media (prefers-reduced-motion: reduce) { .lk-branch { animation: none; } .lk-toggle { transition: none; } }
`;

export type AdminInfo = {
  /** set_publish_status for this video's publish key — null when the row does not exist yet. */
  status: SetPublishStatus | null;
  /** The publish key /v3/post opens on. */
  postKey: string;
};

const DEST_SHORT: Record<PublishDestination, string> = { site: "site", youtube: "YT", instagram: "IG", tiktok: "TT" };

/** 🎬 when filmed, a ○/✓ per destination, and the door into post-production — the one place on
 *  this page an emoji is allowed, because only Lee sees it. */
export function AdminStrip({ info }: { info: AdminInfo }) {
  const s = info.status;
  return (
    <div className="lk-strip">
      <span title={s?.filmedAt ? "filmed" : "not filmed"} style={{ opacity: s?.filmedAt ? 1 : 0.3 }}>🎬</span>
      {PUBLISH_DESTINATIONS.map((d) => {
        const on = !!s?.[d].postedAt;
        return <span key={d} title={`${DEST_SHORT[d]}: ${on ? "posted" : "not yet"}`} style={{ color: on ? INK.green : undefined, opacity: on ? 1 : 0.6 }}>{on ? "✓" : "○"}{DEST_SHORT[d]}</span>;
      })}
      <Link to="/v3/post" search={{ open: info.postKey }} title="Post-production for this video">post →</Link>
    </div>
  );
}

/** ONE CRAM VIDEO — a portrait short, like /learn's. "Coming soon" is the honest face of a video
 *  that is not made; a thumbnail only when the student tree actually has a playback id. */
export function CramVideoCard({ title, made, playbackId, setId, admin }: { title: string; made: boolean; playbackId: string | null; setId: string; admin: AdminInfo | null }) {
  const face = (
    <>
      {playbackId && playbackId !== "__demo__" && <img src={muxThumb(playbackId, 320)} alt="" loading="lazy" />}
      {!made && <span style={{ position: "absolute", left: 8, right: 8, top: "50%", transform: "translateY(-50%)", textAlign: "center", fontSize: 11, fontWeight: 600, color: INK.dim }}>Cram video coming soon</span>}
      <span className="lk-short-t" style={{ zIndex: 1 }}>{title}</span>
    </>
  );
  return (
    <div>
      {made
        ? <Link to="/learn/{-$campus}/{-$chapter}" search={{ set: setId }} className="lk-short" style={{ textDecoration: "none" }} title={title}>{face}</Link>
        : <div className="lk-short" style={{ cursor: "default", opacity: 0.85 }} title={title}>{face}</div>}
      {admin && <AdminStrip info={admin} />}
    </div>
  );
}

export type OffshootView = { id: string; name: string; blurb: string | null; made: boolean; whole: boolean };

/** A "Take it to an A" video under its cram card. Every one has a skip feel — Lee: "speed is
 *  the draw" — so the hint says so. Not made = greyed, dashed, and a door to request it. */
export function OffshootCard({ o, parentName, index, admin, onRequest }: { o: OffshootView; parentName: string; index: number; admin: AdminInfo | null; onRequest: (o: OffshootView) => void }) {
  const body = (
    <>
      <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{o.name}</span>
      {o.blurb && <span style={{ fontSize: 11, color: INK.muted, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.blurb}</span>}
      {o.whole && <span style={{ fontSize: 10, color: INK.dim }}>anywhere in {parentName}</span>}
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: o.made ? "var(--lk-acc)" : INK.muted }}>
        {o.made ? "skip in, skip out ››" : "Not made yet — request it"}
      </span>
    </>
  );
  return (
    <div className="lk-branch" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="lk-stem" />
      {o.made
        ? <Link to="/learn/{-$campus}/{-$chapter}" search={{ set: o.id }} className="lk-off" data-made="true" style={{ textDecoration: "none" }}>{body}</Link>
        : <button type="button" className="lk-off" data-made="false" onClick={() => onRequest(o)}>{body}</button>}
      {admin && <AdminStrip info={admin} />}
    </div>
  );
}

/** The end of every row. Lee: "the scrambled practice review comes at the end… optional." Not
 *  clickable yet — nothing behind it would be honest. */
export function PracticeCard({ topic }: { topic: string }) {
  return (
    <div className="lk-col" style={{ width: 190 }}>
      <div className="lk-card" style={{ height: 270, boxSizing: "border-box", padding: 14, display: "flex", flexDirection: "column", gap: 8, opacity: 0.6, borderStyle: "dashed" }} aria-disabled="true" title="Coming after the cram videos">
        <span className="lk-disp" style={{ fontSize: 16 }}>Practice</span>
        <span style={{ fontSize: 11.5, color: INK.muted, lineHeight: 1.45 }}>Scrambled practice — every question from {topic}, shuffled. Comes at the end.</span>
        <span style={{ marginTop: "auto", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: INK.dim }}>Optional · coming soon</span>
      </div>
    </div>
  );
}

export type RequestTarget = { id: string; name: string; blurb: string | null; topic: string };

/** THE REQUEST SHEET — a contained bottom sheet, never full-screen. One or all, an email, and
 *  after it lands: the share link back to this same request, because a second ask makes it
 *  faster. Copy is honest about what happened: confirmation.email is false by design here
 *  (skipConfirmation), so the sheet says Lee was paged, not that an email went out. */
export function RequestSheet({ target, shareUrl, onClose }: { target: RequestTarget; shareUrl: string; onClose: () => void }) {
  const [scope, setScope] = useState<"one" | "all">("one");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ emailed: boolean } | null>(null);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const e = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr("That email doesn't look right."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await submitIntake({ data: {
        kind: "offshoot_request", email: e, topic: target.topic,
        note: `${target.id} · ${target.name} · scope=${scope}`,
        sourcePath: "/v3/learn", source: "offshoot-request", skipConfirmation: true,
      } });
      setDone({ emailed: r.confirmation.email });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally { setBusy(false); }
  }

  async function copy() {
    setCopied((await copyToClipboard(shareUrl)) ? "yes" : "no");
  }

  const radio = (v: "one" | "all", label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${scope === v ? "var(--lk-acc)" : INK.border}`, cursor: "pointer", fontSize: 13.5 }}>
      <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} style={{ accentColor: "var(--lk-acc)" }} />
      <span>{label}</span>
    </label>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={`Request ${target.name}`} style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
      <div className="lk-in" style={{ position: "relative", width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto", boxSizing: "border-box", background: INK.surface, border: `1px solid ${INK.border2}`, borderBottom: 0, borderRadius: "16px 16px 0 0", padding: "18px 18px 22px", boxShadow: "0 -12px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--lk-acc)" }}>{OFFSHOOT_STUDENT_LABEL}</div>
            <div className="lk-disp" style={{ fontSize: 20, lineHeight: 1.15, marginTop: 2 }}>{target.name}</div>
            {target.blurb && <div style={{ fontSize: 12.5, color: INK.muted, marginTop: 4, lineHeight: 1.4 }}>{target.blurb}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "transparent", border: 0, color: INK.muted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {done ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              Thanks — Lee just got a text.{" "}
              {done.emailed ? "I just emailed you too." : "You'll hear from Lee when it's up."}
            </div>
            <div style={{ fontSize: 13, color: INK.muted, lineHeight: 1.5 }}>Want it faster? Share this link — every extra ask moves it up the list.</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input readOnly value={shareUrl} className="lk-field" style={{ fontSize: 12.5, minHeight: 40, padding: "8px 12px" }} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="lk-btn lk-btn-acc" onClick={copy}>{copied === "yes" ? "Copied" : "Copy"}</button>
            </div>
            {copied === "no" && <div style={{ fontSize: 12, color: INK.red }}>Couldn't copy on this browser — long-press the link above to copy it.</div>}
            <button type="button" className="lk-btn lk-btn-ghost" onClick={onClose} style={{ alignSelf: "flex-start" }}>Done</button>
          </div>
        ) : (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: INK.muted }}>Which ones?</div>
            {radio("one", "Just this one")}
            {radio("all", `All the ${OFFSHOOT_STUDENT_LABEL} videos for ${target.topic}`)}
            <input ref={emailRef} type="email" inputMode="email" autoComplete="email" placeholder="your email — so you hear when it's up" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} className="lk-field" />
            {err && <div style={{ fontSize: 12.5, color: INK.red }}>{err}</div>}
            <button type="button" className="lk-btn lk-btn-acc" onClick={() => void submit()} disabled={busy} style={{ opacity: busy ? 0.6 : 1, alignSelf: "flex-start", padding: "11px 20px" }}>{busy ? "Sending…" : "Request it"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
