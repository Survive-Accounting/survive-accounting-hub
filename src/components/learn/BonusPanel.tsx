// THE BONUS TAB (2026-09-16) — what a set earns you at 80% on its practice.
//
// Lee (the wireframes): A = L + E — "Every transaction in the set as a row with its movement in arrows. Tap one and
// the rubric opens with the arrows lit — no dollar amounts. Locked until 80% on the practice; the lock screen says
// what's left." Know Your Accounts — "All five types side by side, every account inside its type, and every cheat
// code highlighted in gold — the exact lists from your Types of Accounts slide. Contra accounts sit with their
// partner in red ('opposite of'). One screen to memorize; on a phone the five columns become a swipe."
//
// Content comes from fetchSetBonus (the film plan); the lists are account-types.ts — Lee's own slide as data. The
// lock reads lib/practice-score (this device's answers): every question answered, 80% right.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";

import { listOf, TYPE_INFO, TYPE_KEYS, wordOf, type TypeKey, type TypeListId, type TypesSpec } from "@/components/blastoff/account-types";
import type { RubricArrows } from "@/components/blastoff/rubric";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { RubricAnswer } from "@/components/learn/RubricAnswer";
import { arrowsLine, isCheatCode } from "@/lib/learn-bonus";
import { gateLines, PRACTICE_PASS, type PracticeScore } from "@/lib/practice-score";
import { fetchSetBonus, type StudentSet } from "@/lib/student.functions";

const INK = "#F2EFE6", MUTED = "#93A0B4", EDGE = "rgba(148,180,255,0.20)", GOLD = "#FCA311", MINT = "#3BF5A0", RED = "#FF5C6E";

export function BonusPanel({ set, demo, score, narrow, onPractice }: {
  set: StudentSet;
  demo: boolean;
  /** This device's practice on the set (lib/practice-score), re-read by the parent as answers land. */
  score: PracticeScore | null;
  narrow: boolean;
  onPractice: () => void;
}) {
  const total = set.ceqCount;
  const l = gateLines({ videosDone: 0, videosOf: 0, score, total });
  const open = l.practiceOk;
  if (!open) {
    const answeredAll = !!score && score.answered >= total;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, padding: "28px 18px", color: INK, fontFamily: BRAND_SANS }}>
        <Lock className="h-7 w-7" style={{ color: MUTED }} />
        <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 24, lineHeight: 1.05 }}>Earn the bonus</div>
        <div style={{ fontSize: 13.5, color: MUTED, maxWidth: 320 }}>
          {set.bonus === "types" ? "Get 80% on the practice and the whole map is here to memorize — every account, every cheat code." : "Get 80% on the practice and every transaction is here to memorize."}
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 14, color: l.practiceOk ? MINT : INK, marginTop: 2 }}>
          <span aria-hidden style={{ width: 18, textAlign: "center", fontWeight: 900 }}>{answeredAll ? "✓" : "○"}</span>
          <span>{l.practice}</span>
        </div>
        <button type="button" onClick={onPractice} style={{ marginTop: 8, width: "100%", maxWidth: 300, minHeight: 48, padding: "12px 18px", borderRadius: 999, border: 0, cursor: "pointer", background: answeredAll ? RED : GOLD, color: answeredAll ? "#fff" : "#14213D", fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 15 }}>
          {answeredAll ? "Redo the ones you missed" : score?.answered ? "Keep going on the practice" : "Start the practice"}
        </button>
        <div style={{ fontSize: 11.5, color: MUTED }}>{Math.round(PRACTICE_PASS * 100)}% opens it.</div>
      </div>
    );
  }
  return <BonusContent set={set} demo={demo} narrow={narrow} />;
}

function BonusContent({ set, demo, narrow }: { set: StudentSet; demo: boolean; narrow: boolean }) {
  const q = useQuery({ queryKey: ["set-bonus", set.id], queryFn: () => fetchSetBonus({ data: { setId: set.id } }), enabled: !demo, staleTime: 300_000, networkMode: "always" });
  if (demo) return <TypesMap spec={null} narrow={narrow} />;
  if (q.isLoading) return <div className="grid place-items-center p-8" style={{ color: MUTED }}><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const d = q.data;
  if (!d || d.status !== "ok") return <p style={{ padding: 20, color: MUTED, fontSize: 13, textAlign: "center", fontFamily: BRAND_SANS }}>{q.isError ? "Couldn't load the bonus — check your connection." : "Nothing here yet."}</p>;
  if (d.kind === "ale") return <AleList rows={d.rows} />;
  return <TypesMap spec={d.spec} narrow={narrow} />;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, letterSpacing: "0.14em", fontWeight: 800, color: MUTED, textTransform: "uppercase", fontFamily: BRAND_SANS, marginBottom: 8 }}>{children}</div>;
}

/** EVERY TRANSACTION, arrows only. A tap opens the rubric with the arrows lit under the row. */
function AleList({ rows }: { rows: { id: string; text: string; arrows: RubricArrows }[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div style={{ padding: "14px 14px 20px", color: INK, fontFamily: BRAND_SANS }}>
      <Kicker>Memorize · every transaction · {rows.length}</Kicker>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => {
          const on = openId === r.id;
          return (
            <div key={r.id}>
              <button type="button" onClick={() => setOpenId(on ? null : r.id)} aria-expanded={on}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", background: on ? "rgba(252,163,17,0.08)" : "rgba(255,255,255,0.05)", border: `1px solid ${on ? GOLD : EDGE}`, color: INK, fontSize: 14, lineHeight: 1.3, fontFamily: BRAND_SANS }}>
                <span style={{ flex: 1, minWidth: 0 }}>{r.text}</span>
                <span style={{ color: MINT, fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>{arrowsLine(r.arrows)}</span>
              </button>
              {on && (
                <div className="lk-in" style={{ margin: "6px 0 4px 18px", padding: 10, borderRadius: 10, border: `1px solid ${EDGE}`, background: "rgba(0,0,0,0.18)" }}>
                  <RubricAnswer value={r.arrows} readOnly compact />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** THE MAP: the five types, every account, cheat codes in gold, contras in red. */
function TypesMap({ spec, narrow }: { spec: TypesSpec | null; narrow: boolean }) {
  const s = spec ?? undefined;
  const item = (text: string, contra = false) => {
    const cc = isCheatCode(text);
    return (
      <li key={text} style={{ fontSize: 13, lineHeight: 1.35, color: contra ? RED : INK }}>
        {cc ? <span style={{ background: "rgba(252,163,17,0.16)", color: GOLD, borderRadius: 4, padding: "0 4px", fontWeight: 700 }}>{text}</span> : text}
      </li>
    );
  };
  const group = (label: string, id: TypeListId, contra = false) => {
    const list = listOf(s, id);
    if (!list.length) return null;
    return (
      <div key={id}>
        <div style={{ fontSize: 9.5, letterSpacing: "0.12em", fontWeight: 800, color: contra ? RED : MUTED, margin: "9px 0 3px", fontFamily: BRAND_SANS }}>{label}</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>{list.map((t) => item(t, contra))}</ul>
      </div>
    );
  };
  const col = (k: TypeKey) => {
    const info = TYPE_INFO[k];
    return (
      <div key={k} style={{ border: `1px solid ${EDGE}`, borderRadius: 12, padding: "10px 11px", background: "rgba(255,255,255,0.03)", minWidth: narrow ? 220 : 0, scrollSnapAlign: "start" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontFamily: BRAND_DISPLAY, fontWeight: 900, fontSize: 17, color: INK }}>{info.name}</span>
          <span style={{ fontFamily: BRAND_DISPLAY, fontWeight: 800, fontSize: 13, color: MUTED }}>{info.sign}</span>
        </div>
        <div style={{ fontSize: 10.5, letterSpacing: "0.14em", fontWeight: 800, color: GOLD, fontFamily: BRAND_SANS }}>{wordOf(s, k)}</div>
        {k === "A" && <>{group("Current", "A.current")}{group("Long-term", "A.longterm")}{group("Contra · opposite", "A.contra", true)}</>}
        {k === "L" && <>{group("Current", "L.current")}{group("Long-term", "L.longterm")}</>}
        {k === "E" && <>{group("Accounts", "E.all")}{group("Contra · opposite", "E.contra", true)}</>}
        {k === "Rev" && group("Accounts", "Rev.all")}
        {k === "Exp" && group("Accounts", "Exp.all")}
      </div>
    );
  };
  return (
    <div style={{ padding: "14px 14px 20px", color: INK, fontFamily: BRAND_SANS }}>
      <Kicker>Memorize · the 5 types, every account, every cheat code</Kicker>
      <div style={narrow
        ? { display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 6, margin: "0 -14px", padding: "0 14px 6px" }
        : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {TYPE_KEYS.map(col)}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: MUTED, marginTop: 10 }}>
        <span><span style={{ background: "rgba(252,163,17,0.16)", color: GOLD, borderRadius: 4, padding: "0 4px", fontWeight: 700 }}>gold</span> = a cheat code: see the word, you know the type</span>
        <span><span style={{ color: RED, fontWeight: 700 }}>red</span> = contra, the opposite of its partner</span>
        <span>+/− and −/+ = which side increases it</span>
      </div>
      {narrow && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Swipe for the other types →</div>}
    </div>
  );
}
