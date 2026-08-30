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
  Copy,
  Landmark,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  growthBoard,
  growthCampusContactSlots,
  growthSaveCampusContacts,
  type BoardCampus,
  type BoardOwner,
  type CampusReadiness,
  type ExistingContact,
} from "@/lib/growth-tranche.functions";
import { CampusPanel } from "@/components/growth/CampusPanel";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/tranches")({
  component: TranchesPage,
});

type Door = "data" | "contacts" | "results";

const OWNERS: { id: BoardOwner; label: string }[] = [
  { id: "lee", label: "Lee" },
  { id: "king", label: "King" },
  { id: "ej", label: "EJ" },
];

function TranchesPage() {
  const [owner, setOwner] = useState<BoardOwner>("king");
  const board = useQuery({ queryKey: ["board", owner], queryFn: () => growthBoard({ data: { owner } }) });
  const [openTranche, setOpenTranche] = useState<number | null>(1);
  const [picked, setPicked] = useState<BoardCampus | null>(null);
  const [door, setDoor] = useState<Door | null>(null);

  const tranches = board.data?.tranches ?? [];
  const ownerLabel = OWNERS.find((o) => o.id === owner)?.label ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">
          {owner === "lee" ? "Lee's tranches" : owner === "ej" ? "EJ's tranches" : "King's tranches"}
          {owner === "lee" && <span className="ml-1.5 text-[11px] font-normal normal-case tracking-normal text-muted-foreground">Founder</span>}
        </h1>
        <span className="ml-auto text-xs text-muted-foreground">
          <strong className="text-foreground">{(board.data?.totalSeats ?? 0).toLocaleString()}</strong>{" "}
          est. students
        </span>
      </div>

      {/* Whose tranches */}
      <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
        {OWNERS.map((o) => (
          <button
            key={o.id}
            onClick={() => { setOwner(o.id); setOpenTranche(1); }}
            className={cn(
              "px-3.5 py-1.5 font-medium",
              owner === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {board.isLoading && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}

      {!board.isLoading && board.data?.ready === false && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">{ownerLabel} isn't set up yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add {ownerLabel} as a user and assign tranches — this view will fill in automatically.</p>
        </div>
      )}

      {!board.isLoading && board.data?.ready !== false && tranches.length === 0 && (
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
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium">{c.name}</span>
                        {c.readiness?.ready && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-emerald-400">
                            <Check className="size-2.5" /> Ready
                          </span>
                        )}
                      </span>
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

// ── QUICK ACTIONS ────────────────────────────────────────────────────────────────────
// King spends his time finding council/chapter pages and DMing them. Two shortcuts:
// a 🔍 that opens a prefilled Google search (find the IG/page in one click, no typing),
// and a "Copy DM" that puts a ready outreach message on the clipboard to paste into IG.
function googleSearch(query: string) {
  window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
}
async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error("Couldn't copy — clipboard is blocked here.");
  }
}
/** Small inline Google-search button. Stops propagation so it never triggers the row toggle. */
function FindBtn({ query }: { query: string }) {
  return (
    <button
      type="button"
      title={`Google: ${query}`}
      onClick={(e) => { e.stopPropagation(); googleSearch(query); }}
      className="inline-grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Search className="size-3" />
    </button>
  );
}
/** A pre-filled Instagram DM. Entity is the org name / Greek letters; season keeps it timely. */
function dmTemplate(entity: string, campusName: string) {
  const org = entity.trim() || "y'all";
  return `Hey ${org}! 👋 I'm with Survive Accounting. This Fall we're giving Intro Accounting students at ${campusName} a free Exam 1 study tool, and a few chapters are already sharing it with their members. Can I send you the link so ${org} can pass it along? It's free and takes 2 minutes. 🙏`;
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
  notFound: boolean;
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
  notFound: false,
  name: "",
  role: "",
  email: "",
  instagram: "",
});

// Readiness summary shown at the top of the modal (reflects what's already saved).
function ReadinessBar({ r }: { r: CampusReadiness }) {
  const item = (ok: boolean, label: string) => (
    <span className={cn("inline-flex items-center gap-0.5", ok ? "text-emerald-400" : "text-muted-foreground")}>
      {ok ? <Check className="size-3" /> : <span className="inline-block size-1.5 rounded-full bg-current opacity-40" />} {label}
    </span>
  );
  return (
    <div className={cn(
      "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2 text-[11px]",
      r.ready ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/30",
    )}>
      {r.ready
        ? <span className="font-bold uppercase tracking-wide text-emerald-400">🎉 Ready for outreach!</span>
        : <span className="font-medium">Needed:</span>}
      {item(r.councilOk, "Council")}
      {item(r.fratsCovered >= r.fratsTotal, `Frats ${r.fratsCovered}/${r.fratsTotal}`)}
      {item(r.sororitiesCovered >= r.sororitiesTotal, `Sororities ${r.sororitiesCovered}/${r.sororitiesTotal}`)}
      {item(r.clubOk, "Club")}
    </div>
  );
}

// Existing (already-saved) contacts, read-only.
function ExistingList({ contacts }: { contacts: ExistingContact[] }) {
  if (!contacts.length) return null;
  return (
    <div className="space-y-0.5 pl-1">
      {contacts.map((c) => {
        const ig = c.instagram ? `@${String(c.instagram).replace(/^@/, "")}` : null;
        const label = [c.name, c.role, c.email, ig].filter(Boolean).join(" · ") || "contact";
        return (
          <div key={c.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Check className="size-2.5 shrink-0 text-emerald-400" />
            <span className="truncate">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// One entity's block — a clickable name (adds a contact), a Google search, existing contacts,
// the not-found state, and any in-progress rows. Shared by councils / chapters / clubs.
function EntityBlock({
  name, kindLabel, searchQuery, existing, notFound, muted, onAdd, children,
}: {
  name: string;
  kindLabel?: ReactNode;
  searchQuery: string;
  existing: ExistingContact[];
  notFound: boolean;
  muted?: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", muted && "opacity-45 transition-opacity hover:opacity-100")}>
      <div className="flex items-center gap-2 text-[11px] font-medium">
        <button onClick={onAdd} className="min-w-0 truncate text-left hover:text-primary hover:underline" title="Add a contact">
          {name}
        </button>
        {kindLabel}
        <FindBtn query={searchQuery} />
        {existing.length > 0 && <span className="shrink-0 text-emerald-400">✓ {existing.length}</span>}
        {notFound && existing.length === 0 && <span className="shrink-0 italic text-amber-500/80">not found</span>}
        <button onClick={onAdd} className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-primary hover:underline">
          <Plus className="size-3" /> contact
        </button>
      </div>
      <ExistingList contacts={existing} />
      {children}
    </div>
  );
}

function AddContacts({ campus, onClose, onSaved }: { campus: BoardCampus; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const slots = useQuery({ queryKey: ["contact-slots", campus.campusId], queryFn: () => growthCampusContactSlots({ data: { campusId: campus.campusId } }) });
  const [open, setOpen] = useState<Record<string, boolean>>({ councils: true, chapters: false, clubs: false, rep: false });
  const [rows, setRows] = useState<Row[]>([]);

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (r: Partial<Row>) => setRows((rs) => [...rs, emptyRow(r)]);
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const rowsFor = (pred: (r: Row) => boolean) => rows.filter(pred).map((r) => <ContactRow key={r.key} r={r} set={set} remove={remove} campusName={campus.name} />);

  // A row is ready to submit if it's a real contact (email/IG) or an explicit "not found".
  const filled = rows.filter((r) => r.notFound || r.email.trim() || r.instagram.trim());
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
            notFound: r.notFound,
            name: r.name || null,
            role: r.role || null,
            email: r.email || null,
            instagram: r.instagram || null,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Nice work! ${r.saved} saved for ${campus.name}.`, {
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

  const chapterGroup = (type: "fraternity" | "sorority", heading: string) => {
    const list = (s?.chapters ?? []).filter((ch) => ch.orgType === type);
    if (!list.length) return null;
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {heading} <span className="font-normal normal-case">· top 5 needed</span>
        </div>
        {list.map((ch) => (
          <EntityBlock
            key={ch.id}
            name={ch.name}
            kindLabel={
              ch.size != null
                ? <span className="shrink-0 text-muted-foreground">{ch.size}</span>
                : !ch.needed
                  ? <span className="shrink-0 text-[9px] text-muted-foreground">#{ch.rank}</span>
                  : null
            }
            searchQuery={`${ch.name} ${campus.name} instagram`}
            existing={ch.contacts}
            notFound={ch.notFound}
            muted={!ch.needed}
            onAdd={() => add({ kind: "chapter", entityId: ch.id, label: ch.name })}
          >
            {rowsFor((r) => r.kind === "chapter" && r.entityId === ch.id)}
          </EntityBlock>
        ))}
      </div>
    );
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={<span className="sa-admin-display text-sm font-semibold">Add contacts · {campus.name}</span>}
    >
      {slots.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-2 pb-24">
          <ReadinessBar r={campus.readiness} />
          <p className="px-1 text-[10px] text-muted-foreground">
            Click a name (or <span className="text-primary">+ contact</span>) to add — stack as many as you want, then Save once.
          </p>

          {section("councils", 1, "IFC & Panhellenic Councils", "Highest leverage — one yes opens 15+ chapters", Landmark,
            <>
              {(s?.councils ?? []).map((c) => (
                <EntityBlock
                  key={c.type}
                  name={c.label}
                  searchQuery={`${campus.name} ${c.label} council instagram`}
                  existing={c.contacts}
                  notFound={c.notFound}
                  onAdd={() => add({ kind: "council", councilType: c.type, label: c.label })}
                >
                  {rowsFor((r) => r.kind === "council" && r.councilType === c.type)}
                </EntityBlock>
              ))}
            </>,
          )}

          {section("chapters", 2, "Greek Chapters", "Top 5 fraternities + top 5 sororities", Users,
            <>
              {chapterGroup("fraternity", "Fraternities")}
              {chapterGroup("sorority", "Sororities")}
            </>,
          )}

          {section("clubs", 3, "Women in Business, Finance & Investing Clubs", "At least one club contact", Building2,
            <>
              <div className="flex flex-wrap gap-1.5">
                {([["Women in Business", "women in business club"], ["Finance Club", "finance club"], ["Investing Club", "investing club"]] as const).map(([label, q]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => googleSearch(`${campus.name} ${q} instagram`)}
                    title={`Google: ${campus.name} ${q}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Search className="size-3" /> {label}
                  </button>
                ))}
              </div>
              {(s?.clubs ?? []).map((cl) => (
                <EntityBlock
                  key={cl.id}
                  name={cl.name}
                  kindLabel={cl.category ? <span className="shrink-0 text-muted-foreground">{cl.category.replace(/_/g, " ")}</span> : null}
                  searchQuery={`${cl.name} ${campus.name} instagram`}
                  existing={cl.contacts}
                  notFound={cl.notFound}
                  onAdd={() => add({ kind: "club", entityId: cl.id, label: cl.name })}
                >
                  {rowsFor((r) => r.kind === "club" && r.entityId === cl.id)}
                </EntityBlock>
              ))}
              <NewClub onAdd={(name, category) => add({ kind: "club", newClubName: name, newClubCategory: category, label: name })} />
              {rows.filter((r) => r.kind === "club" && !r.entityId && r.newClubCategory !== "campus_rep").map((r) => (
                <div key={r.key} className="rounded border border-dashed border-border p-2">
                  <div className="mb-1 text-[11px] font-medium">{r.newClubName} <span className="text-muted-foreground">({(r.newClubCategory ?? "").replace(/_/g, " ")})</span></div>
                  <ContactRow r={r} set={set} remove={remove} campusName={campus.name} />
                </div>
              ))}
            </>,
          )}

          {section("rep", 4, "Campus Rep Promotion", "A specific individual — optional", UserPlus,
            <>
              <p className="text-[11px] text-muted-foreground">Add a rep candidate (a specific person). We'll follow up to set them up with a tracked link.</p>
              {rows.filter((r) => r.kind === "club" && r.newClubCategory === "campus_rep").map((r) => (
                <ContactRow key={r.key} r={r} set={set} remove={remove} forcePerson campusName={campus.name} />
              ))}
              <button onClick={() => add({ kind: "club", newClubName: "Campus Rep", newClubCategory: "campus_rep", isPerson: true, label: "Rep" })} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <Plus className="size-3" /> rep candidate
              </button>
            </>,
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-border bg-background px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">{filled.length} to save</span>
        <button
          onClick={() => save.mutate()}
          disabled={filled.length === 0 || save.isPending}
          className="ml-auto rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : `Save ${filled.length}`}
        </button>
      </div>
    </BottomSheet>
  );
}

function ContactRow({ r, set, remove, forcePerson, campusName }: { r: Row; set: (k: string, p: Partial<Row>) => void; remove: (k: string) => void; forcePerson?: boolean; campusName: string }) {
  const person = !r.notFound && (forcePerson || r.isPerson);
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="mb-1.5 flex items-center gap-2">
        {!forcePerson && (
          <div className="inline-flex overflow-hidden rounded border border-border text-[10px]">
            <button onClick={() => set(r.key, { isPerson: false, notFound: false })} className={cn("px-2 py-0.5", !r.isPerson && !r.notFound ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Organization</button>
            <button onClick={() => set(r.key, { isPerson: true, notFound: false })} className={cn("px-2 py-0.5", r.isPerson && !r.notFound ? "bg-primary/15 text-primary" : "text-muted-foreground")}>Person</button>
            <button onClick={() => set(r.key, { notFound: true, isPerson: false })} className={cn("px-2 py-0.5", r.notFound ? "bg-amber-500/15 text-amber-500" : "text-muted-foreground")}>Not found</button>
          </div>
        )}
        <button onClick={() => remove(r.key)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
      </div>
      {r.notFound ? (
        <p className="text-[10px] italic text-muted-foreground">We'll record that {r.label || "this"} was checked and no contact was found.</p>
      ) : (
        <>
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
          <div className="mt-1.5 flex items-center gap-2 text-[10px]">
            <button
              type="button"
              onClick={() => copyText(dmTemplate(person && r.name.trim() ? r.name.trim() : r.label, campusName), "DM copied — paste it into their Instagram.")}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy className="size-3" /> Copy DM
            </button>
            {r.label && <FindBtn query={`${r.label} ${campusName} instagram`} />}
          </div>
        </>
      )}
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
