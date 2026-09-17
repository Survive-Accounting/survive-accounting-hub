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
import { useEffect, useState } from "react";

import { BOLT_OUTER, BOLT_VIEWBOX } from "@/components/canvas/brand";
import { chairHero, COUNCIL_CHIPS, COUNCIL_STEPS, councilHero } from "@/lib/acquisition-copy";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
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

// THE EXEC HERO. Council page job: SEND THE PORTAL TO CHAPTER CHAIRS. Chapter chair page job: COPY THE GROUPME POST
// AND SEND IT. (Lee, 2026-09-17: evergreen — "STOP making the council/chapter acquisition experience revolve around
// 'Exam 1 is free'".) The words live in lib/acquisition-copy; the GroupMe post and the member link are built by the
// route from the same share-url helper the toolkit uses, so the copy here and the copy in the kit are identical.
// Headline, one sentence, primary, secondary — the bolt stays a faint background mark and never narrows the text.
export type ExecRole = "council" | "chair";
export function ExecEntrance({ tier, role, schoolName, courseCode, councilName, chapterShort, membersLine, groupMePost, memberPreviewHref, onShare, onCopied, onHow, onMember }: {
  tier: Tier;
  role: ExecRole;
  schoolName: string;
  courseCode: string | null;
  /** "Interfraternity Council" on a council link, else null. */
  councilName: string | null;
  /** "ΣΝ" on a chair's link, else null. */
  chapterShort: string | null;
  /** "12 ΣΝ members are cramming" — only when the real count is above zero; null otherwise. */
  membersLine: string | null;
  /** The chapter's GroupMe post with its tracked member link (chair, chapter known); null otherwise. */
  groupMePost: string | null;
  /** The student-facing chapter page (chair, chapter known). */
  memberPreviewHref: string | null;
  /** Council: open the chairs' kit. Chair without a chapter yet: pick the chapter first. */
  onShare: () => void;
  /** The GroupMe post landed on the clipboard (for tracking). */
  onCopied?: () => void;
  onHow: () => void;
  /** "I'm a member" — back to the student hero. */
  onMember: () => void;
}) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const council = role === "council";
  const displaySize = narrow ? 28 : wide ? 40 : 34;
  const eyebrow = council ? `${councilName ?? "Your council"} · ${schoolName}` : `${chapterShort ?? "Your chapter"} · ${schoolName} · Scholarship chair`;
  const copy = council ? councilHero({ courseCode, schoolName }) : chairHero({ courseCode, chapter: chapterShort });
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => { if (copied === "idle") return; const t = window.setTimeout(() => setCopied("idle"), 2200); return () => window.clearTimeout(t); }, [copied]);
  const copyPost = async () => {
    if (!groupMePost) { onShare(); return; }
    const ok = await copyToClipboard(groupMePost);
    setCopied(ok ? "ok" : "fail");
    if (ok) onCopied?.();
  };
  const chip = (text: string, on = false): React.ReactNode => (
    <span key={text} style={{ fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: "5px 11px", border: `1px solid ${on ? LK.green : LK.border}`, color: on ? LK.green : LK.heroMuted, background: LK.surface, fontFamily: SANS, whiteSpace: "normal" }}>{text}</span>
  );
  const primaryLabel = council
    ? copy.primary
    : !groupMePost ? "Choose your chapter"
    : copied === "ok" ? "Copied — paste it in GroupMe" : copied === "fail" ? "Couldn't copy — try again" : copy.primary;
  return (
    <section aria-label={council ? "For council execs" : "For chapter chairs"} className="lk-hero" data-tier={tier} style={{ gap: narrow ? 10 : 12, alignItems: "flex-start", textAlign: "left", padding: narrow ? "20px 16px 18px" : wide ? "30px 34px 28px" : "26px 26px 24px", borderColor: LK.acc }}>
      <style>{HERO_CSS}</style>
      <span aria-hidden className="lk-hero-glow" data-corner="tl" />
      <span aria-hidden className="lk-hero-glow" data-corner="br" />
      <svg aria-hidden className="lk-hero-mark" viewBox={BOLT_VIEWBOX} focusable="false"><path d={BOLT_OUTER} fill="currentColor" /></svg>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: LK.acc, fontFamily: SANS }}>{eyebrow}</div>
      <h1 className="lk-disp" style={{ margin: 0, fontSize: displaySize, lineHeight: 1.04, letterSpacing: "-0.015em", color: LK.heroText, textWrap: "balance", maxWidth: 720 }}>
        {copy.headline}
      </h1>
      <p style={{ margin: 0, fontSize: narrow ? 15 : 16.5, lineHeight: 1.45, color: LK.heroMuted, fontFamily: SANS, maxWidth: 620, textWrap: "pretty" }}>
        {copy.sub}
      </p>
      <div className="flex flex-wrap items-center" style={{ gap: 10, marginTop: narrow ? 2 : 4, width: narrow ? "100%" : undefined }}>
        <button type="button" onClick={council ? onShare : () => void copyPost()} data-gm-cta={council ? "exec-send-chairs" : "exec-copy-groupme"} className="lk-btn-cta" aria-live="polite"
          style={{ boxShadow: LK.shadow, ...(narrow ? { width: "100%" } : {}), ...(copied === "ok" ? { background: LK.green } : {}) }}>
          {primaryLabel}
        </button>
        {council ? (
          <button type="button" onClick={onHow} data-gm-cta="exec-how" className="lk-btn lk-btn-ghost" style={{ minHeight: 46, fontSize: 13.5, padding: "0 16px", ...(narrow ? { width: "100%" } : {}) }}>▶ See how it works · 0:36</button>
        ) : memberPreviewHref ? (
          <a href={memberPreviewHref} target="_blank" rel="noopener" data-gm-cta="exec-preview-member" className="lk-btn lk-btn-ghost" style={{ minHeight: 46, fontSize: 13.5, padding: "0 16px", textDecoration: "none", ...(narrow ? { width: "100%" } : {}) }}>{chairHero({ courseCode, chapter: chapterShort }).secondary} ↗</a>
        ) : null}
      </div>
      {council ? (
        <>
          {/* THE WORKFLOW, three beats, one line on a desk — visually lightweight. */}
          <ol aria-label="How it works" style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: narrow ? 6 : 8, fontFamily: SANS }}>
            {COUNCIL_STEPS.map((s, i) => (
              <li key={s} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: LK.heroText }}>
                <span aria-hidden style={{ display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: 999, background: LK.acc, color: LK.accInk, fontSize: 11, fontWeight: 900 }}>{i + 1}</span>
                {s}
                {i < COUNCIL_STEPS.length - 1 && !narrow && <span aria-hidden style={{ color: LK.heroMuted, marginLeft: 1 }}>→</span>}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap" style={{ gap: 8 }}>{COUNCIL_CHIPS.map((c) => chip(c))}</div>
        </>
      ) : (
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          {membersLine && chip(membersLine, true)}
          <button type="button" onClick={onHow} data-gm-cta="exec-how" className="underline underline-offset-4" style={{ background: "none", border: 0, padding: "4px 0", cursor: "pointer", color: LK.heroMuted, fontFamily: SANS, fontSize: 13, fontWeight: 700, minHeight: 32 }}>▶ See how it works · 0:36</button>
        </div>
      )}
      <button type="button" onClick={onMember} className="underline underline-offset-4" style={{ background: "none", border: 0, padding: "2px 0 0", cursor: "pointer", color: LK.heroMuted, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, minHeight: 32 }}>
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
