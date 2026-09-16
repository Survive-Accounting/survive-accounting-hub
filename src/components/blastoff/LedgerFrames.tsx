// THE LEDGER SLIDES — the rubric-shaped debit/credit rule, the rubric pick, the T-account and the T pick (ledger.ts
// has the rules and Lee's words). Full 9:16 in the end-of-topic shell, drawn in phone units (k = w / 306). On film
// every one of them walks with space through the capture's FrameStepContext, the way the teaser does.
import { useContext, useState } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { Chip, Shell } from "./EndOfTopicFrames";
import { FrameStepContext } from "./frame-step";
import { DC_ORANGE, DC_YELLOW, dcColor, dcContraOf, dcWalkView, isDcKey, isDcMode, tAccountShown, type DcKey, type TAccountSpec } from "./ledger";
import type { BlastFrame } from "./plan";
import { DISPLAY_FONT } from "./stage";

const MUTED = "#8C9BBA";
const MINT = "#3BF5A0";

/** A small T with its signs: "+ | −" or "− | +". `blank` hides the signs (the write-it-yourself slide). */
function MiniT({ k, name, keyName, dim, blank, size = 1 }: { k: number; name: string; keyName: DcKey; dim?: boolean; blank?: boolean; size?: number }) {
  const debit = dcColor(keyName) === DC_YELLOW;
  const color = dcColor(keyName);
  const s = k * size;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: dim ? 0.22 : 1, transition: "opacity 220ms" }}>
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: (name.length > 14 ? 11 : name.length > 9 ? 12.5 : 15) * s, lineHeight: 1.05, color, textAlign: "center", maxWidth: 110 * s, textWrap: "balance" as never }}>{name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: 70 * s, borderTop: `${2 * s}px solid ${BRAND_CREAM}`, marginTop: 3 * s }}>
        <div style={{ borderRight: `${2 * s}px solid ${BRAND_CREAM}`, textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * s, color: blank ? MUTED : debit ? MINT : "#FF8B7E", lineHeight: 1.2, minHeight: 27 * s }}>{blank ? "" : debit ? "+" : "−"}</div>
        <div style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * s, color: blank ? MUTED : debit ? "#FF8B7E" : MINT, lineHeight: 1.2, minHeight: 27 * s }}>{blank ? "" : debit ? "−" : "+"}</div>
      </div>
    </div>
  );
}

/** THE L — A = L + E across, Rev and Exp under E (the same shape as the A = L + E rubric). `shown` hides boxes
 *  not yet walked in (their space is kept); `lit` dims everything outside the family; `hop` draws the arrow that
 *  jumps the equal sign; `link` the tie between Equity and Revenue. `div` adds the Dividends box under Rev/Exp. */
function RubricL({ k, shown, lit, dim, blank, hop, link, div, size = 1, contra, onPick }: {
  k: number; shown?: readonly DcKey[]; lit?: readonly DcKey[] | null; dim?: (key: DcKey) => boolean; blank?: boolean; hop?: boolean; link?: boolean; div?: boolean; size?: number;
  /** THE CONTRA VIEW (Lee, 2026-09-16): the flipped contra T to the right of Assets with a flip arrow between
   *  them, or — for equity — Dividends under Equity, where Revenues and Expenses sit otherwise. */
  contra?: { of: "A" | "E"; name: string } | null;
  /** A tap on a box: "click the rubric to focus on one type of account". */
  onPick?: (key: DcKey) => void;
}) {
  const s = k * size;
  const on = (key: DcKey) => !shown || shown.includes(key);
  const dimmed = (key: DcKey) => (lit ? !lit.includes(key) : dim ? dim(key) : false);
  const tap = (key: DcKey) => (onPick ? { onClick: (e: React.MouseEvent) => { e.stopPropagation(); onPick(key); } } : {});
  const box = (key: DcKey, name: string) => (
    <div {...tap(key)} style={{ visibility: on(key) ? "visible" : "hidden", transition: "opacity 220ms", ...(onPick ? { cursor: "pointer" } : {}) }}><MiniT k={k} name={name} keyName={key} dim={dimmed(key)} blank={blank} size={size} /></div>
  );
  const sign = (t: string) => <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * s, color: BRAND_CREAM, paddingTop: 2 * s, position: "relative" }}>{t}</div>;
  // the flip arrow: the contra is its family's OPPOSITE
  const flip = (t: string, vertical?: boolean) => (
    <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: (vertical ? 20 : 24) * s, lineHeight: 1, color: "#FCA311", paddingTop: vertical ? 0 : 4 * s, textAlign: "center" }}>{t}</div>
  );
  // the contra's T takes a key with the opposite sign, so its + sits on the other side
  const contraT = (name: string, keyName: DcKey, sz: number) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 * s }}>
      <MiniT k={k} name={name} keyName={keyName} blank={blank} size={sz} />
      <span style={{ fontSize: 8.5 * s, fontWeight: 800, letterSpacing: "0.12em", color: "#FF8B7E", whiteSpace: "nowrap" }}>CONTRA · OPPOSITE</span>
    </div>
  );
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 * s, position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "start", gap: 4 * s, position: "relative" }}>
        {box("A", "Assets")}
        {contra?.of === "A" ? flip("⇄") : sign("=")}
        {contra?.of === "A" ? contraT(contra.name, "L", size) : box("L", "Liabilities")}
        {sign("+")}
        {box("E", "Equity")}
        {/* THE HOP: the arrow that jumps the equal sign — "each side of the equal sign". */}
        {hop && (
          <svg aria-hidden viewBox="0 0 100 30" style={{ position: "absolute", left: "22%", top: -24 * s, width: "56%", height: 30 * s, overflow: "visible" }}>
            <path d="M4 26 C 30 -6, 70 -6, 96 26" fill="none" stroke="#FCA311" strokeWidth={3} strokeLinecap="round" />
            <path d="M88 18 L96 26 L86 28" fill="none" stroke="#FCA311" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {/* Under equity: revenues, then expenses, stacked in equity's column (dividends under them when asked) — the L. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 4 * s, alignItems: "start" }}>
        <span /><span /><span /><span />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 * s, alignItems: "center", position: "relative" }}>
          {contra?.of === "E" ? (
            // EQUITY VS. DIVIDENDS: the flipped one goes underneath ("due to lack of space"), the flip arrow between.
            <>
              {flip("⇅", true)}
              {contraT(contra.name, "Div", size)}
            </>
          ) : (
            <>
              {link && on("Rev") && <div aria-hidden style={{ position: "absolute", left: "50%", top: -10 * s, width: 2 * s, height: 10 * s, background: "#FCA311" }} />}
              {/* STACKED, not side by side (Lee, 2026-09-16: "more like an L… under E, Revenues, Expenses, vertically aligned"). */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 * s, alignItems: "center" }}>
                <div {...tap("Rev")} style={{ visibility: on("Rev") ? "visible" : "hidden", ...(onPick ? { cursor: "pointer" } : {}) }}><MiniT k={k} name="Revenues" keyName="Rev" dim={dimmed("Rev")} blank={blank} size={size * 0.85} /></div>
                <div {...tap("Exp")} style={{ visibility: on("Exp") ? "visible" : "hidden", ...(onPick ? { cursor: "pointer" } : {}) }}><MiniT k={k} name="Expenses" keyName="Exp" dim={dimmed("Exp")} blank={blank} size={size * 0.85} /></div>
              </div>
              {div && <div {...tap("Div")} style={onPick ? { cursor: "pointer" } : undefined}><MiniT k={k} name="Dividends" keyName="Div" dim={dimmed("Div")} blank={blank} size={size * 0.72} /></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** THE DEBIT / CREDIT RULE, rubric-shaped (ledger.ts, the 2026-09-16 note). Nothing on top unless the slide has
 *  a chip or heading of its own. `dcMode` walks it on space: the progression, a contra zoom, or the blank L. */
export function DcRuleFrame({ w, frame, live }: { w: number; frame: BlastFrame; live?: boolean }) {
  const k = w / 306;
  const stepCtx = useContext(FrameStepContext);
  const walking = !!live && !!stepCtx;
  const step = walking ? stepCtx.step : null;
  const mode = isDcMode(frame.dcMode) ? frame.dcMode : null;
  const focus = isDcKey(frame.dcFocus) ? frame.dcFocus : null;
  const advance = walking && stepCtx.advance ? (e: React.MouseEvent) => { if (e.ctrlKey || e.metaKey || e.altKey) return; e.stopPropagation(); stepCtx.advance?.(e.shiftKey ? -1 : 1); } : undefined;
  const chip = frame.chipText?.trim();
  const heading = frame.title?.trim();
  const top = (
    <>
      {chip && <div><Chip text={chip} k={k} /></div>}
      {heading && <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 24 * k, lineHeight: 1.05, color: BRAND_CREAM, textWrap: "balance" as never }}>{heading}</div>}
    </>
  );
  let body: React.ReactNode;
  if (mode === "contraA" || mode === "contraE") {
    // THE CONTRA ZOOM: the type big, then its contra beside it — opposite. Equity's ends on the memory line.
    const main: DcKey = mode === "contraA" ? "A" : "E";
    const contra: DcKey = mode === "contraA" ? "A" : "E"; // colour of the partner
    const contraName = mode === "contraA" ? "Accumulated Depreciation" : "Dividends";
    const mainName = mode === "contraA" ? "Equipment" : "Equity";
    const showContra = step == null || step >= 1;
    const showLine = mode === "contraE" && (step == null || step >= 2);
    const flip: DcKey = mode === "contraA" ? "L" : "A"; // a key with the opposite sign, for the partner's T
    void contra;
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 * k, alignItems: "center", width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 * k, width: "100%", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><MiniT k={k} name={mainName} keyName={main} size={1.45} /></div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 * k, visibility: showContra ? "visible" : "hidden" }}>
            <MiniT k={k} name={contraName} keyName={flip} size={1.45} />
            <span style={{ fontSize: 9 * k, fontWeight: 800, letterSpacing: "0.12em", color: "#FF8B7E", marginTop: 6 * k, whiteSpace: "nowrap" }}>CONTRA · OPPOSITE</span>
          </div>
        </div>
        {mode === "contraE" && (
          <div style={{ visibility: showLine ? "visible" : "hidden", textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 17 * k, lineHeight: 1.15, color: BRAND_CREAM }}>
            <span style={{ color: DC_YELLOW }}>D</span>ividends starts with <span style={{ color: DC_YELLOW }}>D</span> → increases with a <span style={{ color: DC_YELLOW }}>Debit</span>
          </div>
        )}
      </div>
    );
  } else if (mode === "walk") {
    const v = dcWalkView(step);
    const n = v.shown.length;
    body = <RubricL k={k} shown={v.shown} lit={v.lit} hop={n >= 2 && !v.lit} link={n >= 4 && !v.lit} />;
  } else if (mode === "blank") {
    const filled = step == null || step >= 1;
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 * k, width: "100%" }}>
        <RubricL k={k} blank={!filled} />
        <div style={{ textAlign: "center", fontSize: 12 * k, fontWeight: 800, letterSpacing: "0.08em", color: "#FCA311" }}>{filled ? "FILL IN THE + AND − BY HAND" : "DRAW THIS ON YOUR EXAM"}</div>
      </div>
    );
  } else {
    body = <RubricL k={k} dim={(key) => !!focus && focus !== key} div={focus === "Div"} />;
  }
  return (
    <Shell w={w} k={k}>
      <div onClick={advance} style={{ width: "100%", minHeight: 420 * k, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 * k, cursor: advance ? "pointer" : undefined }}>
        {top}
        {body}
      </div>
    </Shell>
  );
}

/** THE RUBRIC PICK: a "How do you increase ____?" card. The L sits on top — the question in the lower area under
 *  it, Debit / Credit at the bottom (Lee, 2026-09-16: "I want the question to sit where it's circled. The rubric
 *  can move upward"). On film, space lights the account's family (the rest blur), then the answer. A tap on any
 *  box focuses that family instead, and a tap on it again lets go — "click the rubric to focus on one type of
 *  account… blur everything else". A contra account (Acc Depr, Dividends) shows its family lit with the flipped
 *  contra T beside it: to the right of Assets with a flip arrow, or under Equity. At rest (Editor) everything is
 *  revealed. Debit / Credit are the card's own choices; the practice keeps them. */
export function DcPickFrame({ w, stem, pick, type, live }: { w: number; stem: string; pick: { account: string; side: "L" | "R" | null }; type: DcKey | null; live?: boolean }) {
  const k = w / 306;
  const stepCtx = useContext(FrameStepContext);
  const walking = !!live && !!stepCtx;
  const step = walking ? stepCtx.step : null;
  const typeLit = step == null || step >= 1;
  const answer = step == null || step >= 2;
  const contra = dcContraOf(pick.account);
  const family: DcKey | null = contra ? contra.of : type;
  const [focus, setFocus] = useState<DcKey | null>(null);
  const lit: DcKey | null = focus ?? (typeLit ? family : null);
  const showContra = !!contra && lit === contra.of;
  const advance = walking && stepCtx.advance ? (e: React.MouseEvent) => { if (e.ctrlKey || e.metaKey || e.altKey) return; e.stopPropagation(); stepCtx.advance?.(e.shiftKey ? -1 : 1); } : undefined;
  const pill = (side: "L" | "R") => {
    const on = answer && pick.side === side;
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52 * k, borderRadius: 10 * k, border: `${2 * k}px ${on ? "solid" : "dashed"} ${on ? MINT : "rgba(245,239,230,0.3)"}`, background: on ? "rgba(59,245,160,0.12)" : "transparent", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: 22 * k, color: on ? MINT : BRAND_CREAM, transition: "all 220ms" }}>
        {side === "L" ? "Debit" : "Credit"}
      </div>
    );
  };
  return (
    <Shell w={w} k={k}>
      <div onClick={advance} style={{ width: "100%", minHeight: 420 * k, display: "flex", flexDirection: "column", gap: 14 * k, cursor: advance ? "pointer" : undefined }}>
        <div style={{ padding: `${12 * k}px ${4 * k}px ${10 * k}px`, borderRadius: 12 * k, border: `1px solid rgba(245,239,230,0.14)` }}>
          <RubricL k={k} dim={(key) => !!lit && lit !== key} contra={showContra ? contra : null} onPick={(key) => setFocus((f) => (f === key ? null : key))} />
        </div>
        <div style={{ flex: 1 }} />
        <div><Chip text="Common exam question" k={k} /></div>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 21 * k, lineHeight: 1.08, color: BRAND_CREAM, textWrap: "balance" as never }}>{stem}</div>
        <div style={{ display: "flex", gap: 10 * k }}>{pill("L")}{pill("R")}</div>
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
        <div style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: (t.name.length > 12 ? 20 : 26) * k, color, whiteSpace: "nowrap" }}>{t.name} <span style={{ fontSize: 16 * k, color: BRAND_CREAM }}>{signs}</span></div>
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
        {on && <span style={{ fontSize: 10 * k, fontWeight: 800, letterSpacing: "0.1em", color: MINT, textAlign: "center" }}>THE + SIDE</span>}
      </div>
    );
  };
  return (
    <Shell w={w} k={k}>
      <div style={{ width: "100%", minHeight: 420 * k, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 * k }}>
        <div><Chip text="Common exam question" k={k} /></div>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 21 * k, lineHeight: 1.08, color: BRAND_CREAM, textWrap: "balance" as never }}>{stem}</div>
        <div style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontWeight: 900, fontSize: (account.length > 18 ? 20 : 26) * k, color: revealed ? color : BRAND_CREAM, marginTop: 6 * k }}>{account}</div>
        <div style={{ position: "relative", borderTop: `${3 * k}px solid ${BRAND_CREAM}`, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, borderLeft: `${3 * k}px solid ${BRAND_CREAM}` }} />
          {half("L")}{half("R")}
        </div>
      </div>
    </Shell>
  );
}
