// /admin/growth/coldoutreach/team — Lee's VA team view: the roster (add a VA, copy their private
// link, activate/deactivate) and light per-VA activity for a month. No pay — VAs work pro bono.
// Refused to VA sessions (assertAdminNotVa). "Preview as a VA" opens the VA view from your account.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Eye, Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { growthVaRoster, growthVaCreate, growthVaUpdate, type VaRosterRow } from "@/lib/growth-va.functions";
import { ColdHeader } from "@/components/growth/ColdHeader";
import { renderQueryState } from "@/components/growth/QueryState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/coldoutreach/team")({ component: TeamPage });

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const curMonth = () => { try { return new Date().toISOString().slice(0, 7); } catch { return "2026-09"; } };
const shiftMonth = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const fmtMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${MON[mo - 1]} ${y}`; };
async function copyText(t: string, ok: string) { try { await navigator.clipboard.writeText(t); toast.success(ok); } catch { toast.error("Couldn't copy."); } }

function TeamPage() {
  const [month, setMonth] = useState(curMonth());
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ["va-roster", month], queryFn: () => growthVaRoster({ data: { month } }) });

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <ColdHeader tab="team" />

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded border border-border px-2 py-1 text-xs">←</button>
        <span className="min-w-[9rem] text-center text-sm font-semibold">{fmtMonth(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= curMonth()} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-30">→</button>
        <Link to="/admin/growth/coldoutreach/va-preview" className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"><Eye className="size-3.5" /> Preview as a VA</Link>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5" /> Add VA</button>
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">VAs add contacts through a private, passcode-free link. Activity below is this month; “ready” means a campus they finished to a full contact set.</p>

      {adding && <AddVa month={month} onClose={() => setAdding(false)} />}
      {renderQueryState(q, { label: "the team" })}
      {q.data && q.data.teams.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">No VAs yet. Add one — they get a private link, no password.</p>
      )}
      {q.data?.teams.map((t) => (
        <div key={t.team} className="overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-card px-3 py-2 text-[11px] font-bold uppercase tracking-wide">{t.label}</div>
          <div className="divide-y divide-border/60">
            {t.rows.map((r) => <VaRow key={r.id} r={r} month={month} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function VaRow({ r, month }: { r: VaRosterRow; month: string }) {
  const qc = useQueryClient();
  const link = typeof window !== "undefined" ? `${window.location.origin}/va/${r.token}` : `/va/${r.token}`;
  const upd = useMutation({
    mutationFn: (patch: { id: string; active?: boolean; name?: string }) => growthVaUpdate({ data: patch }),
    onSuccess: (res) => { if (res.ok) qc.invalidateQueries({ queryKey: ["va-roster", month] }); else toast.error(res.error ?? "Update failed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  return (
    <div className={cn("px-3 py-2.5", !r.active && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold">{r.name}</span>
        {!r.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">inactive</span>}
        <span className="ml-auto text-[11px] text-muted-foreground">
          <strong className="text-emerald-400">{r.campusesReady}</strong> ready · <strong className="text-pink-400">{r.personalIgs}</strong> personal IG{r.personalIgs === 1 ? "" : "s"} · {r.contacts} contact{r.contacts === 1 ? "" : "s"}
          {r.notFound > 0 && <span className="text-muted-foreground/70"> · {r.notFound} not-found</span>}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
        <button onClick={() => copyText(link, "Link copied — send it to them.")} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"><Copy className="size-2.5" /> Copy link</button>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-muted-foreground hover:bg-muted"><Link2 className="size-2.5" /> Open</a>
        <button onClick={() => upd.mutate({ id: r.id, active: !r.active })} disabled={upd.isPending} className="rounded border border-border px-2 py-1 hover:bg-muted">{r.active ? "Deactivate" : "Reactivate"}</button>
      </div>
    </div>
  );
}

function AddVa({ month, onClose }: { month: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [team, setTeam] = useState<"king" | "lee">("king");
  const [created, setCreated] = useState<{ token: string } | null>(null);
  const link = useMemo(() => (created && typeof window !== "undefined" ? `${window.location.origin}/va/${created.token}` : ""), [created]);
  const m = useMutation({
    mutationFn: () => growthVaCreate({ data: { name: name.trim(), team } }),
    onSuccess: (r) => { if (r.ok && r.token) { setCreated({ token: r.token }); qc.invalidateQueries({ queryKey: ["va-roster", month] }); } else toast.error(r.error ?? "Couldn't add"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add"),
  });
  return (
    <div className="rounded-lg border border-primary/40 bg-card p-3">
      {created ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-400"><Check className="size-4" /> {name} added</div>
          <p className="text-[11px] text-muted-foreground">Send them this private link — no password, works on their phone:</p>
          <div className="flex items-center gap-1.5">
            <input readOnly value={link} className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-[11px]" />
            <button onClick={() => copyText(link, "Link copied.")} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground"><Copy className="size-3" /> Copy</button>
          </div>
          <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Done</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold">Add a VA</span>
            <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-[12px]" />
            <div className="inline-flex overflow-hidden rounded border border-border text-[11px]">
              <button onClick={() => setTeam("king")} className={cn("px-2.5 py-1.5", team === "king" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>King's team</button>
              <button onClick={() => setTeam("lee")} className={cn("px-2.5 py-1.5", team === "lee" ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Lee's team</button>
            </div>
            <button onClick={() => name.trim() && m.mutate()} disabled={!name.trim() || m.isPending} className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-40">{m.isPending ? "…" : "Create link"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
