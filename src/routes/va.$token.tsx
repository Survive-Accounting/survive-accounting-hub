// /va/$token — VA enrichment mode. A stripped, passcode-free, mobile-first view for people whose
// only job is adding contacts. One campus at a time; no schedule, batch, revenue or strategy anywhere
// (a role filter, not a redesign — Lee's own view is untouched). The private link's token is the key.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { installVaSession } from "@/lib/admin-session.functions";
import { growthVaQueue, growthVaClaim, growthVaFinishCampus, type VaCampusCard } from "@/lib/growth-va.functions";
import type { BoardCampus } from "@/lib/growth-tranche.functions";
import { AddContacts } from "@/routes/admin.growth.coldoutreach.index";
import { OnboardingCards, VaHelp, hasOnboarded } from "@/components/growth/va-mode";

export const Route = createFileRoute("/va/$token")({
  component: VaPage,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Add contacts" }] }),
});

function VaPage() {
  const { token } = Route.useParams();
  const session = useQuery({ queryKey: ["va-session", token], queryFn: () => installVaSession({ data: { token } }), retry: false, staleTime: Infinity });

  if (session.isLoading) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!session.data?.ok) {
    return (
      <div className="mx-auto grid min-h-[70vh] max-w-sm place-items-center px-6 text-center">
        <div>
          <Zap className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">This link isn't active</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ask Lee or King for your personal link.</p>
        </div>
      </div>
    );
  }
  return <VaShell vaName={session.data.name ?? "there"} />;
}

function VaShell({ vaName }: { vaName: string }) {
  const queue = useQuery({ queryKey: ["va-queue"], queryFn: () => growthVaQueue() });
  const [active, setActive] = useState<VaCampusCard | null>(null);
  const [showOnboard, setShowOnboard] = useState(() => !hasOnboarded());
  const doneToday = queue.data?.doneToday ?? 0;

  const start = async (c: VaCampusCard) => {
    const r = await growthVaClaim({ data: { campusId: c.campusId } });
    if (!r.ok) { toast.message(r.error ?? "Couldn't start — refreshing."); queue.refetch(); return; }
    setActive(c);
  };
  const leave = async (opts: { done: boolean }) => {
    if (!active) return;
    const r = await growthVaFinishCampus({ data: { campusId: active.campusId, done: opts.done } });
    if (r.ready) toast.success(`🎉 ${active.name} is done!`);
    else if (opts.done) toast.success(`Marked ${active.name} done.`);
    setActive(null);
    await queue.refetch();
  };
  // A save that tips the campus into READY auto-advances; otherwise stay and keep going.
  const onSaved = async () => {
    if (!active) return;
    const r = await growthVaFinishCampus({ data: { campusId: active.campusId, done: false } });
    if (r.ready) { toast.success(`🎉 ${active.name} is done!`); setActive(null); }
    queue.refetch();
  };

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <span className="sa-admin-display text-base font-bold uppercase tracking-wide">Add contacts</span>
        <span className="ml-auto text-[12px] text-muted-foreground"><strong className="text-emerald-400">{doneToday}</strong> {doneToday === 1 ? "campus" : "campuses"} done today</span>
      </header>

      {active ? (
        <AddContacts
          campus={{ campusId: active.campusId, name: active.name } as unknown as BoardCampus}
          vaMode
          onSaved={onSaved}
          onClose={() => leave({ done: false })}
          onDone={() => leave({ done: true })}
        />
      ) : queue.isLoading ? (
        <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : queue.data?.current ? (
        <QueueCard current={queue.data.current} remaining={queue.data.remaining} onStart={() => start(queue.data!.current!)} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Check className="mx-auto size-8 text-emerald-400" />
          <p className="mt-2 text-base font-semibold">All caught up 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">No campuses waiting right now. Check back later, or text Lee.</p>
        </div>
      )}

      {showOnboard && <OnboardingCards onClose={() => setShowOnboard(false)} />}
      <VaHelp campusId={active?.campusId ?? queue.data?.current?.campusId ?? null} onHowItWorks={() => setShowOnboard(true)} />
    </div>
  );
}

function QueueCard({ current, remaining, onStart }: { current: VaCampusCard; remaining: number; onStart: () => void }) {
  return (
    <div className="space-y-3 text-center">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold uppercase tracking-wide">{current.name}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {[current.courseCode, `${current.coveredCount} of ${current.neededCount} contacts`].filter(Boolean).join(" · ")}
        </p>
        <button onClick={onStart} className="mt-5 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground active:scale-[0.99]">
          Start this campus →
        </button>
      </div>
      {remaining > 0 && <p className="text-[12px] text-muted-foreground">{remaining} more after this</p>}
    </div>
  );
}
