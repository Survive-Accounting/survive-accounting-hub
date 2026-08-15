// CALLOUT DEMO (P1) — a standalone review surface for the standardized callout
// card: the three variants Lee asked to see (plain · multi-stem · MEMORIZE THIS
// with boiling bolt) plus the highlights stack, rendered with dummy data. No
// canvas, no Supabase, no storage — safe to open while authoring elsewhere.
import { createFileRoute } from "@tanstack/react-router";

import { CalloutBody } from "@/components/canvas/cards/CalloutCard";
import { PAPER } from "@/components/canvas/theme";

export const Route = createFileRoute("/callout-demo")({
  head: () => ({ meta: [{ title: "⚡ Callout Demo — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: CalloutDemo,
});

function Shell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(230,236,255,0.5)", marginBottom: 10 }}>{label}</div>
      <div style={{ width: "fit-content", minWidth: 320, maxWidth: 560, borderRadius: 14, background: PAPER.card, border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.6)" }}>
        <div style={{ overflow: "hidden", borderRadius: 13, padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function CalloutDemo() {
  return (
    <div style={{ minHeight: "100vh", background: "#080D18", padding: 40, display: "flex", flexDirection: "column", gap: 36 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(230,236,255,0.75)" }}>
        CALLOUT (P1) — the standardized reading card. Auto-fits its text (no orphaned tail); same component the note frames render in the Studio, previewer and film.
      </div>
      <Shell label="1 · Plain callout — topic + stem, auto-sized">
        <CalloutBody scale={1} topic="The Accounting Cycle" stem={"What is the correct order?"} />
      </Shell>
      <Shell label="2 · Multi-stem — main stem full-strength, others indented gray bullets">
        <CalloutBody
          scale={1}
          topic="The Accounting Cycle"
          stem={"Which step comes after the unadjusted trial balance?"}
          extraStems={["What is the correct order?", "Which financial statement is prepared first?"]}
        />
      </Shell>
      <Shell label="3 · MEMORIZE THIS — type banner + boiling bolt (both one-click options)">
        <CalloutBody scale={1} topic="Debits & Credits" stem={"DEALER: Dividends · Expenses · Assets = Liabilities · Equity · Revenue"} kind="memorize-this" bolt />
      </Shell>
      <Shell label="4 · Highlights from this set — several memos as one recap card (the Lookback surface)">
        <CalloutBody
          scale={1}
          topic="Types of Accounts"
          stem=""
          highlights={["Anything “Payable” is always a liability", "Anything “Receivable” is always an asset", "Unearned Revenue is a liability!"]}
        />
      </Shell>
    </div>
  );
}
