import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Sparkles, User, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchQueue,
  claimCampus,
  releaseClaim,
  isMine,
  type QueueRow,
} from "@/lib/outreach-queue";
import { getAdminWho, adminEmailFor } from "@/components/AdminGate";

type FilterMode = "all" | "mine" | "unclaimed";

function formatTuition(row: QueueRow): string {
  const cents = row.annual_tuition_out_state_cents ?? row.annual_tuition_in_state_cents;
  if (!cents || cents <= 0) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function expiresLabel(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m left`;
}

export interface CampusQueuePanelProps {
  onReview: (campusId: string) => void;
}

export function CampusQueuePanel({ onReview }: CampusQueuePanelProps) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const who = getAdminWho();
  const myEmail = who ? adminEmailFor(who) : null;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["campus-queue"],
    queryFn: fetchQueue,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Tick every 30s so "47m left" labels stay fresh without refetching.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const all = data ?? [];
    if (filter === "mine") return all.filter((r) => isMine(r, who));
    if (filter === "unclaimed") return all.filter((r) => !r.claim_id);
    return all;
  }, [data, filter, who]);

  const handleClaim = async (row: QueueRow) => {
    setBusyId(row.campus_id);
    try {
      await claimCampus(row.campus_id);
      toast.success(`Claimed ${row.name}`);
      await qc.invalidateQueries({ queryKey: ["campus-queue"] });
      onReview(row.campus_id);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't claim");
      await refetch();
    } finally {
      setBusyId(null);
    }
  };

  const handleRelease = async (row: QueueRow) => {
    setBusyId(row.campus_id);
    try {
      await releaseClaim(row.campus_id);
      toast.success(`Released ${row.name}`);
      await qc.invalidateQueries({ queryKey: ["campus-queue"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't release");
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      mine: all.filter((r) => isMine(r, who)).length,
      unclaimed: all.filter((r) => !r.claim_id).length,
    };
  }, [data, who]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Approval queue</h2>
          <p className="text-xs text-muted-foreground">
            Sorted by annual out-of-state tuition. Claim a campus to lock it for 2 hours.
            {who ? <> Signed in as <span className="font-medium">{who}</span>.</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All · {counts.total}</FilterChip>
          <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>Mine · {counts.mine}</FilterChip>
          <FilterChip active={filter === "unclaimed"} onClick={() => setFilter("unclaimed")}>Open · {counts.unclaimed}</FilterChip>
        </div>
      </header>

      {isLoading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading queue…</div>
      ) : error ? (
        <div className="p-10 text-center text-sm text-destructive">Failed to load queue.</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Nothing in the queue. Nice work.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row, idx) => {
            const mine = isMine(row, who);
            const lockedByOther = !!row.claim_id && !mine;
            const isTop = idx === 0 && filter === "all";
            return (
              <li
                key={row.campus_id}
                className={`flex items-center gap-4 p-4 ${
                  lockedByOther ? "bg-muted/30 opacity-70" : ""
                } ${isTop ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}`}
              >
                <div className="w-10 text-right text-sm font-mono text-muted-foreground">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{row.name}</span>
                    {isTop && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Sparkles className="h-3 w-3" /> Next up
                      </Badge>
                    )}
                    {row.state && (
                      <span className="text-xs text-muted-foreground">{row.state}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Tuition {formatTuition(row)}/yr</span>
                    {row.claim_id && (
                      <span className="flex items-center gap-1">
                        {mine ? (
                          <>
                            <User className="h-3 w-3" /> Claimed by you
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3" /> Claimed by {row.claimed_by?.split("@")[0]}
                          </>
                        )}
                        <span className="text-muted-foreground/70">·</span>
                        <Clock className="h-3 w-3" /> {expiresLabel(row.claim_expires_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {mine ? (
                    <>
                      <Button size="sm" onClick={() => onReview(row.campus_id)}>
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === row.campus_id}
                        onClick={() => handleRelease(row)}
                      >
                        Release
                      </Button>
                    </>
                  ) : lockedByOther ? (
                    <Button size="sm" variant="outline" disabled>
                      Locked
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busyId === row.campus_id || !myEmail}
                      onClick={() => handleClaim(row)}
                    >
                      Claim
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default CampusQueuePanel;
