// /admin/growth/coldoutreach/va-preview — "act as a VA" from your own admin account. Renders the
// exact VA view (queue → add panel, onboarding, help bolt) for a chosen team, driven by the admin
// session (assertAdminNotVa) — no VA link or cookie needed, no claiming. Contacts you add here
// attribute to you, not a VA, so it's a true preview, not impersonation.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, Loader2 } from "lucide-react";
import { growthVaQueuePreview, type VaCampusCard } from "@/lib/growth-va.functions";
import type { BoardCampus } from "@/lib/growth-tranche.functions";
import { AddContacts } from "@/routes/admin.growth.coldoutreach.index";
import { OnboardingCards, VaHelp } from "@/components/growth/va-mode";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/coldoutreach/va-preview")({ component: VaPreviewPage });

function VaPreviewPage() {
  const [team, setTeam] = useState<"king" | "lee">("king");
  const [active, setActive] = useState<VaCampusCard | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const queue = useQuery({ queryKey: ["va-preview", team], queryFn: () => growthVaQueuePreview({ data: { team } }) });

  const back = () => { setActive(null); queue.refetch(); };

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-3">
      {/* admin-only banner so it's clearly a preview, plus the team + exit controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px]">
        <Eye className="size-3.5 text-amber-400" />
        <span className="font-semibold text-amber-400">Previewing the VA view</span>
        <span className="text-muted-foreground">— you're admin; contacts you add attribute to you</span>
        <div className="ml-auto inline-flex overflow-hidden rounded border border-border">
          <button onClick={() => { setActive(null); setTeam("king"); }} className={cn("px-2 py-0.5", team === "king" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>King's</button>
          <button onClick={() => { setActive(null); setTeam("lee"); }} className={cn("px-2 py-0.5", team === "lee" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Lee's</button>
        </div>
        <Link to="/admin/growth/coldoutreach/team" className="text-muted-foreground underline decoration-dotted hover:text-foreground">Exit</Link>
      </div>

      <header className="mb-4 flex items-center gap-2">
        <span className="sa-admin-display text-base font-bold uppercase tracking-wide">Add contacts</span>
        <span className="ml-auto text-[12px] text-muted-foreground"><strong className="text-emerald-400">{queue.data?.doneToday ?? 0}</strong> ready so far</span>
      </header>

      {active ? (
        <AddContacts
          campus={{ campusId: active.campusId, name: active.name } as unknown as BoardCampus}
          vaMode
          onSaved={() => queue.refetch()}
          onClose={back}
          onDone={back}
        />
      ) : queue.isLoading ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : queue.data?.current ? (
        <div className="space-y-3 text-center">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold uppercase tracking-wide">{queue.data.current.name}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{[queue.data.current.courseCode, `${queue.data.current.coveredCount} of ${queue.data.current.neededCount} contacts`].filter(Boolean).join(" · ")}</p>
            <button onClick={() => setActive(queue.data!.current!)} className="mt-5 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground active:scale-[0.99]">Start this campus →</button>
          </div>
          {queue.data.remaining > 0 && <p className="text-[12px] text-muted-foreground">{queue.data.remaining} more after this</p>}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Check className="mx-auto size-8 text-emerald-400" />
          <p className="mt-2 text-base font-semibold">All caught up 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">No campuses waiting for this team right now.</p>
        </div>
      )}

      {showOnboard && <OnboardingCards onClose={() => setShowOnboard(false)} />}
      <VaHelp preview campusId={active?.campusId ?? queue.data?.current?.campusId ?? null} onHowItWorks={() => setShowOnboard(true)} />
    </div>
  );
}
