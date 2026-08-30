// /admin/growth/coldoutreach/engaged — WHO IS ACTUALLY MOVING.
//
// Not everyone we messaged. Only contacts showing signal: a reply, or visits produced by a link
// they were sent. Everyone else is the cold list and lives on the dashboard beside this one.
//
// ── THE FILTER THAT MATTERS ───────────────────────────────────────────────────────────────────
// "Clicked but never replied" is the point of this page. Those people found it useful enough to
// open and pass on and never told us — the warmest list we have, and nobody is following up. It
// is a filter here rather than a saved view because it needs to be one click from the table.
//
// ── WHAT THIS PAGE WILL NOT DO ────────────────────────────────────────────────────────────────
// Signups and paid conversions are NOT shown. Nothing links a signup or an order back to a
// contact ref yet, and a column of zeros would read as "nobody converted" rather than "we are not
// measuring it". The banner says so out loud instead.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AdminGate } from "@/components/AdminGate";
import {
  ENGAGEMENT_WEIGHTS, listEngagedContacts, setContactFlag, type EngagedRow,
} from "@/lib/engaged-contacts.functions";

// FLAT, NOT NESTED. The file is admin.growth.coldoutreach_.engaged.tsx — the trailing underscore
// tells TanStack not to nest this under the coldoutreach route, which renders no <Outlet/> and
// would therefore swallow this page entirely. The URL is unchanged; the alternative was editing
// another session's live route file to add an Outlet.
export const Route = createFileRoute("/admin/growth/coldoutreach_/engaged")({
  head: () => ({ meta: [{ title: "Engaged contacts — Survive" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGate><EngagedPage /></AdminGate>,
});

type FilterKey = "all" | "replied" | "clicked_never_replied" | "converted" | "rep_candidate" | "spoke_by_phone";

const FILTERS: Array<{ key: FilterKey; label: string; hint?: string }> = [
  { key: "all", label: "All with signal" },
  { key: "replied", label: "Replied" },
  { key: "clicked_never_replied", label: "Clicked, never replied", hint: "The warmest list nobody is following up with" },
  { key: "converted", label: "Forwarded it", hint: "More unique visitors than could be one person" },
  { key: "rep_candidate", label: "Rep candidates" },
  { key: "spoke_by_phone", label: "Spoke by phone" },
];

function EngagedPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [campus, setCampus] = useState<string>("");
  const [role, setRole] = useState<string>("");

  const q = useQuery({
    queryKey: ["engaged-contacts"],
    queryFn: () => listEngagedContacts(),
    networkMode: "always",
    staleTime: 60_000,
  });

  const flag = useMutation({
    mutationFn: (v: { contactId: string; field: "rep_candidate" | "spoke_by_phone"; value: boolean }) =>
      setContactFlag({ data: v }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["engaged-contacts"] }); },
    // The server throws on a failed write; surfacing it is the whole point — a flag that looks
    // set but is not silently loses people from the rep list.
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save that flag"),
  });

  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);

  const campuses = useMemo(
    () => [...new Set(rows.map((r) => r.campusName).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const roles = useMemo(
    () => [...new Set(rows.map((r) => r.role).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const shown = useMemo(() => rows.filter((r) => {
    if (campus && r.campusName !== campus) return false;
    if (role && r.role !== role) return false;
    switch (filter) {
      case "replied": return r.replied;
      case "clicked_never_replied": return r.clicks > 0 && !r.replied;
      // "Referred someone" has no direct signal, but a link that produced MORE THAN ONE unique
      // visitor was forwarded — one person opening their own link is one visitor.
      case "converted": return r.uniqueVisitors > 1;
      case "rep_candidate": return r.repCandidate;
      case "spoke_by_phone": return r.spokeByPhone;
      default: return true;
    }
  }), [rows, filter, campus, role]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8">
      <h1 className="text-2xl font-black">Engaged contacts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Only contacts showing signal — a reply, or visits from a link they were sent.
      </p>

      {/* THE GAP, STATED. */}
      {q.data?.notWired && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px]">
          {q.data.notWired}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            title={f.hint}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-bold ${
              filter === f.key ? "border-amber-500 bg-amber-500/15 text-amber-400" : "border-white/15 text-foreground/80"
            }`}
          >
            {f.label}
            {f.key !== "all" && <span className="ml-1.5 opacity-60">{countFor(rows, f.key)}</span>}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <select value={campus} onChange={(e) => setCampus(e.target.value)} className="rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-[13px]">
          <option value="">All campuses</option>
          {campuses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-white/15 bg-transparent px-2 py-1.5 text-[13px]">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {q.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        // An empty table is explained, not left blank: before the migration runs and links go out,
        // empty is the CORRECT answer and should not look like a broken page.
        <p className="mt-8 rounded-lg border border-white/10 px-4 py-6 text-sm text-muted-foreground">
          Nothing yet. Contacts appear here once someone replies, or once a link carrying their
          <code className="mx-1">?ref=</code> is opened — which needs migration
          <code className="mx-1">20260830_1400</code> applied and tagged links out in the world.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[1000px] text-left text-[13px]">
            <thead className="bg-white/5 text-[11.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Contact", "Campus", "Role", "Channel", "Replied", "Clicks", "Visitors", "Chapters", "Last", "Score", "Flags"].map((h) => (
                  <th key={h} className="px-3 py-2 font-black">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => <Row key={r.contactId} r={r} onFlag={(field, value) => flag.mutate({ contactId: r.contactId, field, value })} />)}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[12px] text-muted-foreground">
        Score: replied {ENGAGEMENT_WEIGHTS.replied} · referred {ENGAGEMENT_WEIGHTS.referred} ·{" "}
        {ENGAGEMENT_WEIGHTS.perUniqueVisitor} per unique visitor (capped at {ENGAGEMENT_WEIGHTS.visitorCap}) ·{" "}
        signup {ENGAGEMENT_WEIGHTS.signup} · conversion {ENGAGEMENT_WEIGHTS.conversion}.
      </p>
    </div>
  );
}

function countFor(rows: EngagedRow[], key: FilterKey): number {
  switch (key) {
    case "replied": return rows.filter((r) => r.replied).length;
    case "clicked_never_replied": return rows.filter((r) => r.clicks > 0 && !r.replied).length;
    case "converted": return rows.filter((r) => r.uniqueVisitors > 1).length;
    case "rep_candidate": return rows.filter((r) => r.repCandidate).length;
    case "spoke_by_phone": return rows.filter((r) => r.spokeByPhone).length;
    default: return rows.length;
  }
}

function Row({ r, onFlag }: { r: EngagedRow; onFlag: (f: "rep_candidate" | "spoke_by_phone", v: boolean) => void }) {
  // THE REP FLAG IS OFFERED QUIETLY, and only where the brief says: a reply AND at least one
  // click. Showing it on every row would turn a judgement into a chore.
  const repEligible = r.replied && r.clicks > 0;
  return (
    <tr className="border-t border-white/5 align-top">
      <td className="px-3 py-2">
        <div className="font-bold">{r.name ?? "—"}</div>
        {r.email && <div className="text-[11.5px] text-muted-foreground">{r.email}</div>}
        {r.replyText && (
          <div className="mt-1 max-w-[36ch] rounded bg-white/5 px-2 py-1 text-[11.5px] italic text-foreground/80">
            “{r.replyText.slice(0, 180)}{r.replyText.length > 180 ? "…" : ""}”
          </div>
        )}
      </td>
      <td className="px-3 py-2">{r.campusName ?? "—"}</td>
      <td className="px-3 py-2">{r.role ?? "—"}</td>
      <td className="px-3 py-2">{r.channel ?? "—"}</td>
      <td className="px-3 py-2">{r.replied ? "yes" : "—"}</td>
      <td className="px-3 py-2 tabular-nums">{r.clicks}</td>
      <td className="px-3 py-2 tabular-nums">{r.uniqueVisitors}</td>
      <td className="px-3 py-2 tabular-nums">{r.chapterPagesOpened}</td>
      <td className="px-3 py-2 text-[11.5px] text-muted-foreground">{r.lastActivity ? r.lastActivity.slice(0, 10) : "—"}</td>
      <td className="px-3 py-2 font-black tabular-nums">{r.score}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          {(repEligible || r.repCandidate) && (
            <button
              type="button"
              onClick={() => onFlag("rep_candidate", !r.repCandidate)}
              className={`rounded border px-2 py-1 text-[11.5px] font-bold ${r.repCandidate ? "border-amber-500 text-amber-400" : "border-white/15 text-foreground/70"}`}
            >
              {r.repCandidate ? "✓ rep candidate" : "Flag as rep candidate"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onFlag("spoke_by_phone", !r.spokeByPhone)}
            className={`rounded border px-2 py-1 text-[11.5px] font-bold ${r.spokeByPhone ? "border-sky-500 text-sky-400" : "border-white/15 text-foreground/70"}`}
          >
            {r.spokeByPhone ? "✓ spoke by phone" : "Mark spoke by phone"}
          </button>
        </div>
      </td>
    </tr>
  );
}
