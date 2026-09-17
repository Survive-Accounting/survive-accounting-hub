// THE HERO (redesign, 2026-09-11 — docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md §2). Centred on
// every tier:
//
//                        Like Reels for exam prep.
//                Start with the easy points. Cram videos around a minute each; practice that looks like your test.
//                       [ Start cramming for free ]
//                           ~2.4 min per video
//
// One button. "Start cramming for free" (the polish brief, 09-11 — was "Get started") opens the
// first playable video through the existing mechanism, or — with nothing playable yet — scrolls to
// Easy Points, focuses its first card and outlines the row once, so the click always lands.
//
// THE PANEL (the polish brief, 09-11: "The hero currently feels slightly bare floating on the cream
// background … a subtle contained hero treatment"): a rounded panel one step lighter than the
// canvas, a hairline border, the room's soft shadow, a campus-colour radial glow in two corners
// at low opacity and the real bolt (canvas/brand's BOLT_OUTER) as a faint watermark — CSS and the
// brand path only, no image. Padding is tighter than before so Easy Points starts higher.
// The caption is averageVideoCaption over the exam's timed sets (learn-gate.ts) and is simply
// absent until a runtime exists — a real number or none. "See what's on the exam" is gone, and so
// is the meta row: the navbar (LearnTop) carries the bolt, the campus, the course and the exam.
//
// THE HERO GROUND (2026-09-11): the entrance paints with --lk-hero-* — the canvas's own values in
// every look but "split", where LearnHome puts this section on a full-bleed navy band above the
// cream rows. Same JSX, one more set of variables.
//
// The display face and the button are the home page's tokens (learn-theme: DISPLAY = BRAND_DISPLAY,
// .lk-btn-cta = the door button's geometry). Copy rule: no "run" / "blast" / "pledge", no emoji.
import { BOLT_OUTER, BOLT_VIEWBOX } from "@/components/canvas/brand";
import { LK, SANS } from "@/components/learn/learn-theme";
import type { Tier } from "@/components/learn/use-tier";

export const HERO_CSS = `
.lk-hero { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; border-radius: 22px; border: 1px solid var(--lk-border); background: color-mix(in srgb, var(--lk-surface) 72%, var(--lk-hero-bg)); box-shadow: var(--lk-shadow); }
.lk-hero > * { position: relative; }
.lk-hero-glow { position: absolute; width: 380px; height: 380px; border-radius: 999px; pointer-events: none; background: radial-gradient(circle, color-mix(in srgb, var(--lk-acc) 16%, transparent), transparent 62%); }
.lk-hero-glow[data-corner="tl"] { left: -140px; top: -180px; }
.lk-hero-glow[data-corner="br"] { right: -150px; bottom: -200px; }
.lk-hero-mark { position: absolute; right: 3%; top: -12%; height: 124%; width: auto; color: var(--lk-acc); opacity: .055; transform: rotate(9deg); pointer-events: none; }
@media (prefers-reduced-motion: no-preference) { .lk-hero .lk-btn-cta { transition: transform 160ms ease, box-shadow 160ms ease; } }
`;

// THE EXEC HERO (Lee, 2026-09-16: "For a council link and for a chapter scholarship chair link… it's more about
// boosting gpas for their chapter or for members. the main cta should be the sharing, but they can try the
// product too. if they hit that button, it should just open how survive works video"). Same panel, left-set:
// the council's or the house's name up top, the GPA line, Share as the button, See how it works beside it, and
// only real counts in the chips (stripWords — "Be the first from ΣΧ." when nobody is in yet).
export type ExecRole = "council" | "chair";
export function ExecEntrance({ tier, role, schoolName, councilName, chapterShort, membersLine, onShare, onHow, onMember }: {
  tier: Tier;
  role: ExecRole;
  schoolName: string;
  /** "Interfraternity Council" on a council link, else null. */
  councilName: string | null;
  /** "ΣΧ" on a chair's link, else null. */
  chapterShort: string | null;
  /** stripWords().head — "13 other members are cramming" / "Be the first from ΣΧ." — or null with no chapter. */
  membersLine: string | null;
  onShare: () => void;
  onHow: () => void;
  /** "I'm a member" — back to the student hero. */
  onMember: () => void;
}) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const council = role === "council";
  const displaySize = narrow ? 27 : wide ? 38 : 32;
  const eyebrow = council ? `${councilName ?? "Your council"} · ${schoolName}` : `${chapterShort ?? "Your chapter"} · ${schoolName} · Scholarship chair`;
  const chip = (text: string, on = false): React.ReactNode => (
    <span key={text} style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "5px 11px", border: `1px solid ${on ? LK.green : LK.border}`, color: on ? LK.green : LK.heroMuted, background: LK.surface, fontFamily: SANS }}>{text}</span>
  );
  return (
    <section aria-label={council ? "For council execs" : "For chapter chairs"} className="lk-hero" data-tier={tier} style={{ gap: narrow ? 8 : 10, alignItems: "flex-start", textAlign: "left", padding: narrow ? "20px 16px 18px" : wide ? "28px 32px 26px" : "24px 24px 22px", borderColor: LK.acc }}>
      <style>{HERO_CSS}</style>
      <span aria-hidden className="lk-hero-glow" data-corner="tl" />
      <span aria-hidden className="lk-hero-glow" data-corner="br" />
      <svg aria-hidden className="lk-hero-mark" viewBox={BOLT_VIEWBOX} focusable="false"><path d={BOLT_OUTER} fill="currentColor" /></svg>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: LK.acc, fontFamily: SANS }}>{eyebrow}</div>
      <h1 className="lk-disp" style={{ margin: 0, fontSize: displaySize, lineHeight: 1.05, letterSpacing: "-0.015em", color: LK.heroText, textWrap: "balance", maxWidth: 640 }}>
        {council ? <>Raise the GPA of <span style={{ color: LK.acc }}>every house</span> on campus.</> : <>Boost your chapter&apos;s GPA <span style={{ color: LK.acc }}>before Exam 1.</span></>}
      </h1>
      <p style={{ margin: 0, fontSize: narrow ? 14.5 : 16, lineHeight: 1.45, color: LK.heroMuted, fontFamily: SANS, maxWidth: 560, textWrap: "balance" }}>
        {council
          ? "Free Exam 1 prep, built for members. One link for your chairs. Every chapter gets its own page and its own numbers."
          : "Free cram videos and practice for Exam 1. Send the link to the house; this page counts who's in."}
      </p>
      <div className="flex flex-wrap items-center" style={{ gap: 10, marginTop: narrow ? 4 : 6 }}>
        <button type="button" onClick={onShare} data-gm-cta={council ? "exec-share-chairs" : "exec-share-house"} className="lk-btn-cta" style={{ boxShadow: LK.shadow }}>
          {council ? "Share with chapter chairs ↻" : "Share with your members ↻"}
        </button>
        <button type="button" onClick={onHow} data-gm-cta="exec-how" className="lk-btn lk-btn-ghost" style={{ minHeight: 46, fontSize: 13.5, padding: "0 16px" }}>▶ See how it works · 0:36</button>
      </div>
      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 4 }}>
        {membersLine && chip(membersLine, /cramming/i.test(membersLine))}
        {chip("Exam 1 · free")}
        {chip(council ? "No sign-up for members" : "Takes 30 seconds to send")}
      </div>
      {council && (
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3, 1fr)", gap: 8, marginTop: 8, width: "100%", maxWidth: 720, fontFamily: SANS }}>
          {[["Their own page", "The chapter's name on it, members counted."], ["Who's cramming", "Each house page says how many members are in."], ["Zero cost", "Exam 1 is free. Nothing to buy, nothing to install."]].map(([h, b]) => (
            <div key={h} style={{ border: `1px solid ${LK.border}`, borderRadius: 10, padding: "9px 11px", background: LK.surface }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: LK.text }}>{h}</div>
              <div style={{ fontSize: 12, color: LK.muted, marginTop: 2, lineHeight: 1.4 }}>{b}</div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={onMember} className="underline underline-offset-4" style={{ background: "none", border: 0, padding: "4px 0 0", cursor: "pointer", color: LK.heroMuted, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, minHeight: 32 }}>
        I&apos;m a member, not on exec →
      </button>
    </section>
  );
}

export function LearnEntrance({ tier, onStart }: {
  tier: Tier;
  onStart: () => void;
}) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const displaySize = narrow ? 29 : wide ? 42 : 34;
  return (
    <section aria-label="Welcome" className="lk-hero" data-tier={tier} style={{ gap: narrow ? 8 : 10, padding: narrow ? "22px 16px 20px" : wide ? "30px 32px 28px" : "26px 24px 24px" }}>
      <style>{HERO_CSS}</style>
      <span aria-hidden className="lk-hero-glow" data-corner="tl" />
      <span aria-hidden className="lk-hero-glow" data-corner="br" />
      <svg aria-hidden className="lk-hero-mark" viewBox={BOLT_VIEWBOX} focusable="false"><path d={BOLT_OUTER} fill="currentColor" /></svg>
      <h1 className="lk-disp" style={{ margin: 0, fontSize: displaySize, lineHeight: 1.05, letterSpacing: "-0.015em", color: LK.heroText, textWrap: "balance", maxWidth: 720 }}>
        Cram what&apos;s on <span style={{ color: LK.acc }}>Exam 1</span>.
      </h1>
      <p style={{ margin: 0, fontSize: narrow ? 15 : 17, lineHeight: 1.45, color: LK.heroMuted, fontFamily: SANS, maxWidth: 560, textWrap: "balance" }}>
        Start with the easy points. Cram videos around a minute each; practice that looks like your test.
      </p>
      <div className="flex flex-col items-center" style={{ gap: 6, marginTop: narrow ? 4 : 6 }}>
        {/* King's testing notes (2026-09-14): no "for free" on the button, and no "~0.6 min per video"
            under it — every card already shows its own length. */}
        <button type="button" onClick={onStart} data-gm-cta="start" className="lk-btn-cta" style={{ minWidth: narrow ? 240 : 260, boxShadow: LK.shadow }}>
          Start cramming
        </button>
      </div>
    </section>
  );
}
