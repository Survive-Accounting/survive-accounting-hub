// /outreach/active-roster — governance for the student-facing pickers.
// Lists every campus with its active-roster state + active-professor count, a
// toggle to include/exclude it, and (on expand) the professors on that campus's
// roster with an inline "remove from roster" control. Reads from the same
// active_roster columns that /order and (optionally) ProfIntel filter on.
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronRight, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  listActiveRosterCampuses, toggleCampusRoster, listRosterProfessors, removeProfessorFromRoster,
  type RosterCampus, type RosterProfessor,
} from "@/lib/active-roster.functions";

export const Route = createFileRoute("/outreach/active-roster")({
  component: ActiveRosterPage,
});

function ActiveRosterPage() {
  const listFn = useServerFn(listActiveRosterCampuses);
  const toggleFn = useServerFn(toggleCampusRoster);
  const [campuses, setCampuses] = useState<RosterCampus[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listFn().then(setCampuses).catch((e) => toast.error((e as Error).message)).finally(() => setLoading(false));
  }, [listFn]);
  useEffect(() => { reload(); }, [reload]);

  const activeCount = campuses.filter((c) => c.activeRoster).length;
  const profCount = campuses.reduce((n, c) => n + (c.activeRoster ? c.profCount : 0), 0);
  const ql = q.trim().toLowerCase();
  const filtered = ql ? campuses.filter((c) => c.name.toLowerCase().includes(ql)) : campuses;

  const toggle = async (c: RosterCampus) => {
    setBusyId(c.id);
    try {
      await toggleFn({ data: { campusId: c.id, active: !c.activeRoster } });
      setCampuses((prev) => prev.map((x) => (x.id === c.id ? { ...x, activeRoster: c.activeRoster ? null : "sec" } : x)));
    } catch (e) { toast.error((e as Error).message); } finally { setBusyId(null); }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold">Active Roster</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Campuses & professors students can pick on <code>/order</code>. {activeCount} active campus{activeCount === 1 ? "" : "es"} · {profCount} active professors.
      </p>

      <div className="relative mt-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Filter campuses…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border">
          {filtered.map((c) => {
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="border-b last:border-b-0">
                <div className={cn("flex items-center gap-3 px-3 py-2.5", c.activeRoster ? "bg-emerald-50/40" : "")}>
                  <button type="button" onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    {c.activeRoster && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{c.activeRoster}</span>
                    )}
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.profCount} prof{c.profCount === 1 ? "" : "s"}</span>
                  <Button size="sm" variant={c.activeRoster ? "outline" : "default"} disabled={busyId === c.id}
                    onClick={() => toggle(c)} className="shrink-0">
                    {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : c.activeRoster ? "Remove" : "Add to roster"}
                  </Button>
                </div>
                {isOpen && <RosterProfessors campusId={c.id} onChanged={reload} />}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No campuses match “{q}”.</div>}
        </div>
      )}
    </div>
  );
}

function RosterProfessors({ campusId, onChanged }: { campusId: string; onChanged: () => void }) {
  const listFn = useServerFn(listRosterProfessors);
  const removeFn = useServerFn(removeProfessorFromRoster);
  const [profs, setProfs] = useState<RosterProfessor[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    listFn({ data: { campusId } }).then((r) => { if (!off) setProfs(r); }).catch(() => { if (!off) setProfs([]); });
    return () => { off = true; };
  }, [campusId, listFn]);

  const remove = async (p: RosterProfessor) => {
    setBusyId(p.id);
    try {
      await removeFn({ data: { leadId: p.id } });
      setProfs((prev) => (prev ?? []).filter((x) => x.id !== p.id));
      onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusyId(null); }
  };

  if (profs === null) return <div className="px-9 py-3 text-xs text-muted-foreground">Loading professors…</div>;
  if (profs.length === 0) return <div className="px-9 py-3 text-xs text-muted-foreground">No active professors on this campus.</div>;
  return (
    <div className="bg-muted/30 px-9 py-3">
      <div className="divide-y">
        {profs.map((p) => (
          <div key={p.id} className="flex items-start gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{p.name}{p.title ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{p.title}</span> : null}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {p.email ?? "no email"}
                {p.department ? ` · ${p.department}` : ""}
                {p.source ? ` · ${p.source}` : ""}
                {p.activatedAt ? ` · added ${new Date(p.activatedAt).toLocaleDateString()}` : ""}
                {p.rmpRating != null ? ` · RMP ${p.rmpRating}${p.rmpNumRatings ? `/${p.rmpNumRatings}` : ""}` : ""}
              </div>
            </div>
            <Button size="sm" variant="ghost" className="shrink-0 text-red-600 hover:text-red-700" disabled={busyId === p.id} onClick={() => remove(p)}>
              {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="mr-1 h-3.5 w-3.5" /> Remove</>}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
