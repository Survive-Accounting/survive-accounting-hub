// THE LEDGER SLIDES — the ± rule, the T-account and the T pick (ledger.ts has the rules and Lee's words).
// Full 9:16 in the end-of-topic shell, drawn in phone units (k = w / 306). On film the T-account and the T
// pick walk with space through the capture's FrameStepContext, the way the teaser does.
import { useContext } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { Chip, Shell } from "./EndOfTopicFrames";
import { FrameStepContext } from "./frame-step";
import { DC_NAME, DC_ORANGE, DC_YELLOW, dcColor, isDcKey, tAccountShown, type DcKey, type TAccountSpec } from "./ledger";
import type { BlastFrame } from "./plan";
import { DISPLAY_FONT } from "./stage";

const MUTED = "#8C9BBA";
const MINT = "#3BF5A0";

/** A small T with its signs: "+ | −" or "− | +". */
function MiniT({ k, name, keyName, dim }: { k: number; name: string; keyName: DcKey; dim?: boolean }) {
  const debit = dcColor(keyName) === DC_YELLOW;
  const color = dcColor(keyName);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: dim ? 0.28 : 1, transition: "opacity 200ms" }}>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 15 * k, color, whiteSpace: "nowrap" }}>{name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: 70 * k, borderTop: `${2 * k}px solid ${BRAND_CREAM}`, marginTop: 3 * k }}>
        <div style={{ borderRight: `${2 * k}px solid ${BRAND_CREAM}`, textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * k, color: debit ? MINT : "#FF8B7E", lineHeight: 1.2 }}>{debit ? "+" : "−"}</div>
        <div style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * k, color: debit ? "#FF8B7E" : MINT, lineHeight: 1.2 }}>{debit ? "−" : "+"}</div>
      </div>
    </div>
  );
}

/** THE ± RULE: A = L + E, revenues under equity, expenses and dividends under assets, ADE / LER. `dcFocus`
 *  lights one account type (the others dim) — one per video. */
export function DcRuleFrame({ w, frame }: { w: number; frame: BlastFrame }) {
  const k = w / 306;
  const focus = isDcKey(frame.dcFocus) ? frame.dcFocus : null;
  const dim = (key: DcKey) => !!focus && focus !== key;
  const heading = frame.title?.trim() || (focus ? `${DC_NAME[focus]}: ${dcColor(focus) === DC_YELLOW ? "debit ↑ · credit ↓" : "credit ↑ · debit ↓"}` : "Debits & credits");
  return (
    <Shell w={w} k={k}>
      <div style={{ width: "100%", minHeight: 420 * k, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 * k }}>
        <div><Chip text={frame.chipText?.trim() || "Memorize this"} k={k} /></div>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 24 * k, lineHeight: 1.05, color: BRAND_CREAM, textWrap: "balance" as never }}>{heading}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "start", gap: 4 * k, marginTop: 6 * k }}>
          <MiniT k={k} name="Assets" keyName="A" dim={dim("A")} />
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * k, color: BRAND_CREAM, paddingTop: 2 * k }}>=</div>
          <MiniT k={k} name="Liab." keyName="L" dim={dim("L")} />
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * k, color: BRAND_CREAM, paddingTop: 2 * k }}>+</div>
          <MiniT k={k} name="Equity" keyName="E" dim={dim("E")} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 * k }}>
          <MiniT k={k} name="Expenses" keyName="Exp" dim={dim("Exp")} />
          <MiniT k={k} name="Dividends" keyName="Div" dim={dim("Div")} />
          <MiniT k={k} name="Revenues" keyName="Rev" dim={dim("Rev")} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 18 * k, marginTop: 6 * k, fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 18 * k, letterSpacing: "0.04em" }}>
          <span style={{ color: DC_YELLOW }}>Debit: ADE</span>
          <span style={{ color: DC_ORANGE }}>Credit: LER</span>
        </div>
        <div style={{ textAlign: "center", fontSize: 11 * k, color: MUTED }}>Debits on the left · credits on the right</div>
      </div>
    </Shell>
  );
}

/** THE T-ACCOUNT: "Cash (+/-)", staggered entries with their labels, the ending balance under a second line.
 *  On film space brings in each line, then the ending. */
export function TAccountFrame({ w, frame, live }: { w: number; frame: BlastFrame; live?: boolean }) {
  const k = w / 306;
  const t = frame.tacct as TAccountSpec | undefined;
  const step = useContext(FrameStepContext);
  if (!t) return <Shell w={w} k={k}><div style={{ color: "#FF8A80", fontWeight: 700, fontSize: 13 * k }}>This T-account has no entries yet — add them in the Editor.</div></Shell>;
  const walking = !!live && !!step;
  const shown = tAccountShown(t, walking ? step.step : null);
  const signs = t.normal === "debit" ? "(+/-)" : "(-/+)";
  const color = t.normal === "debit" ? DC_YELLOW : DC_ORANGE;
  const row = (l: { side: "L" | "R"; amount: string; label?: string }, i: number) => (
    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", visibility: i < shown.lines ? "visible" : "hidden" }}>
      <div style={{ textAlign: "right", paddingRight: 10 * k }}>{l.side === "L" && <Entry k={k} l={l} />}</div>
      <div style={{ paddingLeft: 10 * k }}>{l.side === "R" && <Entry k={k} l={l} />}</div>
    </div>
  );
  return (
    <Shell w={w} k={k}>
      <div onClick={walking && step.advance ? (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; e.stopPropagation(); step.advance?.(e.shiftKey ? -1 : 1); } : undefined}
        style={{ width: "100%", minHeight: 420 * k, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 * k, cursor: walking ? "pointer" : undefined }}>
        {frame.chipText !== "" && <div><Chip text={frame.chipText?.trim() || "T-account"} k={k} /></div>}
        {frame.title?.trim() && <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 20 * k, lineHeight: 1.05, color: BRAND_CREAM }}>{frame.title}</div>}
        <div style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 26 * k, color }}>{t.name} <span style={{ fontSize: 18 * k, color: BRAND_CREAM }}>{signs}</span></div>
        <div style={{ position: "relative", borderTop: `${3 * k}px solid ${BRAND_CREAM}` }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, borderLeft: `${3 * k}px solid ${BRAND_CREAM}` }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", fontSize: 10 * k, color: MUTED, letterSpacing: "0.12em", fontWeight: 800, padding: `${4 * k}px 0` }}>
            <div style={{ textAlign: "right", paddingRight: 10 * k }}>DEBIT</div><div style={{ paddingLeft: 10 * k }}>CREDIT</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 * k, minHeight: 150 * k, paddingBottom: 6 * k }}>
            {t.lines.map(row)}
          </div>
          {t.ending && (
            <div style={{ borderTop: `${2 * k}px solid ${BRAND_CREAM}`, display: "grid", gridTemplateColumns: "1fr 1fr", paddingTop: 6 * k, visibility: shown.ending ? "visible" : "hidden" }}>
              <div style={{ textAlign: "right", paddingRight: 10 * k }}>{t.ending.side === "L" && <Ending k={k} amount={t.ending.amount} />}</div>
              <div style={{ paddingLeft: 10 * k }}>{t.ending.side === "R" && <Ending k={k} amount={t.ending.amount} />}</div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
function Entry({ k, l }: { k: number; l: { amount: string; label?: string } }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "inherit" }}>
      <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 22 * k, color: BRAND_CREAM, lineHeight: 1 }}>{l.amount}</span>
      {l.label && <span style={{ fontSize: 10 * k, color: MUTED, fontWeight: 700 }}>{l.label}</span>}
    </span>
  );
}
function Ending({ k, amount }: { k: number; amount: string }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "inherit" }}>
      <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 26 * k, color: "#FCA311", lineHeight: 1 }}>{amount}</span>
      <span style={{ fontSize: 10 * k, color: "#FCA311", fontWeight: 800, letterSpacing: "0.08em" }}>ENDING BALANCE</span>
    </span>
  );
}

/** THE T PICK: "What is the normal balance of ____?" as a blank T. Step 0 the sides wait; step 1 (space) the
 *  + side lights with "Normal balance". At rest (Editor) it shows the answer. */
export function TPickFrame({ w, stem, account, side, live }: { w: number; stem: string; account: string; side: "L" | "R" | null; live?: boolean }) {
  const k = w / 306;
  const step = useContext(FrameStepContext);
  const revealed = !(live && step) || step.step >= 1;
  const color = side === "L" ? DC_YELLOW : side === "R" ? DC_ORANGE : BRAND_CREAM;
  const half = (s: "L" | "R") => {
    const on = revealed && side === s;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 * k, minHeight: 140 * k, borderRadius: 10 * k, margin: 8 * k, border: `${2 * k}px ${on ? "solid" : "dashed"} ${on ? MINT : "rgba(245,239,230,0.25)"}`, background: on ? "rgba(59,245,160,0.12)" : "transparent", transition: "all 220ms" }}>
        <span style={{ fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 24 * k, color: on ? MINT : BRAND_CREAM }}>{s === "L" ? "Debit" : "Credit"}</span>
        {on && <span style={{ fontSize: 10 * k, fontWeight: 800, letterSpacing: "0.1em", color: MINT }}>NORMAL BALANCE · THE + SIDE</span>}
      </div>
    );
  };
  return (
    <Shell w={w} k={k}>
      <div style={{ width: "100%", minHeight: 420 * k, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 * k }}>
        <div><Chip text="Common exam question" k={k} /></div>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 21 * k, lineHeight: 1.08, color: BRAND_CREAM, textWrap: "balance" as never }}>{stem}</div>
        <div style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 26 * k, color: revealed ? color : BRAND_CREAM, marginTop: 6 * k }}>{account}</div>
        <div style={{ position: "relative", borderTop: `${3 * k}px solid ${BRAND_CREAM}`, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, borderLeft: `${3 * k}px solid ${BRAND_CREAM}` }} />
          {half("L")}{half("R")}
        </div>
      </div>
    </Shell>
  );
}
