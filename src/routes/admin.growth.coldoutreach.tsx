// /admin/growth/coldoutreach — THE enrichment surface. The next 48 hours are one job: get
// rich contact data in, one campus at a time, fast. Everything else is deliberately off the
// path. Add Contacts is the only live door; a campus should take minutes, not half an hour.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Instagram,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Recycle,
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
  type ChapterSlot,
  type ContactSlots,
  type ExistingContact,
} from "@/lib/growth-tranche.functions";
import { growthUpdateContact } from "@/lib/growth-reach.functions";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/coldoutreach")({
  component: ColdOutreachPage,
});

// ── shared quick actions ──────────────────────────────────────────────────────────────
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
/** A prefilled search: a magnifier that opens Google, and a Copy button for the query text. */
function SearchPair({ query, label }: { query: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        title={`Google: ${query}`}
        onClick={(e) => { e.stopPropagation(); googleSearch(query); }}
        className="inline-grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="size-3" />
      </button>
      <button
        type="button"
        title="Copy search text"
        onClick={(e) => { e.stopPropagation(); copyText(query, "Search text copied."); }}
        className="inline-grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Copy className="size-3" />
      </button>
      {label && <span className="text-[9px] text-muted-foreground">{label}</span>}
    </span>
  );
}
function dmTemplate(entity: string, campusName: string) {
  const org = entity.trim() || "y'all";
  return `Hey ${org}! 👋 I'm with Survive Accounting. This Fall we're giving Intro Accounting students at ${campusName} a free Exam 1 study tool, and a few chapters are already sharing it with their members. Can I send you the link so ${org} can pass it along? It's free and takes 2 minutes. 🙏`;
}

// Emails whose local part looks like a rotating position, not a person.
const ROLE_LOCALPART = /^(president|pres|vp|vicepresident|treasurer|scholarship|academic|ifc|panhellenic|panhel|nphc|mgc|recruitment|rush|info|contact|secretary|exec|board|greeklife|fsl|chapter)/;
const suggestRoleAccount = (email: string) => {
  const lp = (email.split("@")[0] ?? "").toLowerCase().replace(/[._+-]/g, "");
  return !!lp && ROLE_LOCALPART.test(lp);
};
const igHandle = (s: string | null) => (s ? `@${String(s).replace(/^@+/, "")}` : null);

// Prefilled role chips — order is priority. Scholarship chair sits first: chapter GPA is their
// job and they're the easiest yes we have.
const ROLE_CHIPS = ["Scholarship / Academic Chair", "President", "Vice President", "Treasurer"];

const OWNERS: { id: BoardOwner; label: string }[] = [
  { id: "lee", label: "Lee" },
  { id: "king", label: "King" },
  { id: "ej", label: "EJ" },
];

// ── page ──────────────────────────────────────────────────────────────────────────────
function ColdOutreachPage() {
  const [owner, setOwner] = useState<BoardOwner>("king");
  const board = useQuery({ queryKey: ["co-board", owner], queryFn: () => growthBoard({ data: { owner } }) });
  const [openTranche, setOpenTranche] = useState<number | null>(1);
  const [picked, setPicked] = useState<BoardCampus | null>(null);
  const [door, setDoor] = useState<"menu" | "contacts">("menu");

  const tranches = board.data?.tranches ?? [];
  const ownerLabel = OWNERS.find((o) => o.id === owner)?.label ?? "";
  const readyCount = tranches.flatMap((t) => t.campuses).filter((c) => c.readiness?.ready).length;
  const totalCampuses = tranches.reduce((n, t) => n + t.campuses.length, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">Cold Outreach</h1>
          <span className="text-[11px] text-muted-foreground">Enrichment — one campus at a time</span>
          <Link to="/admin/growth/coldoutreach/schedule" className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
            Schedule →
          </Link>
          <span className="text-xs text-muted-foreground">
            <strong className="text-emerald-400">{readyCount}</strong> / {totalCampuses} ready
          </span>
        </div>
      </div>

      <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
        {OWNERS.map((o) => (
          <button
            key={o.id}
            onClick={() => { setOwner(o.id); setOpenTranche(1); }}
            className={cn("px-3.5 py-1.5 font-medium", owner === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {o.label}
          </button>
        ))}
      </div>

      {board.isLoading && (
        <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      )}
      {!board.isLoading && board.data?.ready === false && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">{ownerLabel} isn't set up yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add {ownerLabel} as a user and assign tranches — this view fills in automatically.</p>
        </div>
      )}

      {tranches.map((t) => {
        const open = openTranche === t.number;
        const ready = t.campuses.filter((c) => c.readiness?.ready).length;
        return (
          <div key={t.number} className="overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => setOpenTranche(open ? null : t.number)}
              className={cn("flex w-full items-center gap-2 px-3 py-2 text-left", t.status === "active" ? "bg-primary/[0.04]" : "bg-card")}
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <span className="sa-admin-display text-sm font-semibold">Tranche {t.label}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                <span className="text-emerald-400">{ready}</span>/{t.campuses.length} ready · {t.totalSeats.toLocaleString()} est.
              </span>
            </button>
            {open && (
              <div className="divide-y divide-border/60 border-t border-border">
                {t.campuses.map((c) => (
                  <button
                    key={c.campusId}
                    onClick={() => { setPicked(c); setDoor("menu"); }}
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

      {picked && door === "menu" && (
        <BottomSheet open onClose={() => setPicked(null)} title={<span className="sa-admin-display text-sm font-semibold">{picked.name}</span>}>
          <div className="grid grid-cols-3 gap-2 p-1">
            <DoorTile icon={Building2} label="Campus Data" soon />
            <DoorTile icon={UserPlus} label="Add Contacts" primary onClick={() => setDoor("contacts")} />
            <DoorTile icon={BarChart3} label="View Results" soon />
          </div>
        </BottomSheet>
      )}
      {picked && door === "contacts" && (
        <AddContacts campus={picked} onClose={() => setPicked(null)} onSaved={() => board.refetch()} />
      )}
    </div>
  );
}

function DoorTile({ icon: Icon, label, onClick, primary, soon }: { icon: any; label: string; onClick?: () => void; primary?: boolean; soon?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      className={cn(
        "relative flex flex-col items-center gap-1.5 rounded-lg border px-2 py-5 text-center",
        primary ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30" : "border-border",
        soon && "cursor-not-allowed opacity-45",
      )}
    >
      <Icon className="size-5" />
      <span className="text-[11px] font-medium">{label}</span>
      {soon && <span className="absolute right-1 top-1 rounded-full bg-muted px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-muted-foreground">Soon</span>}
    </button>
  );
}

function ContactPips({ c }: { c: BoardCampus }) {
  const pip = (n: number, tone: string, title: string, icon?: ReactNode) => (
    <span title={title} className={cn("grid h-5 min-w-5 place-items-center gap-0.5 rounded-full px-1 text-[9px] font-semibold", n > 0 ? tone : "bg-muted text-muted-foreground")}>
      {icon}{n}
    </span>
  );
  return (
    <span className="flex shrink-0 items-center gap-1">
      {pip(c.councilContacts, "bg-emerald-500/15 text-emerald-400", "Council contacts")}
      {pip(c.greekContacts, "bg-primary/15 text-primary", "Greek chapter contacts")}
      {pip(c.clubContacts, "bg-sky-500/15 text-sky-400", "Club contacts")}
      {pip(c.personalIgs, "bg-pink-500/15 text-pink-400", "Personal Instagram handles", <Instagram className="size-2.5" />)}
    </span>
  );
}

// ── the enrichment modal ────────────────────────────────────────────────────────────────
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
  isRoleAccount: boolean;
  roleAcctTouched: boolean;
  name: string;
  role: string;
  email: string;
  instagram: string;
};
const emptyRow = (o: Partial<Row>): Row => ({
  key: Math.random().toString(36).slice(2),
  kind: o.kind ?? "council",
  entityId: o.entityId ?? null,
  councilType: o.councilType ?? null,
  newClubName: o.newClubName ?? null,
  newClubCategory: o.newClubCategory ?? null,
  label: o.label ?? "",
  isPerson: o.isPerson ?? false,
  notFound: false,
  isRoleAccount: false,
  roleAcctTouched: false,
  name: "",
  role: o.role ?? "",
  email: "",
  instagram: "",
});

const draftKey = (campusId: string) => `coldoutreach:draft:${campusId}`;

function neededList(r: CampusReadiness): string[] {
  const out: string[] = [];
  if (!r.councilOk) out.push("No council or Greek Life / FSL office contact");
  if (r.fratsCovered < r.fratsTotal) out.push(`Fraternities: ${r.fratsCovered} of ${r.fratsTotal} have a contact`);
  if (r.sororitiesCovered < r.sororitiesTotal) out.push(`Sororities: ${r.sororitiesCovered} of ${r.sororitiesTotal} have a contact`);
  if (!r.clubOk) out.push("No business club contact");
  if (!r.personOk) out.push("No named person yet — all contacts are organization addresses");
  else if (!r.orgOk) out.push("No organization contact yet — all contacts are people");
  return out;
}

function AddContacts({ campus, onClose, onSaved }: { campus: BoardCampus; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const slots = useQuery({ queryKey: ["co-slots", campus.campusId], queryFn: () => growthCampusContactSlots({ data: { campusId: campus.campusId } }) });
  const [open, setOpen] = useState<Record<string, boolean>>({ councils: true, chapters: false, clubs: false, rep: false });
  const [rows, setRows] = useState<Row[]>([]);
  const [roleFilter, setRoleFilter] = useState(false);
  const restored = useRef(false);

  // Autosave the in-progress batch to browser storage, keyed by campus. Restore silently on return.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(campus.campusId));
      if (raw) {
        const parsed = JSON.parse(raw) as Row[];
        if (Array.isArray(parsed) && parsed.length) { setRows(parsed); restored.current = true; toast.message("Draft restored", { description: `${parsed.length} unsaved row${parsed.length === 1 ? "" : "s"} from last time.` }); }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus.campusId]);
  useEffect(() => {
    try {
      if (rows.length) localStorage.setItem(draftKey(campus.campusId), JSON.stringify(rows));
      else localStorage.removeItem(draftKey(campus.campusId));
    } catch { /* ignore */ }
  }, [rows, campus.campusId]);

  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (r: Partial<Row>) => setRows((rs) => [...rs, emptyRow(r)]);
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const rowsFor = (pred: (r: Row) => boolean) =>
    rows.filter(pred).map((r) => <NewContactRow key={r.key} r={r} set={set} remove={remove} campusName={campus.name} />);

  const filled = rows.filter((r) => r.notFound || r.email.trim() || r.instagram.trim());
  const save = useMutation({
    mutationFn: () =>
      growthSaveCampusContacts({
        data: {
          campusId: campus.campusId,
          contacts: filled.map((r) => ({
            kind: r.kind, entityId: r.entityId, councilType: r.councilType,
            newClubName: r.newClubName, newClubCategory: r.newClubCategory,
            isPerson: r.isPerson, notFound: r.notFound, isRoleAccount: r.isRoleAccount,
            name: r.name || null, role: r.role || null, email: r.email || null, instagram: r.instagram || null,
          })),
        },
      }),
    onSuccess: async (res) => {
      setRows([]);
      try { localStorage.removeItem(draftKey(campus.campusId)); } catch { /* ignore */ }
      await qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] });
      onSaved();
      // Re-read to report readiness precisely.
      let fresh: ContactSlots | undefined;
      try { fresh = await growthCampusContactSlots({ data: { campusId: campus.campusId } }); } catch { /* ignore */ }
      const need = fresh ? neededList(fresh.readiness) : [];
      if (fresh?.readiness.ready) {
        toast.success(`Saved ${res.saved}. 🎉 ${campus.name} is READY FOR OUTREACH.`);
      } else {
        toast.success(`Saved ${res.saved} for ${campus.name}.`, {
          description: need.length ? (
            <div className="mt-1 space-y-0.5 text-[11px]">
              <div className="font-medium">Not ready yet — still needed:</div>
              {need.map((n, i) => <div key={i}>· {n}</div>)}
            </div>
          ) : undefined,
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const s = slots.data;

  // Role-account filter view — every role/position inbox on the campus, for a semester refresh.
  const roleAccounts = useMemo(() => {
    if (!s) return [] as { where: string; c: ExistingContact }[];
    const out: { where: string; c: ExistingContact }[] = [];
    for (const cl of s.councils) for (const c of cl.contacts) if (c.isRoleAccount) out.push({ where: cl.label, c });
    for (const ch of s.chapters) for (const c of ch.contacts) if (c.isRoleAccount) out.push({ where: ch.name, c });
    for (const cb of s.clubs) for (const c of cb.contacts) if (c.isRoleAccount) out.push({ where: cb.name, c });
    return out;
  }, [s]);

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
    const needed = list.filter((ch) => ch.needed);
    const optional = list.filter((ch) => !ch.needed);
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{heading}</div>
        {needed.map((ch) => renderChapter(ch))}
        {optional.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-1 text-[9px] uppercase tracking-wide text-muted-foreground/70">
              <span className="h-px flex-1 bg-border" /> optional <span className="h-px flex-1 bg-border" />
            </div>
            {optional.map((ch) => renderChapter(ch))}
          </>
        )}
      </div>
    );
  };
  const renderChapter = (ch: ChapterSlot) => (
    <EntityRow
      key={ch.id}
      name={ch.name}
      sub={ch.size != null ? <span className="shrink-0 text-muted-foreground">{ch.size}</span> : null}
      searchQuery={`"${campus.name}" "${ch.name}" instagram`}
      existing={ch.contacts}
      notFound={ch.notFound}
      muted={!ch.needed}
      person
      onAdd={() => add({ kind: "chapter", entityId: ch.id, label: ch.name })}
      campusName={campus.name}
      onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })}
    >
      {rowsFor((r) => r.kind === "chapter" && r.entityId === ch.id)}
    </EntityRow>
  );

  return (
    <BottomSheet open onClose={onClose} title={<span className="sa-admin-display text-sm font-semibold">Add contacts · {campus.name}</span>}>
      {slots.isLoading || !s ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2 pb-24">
          <ReadinessBar r={s.readiness} personalIgs={s.personalIgs} />
          <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span>Click a name (or <span className="text-primary">+ contact</span>) to add — stack rows, Save once.</span>
            {roleAccounts.length > 0 && (
              <button onClick={() => setRoleFilter((v) => !v)} className={cn("ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5", roleFilter ? "border-amber-500/50 bg-amber-500/10 text-amber-500" : "border-border")}>
                <Recycle className="size-3" /> {roleAccounts.length} role account{roleAccounts.length === 1 ? "" : "s"}
              </button>
            )}
          </div>

          {roleFilter ? (
            <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
              <div className="mb-1 text-[11px] font-semibold text-amber-500">Role accounts — re-verify each semester</div>
              {roleAccounts.map(({ where, c }) => (
                <div key={c.id} className="flex items-center gap-1.5 text-[11px]">
                  <Recycle className="size-3 shrink-0 text-amber-500" />
                  <span className="text-muted-foreground">{where}:</span>
                  <span className="truncate">{[c.email, igHandle(c.instagram)].filter(Boolean).join(" · ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {section("councils", 1, "Councils & Greek Life Office", "Highest leverage — one yes opens 15+ chapters", Landmark,
                <>
                  {(s.councils).map((c) => (
                    <EntityRow
                      key={c.type}
                      name={c.label}
                      searchQuery={councilQuery(campus.name, c.type, c.label)}
                      existing={c.contacts}
                      notFound={c.notFound}
                      person
                      onAdd={() => add({ kind: "council", councilType: c.type, label: c.label })}
                      campusName={campus.name}
                      onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })}
                    >
                      {c.type === "fsl" && !c.contacts.length && rows.every((r) => r.councilType !== "fsl") && (
                        <button onClick={() => add({ kind: "council", councilType: "fsl", label: c.label, isPerson: true, role: "FSL Director" })} className="text-left text-[10px] italic text-muted-foreground/70 hover:text-primary">
                          + FSL Director (add a name when you have one — an email alone is enough to start)
                        </button>
                      )}
                      {rowsFor((r) => r.kind === "council" && r.councilType === c.type)}
                    </EntityRow>
                  ))}
                </>,
              )}

              {section("chapters", 2, "Greek Chapters", "Top 5 fraternities + top 5 sororities", Users,
                <>
                  {chapterGroup("fraternity", "Fraternities")}
                  {chapterGroup("sorority", "Sororities")}
                </>,
              )}

              {section("clubs", 3, "Business Clubs", "Women in Business, Finance, Investing — one contact", Building2,
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {CLUB_SEARCHES.map(([label, q]) => (
                      <span key={label} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {label} <SearchPair query={q(campus.name)} />
                      </span>
                    ))}
                  </div>
                  {(s.clubs).map((cl) => (
                    <EntityRow
                      key={cl.id}
                      name={cl.name}
                      sub={cl.category ? <span className="shrink-0 text-muted-foreground">{cl.category.replace(/_/g, " ")}</span> : null}
                      searchQuery={`"${campus.name}" "${cl.name}" instagram`}
                      existing={cl.contacts}
                      notFound={cl.notFound}
                      person
                      onAdd={() => add({ kind: "club", entityId: cl.id, label: cl.name })}
                      campusName={campus.name}
                      onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })}
                    >
                      {rowsFor((r) => r.kind === "club" && r.entityId === cl.id)}
                    </EntityRow>
                  ))}
                  <NewClub onAdd={(name, category) => add({ kind: "club", newClubName: name, newClubCategory: category, label: name })} />
                  {rows.filter((r) => r.kind === "club" && !r.entityId && r.newClubCategory !== "campus_rep").map((r) => (
                    <div key={r.key} className="rounded border border-dashed border-border p-2">
                      <div className="mb-1 text-[11px] font-medium">{r.newClubName} <span className="text-muted-foreground">({(r.newClubCategory ?? "").replace(/_/g, " ")})</span></div>
                      <NewContactRow r={r} set={set} remove={remove} campusName={campus.name} />
                    </div>
                  ))}
                </>,
              )}

              {section("rep", 4, "Campus Rep Promotion", "A specific individual — optional", UserPlus,
                <>
                  <p className="text-[11px] text-muted-foreground">Add a rep candidate (a specific person). We'll follow up with a tracked link. Optional — never blocks READY.</p>
                  {rows.filter((r) => r.kind === "club" && r.newClubCategory === "campus_rep").map((r) => (
                    <NewContactRow key={r.key} r={r} set={set} remove={remove} forcePerson campusName={campus.name} />
                  ))}
                  <button onClick={() => add({ kind: "club", newClubName: "Campus Rep", newClubCategory: "campus_rep", isPerson: true, label: "Rep" })} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <Plus className="size-3" /> rep candidate
                  </button>
                </>,
              )}
            </>
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

const CLUB_SEARCHES: [string, (u: string) => string][] = [
  ["Women in Business", (u) => `"${u}" "Women in Business" instagram`],
  ["Finance Club", (u) => `"${u}" finance club instagram`],
  ["Investing Club", (u) => `"${u}" investing OR investment club instagram`],
  ["Beta Alpha Psi", (u) => `"${u}" "Beta Alpha Psi" accounting`],
];
function councilQuery(campus: string, type: string, label: string) {
  if (type === "fsl") return `"${campus}" fraternity sorority life office staff`;
  if (type === "ifc") return `"${campus}" IFC interfraternity council executive board`;
  if (type === "panhellenic") return `"${campus}" panhellenic council executive board`;
  return `"${campus}" ${label} council executive board`;
}

function ReadinessBar({ r, personalIgs }: { r: CampusReadiness; personalIgs: number }) {
  const item = (ok: boolean, label: string) => (
    <span className={cn("inline-flex items-center gap-0.5", ok ? "text-emerald-400" : "text-muted-foreground")}>
      {ok ? <Check className="size-3" /> : <span className="inline-block size-1.5 rounded-full bg-current opacity-40" />} {label}
    </span>
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2 text-[11px]", r.ready ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/30")}>
      {r.ready ? <span className="font-bold uppercase tracking-wide text-emerald-400">🎉 Ready for outreach!</span> : <span className="font-medium">Needed:</span>}
      {item(r.councilOk, "Council/FSL")}
      {item(r.fratsCovered >= r.fratsTotal, `Frats ${r.fratsCovered}/${r.fratsTotal}`)}
      {item(r.sororitiesCovered >= r.sororitiesTotal, `Sororities ${r.sororitiesCovered}/${r.sororitiesTotal}`)}
      {item(r.clubOk, "Club")}
      {item(r.orgOk, "Org")}
      {item(r.personOk, "Person")}
      <span className="ml-auto inline-flex items-center gap-0.5 text-pink-400"><Instagram className="size-3" /> {personalIgs} personal IG{personalIgs === 1 ? "" : "s"}</span>
    </div>
  );
}

// One org (council / chapter / club): clickable name, search, existing contacts (each editable),
// not-found state, and any in-progress add rows.
function EntityRow({
  name, sub, searchQuery, existing, notFound, muted, onAdd, campusName, onEdited, children,
}: {
  name: string; sub?: ReactNode; searchQuery: string; existing: ExistingContact[];
  notFound: boolean; muted?: boolean; person?: boolean; onAdd: () => void; campusName: string;
  onEdited: () => void; children: ReactNode;
}) {
  const settled = notFound && existing.length === 0;
  return (
    <div className={cn("space-y-1", (muted || settled) && "opacity-45 transition-opacity hover:opacity-100")}>
      <div className="flex items-center gap-2 text-[11px] font-medium">
        <button onClick={onAdd} className="min-w-0 truncate text-left hover:text-primary hover:underline" title="Add a contact">{name}</button>
        {sub}
        <SearchPair query={searchQuery} />
        {existing.length > 0 && <span className="shrink-0 text-emerald-400">✓ {existing.length}</span>}
        {settled && <span className="shrink-0 inline-flex items-center gap-0.5 italic text-amber-500/80"><Check className="size-2.5" /> not found</span>}
        <button onClick={onAdd} className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-primary hover:underline"><Plus className="size-3" /> contact</button>
      </div>
      {existing.map((c) => <ExistingRow key={c.id} c={c} campusName={campusName} onEdited={onEdited} />)}
      {children}
    </div>
  );
}

// Existing saved contact — read-only line with a personal-IG dot and role-account recycle icon,
// plus an inline (non-modal) editor.
function ExistingRow({ c, campusName, onEdited }: { c: ExistingContact; campusName: string; onEdited: () => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: c.name ?? "", role: c.role ?? "", email: c.email ?? "", instagram: c.instagram ?? "", isRoleAccount: c.isRoleAccount });
  const save = useMutation({
    mutationFn: () => growthUpdateContact({ data: { qcId: c.id, name: f.name || null, role: f.role || null, email: f.email || null, instagram: f.instagram || null, isRoleAccount: f.isRoleAccount } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Contact updated."); setEditing(false); onEdited(); } else toast.error(r.error ?? "Update failed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  if (editing) {
    return (
      <div className="space-y-1.5 rounded-md border border-primary/40 bg-card p-2 pl-2">
        <div className="grid grid-cols-2 gap-1.5">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@instagram" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Role" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <label className="inline-flex items-center gap-1 text-muted-foreground">
            <input type="checkbox" checked={f.isRoleAccount} onChange={(e) => setF({ ...f, isRoleAccount: e.target.checked })} /> <Recycle className="size-3" /> role account
          </label>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="ml-auto rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground disabled:opacity-40">{save.isPending ? "…" : "Save"}</button>
          <button onClick={() => setEditing(false)} className="rounded border border-border px-2 py-0.5 text-muted-foreground">Cancel</button>
        </div>
      </div>
    );
  }
  const line = [c.name, c.role, c.email, igHandle(c.instagram)].filter(Boolean).join(" · ") || "contact";
  return (
    <div className="group flex items-center gap-1.5 pl-1 text-[10px] text-muted-foreground">
      <Check className="size-2.5 shrink-0 text-emerald-400" />
      <span className="min-w-0 truncate">{line}</span>
      {c.isPerson && c.instagram && <Instagram className="size-2.5 shrink-0 text-pink-400" />}
      {c.isRoleAccount && <Recycle className="size-2.5 shrink-0 text-amber-500" />}
      <button onClick={() => setEditing(true)} title="Edit" className="ml-auto opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"><Pencil className="size-3" /></button>
    </div>
  );
}

// A new contact being entered — Org / Person / Not found, IG beside name for people, role chips,
// role-account auto-suggest.
function NewContactRow({ r, set, remove, forcePerson, campusName }: { r: Row; set: (k: string, p: Partial<Row>) => void; remove: (k: string) => void; forcePerson?: boolean; campusName: string }) {
  const person = !r.notFound && (forcePerson || r.isPerson);
  const onEmail = (email: string) => {
    const patch: Partial<Row> = { email };
    if (!r.roleAcctTouched) patch.isRoleAccount = suggestRoleAccount(email); // auto-suggest until manually set
    set(r.key, patch);
  };
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
            <>
              <div className="mb-1.5 flex flex-wrap gap-1">
                {ROLE_CHIPS.map((role, i) => (
                  <button key={role} onClick={() => set(r.key, { role })} className={cn("rounded-full border px-2 py-0.5 text-[10px]", r.role === role ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted", i === 0 && r.role !== role && "border-primary/40")}>
                    {role}
                  </button>
                ))}
              </div>
              {/* Instagram sits beside name, above email — personal IGs are the highest-value field. */}
              <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                <input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} placeholder="Name" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
                <input value={r.instagram} onChange={(e) => set(r.key, { instagram: e.target.value })} placeholder="@personal IG" className="rounded border border-pink-500/30 bg-background px-2 py-1 text-[11px]" />
              </div>
              <input value={r.role} onChange={(e) => set(r.key, { role: e.target.value })} placeholder="Role (or pick a chip above)" className="mb-1.5 w-full rounded border border-border bg-background px-2 py-1 text-[11px]" />
            </>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <input value={r.email} onChange={(e) => onEmail(e.target.value)} placeholder="Email" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
            {!person && <input value={r.instagram} onChange={(e) => set(r.key, { instagram: e.target.value })} placeholder="@org IG" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
            <label className="inline-flex items-center gap-1 text-muted-foreground" title="A role/position inbox that turns over each year">
              <input type="checkbox" checked={r.isRoleAccount} onChange={(e) => set(r.key, { isRoleAccount: e.target.checked, roleAcctTouched: true })} />
              <Recycle className="size-3" /> role account
            </label>
            <button type="button" onClick={() => copyText(dmTemplate(person && r.name.trim() ? r.name.trim() : r.label, campusName), "DM copied — paste it into their Instagram.")} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Copy className="size-3" /> Copy DM
            </button>
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
    <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim(), cat); setName(""); } }} className="flex items-center gap-1.5">
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
