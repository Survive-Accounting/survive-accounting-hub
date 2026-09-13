// THE END-OF-TOPIC AD — "I just filmed a run of videos for this topic."
//
// Lee, 2026-09-12: "Frontfacing ads can be a thing too. Hey, I just filmed a run of videos for this
// topic. Here's the stats. Here's the best ones. Watch them all, highly recommended, but these are
// the best ones, for sure. Here's how the practice works. I need to end every topic like this."
//
// It is the one slide allowed to point at other videos — the no-chain rule ("I never tease up
// another video at the end of a video, only in ADS") is exactly why this is an ad, and why it
// carries the skippable flag so the player can let a student past it.
//
// The topic and its videos come from the BANK (exam-outline.ts), never typed, so the count cannot
// go stale. The best ones are Lee's own picks (frame.best) and fall back to the first three, so the
// slide is never empty. The two lines under it are his (frame.title / frame.text) with the
// mockup's copy as the default. Clicks do nothing here: it is a card to read, not a field to walk.
import type { BoothSetInfo } from "@/lib/talkthrough.functions";
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { Chip, Loud, Shell, useBankOrReason } from "./EndOfTopicFrames";
import { examOutline, setLabel } from "./exam-outline";
import type { BlastFrame } from "./plan";
import { TOPIC_AD_COPY, bestOf, topicAdStats } from "./topic-ad";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";

const GOLD = "#FCA311";
const RED = "#EF4B3F";
const MUTED = "#8C9BBA";
const CARD = "#152241";
const CARD_EDGE = "#8A6A2A";

export function TopicAdFrame({ w, set, frame }: { w: number; set: BoothSetInfo; frame: BlastFrame; live?: boolean }) {
  const k = w / 306;
  const { topics, reason, quiet } = useBankOrReason();
  if (!topics) return <Loud w={w} k={k} text={reason ?? "No bank."} quiet={quiet} />;
  const o = examOutline(topics, set.id);
  const here = o.topics[o.hereIndex];
  if (!here) return <Loud w={w} k={k} text="This set isn't on an exam topic — the ad has nothing to count." />;
  const stats = topicAdStats(here.sets);
  const best = bestOf(here.sets, frame.best);
  const heading = frame.title?.trim() || TOPIC_AD_COPY.heading;
  const practice = frame.text?.trim() || TOPIC_AD_COPY.practice;
  return (
    <Shell w={w} k={k}>
      <div style={{ width: 195 * k }}>
        <Chip text={TOPIC_AD_COPY.chip} k={k} />
        <div style={{ marginTop: 7 * k, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 21 * k, lineHeight: 1.05, color: BRAND_CREAM, whiteSpace: "pre-line", textWrap: "balance" as never }}>{heading}</div>
      </div>
      {/* THE STATS — only what the bank actually knows. */}
      <div style={{ marginTop: 8 * k, fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 12 * k, color: GOLD }}>
        {here.name} · {stats.videos} video{stats.videos === 1 ? "" : "s"}
      </div>
      <div style={{ marginTop: 3 * k, fontSize: 11.5 * k, color: MUTED, lineHeight: 1.3, maxWidth: 220 * k }}>{TOPIC_AD_COPY.line}</div>
      {/* THE BEST ONES — his picks, in the topic's order. */}
      <div style={{ boxSizing: "border-box", marginTop: 9 * k, width: "100%", background: CARD, border: `${Math.max(1, 1.5 * k)}px solid ${CARD_EDGE}`, borderRadius: 12 * k, padding: `${10 * k}px ${11 * k}px` }}>
        <div style={{ fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 8.5 * k, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD }}>Start with these</div>
        <div style={{ marginTop: 5 * k, display: "flex", flexDirection: "column", gap: 4 * k }}>
          {best.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 7 * k, fontFamily: BRAND_FONT, fontSize: 12.5 * k, lineHeight: 1.25, color: BRAND_CREAM }}>
              <span style={{ flex: "0 0 auto", width: 13 * k, textAlign: "right", fontWeight: 800, color: GOLD }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{setLabel(frame.outline, s)}</span>
            </div>
          ))}
          {best.length === 0 && <div style={{ fontSize: 11 * k, color: MUTED }}>No videos in this topic yet.</div>}
        </div>
      </div>
      {/* HOW THE PRACTICE WORKS, then the pill. */}
      <div style={{ marginTop: 9 * k, fontSize: 12 * k, lineHeight: 1.32, color: "#DBE1EE", maxWidth: 232 * k, whiteSpace: "pre-line" }}>{practice}</div>
      <div style={{ marginTop: 9 * k, display: "inline-flex", alignItems: "center", background: RED, color: "#FFF4EC", borderRadius: 999, padding: `${7 * k}px ${14 * k}px`, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 14 * k, lineHeight: 1 }}>
        {TOPIC_AD_COPY.cta}
      </div>
    </Shell>
  );
}
