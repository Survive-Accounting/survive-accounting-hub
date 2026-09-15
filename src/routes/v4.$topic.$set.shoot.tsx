// /v4/$topic/$set/shoot — the film tool, in v4 (Lee, 2026-09-14: "clicking film will take me a /v4 version of
// …/blast-off/film … and once I finish one split, it will just let me navigate to the next one right away and
// keep filming"). The same capture as /v3's Rehearse & Film (?take, ?frame, ?popout — the pop-out copies this
// URL), opened in the same tab from the v4 Film list; Esc goes back to that list, and ] / "Next video" move
// through the splits in place.
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BlastOffCapture } from "@/components/blastoff/BlastOffCapture";
import { useV3Set } from "@/components/v3/use-bank";
import { FilmTopLinks } from "@/components/v4/stitch-room/FilmTopLinks";
import { V3Note, V3Shell } from "@/components/v3/Shell";

export const Route = createFileRoute("/v4/$topic/$set/shoot")({
  validateSearch: (s: Record<string, unknown>): { popout?: 1; take?: number; frame?: string } => {
    const take = Number(s.take);
    return {
      ...(s.popout === 1 || s.popout === "1" || s.popout === true ? { popout: 1 as const } : {}),
      ...(s.take !== undefined && s.take !== null && s.take !== "" && Number.isInteger(take) && take >= 0 ? { take } : {}),
      ...(typeof s.frame === "string" && s.frame ? { frame: s.frame } : {}),
    };
  },
  component: () => <AdminGate><V4Shoot /></AdminGate>,
  head: () => ({ meta: [{ title: "🎬 Film — v4" }, { name: "robots", content: "noindex" }] }),
});

function V4Shoot() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { take, frame } = Route.useSearch();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  const crumbs = [
    { label: "V4", to: "/v4" },
    { label: set?.name ?? setKey, to: `/v4/${topicKey}/${setKey}/film` },
    { label: "Film" },
  ];
  if (set && topic) {
    const exit = () => void navigate({ to: "/v4/$topic/$set/$step", params: { topic: topicKey, set: setKey, step: "film" } });
    return <BlastOffCapture set={set} topicName={topic.name} onExit={exit} crumbs={crumbs} topLinks={<FilmTopLinks />} skipOutro take={take ?? 0} startFrameId={frame} />;
  }
  return (
    <V3Shell crumbs={crumbs}>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}”.</V3Note>}
    </V3Shell>
  );
}
