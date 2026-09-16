// THE CHAPTER STRIP — one compact strip under "Start cramming" on /learn (the simple flow, Lee, 2026-09-16).
//
// Everyone lands on the same /learn page; the strip is the only thing that knows who arrived:
//   no chapter        one quiet line: "Studying with your chapter? →" (the chapter picker; the menu opens it too)
//   member            "Be the first from ΚΑ." / "Study with ΚΑ. 12 members are cramming." · Join the study group ·
//                     Spread the word → ; joined: "You're studying with ΚΑ. 13 other members are cramming."
//   chapter exec      ?share=chair — "Bring this to the house. One link — every ΚΑ member gets Exam 1 free, right
//                     now." · Share with the house ↻ (link · GroupMe post · flyer · flyer image · meeting slide) ·
//                     Claim your exec dashboard
//   council exec      ?share=council&c=ifc — "Bring this to your chapters." · Share with chapter chairs ↻ (the
//                     chairs' link · GroupMe post · council slide) · Choose your chapter
//
// Email is asked ONLY on Join (the JoinSheet) — never on arrival. Selecting a chapter, opening its page or copying
// its link never counts anyone as a member; the count is the server's (getGoChapter). No funding lines, no
// "your practice saves with the house" (Lee: "that doesn't really matter"). The pitch waits for the dashboard.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileText, Image as ImageIcon, Link2, Loader2, MessageSquare, Presentation, Undo2, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { LK } from "@/components/learn/learn-theme";
import { chapterGroupMe } from "@/components/learn/LearnChapterBar";
import { CHAPTER_JOINED_EVENT, EMAIL_RE, ExecForm, joinChapter, OPEN_CHAPTER_FINDER_EVENT, readJoined, type PickedChapter } from "@/components/learn/LearnChapterModule";
import { chairArtwork, councilChairPost } from "@/components/site/chair-promo";
import { ChapterPickerSheet } from "@/components/site/home-two-door/ChapterPickerSheet";
import { track } from "@/lib/analytics";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { saveFlyerImage } from "@/lib/flyer-image";
import { COUNCILS } from "@/lib/greek-councils.functions";
import { councilChairsPath, LEARN_ORIGIN } from "@/lib/learn-paths";
import type { School } from "@/lib/schools";
import { buildShareUrl } from "@/lib/share-url";
import { useDismiss } from "@/lib/use-dismiss";

export type StripRole = "member" | "chair" | "council";

const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311";

/** What the strip says about the house, from the real count and this device's join. Exported for the tests. */
export function stripWords(short: string, members: number | null, joined: boolean): { head: string; sub: string | null } {
  if (members == null) return { head: `Study with ${short}.`, sub: null };
  if (joined) {
    const others = Math.max(0, members - 1);
    return others === 0
      ? { head: `You're the first from ${short}.`, sub: "Send it to one chaptermate." }
      : { head: `You're studying with ${short}.`, sub: `${others} other member${others === 1 ? " is" : "s are"} cramming.` };
  }
  if (members === 0) return { head: `Be the first from ${short}.`, sub: "Nobody from the house is in yet." };
  return { head: `Study with ${short}.`, sub: `${members} member${members === 1 ? " is" : "s are"} cramming.` };
}

export function ChapterStrip({ school, chapter, pathChapter = false, role, councilPreset, contactRef, narrow, prefillEmail, onPick, onClear }: {
  school: School;
  chapter: PickedChapter | null;
  /** The chapter is in the address (a chapter link), not just remembered on this device — a council exec's link
   *  with a remembered pick still shows the council strip. */
  pathChapter?: boolean;
  /** From the link: ?share=chair → chair, ?share=council → council; else member. */
  role: StripRole;
  /** ?c= on the link — the council the chairs' link came from; presets the picker. */
  councilPreset: string | null;
  contactRef: string | null;
  narrow: boolean;
  /** A signed-in student's address — Join is one tap. */
  prefillEmail?: string | null;
  onPick: (slug: string) => void;
  onClear: () => void;
}) {
  // THE PICKER: the same council → chapter sheet the home page uses. Opens from the line here, from the menu
  // (OPEN_CHAPTER_FINDER_EVENT), and on arrival from a chairs' link (?c=).
  const [picking, setPicking] = useState(!chapter && !!councilPreset && role !== "council");
  // A chapter picked on this page (a council exec choosing a house) turns the strip into that house's — the
  // address loses ?share= underneath, but the route's search state does not, so the strip remembers the pick.
  const [pickedHere, setPickedHere] = useState(false);
  useEffect(() => {
    const on = () => setPicking(true);
    window.addEventListener(OPEN_CHAPTER_FINDER_EVENT, on);
    return () => window.removeEventListener(OPEN_CHAPTER_FINDER_EVENT, on);
  }, []);
  const sheet = picking ? (
    <ChapterPickerSheet schoolSlug={school.slug} schoolName={school.name} pinnedTheme initialCouncil={councilPreset} hasChapter={!!chapter}
      onClose={() => setPicking(false)} onClear={onClear} onPick={(c) => { setPicking(false); setPickedHere(true); onPick(c.slug); }} />
  ) : null;

  const council = role === "council" && !pathChapter && !pickedHere;
  if (!chapter && !council) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "center", marginTop: narrow ? 6 : 8 }}>
          <button type="button" onClick={() => setPicking(true)} data-gm-cta="strip-chapter" className="underline underline-offset-4" style={{ background: "none", border: 0, padding: "6px 4px", cursor: "pointer", color: LK.muted, fontFamily: BRAND_SANS, fontSize: 13.5, fontWeight: 700, minHeight: 36 }}>
            Studying with your chapter? →
          </button>
        </div>
        {sheet}
      </>
    );
  }
  if (!chapter || council) return <><CouncilStrip school={school} council={councilPreset} contactRef={contactRef} narrow={narrow} onChoose={() => setPicking(true)} />{sheet}</>;
  return <><HouseStrip school={school} chapter={chapter} role={role === "council" ? "chair" : role} contactRef={contactRef} narrow={narrow} prefillEmail={prefillEmail ?? null} onNotYours={() => { onClear(); setPicking(true); }} />{sheet}</>;
}

// ── a chapter's strip: member, or chair ──────────────────────────────────────────────────────

function HouseStrip({ school, chapter, role, contactRef, narrow, prefillEmail, onNotYours }: { school: School; chapter: PickedChapter; role: StripRole; contactRef: string | null; narrow: boolean; prefillEmail: string | null; onNotYours: () => void }) {
  const short = (chapter.letters ?? "").trim() || chapter.name || "your chapter";
  const [chair, setChair] = useState(role === "chair");
  useEffect(() => { setChair(role === "chair"); }, [role, chapter.slug]);
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    const read = () => setJoined(readJoined(school.slug, chapter.slug));
    read();
    window.addEventListener(CHAPTER_JOINED_EVENT, read);
    return () => window.removeEventListener(CHAPTER_JOINED_EVENT, read);
  }, [school.slug, chapter.slug]);
  const [kit, setKit] = useState(false);
  const [join, setJoin] = useState(false);
  const [claim, setClaim] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(t); }, [toast]);

  // THE MEMBER LINK — the chapter's page, no role on it; every link a member or a chair shares opens the same page.
  const link = buildShareUrl({ campus: school.id, chapter: chapter.slug, contactRef });
  const post = chapterGroupMe({ courseCode: school.courseCode, url: link, chapter: short });
  const art = chairArtwork("chapter", school.slug, chapter.slug);
  const w = stripWords(short, chapter.members, joined);

  return (
    <section aria-label="Your chapter" className="lk-card" style={{ marginTop: narrow ? 10 : 12, padding: narrow ? "11px 12px" : "12px 14px", fontFamily: BRAND_SANS, borderColor: chair ? GOLD : joined ? "#1F7A4D" : undefined, display: "flex", flexDirection: "column", gap: 8 }}>
      {!kit && !claim && (
        <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
          <div className="min-w-0" style={{ flex: "1 1 200px" }}>
            {chair ? (
              <>
                <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: narrow ? 15.5 : 17, lineHeight: 1.15, color: LK.text }}>Bring this to the house.</div>
                <div style={{ fontSize: 12.5, color: LK.muted, marginTop: 2 }}>One link — every {short} member gets Exam 1 free, right now.</div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: narrow ? 15.5 : 17, lineHeight: 1.15, color: LK.text }}>{w.head}</div>
                {w.sub && <div style={{ fontSize: 12.5, color: LK.muted, marginTop: 2 }}>{w.sub}</div>}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            {chair ? (
              <button type="button" onClick={() => setKit(true)} className="lk-btn lk-btn-acc" style={{ minHeight: 38, fontSize: 12, padding: "0 14px" }}>Share with the house ↻</button>
            ) : (
              <>
                {!joined && <button type="button" onClick={() => setJoin(true)} className="lk-btn lk-btn-ghost" style={{ minHeight: 38, fontSize: 12, padding: "0 14px" }}>Join the study group</button>}
                <button type="button" onClick={() => setKit(true)} className={joined ? "lk-btn lk-btn-acc" : "lk-btn lk-btn-ghost"} style={{ minHeight: 38, fontSize: 12, padding: "0 14px" }}>Spread the word →</button>
              </>
            )}
          </div>
        </div>
      )}
      {kit && <Kit title={chair ? "Share with the house" : `Share with ${short}`} note="Every link opens the house's free cram page." link={link} post={post} art={art} letters={short} onBack={() => setKit(false)} />}
      {claim && (
        <div style={{ background: NAVY, color: CREAM, borderRadius: 12, padding: "14px 14px 12px", textAlign: "center" }}>
          <ExecForm school={school} chapter={chapter} short={short} onMember={() => setClaim(false)} onNotYours={onNotYours} />
        </div>
      )}
      {!kit && !claim && (
        <div className="flex flex-wrap items-center" style={{ gap: 14, fontSize: 11.5, color: LK.dim }}>
          {toast ? <span style={{ color: "#1F7A4D", fontWeight: 700 }}>{toast}</span> : null}
          <span style={{ flex: 1 }} />
          {chair ? (
            <>
              <Quiet onClick={() => setClaim(true)}>Claim your exec dashboard</Quiet>
              <Quiet onClick={() => setChair(false)}>I'm a member</Quiet>
            </>
          ) : (
            <Quiet onClick={() => setChair(true)}>On exec?</Quiet>
          )}
          <Quiet onClick={onNotYours}>Not your chapter?</Quiet>
        </div>
      )}
      {join && (
        <JoinSheet school={school} chapter={chapter} short={short} members={chapter.members} prefillEmail={prefillEmail}
          onClose={() => setJoin(false)}
          onJoined={() => { setJoin(false); setJoined(true); setToast(`You're in with ${short}.`); }} />
      )}
    </section>
  );
}

// ── the council exec's strip ─────────────────────────────────────────────────────────────────

function CouncilStrip({ school, council, contactRef, narrow, onChoose }: { school: School; council: string | null; contactRef: string | null; narrow: boolean; onChoose: () => void }) {
  const c = COUNCILS.find((x) => x.slug === council) ?? null;
  const name = c?.name ?? "your council";
  const [kit, setKit] = useState(false);
  // THE CHAIRS' LINK: the campus page with the council preset — a chair opens it, picks their chapter, and the
  // house gets its own link. The council's referral rides along as ?by=.
  const chairs = `${LEARN_ORIGIN}${councilChairsPath(school.id, council ?? "")}${contactRef ? `&by=${encodeURIComponent(contactRef)}` : ""}`;
  const post = councilChairPost(school.courseCode, chairs, name);
  const art = council ? chairArtwork("council", school.slug, council) : null;
  return (
    <section aria-label="Your council" className="lk-card" style={{ marginTop: narrow ? 10 : 12, padding: narrow ? "11px 12px" : "12px 14px", fontFamily: BRAND_SANS, borderColor: GOLD, display: "flex", flexDirection: "column", gap: 8 }}>
      {kit && art ? (
        <Kit title="Share with chapter chairs" note="One link. Chairs open the free prep, pick their chapter, and pass the house its own link." link={chairs} post={post} art={art} letters={name} council onBack={() => setKit(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
            <div className="min-w-0" style={{ flex: "1 1 200px" }}>
              <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: narrow ? 15.5 : 17, lineHeight: 1.15, color: LK.text }}>Bring this to your chapters.</div>
              <div style={{ fontSize: 12.5, color: LK.muted, marginTop: 2 }}>One link for chairs; every house gets its own page.</div>
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
              <button type="button" onClick={() => setKit(true)} disabled={!art} className="lk-btn lk-btn-acc" style={{ minHeight: 38, fontSize: 12, padding: "0 14px" }}>Share with chapter chairs ↻</button>
              <button type="button" onClick={onChoose} className="lk-btn lk-btn-ghost" style={{ minHeight: 38, fontSize: 12, padding: "0 14px" }}>Choose your chapter</button>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: LK.dim }}>{name} · {school.name}</div>
        </>
      )}
    </section>
  );
}

// ── the kit, flipped open in place ───────────────────────────────────────────────────────────

function Kit({ title, note, link, post, art, letters, council = false, onBack }: { title: string; note: string; link: string; post: string; art: ReturnType<typeof chairArtwork>; letters: string; council?: boolean; onBack: () => void }) {
  const [imgBusy, setImgBusy] = useState(false);
  const flyerImageFile = `survive-${art.flyer?.split("/").pop() || "chapter"}-flyer.png`;
  const slideFile = `survive-${council ? "council" : "chapter"}-${letters.replace(/[^A-Za-z0-9]+/g, "").toLowerCase() || "meeting"}-slide.pdf`;
  const downloadImage = async () => {
    if (!art.flyerImage || imgBusy) return;
    setImgBusy(true);
    try { await saveFlyerImage(art.flyerImage, flyerImageFile); } catch { window.open(art.flyerImage, "_blank", "noopener"); }
    finally { setImgBusy(false); }
  };
  return (
    <div className="lk-in" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 16, color: LK.text }}>{title}</div>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 underline underline-offset-4" style={{ background: "none", border: 0, padding: "4px 2px", cursor: "pointer", color: LK.muted, fontFamily: BRAND_SANS, fontSize: 12, fontWeight: 700 }}><Undo2 className="h-3.5 w-3.5" /> Back</button>
      </div>
      <div style={{ fontSize: 12.5, color: LK.muted }}>{note}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 6 }}>
        <CopyBtn icon={<Link2 className="h-4 w-4" />} label={council ? "Copy the chairs' link" : "Copy the link"} text={link} what="link" />
        <CopyBtn icon={<MessageSquare className="h-4 w-4" />} label="Copy a GroupMe post" text={post} what="post" />
        {art.flyer && <a href={art.flyer} target="_blank" rel="noreferrer" className="lk-btn lk-btn-ghost" style={{ minHeight: 40, fontSize: 12, justifyContent: "flex-start" }}><FileText className="h-4 w-4" /> Print the flyer</a>}
        {art.flyerImage && <button type="button" onClick={() => void downloadImage()} disabled={imgBusy} className="lk-btn lk-btn-ghost" style={{ minHeight: 40, fontSize: 12, justifyContent: "flex-start" }}>{imgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />} Download the flyer image</button>}
        <a href={art.slide} download={slideFile} className="lk-btn lk-btn-ghost" style={{ minHeight: 40, fontSize: 12, justifyContent: "flex-start" }}><Presentation className="h-4 w-4" /> {council ? "Council meeting slide" : "Chapter meeting slide"}</a>
      </div>
    </div>
  );
}

function CopyBtn({ icon, label, text, what }: { icon: React.ReactNode; label: string; text: string; what: "link" | "post" }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => { if (state === "idle") return; const t = window.setTimeout(() => setState("idle"), 1800); return () => window.clearTimeout(t); }, [state]);
  const copy = async () => {
    const ok = await copyToClipboard(text);
    setState(ok ? "ok" : "fail");
    if (ok) track("share_link_copied", { source: `learn-strip-${what}` } as never);
  };
  return (
    <button type="button" onClick={() => void copy()} className={state === "ok" ? "lk-btn lk-btn-acc" : "lk-btn lk-btn-ghost"} style={{ minHeight: 40, fontSize: 12, justifyContent: "flex-start" }} aria-live="polite">
      {state === "ok" ? <><Check className="h-4 w-4" /> Copied</> : state === "fail" ? <><Copy className="h-4 w-4" /> Couldn't copy — long-press to select</> : <>{icon} {label}</>}
    </button>
  );
}

function Quiet({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="underline underline-offset-2" style={{ background: "none", border: 0, padding: "4px 0", cursor: "pointer", color: LK.muted, font: "inherit", fontWeight: 700, minHeight: 32 }}>{children}</button>;
}

// ── the join sheet: email at the moment it means something ───────────────────────────────────

function JoinSheet({ school, chapter, short, members, prefillEmail, onClose, onJoined }: { school: School; chapter: PickedChapter; short: string; members: number; prefillEmail: string | null; onClose: () => void; onJoined: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useDismiss<HTMLDivElement>(onClose, { outside: false });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = email.trim();
    if (!EMAIL_RE.test(v)) { setErr("That email doesn't look right."); return; }
    setBusy(true); setErr(null);
    try {
      await joinChapter(school, chapter.slug, v, "learn-strip");
      void qc.invalidateQueries({ queryKey: ["cta-go-chapter"] });
      onJoined();
    } catch (e2) { setErr(e2 instanceof Error && e2.message.length < 120 ? e2.message : "Couldn't save that — try again."); setBusy(false); }
  };
  const first = members === 0;
  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(0,0,0,0.72)" }} onClick={onClose}>
      <div role="dialog" aria-label={first ? `Be the first from ${short}` : `Study with ${short}`} className="lk-in flex w-full max-w-[430px] flex-col rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: NAVY, color: CREAM, border: "1px solid #405370", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start" style={{ gap: 10 }}>
          <div className="min-w-0 flex-1">
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 800, color: GOLD }}>{chapter.name ?? short} · {school.name}</div>
            <h3 style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 21, margin: "4px 0 6px", lineHeight: 1.12 }}>{first ? `Be the first from ${short}.` : `Study with ${short}.`}</h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "rgba(245,239,230,0.78)" }}>{first ? `The next person from ${short} sees someone's already in.` : `${members} member${members === 1 ? " is" : "s are"} cramming already.`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: CREAM, border: 0, cursor: "pointer" }}><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={(e) => void submit(e)} style={{ marginTop: 14 }}>
          <label htmlFor="strip-email" style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#C8D2E6", marginBottom: 6 }}>Email address</label>
          <input id="strip-email" ref={input} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} placeholder="you@school.edu"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: BRAND_SANS, fontSize: 16, padding: "12px", borderRadius: 9, color: NAVY, background: "#F8F5EE", border: "1px solid #CFDBED", outline: "none" }} />
          {err && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "#F3C6CC" }}>{err}</p>}
          <button type="submit" disabled={busy} style={{ marginTop: 10, width: "100%", minHeight: 48, border: 0, borderRadius: 9, background: GOLD, color: NAVY, fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 15.5, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join the study group"}
          </button>
        </form>
        <button type="button" onClick={onClose} style={{ marginTop: 10, background: "transparent", border: 0, padding: 4, fontFamily: BRAND_SANS, fontSize: 12.5, color: "rgba(245,239,230,0.65)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>Keep studying</button>
      </div>
    </div>
  );
}
