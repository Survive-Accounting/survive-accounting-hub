// /outreach/demand — every unified-intake lead, with contacted_at actually settable (spec §7).
// Founder alerts deep-link here as ?lead=<id>.
import { createFileRoute } from "@tanstack/react-router";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { WaitlistCard } from "@/components/outreach/WaitlistCard";

export const Route = createFileRoute("/outreach/demand")({
  validateSearch: (s: Record<string, unknown>): { lead?: string } => ({ lead: typeof s.lead === "string" && s.lead ? s.lead : undefined }),
  head: () => ({ meta: [{ title: "Demand — outreach" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: DemandPage,
});

function DemandPage() {
  const { lead } = Route.useSearch();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" style={{ color: "#0B1220", fontFamily: BRAND_SANS }}>
      <h1 className="mb-1 text-[24px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Demand</h1>
      <p className="mb-5 text-[12.5px]" style={{ color: "#6B7280" }}>Every signup, syllabus, claim, rep application and referral — one list. Priority kinds texted you when they arrived; the rest roll into Sunday's digest.</p>
      <WaitlistCard focusLeadId={lead ?? null} />
    </div>
  );
}
