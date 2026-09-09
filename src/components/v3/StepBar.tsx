// THE STEP BAR — the buttons at the top of every Blast Off step screen.
//
// Lee (2026-09-02): "What we want is maybe three buttons at the top —
// Step 1: Talkthrough · Step 2: Generate Results · Step 3: Send to filming."
// The previous "Talkthrough studio ↗" link left the breadcrumb trail and got
// him stuck; nothing here leaves /v3. Each button is a real URL so the
// browser's back button walks the steps too.
//
// FOUR STEPS NOW (Lee, 2026-09-05: "go ahead and fold Arrange into Review,
// renumber the steps... Step 3: Film Step 4: Post"). Arrange's own job —
// "the ideas become reusable elements dropped between slides, review each
// slide, add and remove" — was already Review's job in its own words ("see
// the slides, edit, add, skip, rearrange"); Review's blurb below says so
// explicitly now, and the Arrange URL redirects into Review rather than
// disappearing, so an old link or bookmark still lands somewhere real. Film
// gets its own numbered step for the first time (it always had its own page,
// just never its own door — see the old "arrange"'s "Capture in-page →"
// link, now redundant since Film is a step click away). Post got its page
// 2026-09-06 (/v3/post — a cross-set queue, not nested under a topic/set).
//
// RENAMED, AND A FIFTH (Lee, 2026-09-07): "I think Review should be named Editor.
// Talkthrough should be brainstorm. Rehearse & Film, because I want teleprompter to
// live here, during review the lines. #4 Cross-post" — and "I'd love a Step 5:
// Improve Process." Labels only: the step ids and the URL segments (talkthrough ·
// results · film · post) are unchanged, so bookmarks, the timer's path detection
// (lib/production-time.ts) and the deployed routes all still resolve. The fifth step
// nests under the set like the others (/blast-off/improve) and isn't timed.
// 2026-09-07: no teleprompter on the Editor — lines are made on Rehearse & Film
// (rounds + the rehearsal review).
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { blastOffPath, type BlastOffStep } from "./use-bank";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "./Shell";

/** The numbered steps — the BlastOffStep vocabulary minus "arrange", which keeps its URL
 *  (a redirect into the Editor) but has had no door since 2026-09-05. Five since 2026-09-07. */
/** ...and, since 2026-09-08, minus "suggestions", which has a page and a door but deliberately
 *  no number — numbering it would renumber four steps Lee has in his head. */
export type NumberedStep = Exclude<BlastOffStep, "arrange" | "suggestions">;

export const STEPS: readonly { step: NumberedStep; n: number; label: string; blurb: string; soon?: boolean }[] = [
  // 2026-09-07: "Talkthrough" → "Brainstorm" (id and URL still talkthrough).
  { step: "talkthrough", n: 1, label: "Brainstorm", blurb: "Talk the set through out loud — or an exhibit — and stamp what's worth keeping." },
  // Lee (2026-09-03): "Review is seeing the filming draft as it stands …
  // getting it SOLID before I do the film run." The AI board folds under it.
  // 2026-09-07: "Review" → "Editor" (id and URL still results); the teleprompter left this step.
  { step: "results", n: 2, label: "Editor", blurb: "The film draft: order and skip slides, fix the cards, drop in callouts, pictures, camera. The AI board folds underneath." },
  // 2026-09-07: "Film" → "Rehearse & Film" — "I want teleprompter to live here, during review the lines."
  { step: "film", n: 3, label: "Rehearse & Film", blurb: "Rounds with the teleprompter, then the take — one frame at a time, nothing else in the shot." },
  // Post got its own page 2026-09-06 — a cross-set queue at /v3/post (blastOffPath special-cases
  // this step to point there instead of nesting under the current topic/set).
  // 2026-09-07: "Post" → "Cross-post" (id and URL still post).
  { step: "post", n: 4, label: "Cross-post", blurb: "Captions, exports, every destination — queued across every topic and set." },
  // STEP 5 (Lee, 2026-09-07: "I'd love a Step 5: Improve Process."). A real door to a real page
  // (/blast-off/improve — components/v3/improve/ImprovePage.tsx); not timed (production-time.ts).
  // Renamed the same day — "I want to call the improve process 'Iterate' instead." — label only;
  // the id and the URL segment stay `improve`.
  { step: "improve", n: 5, label: "Iterate", blurb: "Time to beat, cost per short, where the minutes went — and what to change, before the next set or at the next topic." },
];

/** Is the step bar folded away? Lee, 2026-09-09: "I also kind of like the idea of steps one
 *  through five existing up there in the top hidden… and just for fun make the nav bar black to
 *  kind of separate it. So those steps could be hidden up there, but make sure the split card
 *  doesn't get hidden." Remembered per browser: the Editor is where he spends the hour, and he
 *  should not have to fold the same bar every visit. */
const FOLD_KEY = "sa-stepbar-folded";
const readFolded = (): boolean => {
  try { return localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; }
};

export function StepBar({ topic, set, active, right }: {
  topic: BoothTopic; set: BoothSetInfo; active: BlastOffStep;
  /** Anything that belongs on the right of the bar (a secondary link). It stays visible when the
   *  steps are folded — that is where ✂ Split lives, and Lee asked for it not to be hidden. */
  right?: ReactNode;
}) {
  const [folded, setFolded] = useState(false);
  // Read after mount: the server has no localStorage, and an unfolded first paint that folds is
  // better than a hydration mismatch.
  useEffect(() => { setFolded(readFolded()); }, []);
  const fold = (v: boolean) => { setFolded(v); try { localStorage.setItem(FOLD_KEY, v ? "1" : "0"); } catch { /* cosmetic */ } };
  const current = STEPS.find((s) => s.step === active);

  return (
    <div className="flex items-center gap-2" style={{
      marginBottom: 16, flexWrap: "wrap",
      // BLACK, to separate it from the work below (his words: "make the nav bar black to kind of
      // separate it"). The bar is chrome; the draft is the page.
      background: "#05070D", border: `1px solid ${V3_EDGE}`, borderRadius: 14, padding: folded ? "6px 10px" : "8px 10px",
    }}>
      <button onClick={() => fold(!folded)} title={folded ? "Show the steps" : "Hide the steps"} aria-expanded={!folded}
        style={{ background: "transparent", border: `1px solid ${V3_EDGE}`, borderRadius: 9, color: V3_MUTED, cursor: "pointer", padding: "4px 8px", fontSize: 12, lineHeight: 1 }}>
        {folded ? "▾" : "▴"}
      </button>
      {folded && (
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: V3_MUTED }}>
            {active === "suggestions" ? "" : `Step ${current?.n ?? ""}`}
          </span>
          <span style={{ fontFamily: V3_DISPLAY, fontWeight: 800, fontSize: 14, color: V3_CREAM }}>
            {active === "suggestions" ? "💡 Suggestions" : current?.label ?? ""}
          </span>
        </span>
      )}
      {!folded && <StepBarSteps topic={topic} set={set} active={active} />}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

function StepBarSteps({ topic, set, active }: { topic: BoothTopic; set: BoothSetInfo; active: BlastOffStep }) {
  return (
    <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
      {/* SUGGESTIONS — a door, not a numbered step (2026-09-08). Lee: "It should take me to a
          separate page honestly. The editor page is for AFTER we've reviewed." It sits where it
          belongs, between talking and building, but deliberately carries NO number: numbering it
          would renumber Editor, Film, Cross-post and Iterate, and those numbers are in his head,
          in the timer's path detection and in half the docs. */}
      {STEPS.map((s) => {
        const suggestions = s.step === "results" ? (
          <Link key="suggestions" to={blastOffPath(topic, set, "suggestions")}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2"
            style={{
              border: `1.5px dashed ${active === "suggestions" ? V3_GOLD : V3_EDGE}`,
              background: active === "suggestions" ? "rgba(252,163,17,0.12)" : "transparent",
              color: active === "suggestions" ? V3_CREAM : V3_MUTED,
              textDecoration: "none",
            }}
            title="Everything the brainstorm suggested, on its own page — add the ones worth filming, then go to the Editor.">
            <span style={{ fontFamily: V3_DISPLAY, fontWeight: 800, fontSize: 14 }}>💡 Suggestions</span>
          </Link>
        ) : null;
        return <StepPill key={s.step} s={s} topic={topic} set={set} active={active} before={suggestions} />;
      })}
    </div>
  );
}

function StepPill({ s, topic, set, active, before }: {
  s: (typeof STEPS)[number]; topic: BoothTopic; set: BoothSetInfo; active: BlastOffStep; before?: ReactNode;
}) {
  return (
    <>
      {before}
      {(() => {
        const on = s.step === active;
        const kicker = (
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: on ? V3_GOLD : V3_MUTED }}>
            Step {s.n}
          </span>
        );
        const label = <span style={{ fontFamily: V3_DISPLAY, fontWeight: 800, fontSize: 14 }}>{s.label}</span>;
        // A step with no page yet is a plain pill, not a link — Door.tsx's own "soon" rule, so
        // it never 404s and reads as "coming", not broken. (Post was the example until it got
        // its page on 2026-09-06; nothing sets `soon` today, the rule stays for the next one.)
        if (s.soon) {
          return (
            <span key={s.step} className="flex items-center gap-2 rounded-xl px-3.5 py-2" title={s.blurb} aria-disabled
              style={{ border: `1.5px solid ${V3_EDGE}`, color: V3_MUTED, opacity: 0.5, cursor: "not-allowed" }}>
              {kicker}{label}
            </span>
          );
        }
        return (
          <Link
            key={s.step}
            to={blastOffPath(topic, set, s.step)}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2"
            style={{
              border: `1.5px solid ${on ? V3_GOLD : V3_EDGE}`,
              background: on ? "rgba(252,163,17,0.12)" : "transparent",
              color: on ? V3_CREAM : V3_MUTED,
              textDecoration: "none",
            }}
            title={s.blurb}
          >
            {kicker}{label}
          </Link>
        );
      })()}
    </>
  );
}
