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
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { LK } from "@/components/learn/learn-theme";
import { chapterGroupMe } from "@/components/learn/LearnChapterBar";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { deviceAnonId } from "@/lib/device-id";
import { COUNCILS, councilMatches } from "@/lib/greek-councils.functions";
import { notifyChapterClaim, submitChapterClaim } from "@/lib/greek-claims.functions";
import { listGoChapters, tagChapterMember, type GoChapterListItem } from "@/lib/greek-go.functions";
import { submitIntake } from "@/lib/intake.functions";
import type { School } from "@/lib/schools";
import { buildShareUrl } from "@/lib/share-url";
import { SEAT_MINIMUM } from "@/lib/terms";
import { writeUnlocked } from "@/components/learn/learn-gate";
import { readTestSession, TEST_CAMPUS_SLUG } from "@/lib/test-mode";
import { ActivationTestProceed } from "@/components/site/ActivationTestProceed";
import { GreekLettersIcon } from "@/components/site/home-two-door/HomeFold";
import { ChapterPickerSheet } from "@/components/site/home-two-door/ChapterPickerSheet";
import { buildGreekCycle, OLE_MISS_GREEK_CYCLE } from "@/lib/greek-cycle";
import { X } from "lucide-react";

export type PickedChapter = { slug: string; name: string | null; letters: string | null; members: number; council: string | null };

const ANIM_KEY = "sa-crest-anim";
export const joinedKey = (school: string, chapter: string) => `sa-joined:${school}/${chapter}`;
export const CHAPTER_JOINED_EVENT = "sa-chapter-joined";
export function readJoined(school: string, chapter: string): boolean {
  try { return localStorage.getItem(joinedKey(school, chapter)) === "1"; } catch { return false; }
}

/** JOIN A CHAPTER'S PAGE — the one member path, shared by the up-front gate (ChapterJoinGate) and
 *  the crest's own form. Email is the whole ask (Lee, 2026-09-13: "we should just grab the member
 *  emails upfront if they're trying to join a greek page"): it lands in campus_waitlist through the
 *  intake (the welcome email), counts the member on the chapter (greek_chapter_members, keyed by the
 *  email), and unlocks the rest of Exam 1 on this device — a member who gave their email to join
 *  their chapter is never asked again by the Exam 1 gate. */
export async function joinChapter(school: School, chapterSlug: string, email: string, source: string): Promise<void> {
  const v = email.trim().toLowerCase();
  // The fixture campus is a test by definition — a tab opened from a test page can lose the
  // session copy, and a test member must never land in the real leads table.
  const isTest = !!readTestSession() || school.slug === TEST_CAMPUS_SLUG;
  await submitIntake({ data: { kind: "greek_member", email: v, campusId: school.campusId || null, chapter: chapterSlug, source, sourcePath: typeof window !== "undefined" ? window.location.pathname : null, isTest } });
  await tagChapterMember({ data: { schoolSlug: school.slug, chapterSlug, source: "link", deviceId: deviceAnonId(), email: v } }).catch(() => undefined);
  try { localStorage.setItem(joinedKey(school.slug, chapterSlug), "1"); } catch { /* ignore */ }
  writeUnlocked();
  try { window.dispatchEvent(new CustomEvent(CHAPTER_JOINED_EVENT)); } catch { /* ignore */ }
}
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311", NAVY_DEEP = "#0C1528";
const GREEK_BAND_DISMISSED = "sa-learn-greek-band-dismissed";
/** The menu's "Study with your chapter" fires this: the Find your chapter band and its picker come back. */
export const OPEN_CHAPTER_FINDER_EVENT = "sa-open-chapter-finder";
export function openChapterFinder(): void { try { window.dispatchEvent(new CustomEvent(OPEN_CHAPTER_FINDER_EVENT)); } catch { /* ignore */ } }

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
/** "When 10 members join, ΑΤΩ can fund everyone's access to Exams 2, 3 and the Final." — the
 *  enticement, in "can" (never "will"): a chapter decides to fund; joining makes it possible. */
export function gateFundingLine(short: string, members: number, threshold: number | null): string | null {
  if (threshold == null) return null;
  const left = Math.max(0, threshold - members);
  return left > 0
    ? `${left} more member${left === 1 ? "" : "s"} and ${short} can fund everyone's access to Exams 2, 3 and the Final.`
    : `${short} has enough members to fund everyone's access to Exams 2, 3 and the Final.`;
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
  // Always fetched now: the band's letters rotate through THIS campus's real houses (as on the home page).
  const chaptersQ = useQuery({ queryKey: ["go-chapters", school.slug], queryFn: () => listGoChapters({ data: { schoolSlug: school.slug } }), staleTime: 300_000, networkMode: "always" });
  const greekCycle = useMemo(() => { const built = buildGreekCycle(chaptersQ.data ?? []); return built.length ? built : OLE_MISS_GREEK_CYCLE; }, [chaptersQ.data]);
  // DISMISSIBLE (Lee, 2026-09-14): the ✕ hides the band on this browser for good.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => { try { setDismissed(localStorage.getItem(GREEK_BAND_DISMISSED) === "1"); } catch { setDismissed(false); } }, []);
  const bandRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const on = () => {
      setDismissed(false);
      try { localStorage.removeItem(GREEK_BAND_DISMISSED); } catch { /* ignore */ }
      setExpanded(true);
      window.setTimeout(() => bandRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    };
    window.addEventListener(OPEN_CHAPTER_FINDER_EVENT, on);
    return () => window.removeEventListener(OPEN_CHAPTER_FINDER_EVENT, on);
  }, []);
  // THE PICKER IS THE HOME PAGE'S (2026-09-14): council first, then chapter, in the home sheet's style.
  const sheet = expanded ? (
    <ChapterPickerSheet
      schoolSlug={school.slug} schoolName={school.name} pinnedTheme
      initialCouncil={councilPreset}
      hasChapter={!!chapter}
      onClose={() => setExpanded(false)}
      onClear={onClear}
      onPick={(c) => { setExpanded(false); onPick(c.slug); }}
    />
  ) : null;
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

  if (chapter) return <><Crest school={school} chapter={chapter} contactRef={contactRef} narrow={narrow} onNotYours={notYours} />{sheet}</>;

  const field: React.CSSProperties = { width: "100%", minHeight: 40, borderRadius: 8, border: `1px solid ${LK.border2}`, background: "#FBF9F5", color: LK.text, padding: "0 11px", fontFamily: BRAND_SANS, fontSize: 13.5, marginBottom: 8 };
  {
    // A — THE BAND (King's testing notes, 2026-09-14: "these are important options, so they should be
    // more noticeable"). Navy, the home page's rotating chapter letters, one button, and an ✕.
    if (dismissed) return sheet;
    const dismiss = () => { setDismissed(true); try { localStorage.setItem(GREEK_BAND_DISMISSED, "1"); } catch { /* ignore */ } };
    return (
      <>
      <section ref={bandRef} aria-label="In a fraternity or sorority?" className="flex w-full items-center" style={{ gap: narrow ? 10 : 14, padding: narrow ? "10px 10px 10px 12px" : "12px 12px 12px 16px", marginBottom: narrow ? 12 : 16, borderRadius: 14, background: NAVY, color: CREAM, fontFamily: BRAND_SANS, boxShadow: "0 10px 26px -16px rgba(12,21,40,0.9)" }}>
        <span data-gm-bolt="band" className="grid shrink-0 place-items-center" style={{ width: narrow ? 46 : 56, height: narrow ? 46 : 56, borderRadius: 12, background: NAVY_DEEP }}>
          <GreekLettersIcon cycle={greekCycle} height={narrow ? 34 : 42} ink={CREAM} still />
        </span>
        <div className="min-w-0 flex-1">
          <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: narrow ? 15 : 17, lineHeight: 1.2, letterSpacing: "-0.01em" }}>In a fraternity or sorority?</div>
          <div style={{ fontSize: narrow ? 12 : 13, lineHeight: 1.35, color: "rgba(245,239,230,0.72)", marginTop: 2 }}>Your chapter gets its own page for studying together.</div>
        </div>
        <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} data-gm-cta="band" className="shrink-0 rounded-full" style={{ background: GOLD, color: NAVY, border: 0, cursor: "pointer", fontWeight: 800, fontSize: narrow ? 12 : 13.5, padding: narrow ? "8px 12px" : "9px 16px", whiteSpace: "nowrap", fontFamily: BRAND_SANS }}>
          {narrow ? "Find it" : "Find your chapter"}
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="grid shrink-0 place-items-center rounded-full" style={{ width: 30, height: 30, background: "rgba(255,255,255,0.08)", color: CREAM, border: 0, cursor: "pointer" }}>
          <X className="h-4 w-4" />
        </button>
      </section>
      {sheet}
      </>
    );
  }
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
    const read = () => setJoined(readJoined(school.slug, chapter.slug));
    read();
    window.addEventListener(CHAPTER_JOINED_EVENT, read);
    return () => window.removeEventListener(CHAPTER_JOINED_EVENT, read);
  }, [school.slug, chapter.slug]);
  useEffect(() => {
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
      await joinChapter(school, chapter.slug, v, "learn-chapter");
      setJoined(true);
      void qc.invalidateQueries({ queryKey: ["cta-go-chapter"] });
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't save that — try again."); }
    finally { setBusy(false); }
  };

  const threshold = fundingThreshold(chapter.slug);
  // The same funding line as the join gate, so a member reads one promise, not two.
  const remaining = gateFundingLine(short, chapter.members, threshold);
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
            <h3 style={{ position: "relative", zIndex: 1, fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 19, margin: "0 0 5px", letterSpacing: "-0.01em", lineHeight: 1.15 }}>{joined ? <>You&apos;re in {short}&apos;s page</> : <>Join {short}&apos;s page</>}</h3>
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
                <button type="submit" disabled={busy} className="lkc-btn" style={{ background: GOLD, color: NAVY_DEEP, marginTop: 8 }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Join ${short}'s page`}</button>
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
  // EMAIL IS ASKED HERE TOO (2026-09-13) — it is how the dashboard signs the chair in. A chair who
  // activated from this form used to be stored with no email and could never open their dashboard.
  // A test run pre-fills the tester's address, which is the only address its sign-in link goes to.
  const [email, setEmail] = useState("");
  useEffect(() => { const t = readTestSession(); if (t?.email) setEmail((v) => v || t.email); }, []);
  const [role, setRole] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ok = name.trim().length > 1 && EMAIL_RE.test(email.trim()) && phone.replace(/\D/g, "").length >= 10 && role.trim().length > 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await submitChapterClaim({ data: { schoolSlug: school.slug, chapterSlug: chapter.slug, name: name.trim(), position: role.trim(), email: email.trim(), phone: phone.trim(), question: question.trim() || undefined } });
      if (r.ok) {
        setDone(true);
        if (r.notifyPending && r.claimId) void notifyChapterClaim({ data: { claimId: r.claimId, question: question.trim() || undefined } }).catch(() => undefined);
      } else setErr(r.error ?? "Something went wrong — try again.");
    } catch { setErr("Couldn't reach the server — try again in a moment."); }
    finally { setBusy(false); }
  };
  const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", color: "rgba(245,239,230,0.62)", marginBottom: 3, textAlign: "left" };
  return (
    <>
      <h3 style={{ position: "relative", zIndex: 1, fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 19, margin: "0 0 5px", letterSpacing: "-0.01em", lineHeight: 1.15 }}>Activate {short}&apos;s<br />chapter dashboard</h3>
      <p style={{ position: "relative", zIndex: 1, fontSize: 12.5, color: "rgba(245,239,230,0.7)", margin: "0 0 13px", lineHeight: 1.45 }}>Track who joins and what they watch, and request seats for your members.</p>
      <div role="group" aria-label="I am" style={{ position: "relative", zIndex: 1, display: "flex", gap: 7, marginBottom: 12 }}>
        <button type="button" onClick={onMember} className="lkc-seg">I&apos;m a member</button>
        <button type="button" className="lkc-seg lkc-seg-on" aria-pressed>I&apos;m on exec</button>
      </div>
      {done ? (
        <div style={{ position: "relative", zIndex: 1, padding: "12px 10px", borderRadius: 10, background: "rgba(252,163,17,0.12)", border: "1px solid rgba(252,163,17,0.4)" }}>
          <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 15 }}>Activation received.</div>
          <div style={{ fontSize: 12.5, color: "rgba(245,239,230,0.8)", marginTop: 3 }}>Lee will text you shortly to get {short}&apos;s dashboard live.</div>
          <ActivationTestProceed schoolSlug={school.slug} tone="navy" />
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} style={{ position: "relative", zIndex: 1 }}>
          <div style={{ marginBottom: 8 }}><label style={label} htmlFor="lkc-name">Name</label><input id="lkc-name" className="lkc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Ellis" autoComplete="name" /></div>
          <div style={{ marginBottom: 8 }}><label style={label} htmlFor="lkc-email">Email</label><input id="lkc-email" className="lkc-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" type="email" inputMode="email" autoComplete="email" /></div>
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
