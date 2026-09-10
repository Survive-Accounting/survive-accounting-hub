// /v3/$topic/$set/blast-off/film — STEP 3. Capture.
//
// The /blast-off capture surface (components/blastoff/BlastOffCapture.tsx — it
// lived inside BlastOffEditor.tsx until 2026-09-04),
// full screen: one frame, spacebar forward, nothing else in the shot — OBS
// captures this window. No V3 shell here on purpose; Escape goes back to the
// step menu. This is Step 3 of four in its own right since 2026-09-05 (StepBar.tsx);
// the canvas's own film surface (bolt cursor, spotlight, pin) is reached only from the
// old, non-V3 /blast-off route now — nothing in V3 points there.
// 2026-09-07: named REHEARSE & FILM (Lee: "Rehearse & Film, because I want teleprompter to live
// here, during review the lines") — the rounds, the rehearsal review and the prompter pop-out
// all live in BlastOffCapture; the Editor step shows no lines any more. URL still /film.
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BlastOffCapture } from "@/components/blastoff/BlastOffCapture";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/film")({
  // ?popout=1 marks the 9:16 pop-out window (components/blastoff/capture/popout.ts). Rehearsal
  // (2026-09-06, second pass) used to be a separate ?rehearse=1 screen here — Lee: "I'd prefer to
  // see it somewhere on film" — so it moved INTO BlastOffCapture itself (the R toggle in its
  // chrome bar); this route is back to one surface again.
  //
  // ?take=N (2026-09-09) films ONE split — the Nth run between cuts (plan.ts planTakes, 0-based),
  // the same numbering /v3/post's rows use. Lee: "I only did account classification > assets. Not
  // the full thing." A finite integer ≥ 0 or nothing; out of range is BlastOffCapture's to say
  // (it films the whole set and shows a chip). The pop-out copies the URL verbatim, so it inherits
  // the take and both windows walk the same frames.
  validateSearch: (s: Record<string, unknown>): { popout?: 1; take?: number } => {
    const take = Number(s.take);
    return {
      ...(s.popout === 1 || s.popout === "1" || s.popout === true ? { popout: 1 as const } : {}),
      ...(s.take !== undefined && s.take !== null && s.take !== "" && Number.isInteger(take) && take >= 0 ? { take } : {}),
    };
  },
  component: () => <AdminGate><V3Film /></AdminGate>,
  head: () => ({ meta: [{ title: "🎬 Rehearse & Film — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Film() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { take } = Route.useSearch();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  const crumbs = [
    { label: "V3", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Rehearse & Film" },
  ];

  if (set && topic) {
    const exit = () => void navigate({ to: blastOffPath(topic, set) });
    // Still no V3Shell — but the same crumbs it would draw (Lee, 2026-09-07: "Show navigation
    // breadcrumbs on /film"): BlastOffCapture draws them small, top-left, chrome-only, main
    // window only, so they can never be in the shot.
    return <BlastOffCapture set={set} topicName={topic.name} onExit={exit} crumbs={crumbs} take={take} />;
  }

  return (
    <V3Shell crumbs={crumbs}>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}
    </V3Shell>
  );
}
