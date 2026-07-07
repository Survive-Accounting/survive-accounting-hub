// /outreach/parent-groups — Parent-group tracker (sibling to /outreach/reddit).
// Manual inventory + engagement triage of campus parent Facebook groups. NO
// Facebook automation (no scraping, no API): a grid of Facebook group-search
// links per campus + hand-entered group records you triage. Reuses the Reddit
// dashboard's patterns and the shared FilterPill.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, Users, Plus, Check, Pencil, CalendarCheck } from "lucide-react";

import {
  addParentGroup,
  cohortLabel,
  COHORTS,
  fetchParentGroupCampuses,
  listParentGroups,
  MEMBERSHIP_STATUSES,
  nextMembershipStatus,
  parentGroupSearchQueries,
  updateCampusMascot,
  updateParentGroup,
  type ParentGroup,
  type ParentGroupCampus,
} from "@/lib/parent-groups";
import { FilterPill } from "@/components/outreach/FilterPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/parent-groups")({
  head: () => ({
    meta: [
      { title: "Outreach — Parent groups" },
      { name: "description", content: "Manual tracker for campus parent Facebook groups." },
    ],
  }),
  component: ParentGroups,
});

const STATUS_STYLE: Record<string, string> = {
  found: "bg-blue-100 text-blue-700 border-blue-200",
  requested: "bg-amber-100 text-amber-700 border-amber-200",
  member: "bg-emerald-100 text-emerald-700 border-emerald-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  ignored: "bg-muted text-muted-foreground border-border",
};

const today = () => new Date().toISOString().slice(0, 10);

function ParentGroups() {
  const campusesQuery = useQuery({ queryKey: ["pg-campuses"], queryFn: fetchParentGroupCampuses });
  const groupsQuery = useQuery({ queryKey: ["parent-groups"], queryFn: () => listParentGroups() });
  const campuses = useMemo(() => campusesQuery.data ?? [], [campusesQuery.data]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  const [campusId, setCampusId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const campusName = (id: string | null) => campuses.find((c) => c.id === id)?.name ?? "—";
  const selectedCampus = campuses.find((c) => c.id === campusId) ?? null;

  // Groups by status, per campus (stats header).
  const byCampusStatus = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const g of groups) {
      const cid = g.campus_id ?? "?";
      (map[cid] ??= {})[g.membership_status] = (map[cid]?.[g.membership_status] ?? 0) + 1;
    }
    return map;
  }, [groups]);

  const filtered = useMemo(
    () =>
      groups
        .filter(
          (g) =>
            (!campusId || g.campus_id === campusId) &&
            (!statusFilter || g.membership_status === statusFilter),
        )
        .sort(
          (a, b) =>
            campusName(a.campus_id).localeCompare(campusName(b.campus_id)) ||
            (b.created_at ?? "").localeCompare(a.created_at ?? ""),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, campusId, statusFilter, campuses],
  );

  async function cycleStatus(g: ParentGroup) {
    try {
      await updateParentGroup(g.id, {
        membership_status: nextMembershipStatus(g.membership_status),
      });
      groupsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }
  async function markChecked(g: ParentGroup) {
    try {
      await updateParentGroup(g.id, { last_checked: today() });
      groupsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }
  async function saveNotes(g: ParentGroup, notes: string) {
    if ((g.notes ?? "") === notes) return;
    try {
      await updateParentGroup(g.id, { notes });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">Parent groups</h1>
        <Badge variant="outline" className="text-[10px]">
          manual
        </Badge>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Track campus parent Facebook groups by hand. No scraping or API — use the search links to
        find groups, log them, and triage membership. Links open Facebook in a new tab.
      </p>

      {/* Stats: groups by status per campus */}
      <div className="mb-4 rounded-lg border border-border bg-card/60 p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Groups by status · {groups.length} total
        </div>
        {groups.length === 0 ? (
          <div className="text-xs text-muted-foreground">No groups logged yet.</div>
        ) : (
          <div className="space-y-1">
            {campuses
              .filter((c) => byCampusStatus[c.id])
              .map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="w-40 shrink-0 truncate font-medium">{c.name}</span>
                  {MEMBERSHIP_STATUSES.filter((s) => byCampusStatus[c.id]?.[s]).map((s) => (
                    <span
                      key={s}
                      className={`rounded-full border px-2 py-0.5 capitalize ${STATUS_STYLE[s]}`}
                    >
                      {s} {byCampusStatus[c.id][s]}
                    </span>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Campus filter (tabs) */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <FilterPill active={!campusId} onClick={() => setCampusId(null)}>
          All campuses
        </FilterPill>
        {campuses.map((c) => (
          <FilterPill key={c.id} active={campusId === c.id} onClick={() => setCampusId(c.id)}>
            {c.name.replace(/^University of /, "").replace(/ University$/, "")}
          </FilterPill>
        ))}
      </div>
      {/* Status filter */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Status:</span>
        <FilterPill active={!statusFilter} onClick={() => setStatusFilter(null)}>
          All
        </FilterPill>
        {MEMBERSHIP_STATUSES.map((s) => (
          <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s}
          </FilterPill>
        ))}
      </div>

      {/* Per-campus tools: mascot editor + Facebook search-link grid */}
      {selectedCampus && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <MascotEditor campus={selectedCampus} onSaved={() => campusesQuery.refetch()} />
          <SearchLinkGrid campus={selectedCampus} />
        </div>
      )}
      <QuickAdd
        campuses={campuses}
        defaultCampusId={campusId}
        onAdded={() => groupsQuery.refetch()}
      />

      {/* Groups table */}
      <div className="mt-4">
        {groupsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No groups logged{campusId ? ` for ${campusName(campusId)}` : ""} yet. Use the search
            links above to find groups, then quick-add them.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border text-xs">
            <table className="w-full">
              <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Campus</th>
                  <th className="px-3 py-2 text-left">Group</th>
                  <th className="px-3 py-2 text-left">Cohort</th>
                  <th className="px-3 py-2 text-right">Members</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Last checked</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id} className="border-t border-border align-top hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{campusName(g.campus_id)}</td>
                    <td className="px-3 py-2">
                      {g.url ? (
                        <a
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                        >
                          {g.name || g.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="font-medium">{g.name || "(unnamed)"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {cohortLabel(g.cohort)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {g.member_count?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => cycleStatus(g)}
                        title="Click to cycle status"
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[g.membership_status] ?? STATUS_STYLE.ignored}`}
                      >
                        {g.membership_status}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => markChecked(g)}
                        title="Mark checked today"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <CalendarCheck className="h-3.5 w-3.5" />
                        {g.last_checked ?? "check"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={g.notes ?? ""}
                        placeholder="note…"
                        onBlur={(e) => saveNotes(g, e.target.value)}
                        className="h-7 w-40 text-[11px]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MascotEditor({ campus, onSaved }: { campus: ParentGroupCampus; onSaved: () => void }) {
  const [value, setValue] = useState(campus.mascot ?? "");
  const [saving, setSaving] = useState(false);

  async function save(markVerified: boolean) {
    setSaving(true);
    try {
      await updateCampusMascot(campus.id, value, markVerified);
      toast.success(markVerified ? "Mascot confirmed." : "Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">Mascot</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-40 text-sm"
        placeholder="e.g. Rebels"
      />
      {campus.mascot_verified ? (
        <Badge className="bg-emerald-100 text-[10px] text-emerald-700">verified</Badge>
      ) : (
        <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
          needs verification
        </Badge>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={saving}
        onClick={() => save(false)}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" /> Save
      </Button>
      <Button size="sm" className="h-7" disabled={saving} onClick={() => save(true)}>
        <Check className="mr-1 h-3.5 w-3.5" /> Confirm
      </Button>
    </div>
  );
}

function SearchLinkGrid({ campus }: { campus: ParentGroupCampus }) {
  const queries = useMemo(
    () => parentGroupSearchQueries(campus.name, campus.mascot),
    [campus.name, campus.mascot],
  );
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
        Facebook group searches (opens Facebook)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {queries.map((q) => (
          <a
            key={q.query}
            href={q.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
          >
            {q.label}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}

function QuickAdd({
  campuses,
  defaultCampusId,
  onAdded,
}: {
  campuses: ParentGroupCampus[];
  defaultCampusId: string | null;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [campusId, setCampusId] = useState(defaultCampusId ?? "");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cohort, setCohort] = useState<string>("general");
  const [members, setMembers] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!campusId) return toast.error("Pick a campus.");
    if (!name.trim()) return toast.error("Group name is required.");
    setSaving(true);
    try {
      await addParentGroup({
        campus_id: campusId,
        name,
        url,
        cohort,
        member_count: members.trim() ? Number(members.replace(/[^\d]/g, "")) : null,
        notes: notes || null,
      });
      toast.success("Group logged.");
      setName("");
      setUrl("");
      setMembers("");
      setNotes("");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold"
      >
        <Plus className="h-4 w-4" /> Quick-add a parent group
      </button>
      {open && (
        <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
          <select
            value={campusId}
            onChange={(e) => setCampusId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Select campus…</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {COHORTS.map((c) => (
              <option key={c} value={c}>
                {cohortLabel(c)}
              </option>
            ))}
          </select>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="text-sm"
          />
          <Input
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            placeholder="Member count (optional)"
            className="text-sm"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.facebook.com/groups/…"
            className="text-sm sm:col-span-2"
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="text-sm sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button size="sm" onClick={add} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Add group
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
