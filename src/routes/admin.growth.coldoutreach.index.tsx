// /admin/growth/coldoutreach — THE enrichment surface. The next 48 hours are one job: get
// rich contact data in, one campus at a time, fast. Everything else is deliberately off the
// path. Add Contacts is the only live door; a campus should take minutes, not half an hour.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Clock,
  Copy,
  Instagram,
  Loader2,
  Mail,
  MessageSquarePlus,
  Pencil,
  Plus,
  Recycle,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
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
import { growthLogEnrichmentTime, growthAddFeedback, growthEnrichmentStats } from "@/lib/growth-enrich-feedback.functions";
import { FindContactsPanel } from "@/components/growth/FindContactsPanel";
import { AddForm, atHandle, ROLE_CHIPS, roleChipOf } from "@/components/growth/contact-add-form";
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

// Prefilled Google search. Council/club handles search "<university> <org> instagram"; a PERSON
// searches "<name> <university> instagram" — name + university alone finds a personal account far
// more often than adding the role or council, which mostly drags in org pages.
const googleUrl = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q.trim())}`;

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
  const stats = useQuery({ queryKey: ["enrich-stats"], queryFn: () => growthEnrichmentStats() });
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
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {(stats.data?.campusCount ?? 0) > 0 && (
              <span title={`Rolling average over the ${stats.data!.campusCount} campus${stats.data!.campusCount === 1 ? "" : "es"} timed so far — three campuses is roughly ${Math.round((stats.data!.avgSeconds * 3) / 60)} min`} className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> avg {Math.max(1, Math.round(stats.data!.avgSeconds / 60))} min / campus
              </span>
            )}
            <span title="Campuses with a complete contact set, out of your assigned batches">
              <strong className="text-emerald-400">{readyCount}</strong> / {totalCampuses} ready
            </span>
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

// Campus timer (item 6): starts on the first interaction, counts while active, pauses after 60s idle.
// `ping` on any interaction (re)starts it; `flush` returns the elapsed seconds and resets, to record
// on save/close so the header average is real.
function useEnrichmentTimer() {
  const [seconds, setSeconds] = useState(0);
  const running = useRef(false);
  const lastActivity = useRef(0);
  const secRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (!running.current) return;
      if (Date.now() - lastActivity.current > 60_000) { running.current = false; return; } // idle → pause
      secRef.current += 1; setSeconds(secRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const ping = () => { lastActivity.current = Date.now(); running.current = true; };
  const flush = (): number => { const s = secRef.current; secRef.current = 0; setSeconds(0); running.current = false; return s; };
  return { seconds, ping, flush };
}

// ── Simplified enrichment (2026-08-31): councils are a fixed field grid, not a free-form add. Per
// council we want three handles — the council org IG, the scholarship chair's personal IG, the
// president's personal IG — because personal handles are the product of this page. Presidents are
// Pass 2 (collapsed by default). Clubs want an org IG (+ optional president). Email is opportunistic.
const FIELD_COUNCILS = [
  { type: "ifc", label: "IFC" },
  { type: "panhellenic", label: "Panhellenic" },
  { type: "nphc", label: "NPHC" },
  { type: "mgc", label: "MGC" },
];
const roleIsChair = (role: string | null) => roleChipOf(role) === "Scholarship / Academic Chair";
const roleIsPres = (role: string | null) => roleChipOf(role) === "President";
type Slot = "org" | "chair" | "pres";
const slotOf = (r: Row): Slot | "other" => (!r.isPerson ? "org" : roleIsChair(r.role) ? "chair" : roleIsPres(r.role) ? "pres" : "other");
const hasHandle = (list: ExistingContact[], pred: (c: ExistingContact) => boolean) => list.some((c) => pred(c) && !!(c.instagram && c.instagram.trim()));

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return <span title={ok ? `${label} — on file` : `${label} — still needed`} className={cn("inline-flex items-center gap-0.5", ok ? "text-emerald-400" : "text-muted-foreground/60")}>{ok ? <Check className="size-2.5" /> : <span className="size-1.5 rounded-full border border-current" />}{label}</span>;
}
// The little magnifier opens the prefilled Google search in a new tab — one click, no retyping.
function IgSearch({ query }: { query: string }) {
  return (
    <a href={googleUrl(query)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={`Google: ${query}`} className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] text-primary hover:bg-primary/10">
      <Search className="size-2.5" /> find
    </a>
  );
}
function IgInput({ label, required, value, onChange, placeholder, search }: { label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; search?: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center gap-1 text-[9px] text-muted-foreground"><Instagram className="size-2.5 text-pink-400" /> {label}{required && <span className="text-pink-400">•</span>}{search && <span className="ml-auto"><IgSearch query={search} /></span>}</span>
      <input value={value} onChange={(e) => onChange(atHandle(e.target.value))} placeholder={placeholder ?? "@handle"} className="w-full rounded border border-pink-500/30 bg-background px-2 py-1.5 text-[11px]" />
    </label>
  );
}
function PersonInput({ label, required, name, ig, campusName, onChange }: { label: string; required?: boolean; name: string; ig: string; campusName: string; onChange: (p: Partial<Row>) => void }) {
  return (
    <div>
      <span className="mb-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">{label}{required && <span className="text-pink-400">•</span>}<span className="text-muted-foreground/60">— name + their personal Instagram</span>{name.trim() && <span className="ml-auto"><IgSearch query={`${name} ${campusName} instagram`} /></span>}</span>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_160px]">
        <input value={name} onChange={(e) => onChange({ name: e.target.value })} placeholder="First Last" className="rounded border border-border bg-background px-2 py-1.5 text-[11px]" />
        <input value={ig} onChange={(e) => onChange({ instagram: atHandle(e.target.value) })} placeholder="@personal IG" className="rounded border border-pink-500/40 bg-background px-2 py-1.5 text-[11px]" />
      </div>
    </div>
  );
}

function CouncilCard({ label, contacts, queuedRows, showPres, campusName, onField, onEdited }: {
  label: string; contacts: ExistingContact[]; queuedRows: Row[]; showPres: boolean; campusName: string;
  onField: (slot: Slot, patch: Partial<Row>) => void; onEdited: () => void;
}) {
  const q = (slot: Slot) => queuedRows.find((r) => slotOf(r) === slot);
  const orgDone = hasHandle(contacts, (c) => !c.isPerson);
  const chairDone = hasHandle(contacts, (c) => c.isPerson && roleIsChair(c.role));
  const presDone = contacts.some((c) => c.isPerson && roleIsPres(c.role));
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12px] font-semibold">{label}</span>
        <span className="flex items-center gap-2 text-[9px]"><StatusDot ok={orgDone || !!q("org")?.instagram.trim()} label="org IG" /><StatusDot ok={chairDone || !!q("chair")?.instagram.trim()} label="chair IG" /></span>
      </div>
      {contacts.map((c) => <ExistingRow key={c.id} c={c} orgLabel={label} campusName={campusName} onEdited={onEdited} />)}
      <div className="mt-1 space-y-1.5">
        {!orgDone && <IgInput label="Council Instagram" required value={q("org")?.instagram ?? ""} onChange={(v) => onField("org", { instagram: v })} placeholder="@councilaccount" search={`${campusName} ${label} instagram`} />}
        {!chairDone && <PersonInput label="Scholarship chair" required name={q("chair")?.name ?? ""} ig={q("chair")?.instagram ?? ""} campusName={campusName} onChange={(p) => onField("chair", p)} />}
        {showPres && !presDone && <PersonInput label="President" name={q("pres")?.name ?? ""} ig={q("pres")?.instagram ?? ""} campusName={campusName} onChange={(p) => onField("pres", p)} />}
      </div>
    </div>
  );
}

function ClubCard({ name, headerExtra, contacts, queuedRows, showPres, campusName, onField, onEdited }: {
  name: string; headerExtra?: ReactNode; contacts: ExistingContact[]; queuedRows: Row[]; showPres: boolean; campusName: string;
  onField: (slot: Slot, patch: Partial<Row>) => void; onEdited: () => void;
}) {
  const q = (slot: Slot) => queuedRows.find((r) => slotOf(r) === slot);
  const orgDone = hasHandle(contacts, (c) => !c.isPerson);
  const presDone = contacts.some((c) => c.isPerson && roleIsPres(c.role));
  // Org IG is all a club needs; a president is an optional add, per-club so it isn't noise on every
  // row. The Pass-2 toggle (showPres) or the queued row itself also opens it.
  const [addPres, setAddPres] = useState(false);
  const showClubPres = !presDone && (showPres || addPres || !!q("pres"));
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] font-semibold">{name}</span>
        {headerExtra}
        <StatusDot ok={orgDone || !!q("org")?.instagram.trim()} label="org IG" />
      </div>
      {contacts.map((c) => <ExistingRow key={c.id} c={c} orgLabel={name} campusName={campusName} onEdited={onEdited} />)}
      <div className="mt-1 space-y-1.5">
        {!orgDone && <IgInput label="Club Instagram" required value={q("org")?.instagram ?? ""} onChange={(v) => onField("org", { instagram: v })} placeholder="@clubaccount" search={`${campusName} ${name} instagram`} />}
        {showClubPres
          ? <PersonInput label="President (optional)" name={q("pres")?.name ?? ""} ig={q("pres")?.instagram ?? ""} campusName={campusName} onChange={(p) => onField("pres", p)} />
          : !presDone && <button onClick={() => setAddPres(true)} className="text-[10px] font-medium text-primary hover:underline">+ president</button>}
      </div>
    </div>
  );
}

// Parse pasted rows (tab- or comma-separated, optional header) into {council, position, name, ig, email}.
export interface PastedRow { council: string; position: string; name: string; instagram: string; email: string; raw: string }
const COL_KEYS = ["council", "position", "name", "instagram", "email"];
function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  return line.split(",").map((s) => s.trim());
}
// Store handles bare: strip a leading @ and any instagram.com/ prefix (spec §the paste box).
function bareHandle(s: string): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/instagram\.com\/([^/?#\s]+)/i);
  return (m ? m[1] : raw).replace(/^@+/, "").replace(/\/+$/, "");
}
// Header words map a column NAME onto a key. Matched against whole cells only, never as a
// substring — otherwise a data value like "instagram.com/foo" would be mistaken for a header.
const HEADER_WORDS: Record<string, string> = {
  council: "council", org: "council", organization: "council", chapter: "council",
  position: "position", role: "position", title: "position", office: "position",
  name: "name", officer: "name", "full name": "name", person: "name",
  instagram: "instagram", ig: "instagram", handle: "instagram", insta: "instagram",
  email: "email", "e-mail": "email", mail: "email",
};
export function parsePasted(text: string): PastedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // Header row only if row 0's cells look like column NAMES (≥2 known header words) and none
  // looks like a value (an @handle, a URL, an email). A no-header paste keeps the default order.
  let order = COL_KEYS;
  let start = 0;
  const firstCells = splitCells(lines[0]).map((c) => c.toLowerCase());
  const headerHits = firstCells.filter((c) => c in HEADER_WORDS).length;
  const looksLikeValues = firstCells.some((c) => /@|instagram\.com|https?:|\.(com|edu|org|net)\b/.test(c));
  if (headerHits >= 2 && !looksLikeValues) {
    order = firstCells.map((c) => HEADER_WORDS[c] ?? c);
    start = 1;
  }
  const out: PastedRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    const rec: Record<string, string> = {};
    order.forEach((k, idx) => { if (cells[idx] !== undefined) rec[k] = cells[idx]; });
    out.push({ council: rec.council ?? "", position: rec.position ?? "", name: rec.name ?? "", instagram: bareHandle(rec.instagram ?? ""), email: rec.email ?? "", raw: lines[i] });
  }
  return out;
}
const COUNCIL_MATCH: [string, RegExp][] = [
  ["ifc", /\bifc\b|interfraternity/i],
  ["panhellenic", /panhel/i],
  ["nphc", /\bnphc\b|pan-?hellenic council|national pan/i],
  ["mgc", /\bmgc\b|multicultural greek/i],
];
function matchCouncilType(s: string): string | null { for (const [t, re] of COUNCIL_MATCH) if (re.test(s)) return t; return null; }
function matchClub(s: string, clubs: { clubType: string; name: string }[]): string | null {
  const v = s.toLowerCase();
  if (/women\s*in\s*business|\bwib\b/.test(v)) return "women_in_business";
  if (/financ/.test(v)) return "finance";
  if (/invest/.test(v)) return "investing";
  const hit = clubs.find((c) => c.name && v.includes(c.name.toLowerCase().slice(0, 6)));
  return hit?.clubType ?? null;
}
function matchSlot(position: string, name: string, instagram: string): Slot | null {
  if (/scholar|academ|chapter\s*develop/i.test(position) || /vp.*scholar|vp.*academ/i.test(position)) return "chair";
  if (/president/i.test(position) && !/vice|\bvp\b/i.test(position)) return "pres";
  if (!name.trim() && instagram.trim()) return "org"; // handle-only row = the org account
  return null;
}

// The paste box — the highest-leverage change. One textarea takes tab/comma-separated officer rows
// (from a spreadsheet or a scrape) and pre-fills the council blocks for review instead of a
// search-and-click per field. Nothing saves until the operator hits Save.
function PasteBox({ onApply }: { onApply: (rows: PastedRow[]) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const parse = () => { const rows = parsePasted(text); if (!rows.length) { toast.message("Nothing to parse — paste rows first."); return; } onApply(rows); toast.success(`Parsed ${rows.length} row${rows.length === 1 ? "" : "s"} — review below, then Save.`); setText(""); setOpen(false); };
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-2.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-left">
        <ClipboardPaste className="size-3.5 text-primary" />
        <span className="text-[12px] font-semibold">Paste officers</span>
        <span className="hidden text-[10px] text-muted-foreground sm:inline">tab or comma columns: council · position · name · instagram · email</span>
        {open ? <ChevronDown className="ml-auto size-4" /> : <ChevronRight className="ml-auto size-4" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={"IFC\tPresident\tGrayson King\t@graysonking\tgking@olemiss.edu\nPanhellenic\tScholarship Chair\tSarah Chen\t@sarahchen\t"} className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-[10.5px]" />
          <div className="flex items-center gap-2">
            <button onClick={parse} disabled={!text.trim()} className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40">Parse & prefill</button>
            <span className="text-[10px] text-muted-foreground">Header row optional · order-tolerant · nothing saves until you hit Save</span>
          </div>
        </div>
      )}
    </div>
  );
}

function UnassignedRow({ row, clubs, onAssign, onDrop }: { row: PastedRow; clubs: { clubType: string; name: string }[]; onAssign: (target: string, slot: Slot) => void; onDrop: () => void }) {
  const [target, setTarget] = useState("");
  const [slot, setSlot] = useState<Slot>("chair");
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1 text-[10px]">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{[row.name, row.instagram, row.council].filter(Boolean).join(" · ") || row.raw}</span>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded border border-border bg-background px-1 py-0.5">
        <option value="">where?</option>
        {FIELD_COUNCILS.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
        {clubs.map((c) => <option key={c.clubType} value={`club:${c.clubType}`}>{c.name}</option>)}
      </select>
      <select value={slot} onChange={(e) => setSlot(e.target.value as Slot)} className="rounded border border-border bg-background px-1 py-0.5">
        <option value="org">org IG</option><option value="chair">chair</option><option value="pres">president</option>
      </select>
      <button onClick={() => target && onAssign(target, slot)} disabled={!target} className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground disabled:opacity-40">Assign</button>
      <button onClick={onDrop} title="Leave out" className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-red-500/15 hover:text-red-400"><X className="size-3" /></button>
    </div>
  );
}

// Feedback, collapsed to a single line at the bottom (this box is how the rebuild got scoped).
function FeedbackLine({ campusId }: { campusId: string }) {
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () => growthAddFeedback({ data: { campusId, note: note.trim() } }),
    onSuccess: (r) => { if (r.ok) { setNote(""); toast.success("Got it", { description: "Logged for the team." }); } else toast.error(r.error ?? "Couldn't save"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <MessageSquarePlus className="size-3 shrink-0 text-muted-foreground" />
      <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) m.mutate(); }} placeholder="What would make this faster next time?" className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px]" />
      <button onClick={() => note.trim() && m.mutate()} disabled={!note.trim() || m.isPending} className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-40">Send</button>
    </div>
  );
}

export function AddContacts({ campus, onClose, onSaved, vaMode, onDone }: { campus: BoardCampus; onClose: () => void; onSaved: () => void; vaMode?: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const slots = useQuery({ queryKey: ["co-slots", campus.campusId], queryFn: () => growthCampusContactSlots({ data: { campusId: campus.campusId } }) });
  const [open, setOpen] = useState<Record<string, boolean>>({ councils: true, chapters: false, clubs: false });
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [queued, setQueued] = useState<Row[]>([]);
  // Only ONE form is open anywhere on the page. { orgKey, draft, editingKey } — editingKey is set
  // when re-opening an already-queued row so Add replaces it instead of appending.
  const [openForm, setOpenForm] = useState<{ orgKey: string; draft: Row; editingKey: string | null } | null>(null);
  const restored = useRef(false);
  const timer = useEnrichmentTimer();
  const logTime = (s: number) => { if (s > 3) growthLogEnrichmentTime({ data: { campusId: campus.campusId, seconds: s } }).catch(() => { /* fire-and-forget */ }); };
  // Record any un-flushed time on close, then close.
  const handleClose = () => { logTime(timer.flush()); onClose(); };

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
    if (spec.isPerson !== undefined) {
      draft.isPerson = spec.isPerson;
      if (spec.role) draft.role = spec.role;
    } else if (isSequenced(spec)) {
      // Sequenced orgs open on the next unfilled role as a person, not a blank org form.
      draft.isPerson = true;
      draft.role = nextRoleFor(spec) ?? "";
    }
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
  const addQueued = (patch?: Partial<Row>) => {
    if (!openForm) return;
    const d = { ...openForm.draft, ...(patch ?? {}) };
    if (!d.name.trim() && !d.email.trim() && !d.instagram.trim()) { toast.error("Add a name, email, or Instagram before adding."); return; }
    const editing = openForm.editingKey;
    setQueued((q) => (editing ? q.map((x) => (x.key === editing ? d : x)) : [...q, d]));
    // Guided progression: after adding a person to a sequenced org, jump to the next unfilled role.
    const spec: Partial<Row> = { kind: d.kind, entityId: d.entityId, councilType: d.councilType, newClubName: d.newClubName, newClubCategory: d.newClubCategory, label: d.label };
    if (!editing && d.isPerson && isSequenced(spec)) {
      const next = nextRoleFor(spec, d.role);
      if (next) {
        const nd = emptyRow(spec); nd.isPerson = true; nd.role = next;
        setOpenForm({ orgKey: specOrgKey(spec), draft: nd, editingKey: null });
        return;
      }
    }
    setOpenForm(null);
  };
  const editQueued = (r: Row) => {
    if (openForm && openForm.draft.key !== r.key && rowHasContent(openForm.draft) && !window.confirm("You have an unsaved contact open. Discard it to edit this one?")) return;
    setOpenForm({ orgKey: orgKeyOf(r), draft: { ...r }, editingKey: r.key });
  };
  const removeQueued = (key: string) => setQueued((q) => q.filter((x) => x.key !== key));
  const queuedFor = (orgKey: string) => queued.filter((r) => orgKeyOf(r) === orgKey);

  // ── field grid: each council/club slot (org IG / chair / president) maps to at most one queued row.
  const [showPres, setShowPres] = useState(false); // Pass 2 — presidents collapsed by default
  const [unassigned, setUnassigned] = useState<PastedRow[]>([]);
  const setSlotField = (spec: Partial<Row>, slot: Slot, patch: Partial<Row>) => {
    setQueued((q) => {
      const idx = q.findIndex((r) => orgKeyOf(r) === specOrgKey(spec) && slotOf(r) === slot);
      if (idx >= 0) {
        const merged = { ...q[idx], ...patch };
        if (!merged.name.trim() && !merged.instagram.trim() && !merged.email.trim()) return q.filter((_, i) => i !== idx);
        return q.map((r, i) => (i === idx ? merged : r));
      }
      const base = emptyRow(spec);
      base.isPerson = slot !== "org";
      base.role = slot === "chair" ? "Scholarship / Academic Chair" : slot === "pres" ? "President" : "";
      base.igRoleAccount = slot === "org"; // a council/club handle is an org account, not a person's
      const merged = { ...base, ...patch };
      if (!merged.name.trim() && !merged.instagram.trim() && !merged.email.trim()) return q;
      return [...q, merged];
    });
  };
  // Apply parsed rows: matched ones fill the grid, the rest land in the unassigned tray.
  const applyPasted = (rows: PastedRow[]) => {
    const leftover: PastedRow[] = [];
    for (const row of rows) {
      const ctype = matchCouncilType(row.council);
      const clubType = ctype ? null : matchClub(row.council, (s?.clubTypes ?? []).map((c) => ({ clubType: c.clubType, name: c.name })));
      const slot = matchSlot(row.position, row.name, row.instagram);
      if ((ctype || clubType) && slot) {
        const spec: Partial<Row> = ctype
          ? { kind: "council", councilType: ctype, label: FIELD_COUNCILS.find((c) => c.type === ctype)?.label ?? ctype }
          : { kind: "club", newClubCategory: clubType!, entityId: (s?.clubTypes ?? []).find((c) => c.clubType === clubType)?.clubId ?? null, newClubName: (s?.clubTypes ?? []).find((c) => c.clubType === clubType)?.name ?? null, label: (s?.clubTypes ?? []).find((c) => c.clubType === clubType)?.name ?? "" };
        setSlotField(spec, slot, { name: row.name || "", instagram: row.instagram ? atHandle(row.instagram) : "", email: row.email || "" });
      } else {
        leftover.push(row);
      }
    }
    setUnassigned(leftover);
  };
  const assignUnassigned = (row: PastedRow, target: string, slot: Slot) => {
    const isClub = target.startsWith("club:");
    const spec: Partial<Row> = isClub
      ? { kind: "club", newClubCategory: target.slice(5), entityId: (s?.clubTypes ?? []).find((c) => c.clubType === target.slice(5))?.clubId ?? null, newClubName: (s?.clubTypes ?? []).find((c) => c.clubType === target.slice(5))?.name ?? null, label: (s?.clubTypes ?? []).find((c) => c.clubType === target.slice(5))?.name ?? "" }
      : { kind: "council", councilType: target, label: FIELD_COUNCILS.find((c) => c.type === target)?.label ?? target };
    setSlotField(spec, slot, { name: row.name || "", instagram: row.instagram ? atHandle(row.instagram) : "", email: row.email || "" });
    setUnassigned((u) => u.filter((x) => x !== row));
  };

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
      const spent = timer.flush(); // record time spent this session against the campus
      if (spent > 3) { try { await growthLogEnrichmentTime({ data: { campusId: campus.campusId, seconds: spent } }); } catch { /* ignore */ } }
      qc.invalidateQueries({ queryKey: ["enrich-stats"] });
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

  // Combined (saved + queued) handle picture per council/club — drives the ready panel + DM list.
  const handlesFor = (spec: Partial<Row>) => {
    const existing = spec.kind === "council"
      ? (s?.councils.find((c) => c.type === spec.councilType)?.contacts ?? [])
      : (s?.clubTypes.find((c) => c.clubType === spec.newClubCategory)?.contacts ?? []);
    const q = queuedFor(specOrgKey(spec));
    const exOrg = existing.find((c) => !c.isPerson && c.instagram && c.instagram.trim());
    const exChair = existing.find((c) => c.isPerson && roleIsChair(c.role));
    const exPres = existing.find((c) => c.isPerson && roleIsPres(c.role));
    const qChair = q.find((r) => slotOf(r) === "chair");
    const qPres = q.find((r) => slotOf(r) === "pres");
    return {
      orgIg: (igHandle(exOrg?.instagram ?? null) ?? "") || (q.find((r) => slotOf(r) === "org")?.instagram ? igHandle(q.find((r) => slotOf(r) === "org")!.instagram) ?? "" : ""),
      chairIg: (igHandle(exChair?.instagram ?? null) ?? "") || (qChair?.instagram ? igHandle(qChair.instagram) ?? "" : ""),
      chairName: exChair?.name ?? qChair?.name ?? "",
      presIg: (igHandle(exPres?.instagram ?? null) ?? "") || (qPres?.instagram ? igHandle(qPres.instagram) ?? "" : ""),
      presName: exPres?.name ?? qPres?.name ?? "",
      hasChair: !!(exChair || qChair),
    };
  };
  const councilHandles = FIELD_COUNCILS.map((c) => ({ ...c, ...handlesFor({ kind: "council", councilType: c.type }) }));
  const clubHandles = (s?.clubTypes ?? []).map((cl) => ({ clubType: cl.clubType, name: cl.name, ...handlesFor({ kind: "club", newClubCategory: cl.clubType }) }));
  const pass1Ready = councilHandles.some((c) => c.orgIg && c.chairIg) && clubHandles.some((c) => c.orgIg);
  const emptyCouncils = councilHandles.filter((c) => !c.orgIg || !c.chairIg).map((c) => c.label);
  const councilsWithChair = councilHandles.filter((c) => c.hasChair);
  const pass2Ready = councilsWithChair.length > 0 && councilsWithChair.every((c) => c.presIg || c.presName);
  const dmList = () => {
    const councils = councilHandles.filter((c) => c.orgIg).map((c) => c.orgIg);
    const chairs = councilHandles.filter((c) => c.chairIg).map((c) => `${c.chairIg}${c.chairName ? ` (${c.chairName}, ${c.label})` : ` (${c.label})`}`);
    const clubs = clubHandles.filter((c) => c.orgIg).map((c) => c.orgIg);
    const pres = councilHandles.filter((c) => c.presIg).map((c) => `${c.presIg}${c.presName ? ` (${c.presName}, ${c.label})` : ` (${c.label})`}`);
    const lines = [`${campus.name} — ${showPres ? "Pass 2" : "Pass 1"}`];
    if (councils.length) lines.push(`Councils:  ${councils.join(" · ")}`);
    if (chairs.length) lines.push(`Chairs:    ${chairs.join(" · ")}`);
    if (clubs.length) lines.push(`Clubs:     ${clubs.join(" · ")}`);
    if (pres.length) lines.push(`Presidents: ${pres.join(" · ")}`);
    return lines.join("\n");
  };

  // Guided role progression (item 1): councils (except the FSL office) and chapters are worked as a
  // sequence — Scholarship chair, President, VP, Treasurer. These helpers say which roles are already
  // on file and which comes next, so the form opens on the next gap and advances as you add.
  const isSequenced = (spec: Partial<Row>) => (spec.kind === "council" && spec.councilType !== "fsl") || spec.kind === "chapter";
  const orgRoles = (spec: Partial<Row>): (string | null)[] => {
    const own = spec.kind === "council" ? (s?.councils.find((c) => c.type === spec.councilType)?.contacts ?? [])
      : spec.kind === "chapter" ? (s?.chapters.find((ch) => ch.id === spec.entityId)?.contacts ?? [])
        : [];
    return [...own.map((c) => c.role), ...queuedFor(specOrgKey(spec)).map((r) => r.role)];
  };
  const coveredRolesFor = (spec: Partial<Row>): string[] => {
    const chips = new Set(orgRoles(spec).map((r) => roleChipOf(r)).filter(Boolean) as string[]);
    return ROLE_CHIPS.filter((c) => chips.has(c));
  };
  const nextRoleFor = (spec: Partial<Row>, alsoCovered?: string | null): string | null => {
    const covered = new Set(coveredRolesFor(spec));
    const e = roleChipOf(alsoCovered); if (e) covered.add(e);
    return ROLE_CHIPS.find((c) => !covered.has(c)) ?? null;
  };

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
          coveredRoles={isSequenced(spec) ? coveredRolesFor(spec) : undefined}
          campusName={campus.name}
          onChange={setDraft}
          onSwitch={switchMode}
          onAdd={addQueued}
          onCancel={cancelForm}
          onMarkNotFound={() => markNotFound(openForm.draft)}
        />
      ) : null,
    };
  };

  const chapterGroup =(type: "fraternity" | "sorority", heading: string) => {
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
    <BottomSheet open onClose={handleClose} title={<span className="sa-admin-display text-sm font-semibold">Add contacts · {campus.name}</span>}>
      {slots.isLoading || !s ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2 pb-24" onPointerDownCapture={timer.ping} onKeyDownCapture={timer.ping}>
          {/* FIND CONTACTS — two model calls + a review table, for a fresh campus. */}
          <FindContactsPanel
            campusId={campus.campusId}
            campusName={campus.name}
            onImported={() => { void qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] }); onSaved(); }}
          />
          <PasteBox onApply={applyPasted} />

          {/* Ready panel — the real bar. Pass 1 = a council with org IG + chair IG, plus a club org IG. */}
          <div className={cn("rounded-lg border p-2.5 text-[12px]", pass1Ready ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/30")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn("font-semibold", pass1Ready && "text-emerald-400")}>{pass1Ready ? "🎉 Pass 1 ready" : "Pass 1 — need a council (org IG + chair IG) + a club org IG"}</span>
              {pass1Ready && <span className={cn("text-[11px]", pass2Ready ? "text-emerald-400" : "text-muted-foreground")}>{pass2Ready ? "· Pass 2 ready" : "· Pass 2: presidents still needed"}</span>}
              <button onClick={() => copyText(dmList(), "DM list copied — paste it into your working doc.")} disabled={!councilHandles.some((c) => c.orgIg || c.chairIg) && !clubHandles.some((c) => c.orgIg)} className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] hover:bg-muted disabled:opacity-40"><Copy className="size-3" /> Copy DM list</button>
            </div>
            {emptyCouncils.length > 0 && <div className="mt-1 text-[10px] text-muted-foreground">Still incomplete (need org IG + chair IG): {emptyCouncils.join(" · ")}</div>}
          </div>

          {/* Councils — the field grid. Personal handles are the product of this page. */}
          <div className="space-y-2">
            {FIELD_COUNCILS.map((c) => {
              const cs = s.councils.find((x) => x.type === c.type);
              const spec = { kind: "council" as const, councilType: c.type, label: c.label };
              return (
                <CouncilCard key={c.type} label={c.label} contacts={cs?.contacts ?? []} queuedRows={queuedFor(specOrgKey(spec))} showPres={showPres} campusName={campus.name}
                  onField={(slot, patch) => setSlotField(spec, slot, patch)} onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })} />
              );
            })}
            <button onClick={() => setShowPres((v) => !v)} className="text-[11px] font-medium text-primary hover:underline">{showPres ? "− Hide presidents (Pass 2)" : "+ Add presidents (Pass 2)"}</button>
          </div>

          {/* Business clubs — org IG each; they feed the campus rep program. */}
          <div className="space-y-2">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Business clubs</div>
            {(s.clubTypes ?? []).map((cl) => {
              const spec = { kind: "club" as const, entityId: cl.clubId, newClubName: cl.name, newClubCategory: cl.clubType, label: cl.name };
              return (
                <ClubCard key={cl.clubType} name={cl.name} headerExtra={<RenameClub campusId={campus.campusId} clubType={cl.clubType} name={cl.name} onRenamed={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })} />}
                  contacts={cl.contacts} queuedRows={queuedFor(specOrgKey(spec))} showPres={showPres} campusName={campus.name}
                  onField={(slot, patch) => setSlotField(spec, slot, patch)} onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })} />
              );
            })}
          </div>

          {/* Unassigned tray — pasted rows we couldn't place. */}
          {unassigned.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-2.5">
              <div className="mb-1 text-[11px] font-semibold text-amber-500">Unassigned ({unassigned.length}) — pick a home or leave out</div>
              {unassigned.map((row, i) => <UnassignedRow key={i} row={row} clubs={s.clubTypes ?? []} onAssign={(target, slot) => assignUnassigned(row, target, slot)} onDrop={() => setUnassigned((u) => u.filter((x) => x !== row))} />)}
            </div>
          )}

          {/* Chapter outreach + FSL office — out of scope for this pass, kept behind a divider. */}
          <div className="rounded-lg border border-border/60">
            <button onClick={() => setOpen((o) => ({ ...o, later: !o.later }))} className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground">
              {open.later ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <span className="text-[11px] font-medium uppercase tracking-wide">Chapter outreach — later</span>
              <span className="hidden text-[10px] sm:inline">Greek chapters + the Greek Life / FSL office</span>
            </button>
            {open.later && (
              <div className="space-y-2 border-t border-border p-3">
                {(() => {
                  const fsl = s.councils.find((c) => c.type === "fsl");
                  if (!fsl) return null;
                  const spec = { kind: "council" as const, councilType: "fsl", label: fsl.label };
                  return <EntityRow name={fsl.label} searchOrg="fraternity sorority life office" existing={fsl.contacts} notFound={fsl.notFound} person campusName={campus.name} onEdited={() => qc.invalidateQueries({ queryKey: ["co-slots", campus.campusId] })} {...addProps(spec)} />;
                })()}
                {chapterGroup("fraternity", "Fraternities")}
                {chapterGroup("sorority", "Sororities")}
              </div>
            )}
          </div>

          <FeedbackLine campusId={campus.campusId} />
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col items-center gap-1.5 border-t border-border bg-background px-4 py-2.5" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => save.mutate()}
          disabled={queued.length === 0 || save.isPending}
          className={cn("rounded-md bg-primary font-semibold text-primary-foreground disabled:opacity-40", vaMode ? "w-full py-3 text-sm" : "px-6 py-1.5 text-xs")}
        >
          {save.isPending ? "Saving…" : `Save queued (${queued.length})`}
        </button>
        {openForm && rowHasContent(openForm.draft) && (
          <span className="text-[10px] text-amber-500">1 contact open — not added yet</span>
        )}
        {vaMode && onDone && queued.length === 0 && !(openForm && rowHasContent(openForm.draft)) && (
          <button onClick={onDone} className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground">Done with this campus →</button>
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
