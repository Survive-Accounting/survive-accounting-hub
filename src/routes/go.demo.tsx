// /go/demo — THE DEMO CHAPTER PAGE, a sales asset for outreach DMs. The existing Greek chapter
// page rendered with a generic config (Org "Your Chapter" · Campus "Your School" · ACCT 101),
// plus a second face: a floating DEMO | ADMIN toggle that flips the page into the exec's view.
//
// THE HONESTY RULE governs everything here: the admin state shows ZERO fabricated data. Every
// dashboard tile is an em-dash with "live once your chapter is set up" — importance comes from
// framing, never from invented numbers. The DEMO watermark rides the flyer preview, the copied
// link goes to THIS page, and the claim paths submit REAL claims against a REAL chapter picked
// in the finder (greek_chapter_claims has no source column, so the demo source tag —
// "demo_page" from the page's own setup controls, "demo_claim" from the adventure panel — is
// logged to expand_events via logGreekEvent instead; see greek-go.functions.ts).
//
// Static /go/demo outranks /go/$school/$chapter, so no real campus can ever be shadowed by this
// (no campus is slugged "demo"), and /go/demo/demo 301s back here so the copied link and the
// flyer QR both resolve.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { ChapterAccessForm } from "@/components/site/ChapterAccessForm";
import { OPEN_CLAIM_EVENT, SEAT_MINIMUM, SEAT_PRICE } from "@/components/site/ChapterAccess";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { ChapterGate } from "@/components/site/ChapterGate";
import { FlyerBlock } from "@/components/site/FlyerBlock";
import { groupMeMessage } from "@/components/site/ChapterShare";
import { GreekLettersGlyph } from "@/components/site/portal-home/GreekLettersGlyph";
import { listGoSchools, logGreekEvent } from "@/lib/greek-go.functions";
import { useChapterMember } from "@/lib/use-chapter-member";
import { scrollToId } from "@/lib/ui-scroll";
import { track } from "@/lib/analytics";
import { HOME_OG, ogMeta } from "@/lib/og";
import { LandingPage } from "./landing";

const EXAM_ANCHOR = "exam1";
const ACCESS_ANCHOR = "chapter-access";
/** The sharing-tools anchor. One id, two owners — DemoChapterAccess (demo mode) and the admin
 *  command center (admin mode) — only one of which is ever mounted. */
const SHARE_ANCHOR = "demo-sharing";
const ADVENTURE_KEY = "sa-demo-adventure";
const DEMO_URL = "https://surviveaccounting.com/go/demo";
const ORG = "Your Chapter";
const SCHOOL = "Your School";
const COURSE = "ACCT 101";

type Mode = "demo" | "admin";
type ClaimSource = "demo-page" | "demo-claim";

export const Route = createFileRoute("/go/demo")({
  head: () => ({
    meta: [
      ...ogMeta({
        ...HOME_OG,
        title: "See a chapter's page — Survive Accounting",
        description: "Exactly what your chapter's page looks like: free Exam 1 for every member, sharing tools, and the exec dashboard.",
        path: "/go/demo",
      }),
      // A demo must never outrank or shadow real chapter pages in search.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GoDemoPage,
});

const DEMO_CSS = `
@keyframes sa-demo-fade { from { opacity: 0; } to { opacity: 1; } }
/* THE PILL'S ONE TEASE — a half-flip and settle, once, shortly after load. */
@keyframes sa-pill-tease {
  0% { transform: translateX(-50%) perspective(340px) rotateX(0); }
  40% { transform: translateX(-50%) perspective(340px) rotateX(26deg); }
  100% { transform: translateX(-50%) perspective(340px) rotateX(0); }
}
.sa-pill-tease { animation: sa-pill-tease 0.9s ease-in-out 0.8s 1; }
@keyframes sa-adventure-in { from { transform: translateY(26px); opacity: 0; } to { transform: none; opacity: 1; } }
.sa-adventure-in { animation: sa-adventure-in 260ms ease; }
@media (prefers-reduced-motion: reduce) {
  .sa-pill-tease, .sa-adventure-in { animation: none; }
}
`;

function GoDemoPage() {
  const { signedIn } = useChapterMember("demo", "demo");
  const [mode, setMode] = useState<Mode>("demo");
  const [fading, setFading] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [adventureOpen, setAdventureOpen] = useState(false);
  const [adventureDone, setAdventureDone] = useState(false);
  const [claimSource, setClaimSource] = useState<ClaimSource | null>(null);
  const flipped = useRef(false);
  const adventureDoneRef = useRef(false);

  useEffect(() => { setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);
  useEffect(() => {
    try {
      if (localStorage.getItem(ADVENTURE_KEY) === "done") { adventureDoneRef.current = true; setAdventureDone(true); }
    } catch { /* private mode */ }
  }, []);

  // Demo visits land in the same greek event log as real chapter visits, under demo/demo —
  // once per session, exactly like the real page.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("sa-visit:demo/demo")) return;
      sessionStorage.setItem("sa-visit:demo/demo", "1");
    } catch { /* private mode — log it and move on */ }
    void logGreekEvent({ data: { kind: "visit", schoolSlug: "demo", chapterSlug: "demo" } }).catch(() => {});
  }, []);

  // THE ADVENTURE PANEL shows once per visitor: after the first toggle flip OR past ~60% scroll,
  // whichever comes first. The demo breathes first — never on load.
  const maybeAdventure = () => {
    if (adventureDoneRef.current) return;
    adventureDoneRef.current = true;
    try { localStorage.setItem(ADVENTURE_KEY, "done"); } catch { /* ignore */ }
    setAdventureDone(true);
    setAdventureOpen(true);
    track("demo_adventure", { action: "shown" });
  };
  useEffect(() => {
    if (adventureDone) return;
    const onScroll = () => {
      const d = document.documentElement;
      const max = d.scrollHeight - window.innerHeight;
      if (max > 400 && window.scrollY / max >= 0.6) maybeAdventure();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [adventureDone]);

  // FLIP — a cross-fade, no reload. Reduced motion swaps instantly.
  const flip = (next: Mode) => {
    if (next === mode) return;
    track("demo_mode_flipped", { mode: next });
    const first = !flipped.current;
    flipped.current = true;
    const commit = () => { setMode(next); setFading(false); window.scrollTo({ top: 0 }); };
    if (reduced) commit(); else { setFading(true); window.setTimeout(commit, 170); }
    if (first) maybeAdventure();
  };

  const openClaim = (source: ClaimSource) => { setClaimSource(source); setAdventureOpen(false); };

  const accessAnchor = mode === "admin" ? SHARE_ANCHOR : ACCESS_ANCHOR;
  const chip = adventureDone && !adventureOpen;

  return (
    <>
      <style>{DEMO_CSS}</style>
      <DemoBanner chip={chip} onSetup={() => openClaim("demo-page")} onChip={() => openClaim("demo-claim")} />

      <div style={{ opacity: fading ? 0 : 1, transition: reduced ? "none" : "opacity 170ms ease" }}>
        {mode === "admin" && <AdminCommandCenter onClaim={() => openClaim("demo-page")} />}
        <LandingPage
          // "demo" is not a campus id — it exists to block the stored-campus restore, so the
          // demo never repaints itself as a returning visitor's real school.
          initialCampusId="demo"
          demoContext={{ schoolName: SCHOOL, courseCode: COURSE }}
          greek={{ orgName: ORG, letters: "your chapter", claimed: false, accessAnchor }}
          chapterAccess={mode === "demo" ? <DemoChapterAccess onClaim={() => openClaim("demo-page")} /> : undefined}
          videoGate={signedIn === false ? <ChapterGate chapterName={ORG} /> : undefined}
          greekOrg={ORG}
        />
      </div>

      <FloatingModeToggle mode={mode} reduced={reduced} onFlip={flip} />
      {adventureOpen && (
        <AdventurePanel
          onClaim={() => openClaim("demo-claim")}
          onExplore={() => {
            setAdventureOpen(false);
            track("demo_adventure", { action: "explore" });
            requestAnimationFrame(() => scrollToId(SHARE_ANCHOR));
          }}
          onDismiss={() => setAdventureOpen(false)}
        />
      )}
      {claimSource && <ClaimDemoModal source={claimSource} onClose={() => setClaimSource(null)} />}
    </>
  );
}

/** THE SLIM DEMO BANNER — at the very top, present in both modes. Says what this page is and
 *  offers the way out of pretending: set up the real one. After the adventure panel has come and
 *  gone, the compact claim chip lives here. */
function DemoBanner({ chip, onSetup, onChip }: { chip: boolean; onSetup: () => void; onChip: () => void }) {
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "#0D1526", borderBottom: "1px solid rgba(252,163,17,0.45)", fontFamily: BRAND_SANS, position: "relative", zIndex: 205 }}>
      <div className="mx-auto flex w-full max-w-[1040px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center">
        <p className="text-[12.5px] font-bold" style={{ color: "var(--brand-cream)" }}>
          <span className="font-black" style={{ color: "var(--accent)", letterSpacing: "0.08em" }}>DEMO</span>
          {" "}— this is what your chapter&apos;s page looks like.
        </p>
        <button type="button" onClick={onSetup} className="text-[12.5px] font-black underline underline-offset-4" style={{ color: "var(--accent)", minHeight: 32 }}>
          Set up yours →
        </button>
        {chip && (
          <button
            type="button"
            onClick={onChip}
            className="rounded-full px-3 text-[11.5px] font-black"
            style={{ minHeight: 26, background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.45)", color: "var(--accent)" }}
          >
            Claim your page
          </button>
        )}
      </div>
    </div>
  );
}

/** DIAGONAL DEMO WATERMARK — over the flyer preview (and anything else that must never be
 *  mistaken for a real chapter's artwork). pointer-events pass through, so download/print keep
 *  working; the artwork underneath is the REAL generated demo flyer, not a mockup. */
function DemoWatermark({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid select-none place-items-center overflow-hidden">
        <span style={{ transform: "rotate(-24deg)", fontFamily: BRAND_DISPLAY, fontSize: 64, fontWeight: 900, letterSpacing: "0.22em", color: "rgba(245,239,230,0.16)" }}>
          DEMO
        </span>
      </div>
    </div>
  );
}

/** THE SHARING TOOLS — copy link, copy GroupMe message, the watermarked flyer. One component,
 *  two framings: the demo page's step 1 and the admin view's "your sharing tools". */
function DemoShareTools({ admin = false }: { admin?: boolean }) {
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const copy = async (kind: "link" | "text") => {
    const text = kind === "link" ? DEMO_URL : groupMeMessage({ claimed: false, shortName: ORG, courseLabel: COURSE, url: DEMO_URL });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
    } catch { /* clipboard blocked — the plain URL below still shows */ }
  };
  const BTN: React.CSSProperties = { minHeight: 46, background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--brand-cream)" };
  return (
    <div className="mx-auto w-full max-w-sm" style={{ fontFamily: BRAND_SANS }}>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => void copy("link")} className="w-full rounded-xl px-4 text-[14px] font-bold focus-visible:ring-2" style={BTN}>
          {copied === "link" ? "Link copied ⚡" : "Copy chapter link"}
        </button>
        <button type="button" onClick={() => void copy("text")} className="w-full rounded-xl px-4 text-[14px] font-bold focus-visible:ring-2" style={BTN}>
          {copied === "text" ? "Message copied ⚡" : "Copy GroupMe message"}
        </button>
      </div>
      <DemoWatermark>
        <FlyerBlock
          schoolSlug="demo"
          chapterSlug="demo"
          chapterName={ORG}
          title={admin ? "Your flyer, print-ready" : "Print flyer for the house"}
          subtitle="Download a print-ready flyer with your chapter QR code."
        />
      </DemoWatermark>
      <p className="mt-2 truncate text-center text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        {DEMO_URL.replace("https://", "")} — your chapter gets its own link when it&apos;s set up.
      </p>
    </div>
  );
}

/** THE DASHBOARD TILES — honest empty state, both modes. Never a sample number: an em-dash and
 *  "live once your chapter is set up" is the whole claim, because it is the whole truth. */
function DemoDashTiles({ badge }: { badge: string }) {
  const ROWS = ["Members joined", "Total study hours", "Practice questions completed"];
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.18)", border: "1px solid var(--border-default)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Exec dashboard</span>
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wide" style={{ background: "rgba(252,163,17,0.14)", color: "var(--accent)" }}>
          {badge}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ROWS.map((label) => (
          <div key={label} className="rounded-xl px-2 py-3 text-center" style={{ background: "var(--bg-surface)" }}>
            <div className="text-[20px] font-black leading-none" style={{ color: "var(--brand-cream)", opacity: 0.4 }}>
              <span aria-label="live once your chapter is set up">—</span>
            </div>
            <div className="mt-1.5 text-[11px] font-bold leading-tight" style={{ color: "var(--brand-cream)" }}>{label}</div>
            <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>live once your chapter is set up</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One accordion step — the same shape as ChapterAccess's StepCard, rebuilt here because the
 *  demo's steps carry different bodies and must never submit against the fake demo slugs. */
function DemoStepCard({ n, title, desc, open, onToggle, children }: {
  n: number; title: string; desc: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const uid = useId();
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: "var(--sa-surface-2, rgba(245,239,230,0.05))", border: `1px solid ${open ? "rgba(252,163,17,0.45)" : "var(--border-default)"}`, transition: "border-color 160ms" }}>
      <h3 className="m-0">
        <button
          type="button"
          id={`demo-step-head-${uid}`}
          aria-expanded={open}
          aria-controls={`demo-step-panel-${uid}`}
          onClick={onToggle}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left focus-visible:ring-2 sm:px-5"
          style={{ minHeight: 64, color: "var(--brand-cream)" }}
        >
          <span aria-hidden className="shrink-0 text-[13px] font-black tabular-nums" style={{ color: open ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.08em" }}>
            {String(n).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-black leading-tight">{title}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--text-muted)" }}>{desc}</span>
          </span>
          <span aria-hidden className="shrink-0 transition-transform motion-reduce:transition-none" style={{ color: "var(--accent)", fontSize: 12, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
        </button>
      </h3>
      <div id={`demo-step-panel-${uid}`} role="region" aria-labelledby={`demo-step-head-${uid}`} className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-5 pt-1 sm:px-5" inert={!open}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/** THE DEMO'S CHAPTER-ACCESS SECTION — the real page's 3-step onboarding, demo-safe: sharing
 *  tools copy THIS page's link, the claim step routes through the finder to a REAL chapter, and
 *  the dashboard step is the honest preview. Answers the hero's "Set up access" event the same
 *  way the real section does. */
function DemoChapterAccess({ onClaim }: { onClaim: () => void }) {
  const [open, setOpen] = useState(0);
  useEffect(() => {
    const onOpen = () => setOpen(1);
    window.addEventListener(OPEN_CLAIM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CLAIM_EVENT, onOpen);
  }, []);
  return (
    <section id={ACCESS_ANCHOR} className="sa-anchor mx-auto w-full max-w-[640px] px-5 py-12" style={{ fontFamily: BRAND_SANS }}>
      <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>CHAPTER ACCESS</p>
      <h2 className="mx-auto mt-3 max-w-[24ch] text-center text-[21px] font-black leading-[1.15] sm:text-[25px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
        Set up chapter access in 3 steps.
      </h2>
      <div className="mt-7 flex flex-col gap-3">
        <DemoStepCard n={1} title="Share it with the house" desc="Send the chapter link, drop it in GroupMe, or print a flyer for the house." open={open === 0} onToggle={() => setOpen((o) => (o === 0 ? -1 : 0))}>
          <div id={SHARE_ANCHOR} className="sa-anchor" />
          <DemoShareTools />
        </DemoStepCard>
        <DemoStepCard n={2} title="Claim your chapter" desc="Get the chapter dashboard, sharing tools and member access controls." open={open === 1} onToggle={() => setOpen((o) => (o === 1 ? -1 : 1))}>
          <div className="mx-auto flex max-w-sm flex-col gap-4">
            <p className="text-center text-[14px] font-bold leading-relaxed" style={{ color: "var(--brand-cream)" }}>
              Claiming is free. Exam 1 stays free for every member.
            </p>
            <button
              type="button"
              onClick={onClaim}
              className="w-full rounded-xl px-7 text-[16px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2"
              style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.6)" }}
            >
              Claim your page →
            </button>
            <div className="rounded-xl px-4 py-3.5 text-center" style={{ background: "rgba(0,0,0,0.18)", border: "1px solid var(--border-default)" }}>
              <p className="text-[11.5px] font-black uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Later, if you want it</p>
              <p className="mt-1.5 text-[16px] font-black" style={{ color: "var(--accent)" }}>${SEAT_PRICE} per member, per semester</p>
              <p className="mt-0.5 text-[12px] font-bold" style={{ color: "var(--text-muted)" }}>{SEAT_MINIMUM}-seat minimum</p>
              <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Full-semester access unlocks Exams 2, 3, and the Final for the members your chapter sponsors.
              </p>
            </div>
          </div>
        </DemoStepCard>
        <DemoStepCard n={3} title="See your chapter studying" desc="Track how members are using the free Exam 1 resources." open={open === 2} onToggle={() => setOpen((o) => (o === 2 ? -1 : 2))}>
          <div className="mx-auto max-w-sm">
            <DemoDashTiles badge="Preview" />
            <p className="mt-3 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Once your chapter is set up, its exec tracks usage here — starting with the free Exam 1 resources, before any seats are bought.
            </p>
          </div>
        </DemoStepCard>
      </div>
    </section>
  );
}

/** THE ADMIN FACE — the exec dashboard section moved to the top, addressed to the person who
 *  runs the house. Everything below it is the member page, unchanged, so the flip reads as
 *  "same page, your side of it". Zero invented numbers anywhere in here. */
function AdminCommandCenter({ onClaim }: { onClaim: () => void }) {
  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--bg-page)", fontFamily: BRAND_SANS }}>
      <section className="mx-auto w-full max-w-[720px] px-5 pb-4 pt-8">
        <p className="text-center text-[11.5px] font-bold" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
          CHAPTER ADMIN — YOUR COMMAND CENTER
        </p>
        <h1 className="mx-auto mt-3 max-w-[24ch] text-center text-[24px] font-black leading-[1.12] sm:text-[30px]" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", letterSpacing: "-0.01em" }}>
          You run the house. This runs the grades.
        </h1>
        <p className="mx-auto mt-2.5 max-w-[52ch] text-center text-[14.5px] leading-relaxed" style={{ color: "var(--brand-cream)", opacity: 0.75 }}>
          This is the verified exec&apos;s side of the page: your numbers, your sharing tools, your
          member access. It goes live the moment your chapter is set up.
        </p>

        <div className="mx-auto mt-7 max-w-md">
          <DemoDashTiles badge="Yours once set up" />
        </div>

        <div id={SHARE_ANCHOR} className="sa-anchor mx-auto mt-8 max-w-md">
          <h2 className="text-center text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Your sharing tools</h2>
          <p className="mx-auto mt-1 max-w-[44ch] text-center text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Drop the link in GroupMe, print the flyer for the house — every member who joins shows
            up in your numbers above.
          </p>
          <div className="mt-3">
            <DemoShareTools admin />
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-md rounded-2xl p-5 text-center" style={{ background: "rgba(252,163,17,0.08)", border: "1px solid rgba(252,163,17,0.35)" }}>
          <p className="text-[15px] font-black" style={{ color: "var(--brand-cream)" }}>Make it yours.</p>
          <p className="mx-auto mt-1 max-w-[40ch] text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Claiming is free — it puts a verified exec&apos;s name on the page and switches this
            dashboard on. Exam 1 stays free for every member either way.
          </p>
          <button
            type="button"
            onClick={onClaim}
            className="mt-3 w-full rounded-xl px-7 text-[15.5px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2"
            style={{ minHeight: 52, background: "var(--accent)", color: "#0B1220" }}
          >
            Claim your page →
          </button>
        </div>

        <p className="mt-10 text-center text-[11.5px] font-black" style={{ color: "var(--text-muted)", letterSpacing: "0.16em" }}>
          WHAT YOUR MEMBERS SEE ↓
        </p>
      </section>
    </div>
  );
}

/** THE FLOATING MODE TOGGLE — bottom-center, clear of mobile safe areas. The ADMIN segment's
 *  letters cycle through the same configured org list as the portal card (one system). One
 *  gentle tease on load with a tooltip, then still; reduced motion gets the tooltip only. */
function FloatingModeToggle({ mode, reduced, onFlip }: { mode: Mode; reduced: boolean; onFlip: (m: Mode) => void }) {
  const [tip, setTip] = useState(false);
  useEffect(() => {
    const show = window.setTimeout(() => setTip(true), 900);
    const hide = window.setTimeout(() => setTip(false), 5600);
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, []);
  const seg = (on: boolean): React.CSSProperties => ({
    minHeight: 40,
    borderRadius: 999,
    padding: "0 16px",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 900,
    fontSize: 12.5,
    letterSpacing: "0.06em",
    background: on ? "var(--accent)" : "transparent",
    color: on ? "#0B1220" : "var(--brand-cream)",
    transition: "background 160ms, color 160ms",
  });
  return (
    <div
      className={reduced ? undefined : "sa-pill-tease"}
      style={{
        ...frameThemeVars(DEFAULT_FRAME_THEME),
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        zIndex: 230,
        fontFamily: BRAND_SANS,
      }}
    >
      {tip && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-bold"
          style={{ bottom: "calc(100% + 8px)", background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--brand-cream)", boxShadow: "0 12px 30px -12px rgba(0,0,0,0.8)" }}
        >
          Flip it — see the admin side.
        </div>
      )}
      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ background: "color-mix(in srgb, var(--bg-overlay) 96%, transparent)", border: "1px solid var(--border-default)", boxShadow: "0 18px 44px -16px rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      >
        <button type="button" aria-pressed={mode === "demo"} onClick={() => { setTip(false); onFlip("demo"); }} style={seg(mode === "demo")}>
          DEMO
        </button>
        <button type="button" aria-pressed={mode === "admin"} onClick={() => { setTip(false); onFlip("admin"); }} style={seg(mode === "admin")}>
          <GreekLettersGlyph ambient fontSize={13} color="currentColor" />
          <span aria-hidden style={{ opacity: 0.55 }}>·</span>
          ADMIN
        </button>
      </div>
    </div>
  );
}

/** CHOOSE YOUR ADVENTURE — the claim path. The home portals' twin-card pattern, in miniature.
 *  Desktop: slides in bottom-right; mobile: a bottom sheet. Shown once per visitor. */
function AdventurePanel({ onClaim, onExplore, onDismiss }: { onClaim: () => void; onExplore: () => void; onDismiss: () => void }) {
  const CARD: React.CSSProperties = {
    background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 16,
    padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
  };
  return (
    <div
      className="sa-adventure-in fixed inset-x-0 bottom-0 z-[220] sm:inset-x-auto sm:bottom-24 sm:right-4 sm:w-[480px]"
      style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), fontFamily: BRAND_SANS }}
      role="dialog"
      aria-label="Claim this for your chapter"
    >
      <div
        className="rounded-t-2xl p-4 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[12px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Like what you see?</p>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3 min-[420px]:grid-cols-2">
          <div style={CARD}>
            <p className="text-[14.5px] font-black leading-snug" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Claim this for your chapter</p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClaim}
              className="mt-3 w-full rounded-xl px-4 text-[13.5px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2"
              style={{ minHeight: 46, background: "var(--accent)", color: "#0B1220" }}
            >
              Claim your page →
            </button>
          </div>
          <div style={CARD}>
            <p className="text-[14.5px] font-black leading-snug" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Keep exploring</p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onExplore}
              className="mt-3 w-full rounded-xl px-4 text-[13.5px] font-black focus-visible:ring-2"
              style={{ minHeight: 46, background: "var(--bg-surface)", border: "1.5px solid var(--brand-cream)", color: "var(--brand-cream)" }}
            >
              Try the sharing tools
            </button>
            <p className="mt-2 text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
              Your chapter&apos;s real page is one claim away.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** THE CLAIM PATH — finder first (the demo names no real chapter), then the SAME request form
 *  every real chapter page uses, prefilled with the picked chapter. A successful submit logs the
 *  demo source tag against the REAL chapter's slugs. */
function ClaimDemoModal({ source, onClose }: { source: ClaimSource; onClose: () => void }) {
  const [picked, setPicked] = useState<{ schoolSlug: string; chapterSlug: string; name: string } | null>(null);
  const schoolsQ = useQuery({ queryKey: ["go-schools"], queryFn: () => listGoSchools(), staleTime: 600_000, networkMode: "always" });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center overflow-y-auto sm:items-center sm:px-4" style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "rgba(5,8,16,0.72)", fontFamily: BRAND_SANS }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Claim your chapter's page"
        className="w-full max-w-[440px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
            {picked ? `Claim ${picked.name}` : "First, find your chapter"}
          </h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {!picked ? (
          schoolsQ.isLoading ? (
            <p className="py-6 text-center text-[13.5px]" style={{ color: "var(--text-muted)" }}>Loading schools…</p>
          ) : (
            <ChapterFinder
              schools={schoolsQ.data ?? []}
              autoPick
              escapeHatches
              note="Your chapter's real page — like this demo, with your letters on it."
              onPick={(s, c, n) => setPicked({ schoolSlug: s, chapterSlug: c, name: n })}
            />
          )
        ) : (
          <>
            <ChapterAccessForm
              schoolSlug={picked.schoolSlug}
              chapterSlug={picked.chapterSlug}
              chapterName={picked.name}
              onClose={() => setPicked(null)}
              onDone={() => {
                // The demo source tag, against the REAL chapter being claimed. Best-effort —
                // a failed log must never cost an exec their claim confirmation.
                void logGreekEvent({ data: { kind: source === "demo-claim" ? "demo_claim" : "demo_page", schoolSlug: picked.schoolSlug, chapterSlug: picked.chapterSlug } }).catch(() => {});
                track("demo_adventure", { action: "claim_submitted", source });
              }}
            />
            <button type="button" onClick={() => setPicked(null)} className="mt-2 w-full text-[13px] font-bold" style={{ minHeight: 40, color: "var(--text-muted)" }}>
              ← Different chapter
            </button>
          </>
        )}
      </div>
    </div>
  );
}
