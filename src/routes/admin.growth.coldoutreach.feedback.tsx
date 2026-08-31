// /admin/growth/coldoutreach/feedback — the plain list of "what would make this faster next time?"
// notes, newest first. The enrichment panel captures them while the friction is fresh; this is where
// they pile up so King's and EJ's papercuts surface without a meeting.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { growthListFeedback, type EnrichmentFeedback } from "@/lib/growth-enrich-feedback.functions";
import { ColdHeader } from "@/components/growth/ColdHeader";
import { renderQueryState } from "@/components/growth/QueryState";

export const Route = createFileRoute("/admin/growth/coldoutreach/feedback")({ component: FeedbackPage });

const fmt = (ts: string) => { try { return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ts; } };
const who = (s: string | null) => { const v = (s || "").toLowerCase(); return v.includes("king") ? "King" : v.includes("ej") ? "EJ" : v.includes("lee") ? "Lee" : (s || "—"); };

function FeedbackPage() {
  const q = useQuery({ queryKey: ["enrich-feedback"], queryFn: () => growthListFeedback({ data: { limit: 200 } }) });
  const items = q.data?.items ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <ColdHeader tab="activity" />
      <div className="flex items-center gap-2 px-1">
        <MessageSquarePlus className="size-4 text-amber-400" />
        <h1 className="text-sm font-semibold">What would make enrichment faster</h1>
        <span className="text-[11px] text-muted-foreground">{items.length} note{items.length === 1 ? "" : "s"}</span>
        <Link to="/admin/growth/coldoutreach" className="ml-auto text-[11px] text-primary hover:underline">← Back to enrichment</Link>
      </div>
      {renderQueryState(q, { label: "feedback" })}
      {q.data && !items.length && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">No feedback yet. It fills in as people work campuses and jot what slowed them down.</p>
      )}
      <div className="space-y-2">
        {items.map((f) => <FeedbackCard key={f.id} f={f} />)}
      </div>
    </div>
  );
}

function FeedbackCard({ f }: { f: EnrichmentFeedback }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="whitespace-pre-wrap text-[13px] text-foreground">{f.note}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground/80">{who(f.createdBy)}</span>
        {f.campusName && <><span>·</span><span>{f.campusName}</span></>}
        <span>·</span><span>{fmt(f.createdAt)}</span>
      </div>
    </div>
  );
}
