// IMPROVE PROCESS — Step 5's body. A STUB (2026-09-07).
//
// Lee, 2026-09-07: "I'd love a Step 5: Improve Process." The door exists and leads here
// (routes/v3.$topic.$set.blast-off.improve.tsx mounts this and nothing else), so the route,
// the StepBar and the picker are already right; what goes on the page is a separate build.
// StepBar's own blurb is the brief: "Time to beat, where the minutes went, what to change
// next set." The material is already there — production_time_log (lib/production-time.
// functions.ts productionBottleneckReport reads it per set and per step) — this page just
// hasn't been written yet. Replace this component; leave the route alone.
import { STEPS } from "@/components/v3/StepBar";
import { V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_MUTED } from "@/components/v3/Shell";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export function ImprovePage({ topic, set }: { topic: BoothTopic; set: BoothSetInfo }) {
  return (
    <div>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px" }}>
        Improve Process
      </h1>
      <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 20 }}>
        {topic.name} · {set.name}
      </div>
      <V3Note>Improve Process — coming in this build.</V3Note>
      <div style={{ marginTop: 18, border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "12px 16px" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 8 }}>
          The steps this will look back on
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, color: V3_CREAM, fontSize: 14, lineHeight: 1.7 }}>
          {STEPS.filter((s) => s.step !== "improve").map((s) => (
            <li key={s.step}>{s.label} <span style={{ color: V3_MUTED, fontSize: 12 }}>— {s.blurb}</span></li>
          ))}
        </ol>
      </div>
    </div>
  );
}
