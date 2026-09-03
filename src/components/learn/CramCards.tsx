// CRAM CARDS (Lee, 2026-09-03: "Cram blast off vid > cram cards > practice").
//
// The memorize-this / cheat-code / deeper-idea cards Lee placed on the film
// draft, in running order, drawn the way they film: navy card, the kind's
// accent, the main phrase highlighted, bullets under it. Nothing here is a
// new store — they are the set's own synced note frames (fetchSetCramCards).
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { renderInline } from "@/components/canvas/inline-md";
import { INK } from "@/components/learn/learn-theme";
import { fetchSetCramCards, type CramCard } from "@/lib/student.functions";

const LOOK: Record<CramCard["kind"], { label: string; accent: string }> = {
  cheat: { label: "CHEAT CODE", accent: "#FCA311" },
  phrase: { label: "MEMORIZE THIS", accent: "#FF9F43" },
  tip: { label: "DEEPER IDEA", accent: "#7DD3FC" },
};

export const DEMO_CRAM_CARDS: CramCard[] = [
  { id: "demo-1", kind: "cheat", text: "==The Paycheck Test==\nAsk yourself if they get a paycheck from the company. They're internal.", bullets: [] },
  { id: "demo-2", kind: "phrase", text: "==Internal users==", bullets: ["Management", "Budgets, costs, forecasts", "Production"] },
  { id: "demo-3", kind: "tip", text: "==External users only get what's published.==", bullets: ["Banks, investors, the IRS"] },
];

export function CramCardView({ card, scale = 1 }: { card: CramCard; scale?: number }) {
  const look = LOOK[card.kind];
  const s = scale;
  return (
    <div style={{
      background: "#14213D", border: `1.5px solid ${look.accent}`, borderRadius: 14 * s, padding: `${14 * s}px ${16 * s}px`,
      color: "#F5EFE6", boxShadow: "0 10px 30px -18px rgba(0,0,0,0.9)",
    }}>
      <div style={{ display: "inline-block", fontSize: 10.5 * s, fontWeight: 900, letterSpacing: "0.18em", color: look.accent, background: `${look.accent}24`, borderRadius: 6 * s, padding: `${2 * s}px ${8 * s}px`, marginBottom: 8 * s }}>
        {look.label}
      </div>
      <div style={{ fontSize: 21 * s, fontWeight: 800, lineHeight: 1.25, whiteSpace: "pre-wrap" }}>{renderInline(card.text, { bg: look.accent, color: "#14213D" })}</div>
      {card.bullets.length > 0 && (
        <ul style={{ margin: `${10 * s}px 0 0 ${4 * s}px`, padding: 0, listStyle: "none", display: "grid", gap: 5 * s }}>
          {card.bullets.map((b, i) => (
            <li key={i} style={{ display: "flex", gap: 7 * s, alignItems: "baseline", fontSize: 15 * s, fontWeight: 600, lineHeight: 1.3, color: "rgba(245,239,230,0.78)" }}>
              <span style={{ color: look.accent, fontWeight: 900 }}>•</span><span>{renderInline(b)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CramCardsPanel({ setId, demo, onPractice, practiceCount }: {
  setId: string; demo: boolean;
  /** "Practice →" — the next step in the cram flow. */
  onPractice: () => void;
  practiceCount: number;
}) {
  const q = useQuery({ queryKey: ["set-cram-cards", setId], queryFn: () => fetchSetCramCards({ data: { setId } }), enabled: !demo, staleTime: 300_000 });
  const cards: CramCard[] = demo ? DEMO_CRAM_CARDS : q.data?.status === "ok" ? q.data.cards : [];
  return (
    <div className="flex flex-col" style={{ gap: 12, padding: "14px 16px 18px" }}>
      {!demo && q.isLoading && <div className="flex items-center gap-2 text-[12px]" style={{ color: INK.muted }}><Loader2 className="h-4 w-4 animate-spin" /> loading the cards…</div>}
      {!demo && q.isError && <div className="text-[12px]" style={{ color: "#FF5C6E" }}>Could not load the cards. Try again in a moment.</div>}
      {!demo && q.data && q.data.status !== "ok" && (
        <div className="text-[13px]" style={{ color: INK.muted }}>
          {q.data.status === "locked" ? "The cards for this set come with the paid course." : "No cram cards on this set yet — the video and practice have you covered."}
        </div>
      )}
      {cards.map((c) => <CramCardView key={c.id} card={c} scale={0.92} />)}
      {practiceCount > 0 && (
        <button type="button" className="lk-btn self-end" onClick={onPractice} style={{ marginTop: 4 }}>
          Practice {practiceCount} Qs →
        </button>
      )}
    </div>
  );
}
