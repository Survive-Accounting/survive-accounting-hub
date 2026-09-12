// THE CHAPTER MODULE on /learn (rebuilt 2026-09-11 to Lee's spec + mockup, chapter-module-mockup.html).
//
// One module, four visitors. Its prominence is INVERSE to how much the visitor needs it:
//   A  cold, no chapter        one quiet collapsed line above the hero: "⚡ In a fraternity or sorority? ›"
//   B  expanded (choosing)     two selects, Continue, one benefit line — nothing else
//   C  member, chapter set     the crest: navy panel, big bolt with the letters on it, the count,
//                              "Send to the group chat" / "Copy link". Confirmation and belonging.
//   D  exec                    same crest, a member/exec toggle, the activation form (phone matters)
//
// Mobile first: most arrivals are a GroupMe link on a phone. Switching never reloads the page —
// the parent swaps the pick in place and keeps scroll. The crest's bolt-and-letters animation
// runs once per session; prefers-reduced-motion gets the static crest.
//
// THE REMAINING-TO-THRESHOLD LINE is the share engine: "7 more members and AKA can fund everyone's
// access for the semester." — "can", never "will". The threshold is the seat minimum (lib/terms
// SEAT_MINIMUM) until a chapter carries its own; with no threshold the line is not rendered.
// The counter never says "0 members joined": at zero it says "Be the first from AKA."
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { LK } from "@/components/learn/learn-theme";
import { chapterGroupMe } from "@/components/learn/LearnChapterBar";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { deviceAnonId } from "@/lib/device-id";
import { COUNCILS, councilMatches } from "@/lib/greek-councils.functions";
import { submitChapterClaim } from "@/lib/greek-claims.functions";
import { listGoChapters, tagChapterMember, type GoChapterListItem } from "@/lib/greek-go.functions";
import { submitIntake } from "@/lib/intake.functions";
import type { School } from "@/lib/schools";
import { buildShareUrl } from "@/lib/share-url";
import { SEAT_MINIMUM } from "@/lib/terms";

export type PickedChapter = { slug: string; name: string | null; letters: string | null; members: number; council: string | null };

const ANIM_KEY = "sa-crest-anim";
const joinedKey = (school: string, chapter: string) => `sa-joined:${school}/${chapter}`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311", NAVY_DEEP = "#0C1528";

/** The funding threshold for a chapter, or null when there is none to compute from. */
export function fundingThreshold(_chapterSlug: string): number | null { return SEAT_MINIMUM > 0 ? SEAT_MINIMUM : null; }
/** "7 more members and AKA can fund everyone's access for the semester." — null when no threshold. */
export function remainingLine(short: string, members: number, threshold: number | null): string | null {
  if (threshold == null) return null;
  const n = Math.max(0, threshold - members);
  return n > 0
    ? `${n} more member${n === 1 ? "" : "s"} and ${short} can fund everyone's access for the semester.`
    : `${short} has enough members to fund everyone's access for the semester.`;
}
/** The count pill: never "0 members joined". */
export function countLine(short: string, members: number): string {
  return members > 0 ? `${members} member${members === 1 ? "" : "s"} joined` : `Be the first from ${short}.`;
}

export function LearnChapterModule({ school, chapter, councilPreset, contactRef, narrow, onPick, onClear }: {
  school: School;
  chapter: PickedChapter | null;
  /** ?c= on the link — opens the module expanded with that council chosen. */
  councilPreset: string | null;
  contactRef: string | null;
  narrow: boolean;
  /** Sets the chapter IN PLACE (no reload). */
  onPick: (slug: string) => void;
  /** Clears the chapter IN PLACE. */
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(!!councilPreset);
  const [council, setCouncil] = useState<string>(councilPreset && COUNCILS.some((c) => c.slug === councilPreset) ? councilPreset : "");
  const [slug, setSlug] = useState("");
  const chaptersQ = useQuery({ queryKey: ["go-chapters", school.slug], queryFn: () => listGoChapters({ data: { schoolSlug: school.slug } }), staleTime: 300_000, networkMode: "always", enabled: expanded || !!chapter });
  const inCouncil = useMemo<GoChapterListItem[]>(() => {
    const all = chaptersQ.data ?? [];
    const c = COUNCILS.find((x) => x.slug === council);
    return c ? all.filter((ch) => councilMatches(c, ch.council)) : all;
  }, [chaptersQ.data, council]);

  // "Not your chapter?" → B, with the current council pre-filled.
  const notYours = () => {
    const cur = chaptersQ.data?.find((c) => c.slug === chapter?.slug);
    const c = COUNCILS.find((x) => councilMatches(x, cur?.council ?? chapter?.council ?? null));
    setCouncil(c?.slug ?? "");
    setSlug("");
    setExpanded(true);
    onClear();
  };

  if (chapter) return <Crest school={school} chapter={chapter} contactRef={contactRef} narrow={narrow} onNotYours={notYours} />;

  const field: React.CSSProperties = { width: "100%", minHeight: 40, borderRadius: 8, border: `1px solid ${LK.border2}`, background: "#FBF9F5", color: LK.text, padding: "0 11px", fontFamily: BRAND_SANS, fontSize: 13.5, marginBottom: 8 };
  if (!expanded) {
    // A — the one quiet line.
    return (
      <button type="button" onClick={() => setExpanded(true)} className="lk-card flex w-full items-center text-left" style={{ gap: 9, padding: "11px 13px", marginBottom: narrow ? 12 : 16, fontFamily: BRAND_SANS, fontSize: 13.5, fontWeight: 600, color: LK.text, cursor: "pointer" }} aria-expanded={false}>
        <BoltBoil height={17} red={school.c1 ?? undefined} blue={school.c2 ?? undefined} />
        <span>In a fraternity or sorority?</span>
        <ChevronRight className="ml-auto h-4 w-4" style={{ color: LK.muted }} aria-hidden />
      </button>
    );
  }
  // B — expanded.
  return (
    <section aria-label="Find your chapter" className="lk-card" style={{ padding: "15px 14px", marginBottom: narrow ? 12 : 16, fontFamily: BRAND_SANS }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 17, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Find your chapter</h3>
          <p style={{ fontSize: 12.5, color: LK.muted, margin: "0 0 13px", lineHeight: 1.45 }}>When enough members join, your chapter can fund everyone&apos;s access for the semester.</p>
        </div>
        <button type="button" onClick={() => setExpanded(false)} aria-label="Close" style={{ background: "transparent", border: 0, padding: 4, color: LK.muted, cursor: "pointer" }}><ChevronDown className="h-4 w-4" /></button>
      </div>
      <select aria-label="Council" value={council} onChange={(e) => { setCouncil(e.target.value); setSlug(""); }} style={field}>
        <option value="">Council…</option>
        {COUNCILS.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <select aria-label="Chapter" value={slug} onChange={(e) => setSlug(e.target.value)} style={field} disabled={!council || chaptersQ.isLoading}>
        <option value="">{!council ? "Pick a council first" : chaptersQ.isLoading ? "Loading chapters…" : inCouncil.length ? "Your chapter…" : "No chapters listed yet"}</option>
        {inCouncil.map((ch) => <option key={ch.slug} value={ch.slug}>{ch.name}{ch.letters ? ` · ${ch.letters}` : ""}</option>)}
      </select>
      <button type="button" disabled={!slug} onClick={() => slug && onPick(slug)} className="lk-btn lk-btn-acc w-full justify-center" style={{ minHeight: 44, fontSize: 14.5, opacity: slug ? 1 : 0.5 }}>Continue</button>
    </section>
  );
}

// ── C and D: the crest ────────────────────────────────────────────────────────────────────────

function Crest({ school, chapter, contactRef, narrow, onNotYours }: { school: School; chapter: PickedChapter; contactRef: string | null; narrow: boolean; onNotYours: () => void }) {
  const qc = useQueryClient();
  const short = (chapter.letters ?? "").trim() || chapter.name || "your chapter";
  const name = chapter.name ?? short;
  const [exec, setExec] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    try { setJoined(localStorage.getItem(joinedKey(school.slug, chapter.slug)) === "1"); } catch { /* ignore */ }
    // ONCE PER SESSION: the bolt lands and the letters settle on it. Static after that.
    try {
      const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!reduce && sessionStorage.getItem(ANIM_KEY) !== "1") { sessionStorage.setItem(ANIM_KEY, "1"); setAnimate(true); }
    } catch { /* ignore */ }
  }, [school.slug, chapter.slug]);

  const link = buildShareUrl({ campus: school.id, chapter: chapter.slug, contactRef });
  const post = chapterGroupMe({ courseCode: school.courseCode, url: link, chapter: short });
  const [copied, setCopied] = useState<"post" | "link" | null>(null);
  const share = async (what: "post" | "link") => {
    const text = what === "post" ? post : link;
    if (what === "post" && narrow && typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try { await navigator.share({ text }); return; } catch { /* cancelled or unsupported → copy */ }
    }
    const ok = await copyToClipboard(text);
    if (ok) { setCopied(what); window.setTimeout(() => setCopied(null), 1800); }
  };

  // THE MEMBER PATH: chapter + email, nothing else. Counted, then the share buttons — the payoff.
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const join = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) { setErr("That email doesn't look right."); return; }
    setBusy(true); setErr(null);
    try {
      await submitIntake({ data: { kind: "greek_member", email: v, campusId: school.campusId, chapter: chapter.slug, source: "learn-chapter", sourcePath: typeof window !== "undefined" ? window.location.pathname : null } });
      await tagChapterMember({ data: { schoolSlug: school.slug, chapterSlug: chapter.slug, source: "link", deviceId: deviceAnonId() } }).catch(() => undefined);
      try { localStorage.setItem(joinedKey(school.slug, chapter.slug), "1"); } catch { /* ignore */ }
      setJoined(true);
      void qc.invalidateQueries({ queryKey: ["cta-go-chapter"] });
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't save that — try again."); }
    finally { setBusy(false); }
  };

  const threshold = fundingThreshold(chapter.slug);
  const remaining = remainingLine(short, chapter.members, threshold);
  const boltH = 78;

  return (
    <section aria-label="Your chapter" className="lkc" style={{ marginBottom: narrow ? 12 : 16, fontFamily: BRAND_SANS }}>
      <style>{CSS}</style>
      <div className="lkc-panel" style={{ background: NAVY, color: CREAM, borderRadius: 13, padding: "18px 15px 15px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(0,107,166,0.28), transparent 62%)", pointerEvents: "none" }} />
        <div className={`lkc-crest${animate ? " lkc-anim" : ""}`} style={{ position: "relative", zIndex: 1, display: "inline-block", marginBottom: 9, lineHeight: 0 }}>
          <div className="lkc-bolt"><BoltBoil height={boltH} red={school.c1 ?? undefined} blue={school.c2 ?? undefined} /></div>
          <div className="lkc-letters" aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: short.length > 4 ? 17 : 23, color: CREAM, textShadow: "0 2px 7px rgba(12,21,40,0.85)", letterSpacing: "0.01em", lineHeight: 1 }}>{short}</div>
        </div>

        {!exec ? (
          <>
            <h3 style={{ position: "relative", zIndex: 1, fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 19, margin: "0 0 5px", letterSpacing: "-0.01em", lineHeight: 1.15 }}>You&apos;re studying with<br />{name}</h3>
            {remaining && <p style={{ position: "relative", zIndex: 1, fontSize: 12.5, color: "rgba(245,239,230,0.7)", margin: "0 0 13px", lineHeight: 1.45 }}>{remaining}</p>}
            <div style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,107,166,0.24)", border: "1px solid rgba(125,211,252,0.3)", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#BFE4FA", marginBottom: 13 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "#3BF5A0" }} />{countLine(short, chapter.members)}
            </div>
            {joined ? (
              <>
                <button type="button" onClick={() => void share("post")} className="lkc-btn" style={{ background: GOLD, color: NAVY_DEEP }}>{copied === "post" ? <><Check className="h-4 w-4" /> Copied — paste it in the chat</> : "Send to the group chat"}</button>
                <button type="button" onClick={() => void share("link")} className="lkc-btn" style={{ background: "transparent", color: "rgba(245,239,230,0.82)", border: "1px solid rgba(245,239,230,0.26)", marginTop: 7 }}>{copied === "link" ? <><Check className="h-4 w-4" /> Link copied</> : "Copy link"}</button>
              </>
            ) : (
              <form onSubmit={(e) => void join(e)} style={{ position: "relative", zIndex: 1 }}>
                <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" aria-label="Your email" className="lkc-input" />
                {err && <p role="alert" style={{ margin: "4px 0 0", fontSize: 12, color: "#F3C6CC", textAlign: "left" }}>{err}</p>}
                <button type="submit" disabled={busy} className="lkc-btn" style={{ background: GOLD, color: NAVY_DEEP, marginTop: 8 }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Count me in with ${short}`}</button>
              </form>
            )}
            <div style={{ position: "relative", zIndex: 1, marginTop: 11, display: "flex", justifyContent: "center", gap: 14 }}>
              <button type="button" onClick={() => setExec(true)} className="lkc-swap">On exec?</button>
              <button type="button" onClick={onNotYours} className="lkc-swap">Not your chapter?</button>
            </div>
          </>
        ) : (
          <ExecForm school={school} chapter={chapter} short={short} onMember={() => setExec(false)} onNotYours={onNotYours} />
        )}
      </div>
    </section>
  );
}

// ── D: activate the dashboard ─────────────────────────────────────────────────────────────────

function ExecForm({ school, chapter, short, onMember, onNotYours }: { school: School; chapter: PickedChapter; short: string; onMember: () => void; onNotYours: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ok = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 10 && role.trim().length > 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitChapterClaim({ data: { schoolSlug: school.slug, chapterSlug: chapter.slug, name: name.trim(), position: role.trim(), phone: phone.trim(), question: question.trim() || undefined } });
      if (r.ok) setDone(true); else setErr(r.error ?? "Something went wrong — try again.");
    } catch { setErr("Couldn't reach the server — try again in a moment."); }
    finally { setBusy(false); }
  };
  const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", color: "rgba(245,239,230,0.62)", marginBottom: 3, textAlign: "left" };
  return (
    <>
      <h3 style={{ position: "relative", zIndex: 1, fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 19, margin: "0 0 5px", letterSpacing: "-0.01em", lineHeight: 1.15 }}>Activate {short}&apos;s<br />chapter dashboard</h3>
      <p style={{ position: "relative", zIndex: 1, fontSize: 12.5, color: "rgba(245,239,230,0.7)", margin: "0 0 13px", lineHeight: 1.45 }}>See who&apos;s studying, fund the chapter, and get a page your members can share.</p>
      <div role="group" aria-label="I am" style={{ position: "relative", zIndex: 1, display: "flex", gap: 7, marginBottom: 12 }}>
        <button type="button" onClick={onMember} className="lkc-seg">I&apos;m a member</button>
        <button type="button" className="lkc-seg lkc-seg-on" aria-pressed>I&apos;m on exec</button>
      </div>
      {done ? (
        <div style={{ position: "relative", zIndex: 1, padding: "12px 10px", borderRadius: 10, background: "rgba(252,163,17,0.12)", border: "1px solid rgba(252,163,17,0.4)" }}>
          <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 15 }}>You&apos;re set.</div>
          <div style={{ fontSize: 12.5, color: "rgba(245,239,230,0.8)", marginTop: 3 }}>Lee will text you shortly to get {short}&apos;s dashboard live.</div>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} style={{ position: "relative", zIndex: 1 }}>
          <div style={{ marginBottom: 8 }}><label style={label} htmlFor="lkc-name">Name</label><input id="lkc-name" className="lkc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Ellis" autoComplete="name" /></div>
          <div style={{ marginBottom: 8 }}><label style={label} htmlFor="lkc-phone">Phone</label><input id="lkc-phone" className="lkc-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(662) 555-0134" type="tel" inputMode="tel" autoComplete="tel" /></div>
          <div style={{ marginBottom: 8 }}><label style={label} htmlFor="lkc-role">Role</label><input id="lkc-role" className="lkc-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Scholarship chair" /></div>
          <div style={{ marginBottom: 8 }}><label style={label} htmlFor="lkc-q">Anything you want to ask <span style={{ fontSize: 10.5, color: "rgba(245,239,230,0.42)", fontWeight: 400, letterSpacing: 0 }}>optional</span></label><input id="lkc-q" className="lkc-input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How does funding work?" /></div>
          {err && <p role="alert" style={{ margin: "0 0 8px", fontSize: 12, color: "#F3C6CC", textAlign: "left" }}>{err}</p>}
          <button type="submit" disabled={!ok || busy} className="lkc-btn" style={{ background: GOLD, color: NAVY_DEEP, opacity: ok ? 1 : 0.55 }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate dashboard"}</button>
        </form>
      )}
      <div style={{ position: "relative", zIndex: 1, marginTop: 11 }}>
        <button type="button" onClick={onNotYours} className="lkc-swap">Not your chapter?</button>
      </div>
    </>
  );
}

const CSS = `
.lkc-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; border: 0; cursor: pointer; font-family: ${BRAND_DISPLAY}; font-weight: 800; font-size: 14.5px; letter-spacing: 0.01em; padding: 12px; border-radius: 9px; position: relative; z-index: 1; }
.lkc-btn:disabled { cursor: default; }
.lkc-input { width: 100%; font-family: ${BRAND_SANS}; font-size: 14px; padding: 10px 11px; border-radius: 8px; color: ${CREAM}; background: rgba(245,239,230,0.07); border: 1px solid rgba(245,239,230,0.18); outline: none; }
.lkc-input::placeholder { color: rgba(245,239,230,0.32); }
.lkc-input:focus { border-color: rgba(252,163,17,0.7); }
.lkc-seg { flex: 1; cursor: pointer; font-family: ${BRAND_SANS}; font-size: 12.5px; font-weight: 500; padding: 9px 6px; border-radius: 8px; background: rgba(245,239,230,0.07); border: 1px solid rgba(245,239,230,0.18); color: rgba(245,239,230,0.72); }
.lkc-seg-on { background: ${GOLD}; border-color: ${GOLD}; color: ${NAVY_DEEP}; font-weight: 600; }
.lkc-swap { background: transparent; border: 0; padding: 0; font-family: ${BRAND_SANS}; font-size: 11.5px; color: rgba(245,239,230,0.5); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.lkc-swap:hover { color: rgba(245,239,230,0.85); }
@keyframes lkc-bolt-in { 0% { transform: translateY(-34px) scale(0.55); opacity: 0; } 60% { transform: translateY(4px) scale(1.04); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes lkc-letters-in { 0% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.lkc-anim .lkc-bolt { animation: lkc-bolt-in 560ms cubic-bezier(.2,.8,.2,1) both; }
.lkc-anim .lkc-letters { animation: lkc-letters-in 360ms cubic-bezier(.2,.8,.2,1) 420ms both; }
@media (prefers-reduced-motion: reduce) { .lkc-anim .lkc-bolt, .lkc-anim .lkc-letters { animation: none; } }
`;
