// /admin/growth/tranches — KING'S WORKING SURFACE. His tranches, each campus a click away
// from three doors: Campus Data, Add Contacts, View Results. Add Contacts is the whole job —
// councils first (the highest-leverage), then chapters, a rep push, then business clubs.
// Simple, top-to-bottom, one campus at a time.
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Landmark,
  Loader2,
  Plus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  growthCampusContactSlots,
  growthKingBoard,
  growthSaveCampusContacts,
  type BoardCampus,
} from "@/lib/growth-tranche.functions";
import { CampusPanel } from "@/components/growth/CampusPanel";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/tranches")({
  component: TranchesPage,
});

type Door = "data" | "contacts" | "results";

function TranchesPage() {
  const board = useQuery({ queryKey: ["king-board"], queryFn: () => growthKingBoard() });
  const [openTranche, setOpenTranche] = useState<number | null>(1);
  const [picked, setPicked] = useState<BoardCampus | null>(null);
  const [door, setDoor] = useState<Door | null>(null);

  if (board.isLoading)
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  const tranches = board.data?.tranches ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">Your tranches</h1>
        <span className="ml-auto text-xs text-muted-foreground">
          <strong className="text-foreground">{(board.data?.totalSeats ?? 0).toLocaleString()}</strong>{" "}
          est. students across your campuses
        </span>
      </div>

      {tranches.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No tranches yet — commit the semester pre-build at /admin/growth/prebuild.
        </p>
      )}

      {tranches.map((t) => {
        const open = openTranche === t.number;
        return (
          <div key={t.number} className="overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => setOpenTranche(open ? null : t.number)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left",
                t.status === "active" ? "bg-primary/[0.04]" : "bg-card",
              )}
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <span className="sa-admin-display text-sm font-semibold">Tranche {t.label}</span>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.status}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {t.campuses.length} campuses · {t.totalSeats.toLocaleString()} est. students
              </span>
            </button>
            {open && (
              <div className="divide-y divide-border/60 border-t border-border">
                {t.campuses.map((c) => (
                  <button
                    key={c.campusId}
                    onClick={() => {
                      setPicked(c);
                      setDoor(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{c.name}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {[c.state, `~${(c.seats ?? 0).toLocaleString()} students`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <ContactPips c={c} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 3-door menu */}
      {picked && !door && (
        <BottomSheet open onClose={() => setPicked(null)} title={<span className="sa-admin-display text-sm font-semibold">{picked.name}</span>}>
          <div className="grid grid-cols-3 gap-2 p-1">
            <DoorBtn icon={Building2} label="Campus Data" onClick={() => setDoor("data")} />
            <DoorBtn icon={UserPlus} label="Add Contacts" primary onClick={() => setDoor("contacts")} />
            <DoorBtn icon={BarChart3} label="View Results" onClick={() => setDoor("results")} />
          </div>
        </BottomSheet>
      )}

      {/* Campus Data / View Results reuse the campus panel */}
      {picked && (door === "data" || door === "results") && (
        <BottomSheet open onClose={() => { setDoor(null); }} title={<span className="sa-admin-display text-sm font-semibold">{picked.name}</span>}>
          <CampusPanel campusId={picked.campusId} pinned={false} initialSection={door === "results" ? "activity" : "snapshot"} />
        </BottomSheet>
      )}

      {/* Add Contacts modal */}
      {picked && door === "contacts" && (
        <AddContacts
          campus={picked}
          onClose={() => { setDoor(null); }}
          onSaved={() => board.refetch()}
        />
      )}
    </div>
  );
}

function ContactPips({ c }: { c: BoardCampus }) {
  const pip = (n: number, tone: string, title: string) => (
    <span
      title={title}
      className={cn(
        "grid size-5 place-items-center rounded-full text-[9px] font-semibold",
        n > 0 ? tone : "bg-muted text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
  return (
    <span className="flex shrink-0 items-center gap-1">
      {pip(c.councilContacts, "bg-emerald-500/15 text-emerald-400", "Council contacts")}
      {pip(c.greekContacts, "bg-primary/15 text-primary", "Greek chapter contacts")}
      {pip(c.clubContacts, "bg-sky-500/15 text-sky-400", "Club contacts")}
    </span>
  );
}

function DoorBtn({ icon: Icon, label, onClick, primary }: { icon: any; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-4 text-center",
        primary ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
      )}
    >
      <Icon className="size-5" />
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

// ── ADD CONTACTS ─────────────────────────────────────────────────────────────────────
type Row = {
  key: string;
  kind: "council" | "chapter" | "club";
  entityId: string | null;
  councilType: string | null;
  newClubName: string | null;
  newClubCategory: string | null;
  label: string;
  isPerson: boolean;
  name: string;
  role: string;
  email: string;
  instagram: string;
};

const emptyRow = (o: Partial<Row>): Row => ({
  key: o.key ?? Math.random().toString(36).slice(2),
  kind: o.kind ?? "council",
  entityId: o.entityId ?? null,
  councilType: o.councilType ?? null,
  newClubName: o.newClubName ?? null,
  newClubCategory: o.newClubCategory ?? null,
  label: o.label ?? "",
  isPerson: o.isPerson ?? false,
  name: "",
  role: "",
  email: "",
  instagram: "",
});

function AddContacts({ campus, onClose, onSaved }: { campus: BoardCampus; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const slots = useQuery({ queryKey: ["contact-slots", campus.campusId], queryFn: () => growthCampusContactSlots({ data: { campusId: campus.campusId } }) });
  const [open, setOpen] = useState<Record<string, boolean>>({ councils: true, chapters: false, rep: false, clubs: false });
  const [rows, setRows] = useState<Row[]>([]);

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (r: Partial<Row>) => setRows((rs) => [...rs, emptyRow(r)]);
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const filled = rows.filter((r) => r.email.trim() || r.instagram.trim());
  const save = useMutation({
    mutationFn: () =>
      growthSaveCampusContacts({
        data: {
          campusId: campus.campusId,
          contacts: filled.map((r) => ({
            kind: r.kind,
            entityId: r.entityId,
            councilType: r.councilType,
            newClubName: r.newClubName,
            newClubCategory: r.newClubCategory,
            isPerson: r.isPerson,
            name: r.name || null,
            role: r.role || null,
            email: r.email || null,
            instagram: r.instagram || null,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Nice work! ${r.saved} contact${r.saved === 1 ? "" : "s"} saved for ${campus.name}.`, {
        description: r.errors.length ? `${r.errors.length} skipped (dupes / invalid).` : undefined,
      });
      qc.invalidateQueries({ queryKey: ["contact-slots", campus.campusId] });
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const s = slots.data;
  const section = (id: string, n: number, title: string, hint: string, icon: any, children: ReactNode) => {
    const Icon = icon;
    return (
      <div className="rounded-lg border border-border">
        <button onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{n}</span>
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold">{title}</span>
          <span className="hidden text-[10px] text-muted-foreground sm:inline">{hint}</span>
          {open[id] ? <ChevronDown className="ml-auto size-4" /> : <ChevronRight className="ml-auto size-4" />}
        </button>
        {open[id] && <div className="space-y-2 border-t border-border p-3">{children}</div>}
      </div>
    );
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="sa-admin-display text-sm font-semibold">Add contacts · {campus.name}</span>
        </span>
      }
    >
      {slots.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-2 pb-24">
          {section("councils", 1, "IFC & Panhellenic Councils", "Highest leverage — one yes opens 15+ chapters", Landmark,
            <>
              {(s?.councils ?? []).map((c) => (
                <div key={c.type} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-medium">
                    {c.label}
                    {c.has > 0 && <span className="text-emerald-400">✓ {c.has}</span>}
                    <button onClick={() => add({ kind: "council", councilType: c.type, label: c.label })} className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline">
                      <Plus className="size-3" /> contact
                    </button>
                  </div>
                  {rows.filter((r) => r.kind === "council" && r.councilType === c.type).map((r) => (
                    <ContactRow key={r.key} r={r} set={set} remove={remove} />
                  ))}
                </div>
              ))}
            </>,
          )}
          {section("chapters", 2, "Greek Chapters", "Top 5 fraternities & sororities", Users,
            <>
              {(s?.chapters ?? []).slice(0, 20).map((ch) => (
                <div key={ch.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-medium">
                    {ch.name}
                    {ch.size != null && <span className="text-muted-foreground">{ch.size}</span>}
                    {ch.has > 0 && <span className="text-emerald-400">✓ {ch.has}</span>}
                    <button onClick={() => add({ kind: "chapter", entityId: ch.id, label: ch.name })} className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline">
                      <Plus className="size-3" /> contact
                    </button>
                  </div>
                  {rows.filter((r) => r.kind === "chapter" && r.entityId === ch.id).map((r) => (
                    <ContactRow key={r.key} r={r} set={set} remove={remove} />
                  ))}
                </div>
              ))}
            </>,
          )}
          {section("rep", 3, "Campus Rep Promotion", "A student who'll rep the campus", UserPlus,
            <>
              <p className="text-[11px] text-muted-foreground">Add a rep candidate (a person). We'll follow up to set them up with a tracked link.</p>
              {rows.filter((r) => r.kind === "club" && r.newClubCategory === "campus_rep").map((r) => (
                <ContactRow key={r.key} r={r} set={set} remove={remove} forcePerson />
              ))}
              <button onClick={() => add({ kind: "club", newClubName: "Campus Rep", newClubCategory: "campus_rep", isPerson: true, label: "Rep" })} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <Plus className="size-3" /> rep candidate
              </button>
            </>,
          )}
          {section("clubs", 4, "Women in Business, Finance & Investing Clubs", "Add a club and its contact", Building2,
            <>
              {(s?.clubs ?? []).map((cl) => (
                <div key={cl.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-medium">
                    {cl.name}
                    {cl.category && <span className="text-muted-foreground">{cl.category.replace(/_/g, " ")}</span>}
                    <button onClick={() => add({ kind: "club", entityId: cl.id, label: cl.name })} className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline">
                      <Plus className="size-3" /> contact
                    </button>
                  </div>
                  {rows.filter((r) => r.kind === "club" && r.entityId === cl.id).map((r) => (
                    <ContactRow key={r.key} r={r} set={set} remove={remove} />
                  ))}
                </div>
              ))}
              <NewClub onAdd={(name, category) => add({ kind: "club", newClubName: name, newClubCategory: category, label: name })} />
              {rows.filter((r) => r.kind === "club" && !r.entityId && r.newClubCategory !== "campus_rep").map((r) => (
                <div key={r.key} className="rounded border border-dashed border-border p-2">
                  <div className="mb-1 text-[11px] font-medium">{r.newClubName} <span className="text-muted-foreground">({(r.newClubCategory ?? "").replace(/_/g, " ")})</span></div>
                  <ContactRow r={r} set={set} remove={remove} />
                </div>
              ))}
            </>,
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-border bg-background px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">{filled.length} contact{filled.length === 1 ? "" : "s"} ready</span>
        <button
          onClick={() => save.mutate()}
          disabled={filled.length === 0 || save.isPending}
          className="ml-auto rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : `Save ${filled.length} contact${filled.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </BottomSheet>
  );
}

function ContactRow({ r, set, remove, forcePerson }: { r: Row; set: (k: string, p: Partial<Row>) => void; remove: (k: string) => void; forcePerson?: boolean }) {
  const person = forcePerson || r.isPerson;
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="mb-1.5 flex items-center gap-2">
        {!forcePerson && (
          <div className="inline-flex overflow-hidden rounded border border-border text-[10px]">
            <button onClick={() => set(r.key, { isPerson: false })} className={cn("px-2 py-0.5", !r.isPerson ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Organization</button>
            <button onClick={() => set(r.key, { isPerson: true })} className={cn("px-2 py-0.5", r.isPerson ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Person</button>
          </div>
        )}
        <button onClick={() => remove(r.key)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
      </div>
      {person && (
        <div className="mb-1.5 grid grid-cols-2 gap-1.5">
          <input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} placeholder="Name" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={r.role} onChange={(e) => set(r.key, { role: e.target.value })} placeholder="Role (e.g. President)" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <input value={r.email} onChange={(e) => set(r.key, { email: e.target.value })} placeholder="Email" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
        <input value={r.instagram} onChange={(e) => set(r.key, { instagram: e.target.value })} placeholder={person ? "@personal IG" : "@org IG"} className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
      </div>
    </div>
  );
}

function NewClub({ onAdd }: { onAdd: (name: string, category: string) => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("women_in_business");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim(), cat); setName(""); } }}
      className="flex items-center gap-1.5"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a club…" className="min-w-0 flex-1 rounded border border-dashed border-border bg-background px-2 py-1 text-[11px]" />
      <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded border border-border bg-card px-1.5 py-1 text-[11px]">
        <option value="women_in_business">Women in Business</option>
        <option value="finance">Finance</option>
        <option value="investing">Investing</option>
      </select>
      <button type="submit" disabled={!name.trim()} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40">Add</button>
    </form>
  );
}
