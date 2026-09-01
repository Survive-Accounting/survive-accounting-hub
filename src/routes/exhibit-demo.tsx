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
import { cycleExhibitModes, exhibitDepthKey, exhibitRevealKey } from "@/components/canvas/exhibit-modes";
import { UsersNode } from "@/components/canvas/cards/UsersNode";
import { StandardsNode } from "@/components/canvas/cards/StandardsNode";
import { BasisNode } from "@/components/canvas/cards/BasisNode";
import { CareersNode } from "@/components/canvas/cards/CareersNode";
import { ClassificationNode } from "@/components/canvas/cards/ClassificationNode";
import { CycleNode } from "@/components/canvas/cards/CycleNode";
import { blankCard } from "@/components/canvas/templates";
import { FilmContext } from "@/components/canvas/film-lock";
import { PAPER } from "@/components/canvas/theme";

// Real exhibit cards mounted OUTSIDE a ReactFlow graph for QA: NodeProps is
// wider than what the cards actually read (id / data / selected), so the demo
// narrows the type rather than fabricating a whole node.
const UsersDemo = UsersNode as unknown as (p: { id: string; data: unknown; selected?: boolean }) => React.ReactNode;
const StandardsDemo = StandardsNode as unknown as (p: { id: string; data: unknown; selected?: boolean }) => React.ReactNode;
const BasisDemo = BasisNode as unknown as (p: { id: string; data: unknown; selected?: boolean }) => React.ReactNode;
const CareersDemo = CareersNode as unknown as (p: { id: string; data: unknown; selected?: boolean }) => React.ReactNode;
const ClassificationDemo = ClassificationNode as unknown as (p: { id: string; data: unknown; selected?: boolean }) => React.ReactNode;
const CycleDemo = CycleNode as unknown as (p: { id: string; data: unknown; selected?: boolean }) => React.ReactNode;

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
  // The page's only wiring: the film-controller keys the previewer normally
  // provides — ` reset, Tab/Shift+Tab reveal stepping, D depth layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Backquote" || e.key === "`") clearExhibitHighlights();
      if (e.key === "Tab" && exhibitRevealKey(e.shiftKey ? "back" : "step")) e.preventDefault();
      if ((e.key === "d" || e.key === "D") && !e.ctrlKey && !e.metaKey && !e.altKey) exhibitDepthKey();
      if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey) cycleExhibitModes();
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
          {/* WHO'S IT FOR? — film-mode QA mount: Tab/Shift+Tab steps the reveal,
              D toggles the differences strip, ` clears spotlight + resets. */}
          <div style={{ marginTop: 8 }}>
            <UsersDemo id="demo-users" data={{ kind: "users" }} selected={false} />
          </div>
          {/* the same card at a mobile-ish width — the stacked degradation */}
          <div style={{ marginTop: 8 }}>
            <UsersDemo id="demo-users-narrow" data={{ kind: "users", w: 420, h: 760 }} selected={false} />
          </div>
          {/* THE RULEBOOK & THE COPS — same film keys (Tab reveal, D = A+ layer) */}
          <div style={{ marginTop: 8 }}>
            <StandardsDemo id="demo-standards" data={{ kind: "standards" }} selected={false} />
          </div>
          <div style={{ marginTop: 8 }}>
            <StandardsDemo id="demo-standards-narrow" data={{ kind: "standards", w: 420, h: 720 }} selected={false} />
          </div>
          {/* WHEN IT COUNTS — cash vs accrual (Tab reveal, M example toggle, D gaps) */}
          <div style={{ marginTop: 8 }}>
            <BasisDemo id="demo-basis" data={{ kind: "basis" }} selected={false} />
          </div>
          <div style={{ marginTop: 8 }}>
            <BasisDemo id="demo-basis-narrow" data={{ kind: "basis", w: 440, h: 640 }} selected={false} />
          </div>
          {/* WHO DO YOU WORK FOR? — careers branch map (Tab reveal, D = day-to-day) */}
          <div style={{ marginTop: 8 }}>
            <CareersDemo id="demo-careers" data={{ kind: "careers" }} selected={false} />
          </div>
          <div style={{ marginTop: 8 }}>
            <CareersDemo id="demo-careers-narrow" data={{ kind: "careers", w: 440, h: 900 }} selected={false} />
          </div>
          {/* THE 5 TYPES OF ACCOUNTS — classifier (Tab reveal, D = Current/Long-term) */}
          <div style={{ marginTop: 8 }}>
            <ClassificationDemo id="demo-classification" data={{ kind: "classification" }} selected={false} />
          </div>
          <div style={{ marginTop: 8 }}>
            <ClassificationDemo id="demo-classification-narrow" data={{ kind: "classification", w: 460, h: 1200 }} selected={false} />
          </div>
          {/* THE ACCOUNTING CYCLE — the card Lee films most, and the one that had
              no canvas-free QA mount. It starts in PLAIN: click a step to
              highlight it, click again to blur it, shift-click an arrow to light
              a chain, ` clears, 0 resets. M walks on to Source Docs /
              Definitions / Order, which is where the popovers and the orbit
              live. Seeded from blankCard so this is the real nine steps.

              CAVEAT for whoever QAs here: exhibit-modes keeps ONE module-level
              modeDefs slot ("one moded exhibit kind mounted at a time today"),
              and this page mounts two moded cards — Basis and Cycle — so M is
              whichever rendered last. Not a product bug: a frame in the capture
              window only ever has one exhibit on it. Trust the click gestures
              on this page; test M in the Studio. */}
          <div style={{ marginTop: 8 }}>
            <CycleDemo id="demo-cycle" data={blankCard("cycle")} selected={false} />
          </div>
        </FilmContext.Provider>
      </ReactFlowProvider>
    </div>
  );
}
