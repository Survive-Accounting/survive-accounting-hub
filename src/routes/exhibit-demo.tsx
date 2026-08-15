// EXHIBIT DEMO — living proof of the shared exhibit layer: a minimal T-ACCOUNT
// STUB built from DECLARATIONS ONLY (the real TAccountCardNode is untouched).
// The page renders it inside FilmContext=true, so what you see is film-mode
// behavior arriving for free: no chrome, click-to-glow with adjacency, and `
// clearing everything. Zero behavior code below — count the lines that aren't
// content. No canvas, no Supabase; safe to open anytime.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { useExhibit, type ExhibitDeclaration } from "@/components/canvas/exhibit-base";
import { clearExhibitHighlights } from "@/components/canvas/exhibit-highlights";
import { FilmContext } from "@/components/canvas/film-lock";
import { PAPER } from "@/components/canvas/theme";

export const Route = createFileRoute("/exhibit-demo")({
  head: () => ({ meta: [{ title: "⚡ Exhibit Layer Demo — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: ExhibitDemo,
});

// ---- THE ENTIRE T-ACCOUNT STUB: one declaration + content ------------------
const T_DECL: ExhibitDeclaration = {
  minWidth: 320,
  minHeight: 220,
  nodes: ["debits", "credits", "balance"],
  adjacency: [["debits", "credits"], ["debits", "balance"], ["credits", "balance"]],
};

function TAccountStub() {
  const ex = useExhibit(T_DECL);
  const cell = (nodeId: string, label: string, rows: string[]) => {
    const ns = ex.nodeStyle(nodeId);
    return (
      <div
        onClick={ex.nodeClick(nodeId)}
        style={{ cursor: ex.film ? "pointer" : undefined, opacity: ns.opacity, border: `1.5px solid ${ns.border}`, boxShadow: ns.boxShadow, borderRadius: 10, padding: 10, transition: "box-shadow 160ms ease, opacity 160ms ease", background: "rgba(255,255,255,0.55)" }}
        title={ex.film ? "Click to glow · ` clears" : undefined}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: PAPER.inkMuted, marginBottom: 6 }}>{label}</div>
        {rows.map((r, i) => <div key={i} style={{ fontSize: 15, fontWeight: 700, color: PAPER.ink, lineHeight: 1.5 }}>{r}</div>)}
      </div>
    );
  };
  // the T crossbar glows when both sides are lit — pure edgeLit, no code
  const crossLit = ex.edgeLit("debits", "credits");
  return (
    <div style={{ width: 420, borderRadius: 14, background: PAPER.card, padding: 16 }}>
      <div style={{ textAlign: "center", fontWeight: 900, fontSize: 18, color: PAPER.ink, marginBottom: 8 }}>Cash</div>
      <div style={{ height: 3, borderRadius: 2, background: crossLit ? "#FCA311" : PAPER.cardEdge, boxShadow: crossLit ? "0 0 14px rgba(252,163,17,0.8)" : undefined, transition: "box-shadow 160ms ease, background 160ms ease", marginBottom: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {cell("debits", "Debits", ["5,000", "1,200"])}
        {cell("credits", "Credits", ["800"])}
      </div>
      <div style={{ marginTop: 10 }}>{cell("balance", "Balance", ["5,400 DR"])}</div>
    </div>
  );
}
// ---- end of stub ------------------------------------------------------------

function ExhibitDemo() {
  // The page's only wiring: the ` reset the film controller normally provides.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Backquote" || e.key === "`") clearExhibitHighlights();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#080D18", padding: 40, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(230,236,255,0.75)", maxWidth: 640 }}>
        EXHIBIT LAYER PROOF — a T-account stub built from ONE declaration (3 nodes + adjacency) and its content.
        This page renders it in FILM MODE: click cells to glow (multi-select), light Debits + Credits to see the
        crossbar glow via adjacency, press ` to clear. It never implemented any of that.
      </div>
      <ReactFlowProvider>
        <FilmContext.Provider value={true}>
          <TAccountStub />
        </FilmContext.Provider>
      </ReactFlowProvider>
    </div>
  );
}
