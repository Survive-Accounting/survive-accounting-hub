// THE EXAM OUTLINE — the roadmap slide for the first video in a topic. Drawn through PhoneFrame
// like every other slide.
//
// Lee (2026-09-11): "an outline slide for an exam. I want to see each topic and be able to click
// it to open its contents. This will be for the first video I make in a topic, so I can let them
// know the roadmap." Then: "let me < > between a topic and show the spine that way, so it's not 25
// topics/sets going vertically." Then: the words editable, starting as the exam's question stems.
//
// So: the exam's topics as a numbered strip (click a number to jump), and ONE topic open below —
// "Topic N of M", its label, and its videos in order (the spine) as question stems, with ‹ › to
// walk topics. It opens on this video's own topic, with this video marked. The topics and videos
// come from the bank (exam-outline.ts); their words start as defaults and take Lee's edits
// (frame.outline, edited in the Editor panel); the heading is frame.text.
//
// Clicks change what's open for this viewing only — nothing is saved. Divs with role="button",
// not buttons: a focused button would take the film's spacebar as a click. The corner camera sits
// top-right, so the heading keeps to the left column; everything ends above the caption rail.
import { useState } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";

import { Chip, Loud, Shell, useBankOrReason } from "./EndOfTopicFrames";
import { examOutline, setLabel, spineLines, stepTopic, topicLabel } from "./exam-outline";
import type { BlastFrame } from "./plan";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";

const GOLD = "#FCA311";
const MUTED = "#8C9BBA";
const CARD = "#152241";
const CARD_EDGE = "#2B3D66";

export function OutlineFrame({ w, set, frame }: { w: number; set: BoothSetInfo; frame: BlastFrame; live?: boolean }) {
  const k = w / 306;
  const { topics, reason, quiet } = useBankOrReason();
  const [viewed, setViewed] = useState<number | null>(null);
  if (!topics) return <Loud w={w} k={k} text={reason ?? "No bank."} quiet={quiet} />;
  const o = examOutline(topics, set.id);
  if (!o.topics.length) return <Loud w={w} k={k} text="The bank has no exam topics yet — the outline has nothing to show." />;
  const labels = frame.outline;
  const n = o.topics.length;
  const i = stepTopic(viewed ?? o.hereIndex, 0, n);
  const t = o.topics[i];
  const { shown, more } = spineLines(t.sets);
  const go = (to: number) => setViewed(stepTopic(to, 0, n));
  const heading = frame.text?.trim() || `What's on ${o.exam}`;
  const tap = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const arrow = (dir: -1 | 1) => {
    const off = dir < 0 ? i === 0 : i === n - 1;
    return (
      <div role="button" aria-label={dir < 0 ? "Previous topic" : "Next topic"} onClick={off ? undefined : tap(() => go(i + dir))}
        style={{ width: 26 * k, height: 26 * k, flex: "0 0 auto", borderRadius: 999, display: "grid", placeItems: "center", cursor: off ? "default" : "pointer", userSelect: "none",
          border: `${Math.max(1, 1.2 * k)}px solid ${off ? CARD_EDGE : `${GOLD}99`}`, color: off ? CARD_EDGE : GOLD, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 16 * k, lineHeight: 1 }}>
        {dir < 0 ? "‹" : "›"}
      </div>
    );
  };
  return (
    <Shell w={w} k={k}>
      <div style={{ width: 195 * k }}>
        <Chip text={`${o.exam} · the roadmap`} k={k} />
        <div style={{ marginTop: 7 * k, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 21 * k, lineHeight: 1.05, color: BRAND_CREAM, whiteSpace: "pre-line", textWrap: "balance" as never }}>{heading}</div>
      </div>
      {/* THE TOPICS, as a numbered strip — the whole exam at a glance; click to jump. */}
      <div style={{ marginTop: 10 * k, display: "flex", gap: 4 * k, flexWrap: "wrap", maxWidth: 200 * k }}>
        {o.topics.map((tp, j) => (
          <div key={tp.id} role="button" title={topicLabel(labels, tp)} onClick={tap(() => go(j))}
            style={{ minWidth: 22 * k, height: 22 * k, padding: `0 ${5 * k}px`, boxSizing: "border-box", borderRadius: 6 * k, display: "grid", placeItems: "center", cursor: "pointer", userSelect: "none",
              background: j === i ? GOLD : "transparent", color: j === i ? "#111A32" : tp.here ? GOLD : BRAND_CREAM,
              border: `${Math.max(1, 1.2 * k)}px solid ${j === i ? GOLD : tp.here ? `${GOLD}99` : CARD_EDGE}`, fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 11 * k }}>
            {tp.number ?? j + 1}
          </div>
        ))}
      </div>
      {/* ONE TOPIC OPEN: ‹ its label › and its videos in order, as question stems. */}
      <div style={{ boxSizing: "border-box", marginTop: 10 * k, width: "100%", background: CARD, border: `${Math.max(1, 1.5 * k)}px solid ${CARD_EDGE}`, borderRadius: 12 * k, padding: `${10 * k}px ${10 * k}px ${9 * k}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 * k }}>
          {arrow(-1)}
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 8.5 * k, letterSpacing: "0.14em", textTransform: "uppercase", color: t.here ? GOLD : MUTED }}>{t.here ? "You are here · " : ""}Topic {i + 1} of {n}</div>
            <div style={{ marginTop: 2 * k, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 15.5 * k, lineHeight: 1.1, color: BRAND_CREAM, textWrap: "balance" as never }}>{topicLabel(labels, t)}</div>
          </div>
          {arrow(1)}
        </div>
        <div style={{ marginTop: 8 * k, display: "flex", flexDirection: "column", gap: 2 * k }}>
          {shown.length === 0 && <div style={{ fontSize: 11 * k, color: MUTED, textAlign: "center" }}>No videos in this topic yet.</div>}
          {shown.map((s, j) => {
            const me = s.id === o.hereSetId;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 6 * k, fontFamily: BRAND_FONT, fontSize: 11.5 * k, lineHeight: 1.3, color: me ? GOLD : "#DBE1EE" }}>
                <span style={{ width: 14 * k, flex: "0 0 auto", textAlign: "right", fontWeight: 800, color: me ? GOLD : MUTED }}>{j + 1}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: me ? 800 : 600 }}>{setLabel(labels, s)}</span>
                {me && <span style={{ flex: "0 0 auto", fontSize: 8 * k, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>this video</span>}
              </div>
            );
          })}
          {more > 0 && <div style={{ marginTop: 1 * k, paddingLeft: 20 * k, fontSize: 10.5 * k, color: MUTED }}>+ {more} more</div>}
        </div>
      </div>
    </Shell>
  );
}
