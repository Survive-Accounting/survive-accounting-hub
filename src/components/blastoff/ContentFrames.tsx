// INSERTABLE CONTENT FRAMES — a phrase, a cheat code, a tip. Data in, styled
// frame out. The whole point is that Lee never styles these: a phrase always
// LOOKS like a phrase, across every video, forever.
//
// Each treatment is deliberately distinguishable at thumbnail size and at a
// glance mid-scroll:
//   PHRASE     — huge cream words in quotes on navy. Lee's voice, nothing else.
//   CHEAT CODE — gold-bordered card, monospace label, title + body. A tool.
//   TIP/TRICK  — gold left rule, smaller, conversational. An aside.
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";
import { DISPLAY_FONT, VStage, reveal, riseIn } from "./stage";

const GOLD = "#FCA311";
const NAVY_CARD = "rgba(16,24,44,0.92)";
const MID = Math.round(1920 * 0.26);

/** THE PHRASE — a Lee-ism, said the way he says it. Type is the design. */
export function PhraseFrame({ text, progress, scale = 1, transparent = false }: {
  text: string; progress?: number; scale?: number; transparent?: boolean;
}) {
  const t = reveal(progress, 0.04, 0.14);
  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{ position: "absolute", left: 90, right: 90, top: MID, ...riseIn(t) }}>
        <div style={{ fontSize: 120, lineHeight: 0.6, color: GOLD, fontFamily: DISPLAY_FONT, fontWeight: 800 }}>“</div>
        <div style={{
          marginTop: 18, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 96,
          lineHeight: 1.1, color: BRAND_CREAM, textWrap: "balance",
        }}>
          {text}
        </div>
      </div>
    </VStage>
  );
}

/** THE CHEAT CODE — a rule you can carry into the exam. Framed like a tool. */
export function CheatCodeFrame({ title, body, progress, scale = 1, transparent = false }: {
  title: string; body?: string; progress?: number; scale?: number; transparent?: boolean;
}) {
  const card = reveal(progress, 0.04, 0.12);
  const bodyT = reveal(progress, 0.20);
  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{
        position: "absolute", left: 84, right: 84, top: MID,
        background: NAVY_CARD, border: `3px solid ${GOLD}`, borderRadius: 28,
        padding: "44px 46px 50px", ...riseIn(card),
      }}>
        <div style={{
          fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace", fontWeight: 700,
          fontSize: 34, letterSpacing: "0.22em", textTransform: "uppercase", color: GOLD,
        }}>
          Cheat code
        </div>
        <div style={{
          marginTop: 26, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 72,
          lineHeight: 1.14, color: BRAND_CREAM, textWrap: "balance",
        }}>
          {title}
        </div>
        {body ? (
          <div style={{ marginTop: 26, fontSize: 44, lineHeight: 1.3, color: BRAND_CREAM, opacity: 0.9, ...riseIn(bodyT) }}>
            {body}
          </div>
        ) : null}
      </div>
    </VStage>
  );
}

/** THE TIP — an aside. Quieter than a cheat code on purpose. */
export function TipFrame({ text, progress, scale = 1, transparent = false }: {
  text: string; progress?: number; scale?: number; transparent?: boolean;
}) {
  const t = reveal(progress, 0.04, 0.14);
  return (
    <VStage scale={scale} transparent={transparent}>
      <div style={{ position: "absolute", left: 90, right: 90, top: MID, borderLeft: `6px solid ${GOLD}`, paddingLeft: 40, ...riseIn(t) }}>
        <div style={{
          fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 34, letterSpacing: "0.2em",
          textTransform: "uppercase", color: GOLD, marginBottom: 22,
        }}>
          Tip
        </div>
        <div style={{ fontSize: 64, lineHeight: 1.24, color: BRAND_CREAM, textWrap: "balance" }}>
          {text}
        </div>
      </div>
    </VStage>
  );
}
