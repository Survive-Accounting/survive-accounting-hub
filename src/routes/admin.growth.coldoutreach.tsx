// /admin/growth/coldoutreach — THE enrichment surface. The next 48 hours are one job: get
// rich contact data in, one campus at a time, fast. Everything else is deliberately off the
// path. Add Contacts is the only live door; a campus should take minutes, not half an hour.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  growthBoard,
  growthCampusContactSlots,
  growthRenameClub,
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
import { ColdHeader } from "@/components/growth/ColdHeader";
import { renderQueryState } from "@/components/growth/QueryState";
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
// Role-search dropdown. Searching for an individual by role surfaces their personal Instagram —
// the field we most want and the one an org-level search never returns. Priority order.
const ROLE_SEARCHES: { label: string; q: (campus: string, org: string) => string }[] = [
  { label: "Scholarship / Academic Chair", q: (c, o) => `"${c}" "${o}" scholarship chair OR academic chair` },
  { label: "President", q: (c, o) => `"${c}" "${o}" president 2026` },
  { label: "Vice President", q: (c, o) => `"${c}" "${o}" vice president 2026` },
  { label: "Treasurer", q: (c, o) => `"${c}" "${o}" treasurer 2026` },
  { label: "The organization itself", q: (c, o) => `"${c}" "${o}" instagram` },
];
function RoleSearch({ campus, org }: { campus: string; org: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block shrink-0">
      <button
        type="button"
        title="Search for a contact by role — opens a prefilled Google search"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Search className="size-2.5" /> Search ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-0.5 w-52 rounded-md border border-border bg-background p-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          <div className="px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">Search for…</div>
          {ROLE_SEARCHES.map((rs) => (
            <button key={rs.label} onClick={(e) => { e.stopPropagation(); googleSearch(rs.q(campus, org)); setOpen(false); }} className="block w-full rounded px-2 py-1 text-left text-[10px] hover:bg-muted">
              {rs.label}
            </button>
          ))}
        </div>
      )}
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

  const tranches = board.data?.tranches ?? [];
  const ownerLabel = OWNERS.find((o) => o.id === owner)?.label ?? "";
  const readyCount = tranches.flatMap((t) => t.campuses).filter((c) => c.readiness?.ready).length;
  const totalCampuses = tranches.reduce((n, t) => n + t.campuses.length, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <ColdHeader
        tab="enrichment"
        right={
          <span title="Campuses with a complete contact set, out of your assigned batches" className="text-xs text-muted-foreground">
            <strong className="text-emerald-400">{readyCount}</strong> / {totalCampuses} ready
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
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
        <PipLegend />
      </div>

      {renderQueryState(board)}
      {!board.isLoading && !board.isError && board.data?.ready === false && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">{ownerLabel} isn't set up yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Add {ownerLabel} as a user and assign batches — this view fills in automatically.</p>
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
              <span className="sa-admin-display text-sm font-semibold">Batch {t.label}</span>
              <span title="Campuses ready for outreach in this batch · estimated students / yr" className="ml-auto text-[11px] text-muted-foreground">
                <span className="text-emerald-400">{ready}</span>/{t.campuses.length} ready · {t.totalSeats.toLocaleString()} est.
              </span>
            </button>
            {open && (
              <div className="divide-y divide-border/60 border-t border-border">
                {t.campuses.map((c) => (
                  <button
                    key={c.campusId}
                    onClick={() => setPicked(c)}
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

      {/* Campus click opens Add Contacts directly — no dead-tile door menu. */}
      {picked && (
        <AddContacts campus={picked} onClose={() => setPicked(null)} onSaved={() => board.refetch()} />
      )}
    </div>
  );
}

function PipLegend() {
  const dot = (tone: string, label: string, icon?: ReactNode) => (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-grid size-3.5 place-items-center rounded-full", tone)}>{icon}</span>
      {label}
    </span>
  );
  return (
    <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground" title="Contacts on file: councils · chapters · clubs · personal Instagrams">
      {dot("bg-emerald-500/15", "Councils")}
      {dot("bg-primary/15", "Chapters")}
      {dot("bg-sky-500/15", "Clubs")}
      {dot("bg-pink-500/15", "IG", <Instagram className="size-2 text-pink-400" />)}
    </div>
  );
}

function ContactPips({ c }: { c: BoardCampus }) {
  const pip = (n: number, tone: string, title: string, icon?: ReactNode) => (
    <span title={title} className={cn("grid h-5 min-w-5 place-items-center gap-0.5 rounded-full px-1 text-[10px] font-semibold", n > 0 ? tone : "bg-muted text-muted-foreground")}>
      {icon}{n}
    </span>
  );
  return (
    <span className="flex shrink-0 items-center gap-1">
      {pip(c.councilContacts, "bg-emerald-500/15 text-emerald-400", "Council / FSL contacts on file")}
      {pip(c.greekContacts, "bg-primary/15 text-primary", "Greek chapter contacts on file")}
      {pip(c.clubContacts, "bg-sky-500/15 text-sky-400", "Business club contacts on file")}
      {pip(c.personalIgs, "bg-pink-500/15 text-pink-400", "Personal Instagram handles — our highest-value field", <Instagram className="size-2.5" />)}
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
  const [open, setOpen] = useState<Record<string, boolean>>({ councils: true, chapters: false, clubs: false });
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
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
    const shown = !!showAll[type];
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{heading}</div>
        {needed.map((ch) => renderChapter(ch))}
        {optional.length > 0 && !shown && (
          <button onClick={() => setShowAll((o) => ({ ...o, [type]: true }))} className="text-[10px] text-primary hover:underline">
            Show all {list.length} {type === "fraternity" ? "fraternities" : "sororities"} ▾
          </button>
        )}
        {optional.length > 0 && shown && (
          <>
            <div className="flex items-center gap-2 pt-1 text-[9px] uppercase tracking-wide text-muted-foreground/70">
              <span className="h-px flex-1 bg-border" /> optional <span className="h-px flex-1 bg-border" />
            </div>
            {optional.map((ch) => renderChapter(ch))}
            <button onClick={() => setShowAll((o) => ({ ...o, [type]: false }))} className="text-[10px] text-muted-foreground hover:underline">Show less ▴</button>
          </>
        )}
      </div>
    );
  };
  const renderChapter = (ch: ChapterSlot) => (
    <EntityRow
      key={ch.id}
      name={ch.name}
      sub={ch.size != null ? <span title="Members (chapter size)" className="shrink-0 text-muted-foreground">{ch.size}</span> : null}
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
                      searchOrg={c.type === "fsl" ? "fraternity sorority life office" : `${c.label} council`}
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
                  <p className="text-[10px] text-muted-foreground">Ranked by chapter size where we have it, alphabetically where we don't. Top 5 is what the DM budget supports.</p>
                  {chapterGroup("fraternity", "Fraternities")}
                  {chapterGroup("sorority", "Sororities")}
                </>,
              )}

              {section("clubs", 3, "Business Clubs", "Women in Business, Finance, Investing — one contact", Building2,
                <>
                  {(s.clubTypes ?? []).map((cl) => (
                    <EntityRow
                      key={cl.clubType}
                      name={cl.name}
                      searchOrg={cl.name}
                      headerExtra={<RenameClub campusId={campus.campusId} clubType={cl.clubType} name={cl.name} onRenamed={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })} />}
                      existing={cl.contacts}
                      notFound={cl.notFound}
                      person
                      onAdd={() => add({ kind: "club", entityId: cl.clubId, newClubName: cl.name, newClubCategory: cl.clubType, label: cl.name })}
                      campusName={campus.name}
                      onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })}
                    >
                      {rowsFor((r) => r.kind === "club" && r.newClubCategory === cl.clubType)}
                    </EntityRow>
                  ))}
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

// Rename a preloaded club to the campus's actual name ("Florida Women in Business (FWIB)"),
// keeping its type. Creates the row on first save.
function RenameClub({ campusId, clubType, name, onRenamed }: { campusId: string; clubType: string; name: string; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const m = useMutation({
    mutationFn: () => growthRenameClub({ data: { campusId, clubType, name: val.trim() } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Club renamed."); setEditing(false); onRenamed(); } else toast.error(r.error ?? "Rename failed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rename failed"),
  });
  if (!editing) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); setVal(name); setEditing(true); }} title="Rename to the campus's actual club name" className="shrink-0 text-[9px] text-muted-foreground underline decoration-dotted hover:text-foreground">
        rename
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input value={val} onChange={(e) => setVal(e.target.value)} className="w-32 rounded border border-border bg-background px-1.5 py-0.5 text-[10px]" />
      <button type="button" onClick={() => val.trim() && m.mutate()} disabled={m.isPending} className="text-[9px] font-medium text-primary disabled:opacity-40">save</button>
      <button type="button" onClick={() => setEditing(false)} className="text-[9px] text-muted-foreground">✕</button>
    </span>
  );
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
  name, searchOrg, sub, headerExtra, existing, notFound, muted, onAdd, campusName, onEdited, children,
}: {
  name: string; searchOrg?: string; sub?: ReactNode; headerExtra?: ReactNode; existing: ExistingContact[];
  notFound: boolean; muted?: boolean; person?: boolean; onAdd: () => void; campusName: string;
  onEdited: () => void; children: ReactNode;
}) {
  const settled = notFound && existing.length === 0;
  return (
    <div className={cn("space-y-1", (muted || settled) && "opacity-45 transition-opacity hover:opacity-100")}>
      <div className="flex items-center gap-2 text-[11px] font-medium">
        <button onClick={onAdd} className="min-w-0 truncate text-left hover:text-primary hover:underline" title="Click to add a contact">{name}</button>
        {sub}
        <RoleSearch campus={campusName} org={searchOrg ?? name} />
        {headerExtra}
        {existing.length > 0 && <span className="shrink-0 text-emerald-400">✓ {existing.length}</span>}
        {settled && <span className="shrink-0 inline-flex items-center gap-0.5 italic text-amber-400"><Check className="size-2.5" /> not found</span>}
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
      {c.isRoleAccount && <Recycle className="size-2.5 shrink-0 text-amber-400" />}
      <button onClick={() => setEditing(true)} title="Edit this contact" className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[9px] hover:bg-muted hover:text-foreground"><Pencil className="size-2.5" /> Edit</button>
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

