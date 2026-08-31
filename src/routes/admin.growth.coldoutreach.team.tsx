// /admin/growth/coldoutreach/team — Lee's VA team view: the Payments table (only READY campuses pay,
// $4/ready + $1/personal-IG by default) and the roster (add a VA, copy their private link, set rates,
// activate/deactivate). Refused to VA sessions (assertAdminNotVa) so pay never leaks to a VA.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { growthVaRoster, growthVaCreate, growthVaUpdate, type VaPayRow } from "@/lib/growth-va.functions";
import { ColdHeader } from "@/components/growth/ColdHeader";
import { renderQueryState } from "@/components/growth/QueryState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/coldoutreach/team")({ component: TeamPage });

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
      <ColdHeader tab="team" right={q.data ? <span className="text-xs text-muted-foreground">owed this month <strong className="text-foreground">{money(q.data.totalCents)}</strong></span> : undefined} />

      <div className="flex items-center gap-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="rounded border border-border px-2 py-1 text-xs">←</button>
        <span className="min-w-[9rem] text-center text-sm font-semibold">{fmtMonth(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= curMonth()} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-30">→</button>
        <button onClick={() => setAdding(true)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Plus className="size-3.5" /> Add VA</button>
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">Only campuses that reach READY pay — a half-finished campus pays nothing, which keeps quality in without review. Default $4 per READY campus, $1 per personal Instagram.</p>

      {adding && <AddVa month={month} onClose={() => setAdding(false)} />}
      {renderQueryState(q, { label: "the team" })}
      {q.data && q.data.teams.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">No VAs yet. Add one — they get a private link, no password.</p>
      )}
      {q.data?.teams.map((t) => (
        <div key={t.team} className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wide">{t.label}</span>
            <span className="ml-auto text-[12px] text-muted-foreground">subtotal <strong className="text-foreground">{money(t.subtotalCents)}</strong></span>
          </div>
          <div className="divide-y divide-border/60">
            {t.rows.map((r) => <VaRow key={r.id} r={r} month={month} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function VaRow({ r, month }: { r: VaPayRow; month: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/va/${r.token}` : `/va/${r.token}`;
  const refresh = () => qc.invalidateQueries({ queryKey: ["va-roster", month] });
  const upd = useMutation({
    mutationFn: (patch: { id: string; active?: boolean; name?: string; team?: "king" | "lee"; rateReadyCents?: number; rateIgCents?: number }) => growthVaUpdate({ data: patch }),
    onSuccess: (res) => { if (res.ok) refresh(); else toast.error(res.error ?? "Update failed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  return (
    <div className={cn("px-3 py-2.5", !r.active && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold">{r.name}</span>
        {!r.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">inactive</span>}
        <span className="text-[11px] text-muted-foreground">
          <strong className="text-emerald-400">{r.campusesReady}</strong> ready · <strong className="text-pink-400">{r.personalIgs}</strong> personal IG{r.personalIgs === 1 ? "" : "s"}
          {r.notFound > 0 && <span className="text-muted-foreground/70"> · {r.notFound} not-found</span>}
        </span>
        <span className="ml-auto text-[13px] font-semibold tabular-nums" title={`${money(r.payReadyCents)} ready + ${money(r.payIgCents)} IG`}>
          {money(r.payReadyCents)} + {money(r.payIgCents)} = <span className="text-primary">{money(r.payTotalCents)}</span>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
        <button onClick={() => copyText(link, "Link copied — send it to them.")} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"><Copy className="size-2.5" /> Copy link</button>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-muted-foreground hover:bg-muted"><Link2 className="size-2.5" /> Open</a>
        <button onClick={() => setEditing((v) => !v)} className="rounded border border-border px-2 py-1 hover:bg-muted">Rates</button>
        <button onClick={() => upd.mutate({ id: r.id, active: !r.active })} disabled={upd.isPending} className="rounded border border-border px-2 py-1 hover:bg-muted">{r.active ? "Deactivate" : "Reactivate"}</button>
      </div>
      {editing && <RateEditor r={r} onSave={(patch) => { upd.mutate({ id: r.id, ...patch }); setEditing(false); }} onCancel={() => setEditing(false)} />}
    </div>
  );
}

function RateEditor({ r, onSave, onCancel }: { r: VaPayRow; onSave: (p: { rateReadyCents: number; rateIgCents: number }) => void; onCancel: () => void }) {
  const [ready, setReady] = useState((r.rateReadyCents / 100).toString());
  const [ig, setIg] = useState((r.rateIgCents / 100).toString());
  const cents = (v: string) => Math.max(0, Math.round(parseFloat(v || "0") * 100));
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-card p-2 text-[11px]">
      <label className="inline-flex items-center gap-1">$<input value={ready} onChange={(e) => setReady(e.target.value)} inputMode="decimal" className="w-14 rounded border border-border bg-background px-1.5 py-1" /> per ready</label>
      <label className="inline-flex items-center gap-1">$<input value={ig} onChange={(e) => setIg(e.target.value)} inputMode="decimal" className="w-14 rounded border border-border bg-background px-1.5 py-1" /> per IG</label>
      <button onClick={() => onSave({ rateReadyCents: cents(ready), rateIgCents: cents(ig) })} className="rounded bg-primary px-2.5 py-1 font-medium text-primary-foreground">Save</button>
      <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-muted-foreground">Cancel</button>
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
