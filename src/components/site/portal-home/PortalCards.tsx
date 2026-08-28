// TWO-PORTAL HOME (experimental, /preview/home) — the Speechnotes two-card pattern in our skin.
//
// Two equal portals under a compressed hero: students left, Greek orgs right. Equal visual
// weight, trading off each other, almost no text — the symmetry IS the design, so both cards
// share ONE dimension set (same radius, same padding, same min-height) and any change to one
// card's frame must go through PORTAL_CARD so it cannot drift from the other's.
//
// Navy stays; these are bordered cream-on-navy cards on our own background — the structure is
// stolen from Speechnotes, the world is not.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, X } from "lucide-react";

import { Bolt, BRAND_BLUE, BRAND_DISPLAY, BRAND_RED, BRAND_SANS } from "@/components/canvas/brand";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { ChapterFinder } from "@/components/site/ChapterFinder";
import { listGoSchools } from "@/lib/greek-go.functions";
import { track } from "@/lib/analytics";
import { GreekLettersGlyph } from "@/components/site/portal-home/GreekLettersGlyph";

/** ONE frame for both cards — see the header note. */
const PORTAL_CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 20,
  padding: "26px 22px",
  minHeight: 252,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7)",
};

export const PORTAL_HOME_CSS = `
/* COMPRESSED HERO. The stock hero reserves ~80vh so the player peeks below the fold; on the
   portal home the PORTALS are the point and must be visible without scrolling on a laptop, so
   the reservation goes entirely. Two classes beat styles.css's single-class min-height. */
.sa-hero3.sa-hero3--compact { min-height: 0; }
@media (min-width: 1024px) {
  .sa-hero3.sa-hero3--compact { min-height: 0; }
  .sa-hero3--compact .sa-hero3-paper { width: 172px; margin-right: 3rem; }
}
/* THE CHEVRON — one small pointer between the portals and the player. Two gentle bounce cycles,
   then still: the header does the selling; this just points. */
@keyframes sa-portal-chevron { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(7px); } }
.sa-portal-chevron { animation: sa-portal-chevron 1.15s ease-in-out 0.5s 2; }
@media (prefers-reduced-motion: reduce) { .sa-portal-chevron { animation: none; } }
`;

/** THE PLAYER HEADER (+ chevron above it) — replaces any section header above the player on the
 *  portal home. Small caps, cream; one honest subline. */
export function PlayerHeaderFreePrep() {
  return (
    <div className="pb-1 pt-8 text-center" style={{ fontFamily: BRAND_SANS }}>
      <div aria-hidden className="mb-4 flex justify-center">
        <ChevronDown className="sa-portal-chevron h-5 w-5" style={{ color: "var(--accent)", opacity: 0.85 }} />
      </div>
      <p className="text-[12px] font-black" style={{ color: "var(--brand-cream)", letterSpacing: "0.18em" }}>
        COMPLETELY FREE EXAM PREP
      </p>
      <p className="mt-1.5 text-[14.5px]" style={{ color: "var(--text-muted)" }}>
        Exam 1 is free. No account needed.
      </p>
    </div>
  );
}

/** SPARK-ONCE BOLT — card 1's icon. Boils for a beat on card hover (desktop, motion allowed),
 *  then settles. This is the whole permitted spunk pass; nothing else on the cards moves. */
function SparkBolt({ hovered }: { hovered: boolean }) {
  const [reduced, setReduced] = useState(true); // static until the client answers — SSR-safe
  const [boiling, setBoiling] = useState(false);
  useEffect(() => { setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);
  useEffect(() => {
    if (!hovered || reduced) return;
    setBoiling(true);
    const t = window.setTimeout(() => setBoiling(false), 1400);
    return () => window.clearTimeout(t);
  }, [hovered, reduced]);
  return (
    <span aria-hidden className="inline-block" style={{ height: 44, width: 28 }}>
      {boiling ? <BoltBoil height={44} red={BRAND_RED} blue={BRAND_BLUE} /> : <Bolt c1={BRAND_RED} c2={BRAND_BLUE} />}
    </span>
  );
}

/** THE MINIMAL FINDER — school → organization list → that chapter's /go page. No auth exists
 *  yet, so the chapter page IS the portal destination; the finder's only job is routing there.
 *  Exported (08-27): the two-door homepage's "Find your chapter →" opens the SAME finder. */
export function ChapterFinderModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const schoolsQ = useQuery({ queryKey: ["go-schools"], queryFn: () => listGoSchools(), staleTime: 600_000, networkMode: "always" });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center sm:items-center sm:px-4" style={{ background: "rgba(5,8,16,0.72)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Find your chapter"
        className="w-full max-w-[420px] rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: "var(--bg-overlay)", border: "1px solid var(--border-default)", boxShadow: "0 30px 70px -20px rgba(0,0,0,0.85)", paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>Find your chapter</h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10" style={{ color: "var(--brand-cream)" }} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {schoolsQ.isLoading ? (
          <p className="py-6 text-center text-[13.5px]" style={{ color: "var(--text-muted)" }}>Loading schools…</p>
        ) : (
          <ChapterFinder
            schools={schoolsQ.data ?? []}
            autoPick
            escapeHatches
            onPick={(s, c) => {
              void navigate({ to: "/go/$school/$chapter", params: { school: s, chapter: c } });
            }}
          />
        )}
      </div>
    </div>
  );
}

export function PortalCards({ onStartExam1 }: {
  /** Card 1's primary CTA — the SAME behavior as the hero CTA (scroll to the player, focus Exam 1). */
  onStartExam1: () => void;
}) {
  const [hover1, setHover1] = useState(false);
  const [hover2, setHover2] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);

  const H3: React.CSSProperties = { fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)", fontSize: 23, fontWeight: 900, letterSpacing: "-0.01em" };

  return (
    <section aria-label="Choose your door" className="pb-1 pt-2" style={{ fontFamily: BRAND_SANS }}>
      <div className="mx-auto grid w-full max-w-[880px] gap-4 sm:grid-cols-2">
        {/* CARD 1 — STUDENTS (first in DOM, so it stacks first on mobile). */}
        <div style={PORTAL_CARD} onMouseEnter={() => setHover1(true)} onMouseLeave={() => setHover1(false)}>
          <SparkBolt hovered={hover1} />
          <h3 className="mt-3" style={H3}>Start Cramming</h3>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => { track("portal_door_selected", { door: "start_cramming" }); onStartExam1(); }}
            className="mt-5 w-full rounded-xl px-6 text-[15.5px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2"
            style={{ minHeight: 54, background: "var(--accent)", color: "#0B1220", boxShadow: "0 18px 44px -16px rgba(252,163,17,0.55)" }}
          >
            Cram Exam 1 Free ⚡
          </button>
          <p className="mt-2.5 text-[12.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
            Free. No account, no card. Exams 2, 3 and the Final live here too.
          </p>
        </div>

        {/* CARD 2 — GREEK. Same frame, navy/cream CTA of equal size — the two doors trade off
            each other rather than one outranking the other. */}
        <div style={PORTAL_CARD} onMouseEnter={() => setHover2(true)} onMouseLeave={() => setHover2(false)}>
          <span className="grid" style={{ height: 44, alignItems: "center" }}>
            <GreekLettersGlyph active={hover2} fontSize={32} />
          </span>
          <h3 className="mt-3" style={H3}>Greek Portal</h3>
          <p className="mt-1 text-[13.5px]" style={{ color: "var(--text-muted)" }}>Enter through your organization.</p>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => { track("portal_door_selected", { door: "find_chapter" }); setFinderOpen(true); }}
            className="mt-5 w-full rounded-xl px-6 text-[15.5px] font-black transition-transform hover:scale-[1.02] focus-visible:ring-2"
            style={{ minHeight: 54, background: "var(--bg-surface)", border: "1.5px solid var(--brand-cream)", color: "var(--brand-cream)" }}
          >
            Find your chapter →
          </button>
          <a
            href="/go/demo"
            className="mt-2.5 text-[12.5px] font-bold underline underline-offset-4"
            style={{ color: "var(--text-muted)", minHeight: 32, display: "inline-flex", alignItems: "center" }}
            onClick={() => track("portal_door_selected", { door: "demo" })}
          >
            Just looking? See a demo chapter →
          </a>
        </div>
      </div>

      {finderOpen && <ChapterFinderModal onClose={() => setFinderOpen(false)} />}
    </section>
  );
}
