// /v3/$topic/$set — WHAT ARE YOU MAKING? Three doors, one live.
//
// Lee's spec (2026-09-01): "there's three options — you can do the rocket ship
// which is blast off, the exam icon is the practice which we'll build later, and
// the review video is the grad cap. Make these kind of big buttons."
//
// Practice and Review render as REAL, VISIBLY DISABLED doors rather than being
// hidden. The shape of the thing is the point: every set gets three kinds of
// video, and seeing the two that don't exist yet is what makes that obvious —
// to Lee tomorrow, and to whoever builds them.
//
// V3 is Blast Off only, so that is the one door that opens — and it opens
// INTO V3 (/v3/$topic/$set/blast-off), not out to the old /blast-off. Lee, on
// the move (2026-09-02): "the design is right, the route is wrong."
//
// This is an INDEX route (v3.$topic.$set.index.tsx) so the blast-off screens
// are flat siblings under the same URL prefix rather than children rendered
// inside this one — each screen is its own whole surface.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { branchProblem, DECK_LANES, LANE_HINT, LANE_LABEL, laneOf, type DeckLane } from "@/lib/deck-lane";
import { setDeckLane } from "@/lib/blastoff.functions";
import { orderedSets } from "@/lib/v3-topic-groups";
import { refreshBank, slugOf } from "@/components/v3/use-bank";
import { GraduationCap, Rocket, ClipboardList } from "lucide-react";

import { Door } from "@/components/v3/Door";
import { usePlan } from "@/components/blastoff/BlastOffEditor";
import { LAYOUTS, LAYOUT_LABEL, isLayout } from "@/components/blastoff/layout";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_DISPLAY, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/")({
  component: V3Set,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Set() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  return (
    <V3Shell
      crumbs={[
        { label: "V3", to: "/v3" },
        { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
        { label: set?.name ?? setKey },
      ]}
    >
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <>
          <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 36, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px", textWrap: "balance" }}>
            {set.name}
          </h1>
          <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 30 }}>
            {topic.kind === "strategy"
              ? "Strategy short · no questions, just the points — riff it"
              : <>{topic.name} · {set.liveCount} question{set.liveCount === 1 ? "" : "s"}{set.draftCount ? ` · ${set.draftCount} draft` : ""}</>}
          </div>

          {/* THE TEMPLATE (Lee, 2026-09-05): "with /v3/ maybe before we open /results and
              /arrange etc, let it have a dropdown for pass 1 (current), pass 2, etc." */}
          <TemplatePicker set={set} />

          {/* THE LANE — cram path, or an offshoot/pitch hanging off one (docs/DESIGN-CRAM-MAP.md). */}
          {topic.kind !== "strategy" && <LanePicker topic={topic} set={set} />}

          <h2 style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 14 }}>
            What are you making?
          </h2>

          <div className="flex flex-wrap gap-3">
            <Door
              icon={Rocket}
              title="Blast Off"
              blurb="Talk through the set, arrange the running order, film it."
              to={blastOffPath(topic, set)}
            />
            <Door icon={ClipboardList} title="Practice" blurb="The question set students work through." soon />
            <Door icon={GraduationCap} title="Review" blurb="The long-form walkthrough video." soon />
          </div>
        </>
      )}
    </V3Shell>
  );
}

/** WHICH LANE THIS SET IS ON (docs/DESIGN-CRAM-MAP.md, 2026-09-09). Lee: "I think I just need to
 *  always be cram, but if you want to learn more about this I will teach you about it."
 *
 *  Cram is the default and needs no parent; an offshoot or a pitch names the cram set it hangs
 *  off. Saved the moment it changes — there is no Save button anywhere else on this screen. */
function LanePicker({ topic, set }: { topic: BoothTopic; set: BoothSetInfo }) {
  const [lane, setLane] = useState<DeckLane>(() => laneOf(set));
  const [parent, setParent] = useState<string>(set.branchFrom ?? "");
  const [saving, setSaving] = useState<string | null>(null);

  // The cram sets of this topic, in the order the queue lists them — a branch can hang off any
  // of them but itself.
  const parents = useMemo(
    () => orderedSets(slugOf(topic.name), topic.sets).filter((s) => s.id !== set.id && laneOf(s) === "cram"),
    [topic, set.id],
  );

  const save = (nextLane: DeckLane, nextParent: string) => {
    const problem = nextLane === "cram" ? null : branchProblem(set, nextParent, topic.sets);
    if (problem) { setSaving(problem); return; }
    setSaving("saving…");
    void setDeckLane({ data: { setId: set.id, lane: nextLane, ...(nextLane === "cram" ? {} : { branchFrom: nextParent }) } })
      .then(() => { setSaving("saved"); refreshBank(); })
      .catch((e: unknown) => setSaving(`⚠ ${e instanceof Error ? e.message : String(e)}`));
  };

  const sel: React.CSSProperties = { background: "rgba(0,0,0,0.35)", color: "#F4EFE6", border: "1px solid rgba(244,239,230,0.2)", borderRadius: 8, padding: "6px 10px", fontSize: 13 };
  const carded = set.liveCount + set.draftCount > 0;

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED }}>Lane</span>
        <select value={lane} onChange={(e) => { const v = e.target.value as DeckLane; setLane(v); if (v === "cram" || parent) save(v, parent); else setSaving("Pick the cram set this hangs off."); }} style={sel}>
          {DECK_LANES.map((l) => <option key={l} value={l}>{LANE_LABEL[l]}</option>)}
        </select>
        {lane !== "cram" && (
          <>
            <span style={{ fontSize: 12, color: V3_MUTED }}>off</span>
            <select value={parent} onChange={(e) => { setParent(e.target.value); save(lane, e.target.value); }} style={sel}>
              <option value="">— pick a cram set —</option>
              {parents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}
        {saving && <span style={{ fontSize: 11, color: saving.startsWith("⚠") || saving.endsWith(".") ? "#FF9F43" : V3_MUTED }}>{saving}</span>}
        <Link to="/v3/map" style={{ fontSize: 11.5, color: V3_GOLD, textDecoration: "none", marginLeft: "auto" }}>The map →</Link>
      </div>
      <div style={{ fontSize: 11.5, color: V3_MUTED, marginTop: 6, maxWidth: 640, lineHeight: 1.5 }}>{LANE_HINT[lane]}</div>
      {lane !== "cram" && carded && (
        // §3.8 of the design, in one line: the student-side filter is a separate, explicit build.
        <div style={{ fontSize: 11.5, color: "#FF9F43", marginTop: 4, maxWidth: 640, lineHeight: 1.5 }}>
          This set has cards — until the student-side filter lands it still shows on /learn. Ask before marking it.
        </div>
      )}
    </div>
  );
}


/** Pass 1 / pass 2 for this set — saved on the plan, read by Review and /film (and by Arrange,
 *  until it folded into Review on 2026-09-05). */
function TemplatePicker({ set }: { set: BoothSetInfo }) {
  const { plan, saving, setLayout } = usePlan(set);
  const cur = plan?.layout ?? "pass1";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
      <span style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED }}>Slide template</span>
      <select value={cur} disabled={!plan} onChange={(e) => { if (isLayout(e.target.value)) setLayout(e.target.value); }}
        style={{ background: "rgba(0,0,0,0.35)", color: "#F4EFE6", border: "1px solid rgba(244,239,230,0.2)", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
        {LAYOUTS.map((l) => <option key={l} value={l}>{LAYOUT_LABEL[l]}</option>)}
      </select>
      {saving && <span style={{ fontSize: 11, color: V3_MUTED }}>{saving}</span>}
      <span style={{ fontSize: 11.5, color: V3_MUTED }}>pass 2 = the vertical template: cards at the top of the safe column, bigger type, the camera placed to the content</span>
    </div>
  );
}
