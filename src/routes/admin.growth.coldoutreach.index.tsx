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
  HelpCircle,
  Instagram,
  Landmark,
  Loader2,
  Mail,
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
import { growthDeleteContact, growthUpdateContact } from "@/lib/growth-reach.functions";
import { AddForm, atHandle } from "@/components/growth/contact-add-form";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { ColdHeader } from "@/components/growth/ColdHeader";
import { renderQueryState } from "@/components/growth/QueryState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/coldoutreach/")({
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
        <>
          {/* backdrop: any outside click closes the menu (not just mouse-leave) */}
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute left-0 top-full z-40 mt-0.5 w-52 rounded-md border border-border bg-background p-1 shadow-lg">
            <div className="px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">Search for…</div>
            {ROLE_SEARCHES.map((rs) => (
              <button key={rs.label} onClick={(e) => { e.stopPropagation(); googleSearch(rs.q(campus, org)); setOpen(false); }} className="block w-full rounded px-2 py-1 text-left text-[10px] hover:bg-muted">
                {rs.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
function dmTemplate(entity: string, campusName: string) {
  const org = entity.trim() || "y'all";
  return `Hey ${org}! 👋 I'm with Survive Accounting. This Fall we're giving Intro Accounting students at ${campusName} a free Exam 1 study tool, and a few chapters are already sharing it with their members. Can I send you the link so ${org} can pass it along? It's free and takes 2 minutes. 🙏`;
}

// Display an Instagram handle from either a bare @handle or a full instagram.com URL.
const igHandle = (s: string | null) => {
  if (!s) return null;
  const raw = String(s).trim();
  const m = raw.match(/instagram\.com\/([^/?#\s]+)/i);
  const handle = (m ? m[1] : raw).replace(/^@+/, "").replace(/\/+$/, "");
  return handle ? `@${handle}` : null;
};

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
                    <ContactCounters email={c.emailContacts} ig={c.igContacts} />
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

// Two counters per campus: emails on file and Instagram handles on file, count under each icon.
function ContactCounters({ email, ig, title }: { email: number; ig: number; title?: string }) {
  const cell = (n: number, icon: ReactNode, cellTitle: string, tone: string) => (
    <span title={cellTitle} className={cn("flex w-9 flex-col items-center gap-0.5", n > 0 ? tone : "text-muted-foreground")}>
      {icon}
      <span className="text-[11px] font-semibold leading-none">{n}</span>
    </span>
  );
  return (
    <span title={title} className="flex shrink-0 items-center gap-1">
      {cell(email, <Mail className="size-3.5" />, "Emails on file", "text-sky-400")}
      {cell(ig, <Instagram className="size-3.5" />, "Instagram handles on file", "text-pink-400")}
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
  igRoleAccount: boolean;
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
  igRoleAccount: false,
  roleAcctTouched: false,
  name: "",
  role: o.role ?? "",
  email: "",
  instagram: "",
});

const draftKey = (campusId: string) => `coldoutreach:draft:${campusId}`;

// Which org a draft/queued row belongs to. Councils key by type, chapters by id, clubs by
// category (one slot per category). Routes the single open form + queued rows to the right
// EntityRow, and keeps "only one form open anywhere" honest.
const specOrgKey = (o: Partial<Row>): string =>
  o.kind === "council"
    ? `council:${o.councilType}`
    : o.kind === "chapter"
      ? `chapter:${o.entityId}`
      : `club:${o.newClubCategory}`;
const orgKeyOf = (r: Row) => specOrgKey(r);
const rowHasContent = (r: Row) => !!(r.name.trim() || r.email.trim() || r.instagram.trim() || r.role.trim());
const modeLabel = (m: "org" | "person" | "notfound") =>
  m === "person" ? "Person" : m === "org" ? "Organization" : "Not found";

function neededList(r: CampusReadiness): string[] {
  const out: string[] = [];
  if (!r.councilOk) out.push("No council or Greek Life / FSL office contact");
  if (!r.fratOk) out.push("No fraternity contact");
  if (!r.sororityOk) out.push("No sorority contact");
  if (!r.clubOk) out.push("No business club contact");
  return out;
}

function AddContacts({ campus, onClose, onSaved }: { campus: BoardCampus; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const slots = useQuery({ queryKey: ["co-slots", campus.campusId], queryFn: () => growthCampusContactSlots({ data: { campusId: campus.campusId } }) });
  const [open, setOpen] = useState<Record<string, boolean>>({ councils: true, chapters: false, clubs: false });
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [queued, setQueued] = useState<Row[]>([]);
  // Only ONE form is open anywhere on the page. { orgKey, draft, editingKey } — editingKey is set
  // when re-opening an already-queued row so Add replaces it instead of appending.
  const [openForm, setOpenForm] = useState<{ orgKey: string; draft: Row; editingKey: string | null } | null>(null);
  const [roleFilter, setRoleFilter] = useState(false);
  const restored = useRef(false);

  // Autosave the queued (added-but-unsaved) contacts to browser storage, keyed by campus.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(campus.campusId));
      if (raw) {
        const parsed = JSON.parse(raw) as Row[];
        if (Array.isArray(parsed) && parsed.length) { setQueued(parsed); restored.current = true; toast.message("Draft restored", { description: `${parsed.length} queued contact${parsed.length === 1 ? "" : "s"} from last time.` }); }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus.campusId]);
  useEffect(() => {
    try {
      if (queued.length) localStorage.setItem(draftKey(campus.campusId), JSON.stringify(queued));
      else localStorage.removeItem(draftKey(campus.campusId));
    } catch { /* ignore */ }
  }, [queued, campus.campusId]);

  // ── one open form → a queued list → Save the batch once ────────────────────────────────
  const setDraft = (patch: Partial<Row>) => setOpenForm((f) => (f ? { ...f, draft: { ...f.draft, ...patch } } : f));
  const openFormFor = (spec: Partial<Row>) => {
    const orgKey = specOrgKey(spec);
    if (openForm) {
      if (openForm.orgKey === orgKey && !openForm.editingKey) return; // already adding here
      if (rowHasContent(openForm.draft) && !window.confirm("You have an unsaved contact open. Discard it and start a new one?")) return;
    }
    const draft = emptyRow(spec);
    draft.isPerson = spec.isPerson ?? false;
    if (spec.role) draft.role = spec.role;
    setOpenForm({ orgKey, draft, editingKey: null });
  };
  const cancelForm = () => {
    if (openForm && rowHasContent(openForm.draft) && !window.confirm("Discard this contact? What you typed will be lost.")) return;
    setOpenForm(null);
  };
  // Switching type CLEARS every field so nothing bleeds across (an org IG must never survive into a
  // person record). Confirms first only when the row has something in it.
  const switchMode = (mode: "org" | "person" | "notfound") => {
    if (!openForm) return;
    const d = openForm.draft;
    const cur = d.notFound ? "notfound" : d.isPerson ? "person" : "org";
    if (cur === mode) return;
    if (rowHasContent(d) && !window.confirm(`Switch to ${modeLabel(mode)}? This clears what you've typed.`)) return;
    const cleared = emptyRow({ kind: d.kind, entityId: d.entityId, councilType: d.councilType, newClubName: d.newClubName, newClubCategory: d.newClubCategory, label: d.label });
    cleared.key = d.key;
    cleared.isPerson = mode === "person";
    cleared.notFound = mode === "notfound";
    setOpenForm({ ...openForm, draft: cleared });
  };
  const addQueued = () => {
    if (!openForm) return;
    const d = openForm.draft;
    if (!d.name.trim() && !d.email.trim() && !d.instagram.trim()) { toast.error("Add a name, email, or Instagram before adding."); return; }
    setQueued((q) => (openForm.editingKey ? q.map((x) => (x.key === openForm.editingKey ? d : x)) : [...q, d]));
    setOpenForm(null);
  };
  const editQueued = (r: Row) => {
    if (openForm && openForm.draft.key !== r.key && rowHasContent(openForm.draft) && !window.confirm("You have an unsaved contact open. Discard it to edit this one?")) return;
    setOpenForm({ orgKey: orgKeyOf(r), draft: { ...r }, editingKey: r.key });
  };
  const removeQueued = (key: string) => setQueued((q) => q.filter((x) => x.key !== key));
  const queuedFor = (orgKey: string) => queued.filter((r) => orgKeyOf(r) === orgKey);

  // Not found commits immediately (its own tiny save) so the org settles and stops reading as a gap.
  const notFoundMut = useMutation({
    mutationFn: (spec: Row) => growthSaveCampusContacts({ data: { campusId: campus.campusId, contacts: [{ kind: spec.kind, entityId: spec.entityId, councilType: spec.councilType, newClubName: spec.newClubName, newClubCategory: spec.newClubCategory, isPerson: false, notFound: true, isRoleAccount: false, igRoleAccount: false, name: null, role: null, email: null, instagram: null }] } }),
    onSuccess: async () => { setOpenForm(null); await qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] }); onSaved(); toast.success("Marked not found."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  const markNotFound = (spec: Row) => { if (window.confirm(`Mark ${spec.label || "this organization"} as not found?\n\nNothing turned up for it. It stops appearing as a gap and won't be searched again — you can undo this later.`)) notFoundMut.mutate(spec); };

  const save = useMutation({
    mutationFn: () =>
      growthSaveCampusContacts({
        data: {
          campusId: campus.campusId,
          contacts: queued.map((r) => ({
            kind: r.kind, entityId: r.entityId, councilType: r.councilType,
            newClubName: r.newClubName, newClubCategory: r.newClubCategory,
            isPerson: r.isPerson, notFound: false, isRoleAccount: r.isRoleAccount, igRoleAccount: r.igRoleAccount,
            name: r.name || null, role: r.role || null, email: r.email || null, instagram: r.instagram || null,
          })),
        },
      }),
    onSuccess: async (res) => {
      setQueued([]);
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
    const isRole = (c: ExistingContact) => c.isRoleAccount || c.igRoleAccount;
    for (const cl of s.councils) for (const c of cl.contacts) if (isRole(c)) out.push({ where: cl.label, c });
    for (const ch of s.chapters) for (const c of ch.contacts) if (isRole(c)) out.push({ where: ch.name, c });
    for (const cb of s.clubs) for (const c of cb.contacts) if (isRole(c)) out.push({ where: cb.name, c });
    return out;
  }, [s]);

  // Everything an EntityRow needs to host the single add-form + its queued rows for one org.
  const addProps = (spec: Partial<Row>) => {
    const orgKey = specOrgKey(spec);
    const formIsOpen = openForm?.orgKey === orgKey;
    return {
      onAdd: () => openFormFor(spec),
      formIsOpen,
      queuedNode: queuedFor(orgKey).map((r) => (
        <QueuedRow key={r.key} r={r} editing={openForm?.editingKey === r.key} onEdit={() => editQueued(r)} onRemove={() => removeQueued(r.key)} />
      )),
      formNode: formIsOpen ? (
        <AddForm
          draft={openForm.draft}
          editing={!!openForm.editingKey}
          notFoundPending={notFoundMut.isPending}
          onChange={setDraft}
          onSwitch={switchMode}
          onAdd={addQueued}
          onCancel={cancelForm}
          onMarkNotFound={() => markNotFound(openForm.draft)}
        />
      ) : null,
    };
  };

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
      campusName={campus.name}
      onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })}
      {...addProps({ kind: "chapter", entityId: ch.id, label: ch.name })}
    />
  );

  return (
    <BottomSheet open onClose={onClose} title={<span className="sa-admin-display text-sm font-semibold">Add contacts · {campus.name}</span>}>
      {slots.isLoading || !s ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2 pb-24">
          <ReadinessBar r={s.readiness} />
          <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span>Add contacts one at a time — each drops into a queue below its org. <span className="text-primary">Save</span> the whole batch once.</span>
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
                  {(s.councils).map((c) => {
                    const spec = { kind: "council" as const, councilType: c.type, label: c.label };
                    const showFsl = c.type === "fsl" && !c.contacts.length && !queuedFor(specOrgKey(spec)).length && openForm?.orgKey !== specOrgKey(spec);
                    return (
                      <EntityRow
                        key={c.type}
                        name={c.label}
                        searchOrg={c.type === "fsl" ? "fraternity sorority life office" : `${c.label} council`}
                        existing={c.contacts}
                        notFound={c.notFound}
                        person
                        campusName={campus.name}
                        onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })}
                        {...addProps(spec)}
                      >
                        {showFsl && (
                          <button onClick={() => openFormFor({ ...spec, isPerson: true, role: "FSL Director" })} className="text-left text-[10px] italic text-muted-foreground/70 hover:text-primary">
                            + FSL Director (add a name when you have one — an email alone is enough to start)
                          </button>
                        )}
                      </EntityRow>
                    );
                  })}
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
                      campusName={campus.name}
                      onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })}
                      {...addProps({ kind: "club", entityId: cl.clubId, newClubName: cl.name, newClubCategory: cl.clubType, label: cl.name })}
                    />
                  ))}
                </>,
              )}
            </>
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col items-center gap-1 border-t border-border bg-background px-4 py-2.5">
        <button
          onClick={() => save.mutate()}
          disabled={queued.length === 0 || save.isPending}
          className="rounded-md bg-primary px-6 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : `Save queued (${queued.length})`}
        </button>
        {openForm && rowHasContent(openForm.draft) && (
          <span className="text-[10px] text-amber-500">1 contact open — not added yet</span>
        )}
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

function ReadinessBar({ r }: { r: CampusReadiness }) {
  // Each chip carries a ? that explains what the requirement means; when unmet the tooltip says so
  // plainly ("No business club contact yet").
  const item = (ok: boolean, label: string, met: string, unmet: string) => (
    <span title={ok ? met : unmet} className={cn("inline-flex cursor-help items-center gap-1", ok ? "text-emerald-400" : "text-muted-foreground")}>
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5 text-amber-400" />} {label}
      <HelpCircle className="size-2.5 text-muted-foreground/50" />
    </span>
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-2.5 text-[12px]", r.ready ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/30")}>
      {r.ready
        ? <span className="font-bold uppercase tracking-wide text-emerald-400">🎉 Ready for outreach!</span>
        : <span className="font-medium">Needed before launch:</span>}
      {item(r.councilOk, "Council/FSL", "A council or Greek Life / FSL office contact is on file — one yes reaches every chapter under it.", "No council or Greek Life / FSL office contact yet — the highest-leverage one to get.")}
      {item(r.fratOk, "Frats", "At least one fraternity chapter contact (email or Instagram) is on file.", "No fraternity contact yet — add one chapter to clear this.")}
      {item(r.sororityOk, "Sororities", "At least one sorority chapter contact is on file.", "No sorority contact yet — add one chapter to clear this.")}
      {item(r.clubOk, "Clubs", "A business club contact is on file (Women in Business, Finance, or Investing).", "No business club contact yet.")}
    </div>
  );
}

// One org (council / chapter / club): clickable name, search, existing contacts (each editable),
// not-found state, and any in-progress add rows.
function EntityRow({
  name, searchOrg, sub, headerExtra, existing, notFound, muted, onAdd, campusName, onEdited,
  formIsOpen, queuedNode, formNode, children,
}: {
  name: string; searchOrg?: string; sub?: ReactNode; headerExtra?: ReactNode; existing: ExistingContact[];
  notFound: boolean; muted?: boolean; person?: boolean; onAdd: () => void; campusName: string;
  onEdited: () => void; formIsOpen?: boolean; queuedNode?: ReactNode; formNode?: ReactNode; children?: ReactNode;
}) {
  const settled = notFound && existing.length === 0;
  const emails = existing.filter((c) => c.email && c.email.trim()).length;
  const igs = existing.filter((c) => c.instagram && c.instagram.trim()).length;
  const counterTitle = `${emails} email${emails === 1 ? "" : "s"} · ${igs} Instagram`;
  return (
    <div className={cn("border-b border-border/30 py-2 last:border-0", (muted || settled) && "opacity-45 transition-opacity hover:opacity-100")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium">
            <button onClick={onAdd} className="min-w-0 truncate text-left hover:text-primary hover:underline" title="Click to add a contact">{name}</button>
            {sub}
            <RoleSearch campus={campusName} org={searchOrg ?? name} />
            {headerExtra}
            {settled && <span className="inline-flex items-center gap-0.5 italic text-amber-400"><Check className="size-2.5" /> not found</span>}
          </div>
          {existing.map((c) => <ExistingRow key={c.id} c={c} orgLabel={name} campusName={campusName} onEdited={onEdited} />)}
          {children}
          {queuedNode}
          {formNode}
          {!formIsOpen && (
            <button onClick={onAdd} className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"><Plus className="size-3" /> contact</button>
          )}
        </div>
        {(emails > 0 || igs > 0) && <ContactCounters email={emails} ig={igs} title={counterTitle} />}
      </div>
    </div>
  );
}

// A queued contact — added but not yet saved. Dimmed with an ⧗ marker; Edit reopens the form,
// ✕ drops it. These survive a refresh via the browser autosave.
function QueuedRow({ r, editing, onEdit, onRemove }: { r: Row; editing?: boolean; onEdit: () => void; onRemove: () => void }) {
  const line = [r.name, r.role, r.email, igHandle(r.instagram)].filter((x) => x && String(x).trim()).join(" · ") || "contact";
  return (
    <div className={cn("flex items-center gap-1.5 rounded-md border border-dashed border-border/70 bg-muted/20 px-2 py-1 pl-1 text-[10px] text-muted-foreground", editing && "opacity-40")}>
      <span title="Queued — not saved yet" className="shrink-0 text-muted-foreground/70">⧗</span>
      <span className="min-w-0 truncate">{line}</span>
      {r.isPerson && r.instagram && <Instagram className="size-2.5 shrink-0 text-pink-400" />}
      <span className="shrink-0 rounded bg-muted px-1 text-[8.5px] uppercase tracking-wide text-muted-foreground/80">queued</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button onClick={onEdit} title="Edit before saving" className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[9px] hover:bg-muted hover:text-foreground"><Pencil className="size-2.5" /> Edit</button>
        <button onClick={onRemove} title="Remove from the queue" className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-red-500/15 hover:text-red-400"><X className="size-3" /></button>
      </span>
    </div>
  );
}

// Existing saved contact — read-only line with a personal-IG dot and role-account recycle icon,
// plus an inline (non-modal) editor.
function ExistingRow({ c, orgLabel, campusName, onEdited }: { c: ExistingContact; orgLabel: string; campusName: string; onEdited: () => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: c.name ?? "", role: c.role ?? "", email: c.email ?? "", instagram: c.instagram ?? "", isRoleAccount: c.isRoleAccount, igRoleAccount: c.igRoleAccount });
  const save = useMutation({
    mutationFn: () => growthUpdateContact({ data: { qcId: c.id, name: f.name || null, role: f.role || null, email: f.email || null, instagram: f.instagram || null, isRoleAccount: f.isRoleAccount, igRoleAccount: f.igRoleAccount } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Contact updated."); setEditing(false); onEdited(); } else toast.error(r.error ?? "Update failed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const del = useMutation({
    mutationFn: () => growthDeleteContact({ data: { qcId: c.id } }),
    onSuccess: (r) => { if (r.ok) { toast.success("Contact deleted."); onEdited(); } else toast.error(r.error ?? "Delete failed"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });
  const confirmDelete = () => {
    const label = [c.name, c.email, igHandle(c.instagram)].filter(Boolean).join(" · ") || "this contact";
    if (window.confirm(`Delete ${label}? This can't be undone.`)) del.mutate();
  };
  if (editing) {
    return (
      <div className="space-y-1.5 rounded-md border border-primary/40 bg-card p-2 pl-2">
        <div className="grid grid-cols-2 gap-1.5">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={f.instagram} onChange={(e) => setF({ ...f, instagram: atHandle(e.target.value) })} placeholder="@instagram" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Role" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" className="rounded border border-border bg-background px-2 py-1 text-[11px]" />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          {f.email.trim() && <label className="inline-flex items-center gap-1 text-muted-foreground" title="Email is a role/position inbox">
            <input type="checkbox" checked={f.isRoleAccount} onChange={(e) => setF({ ...f, isRoleAccount: e.target.checked })} /> <Recycle className="size-3" /> email role
          </label>}
          {f.instagram.trim() && <label className="inline-flex items-center gap-1 text-muted-foreground" title="Instagram is an org/position handle">
            <input type="checkbox" checked={f.igRoleAccount} onChange={(e) => setF({ ...f, igRoleAccount: e.target.checked })} /> <Recycle className="size-3" /> IG role
          </label>}
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
      {(c.isRoleAccount || c.igRoleAccount) && <span title={`Role account (${[c.isRoleAccount ? "email" : null, c.igRoleAccount ? "IG" : null].filter(Boolean).join(" + ")})`} className="inline-flex shrink-0"><Recycle className="size-2.5 text-amber-400" /></span>}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button onClick={() => copyText(dmTemplate(c.isPerson && c.name ? c.name : orgLabel, campusName), "DM copied — paste it into their Instagram.")} title="Copy a ready-to-send Instagram DM for this contact" className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[9px] hover:bg-muted hover:text-foreground"><Copy className="size-2.5" /> DM</button>
        <button onClick={() => setEditing(true)} title="Edit this contact" className="inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[9px] hover:bg-muted hover:text-foreground"><Pencil className="size-2.5" /> Edit</button>
        <button onClick={confirmDelete} disabled={del.isPending} title="Delete this contact" className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"><X className="size-3" /></button>
      </span>
    </div>
  );
}
