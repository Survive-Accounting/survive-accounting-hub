// /outreach/course-intel — the Course Intel cockpit.
// One place to SEE everything the scraper/Course-Intel pipeline produces:
// per-campus professor + textbook coverage (a leaderboard), a per-campus
// drill-down where you approve professors (→ outreach AND the student player),
// and the textbook chapter → Survive-topic mappings.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminGate, getAdminWho, adminEmailFor } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCourseIntelOverview, getCampusProfessors, reviewProfessor, getTextbookMappings,
  type CourseIntelRow,
} from "@/lib/course-intel.functions";

export const Route = createFileRoute("/outreach/course-intel")({
  head: () => ({ meta: [{ title: "Course Intel — Survive Accounting" }] }),
  component: () => (
    <AdminGate>
      <CourseIntelCockpit />
    </AdminGate>
  ),
});

type Tab = "coverage" | "mappings";
type Filter = "all" | "picker" | "picker_no_profs" | "has_pending";

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

function CourseIntelCockpit() {
  const [tab, setTab] = useState<Tab>("coverage");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<CourseIntelRow | null>(null);

  const overview = useQuery({ queryKey: ["course-intel-overview"], queryFn: () => getCourseIntelOverview() });
  const rows = overview.data?.rows ?? [];
  const totals = overview.data?.totals;

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === "picker") r = r.filter((x) => x.inPicker);
    else if (filter === "picker_no_profs") r = r.filter((x) => x.inPicker && x.profTotal === 0);
    else if (filter === "has_pending") r = r.filter((x) => x.profPending > 0);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((x) => x.name.toLowerCase().includes(q) || (x.state ?? "").toLowerCase().includes(q));
    return [...r].sort((a, b) => b.profTotal - a.profTotal || a.name.localeCompare(b.name));
  }, [rows, filter, search]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Course Intel</h1>
          <p className="text-xs text-muted-foreground">Professor + textbook coverage across every campus. Approve professors to publish them to outreach and the student player.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <button onClick={() => setTab("coverage")} className={`rounded px-3 py-1 text-xs ${tab === "coverage" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Coverage</button>
          <button onClick={() => setTab("mappings")} className={`rounded px-3 py-1 text-xs ${tab === "mappings" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Textbook Mappings</button>
        </div>
      </div>

      {tab === "coverage" && (
        <>
          {totals && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Campuses" value={totals.campuses} />
              <Stat label="With ≥1 prof" value={totals.withProfs} />
              <Stat label="Pickable schools" value={totals.pickable} hint="in the student picker" />
              <Stat label="Pickable, no profs" value={totals.pickableNoProfs} hint="next scrape targets" />
              <Stat label="Student-visible profs" value={totals.studentVisible} />
              <Stat label="Pending review" value={totals.pendingReview} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campus or state…" className="h-9 max-w-xs" />
            {([["all", "All"], ["picker", "Pickable"], ["picker_no_profs", "Pickable · no profs"], ["has_pending", "Has pending"]] as [Filter, string][]).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{label}</button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} campuses{overview.isLoading ? " · loading…" : ""}</span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Campus</th><th className="px-2 py-2">ST</th>
                  <th className="px-2 py-2 text-right">Profs</th><th className="px-2 py-2 text-right">Email</th>
                  <th className="px-2 py-2 text-right">Live</th><th className="px-2 py-2 text-right">Pending</th>
                  <th className="px-3 py-2">Textbook</th><th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r) => (
                  <tr key={r.campusId} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {r.name}
                      {r.inPicker && <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">PICKER</span>}
                      {r.hasMapping && <span className="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">MAPPED</span>}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.state}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.profTotal || <span className="text-muted-foreground/50">0</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.profWithEmail}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-500">{r.profStudentVisible || ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-amber-500">{r.profPending || ""}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.textbook ?? <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="px-2 py-2 text-right">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(r)} disabled={r.profTotal === 0}>Review</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "mappings" && <MappingsView />}

      {selected && <ProfessorDrawer row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ProfessorDrawer({ row, onClose }: { row: CourseIntelRow; onClose: () => void }) {
  const qc = useQueryClient();
  const who = getAdminWho();
  const profs = useQuery({ queryKey: ["campus-profs", row.campusId], queryFn: () => getCampusProfessors({ data: { campusId: row.campusId } }) });
  const review = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" | "unapprove" }) =>
      reviewProfessor({ data: { ...v, who: who ? adminEmailFor(who) : undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campus-profs", row.campusId] });
      qc.invalidateQueries({ queryKey: ["course-intel-overview"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{row.name}</h2>
            <p className="text-xs text-muted-foreground">{row.state} · {row.profTotal} professors · {row.textbook ?? "no textbook on file"}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Approve → visible to students in the professor picker + added to outreach. Emails are never shown to students.</p>
        <div className="mt-4 space-y-2">
          {profs.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {(profs.data ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {p.name || <span className="text-muted-foreground">(no name)</span>}
                  {p.studentVisible && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500">LIVE</span>}
                  {p.status === "rejected" && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-500">rejected</span>}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {[p.title, p.department, p.isCpa && "CPA", p.isPhd && "PhD", p.hasEmail && "✉ email", p.rmpRating != null && `RMP ${p.rmpRating}★ (${p.rmpNumRatings})`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {!p.studentVisible
                  ? <Button size="sm" className="h-7 text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, action: "approve" })}>Approve</Button>
                  : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, action: "unapprove" })}>Unpublish</Button>}
                {p.status !== "rejected" && <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, action: "reject" })}>✕</Button>}
              </div>
            </div>
          ))}
          {profs.data && profs.data.length === 0 && <div className="text-sm text-muted-foreground">No professors scraped for this campus yet.</div>}
        </div>
      </div>
    </div>
  );
}

function MappingsView() {
  const q = useQuery({ queryKey: ["textbook-mappings"], queryFn: () => getTextbookMappings() });
  const data = q.data;
  if (q.isLoading) return <div className="mt-6 text-sm text-muted-foreground">Loading mappings…</div>;
  if (!data) return null;
  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs text-muted-foreground">Textbook chapter → Survive topic mappings. Built once per edition and reused across every professor/campus using that book.</p>
      {data.books.map((b) => {
        const chapters = data.chapters.filter((c) => c.textbook_id === b.id);
        return (
          <div key={b.id} className="rounded-lg border border-border">
            <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">{b.title} — {b.authors} <span className="text-xs text-muted-foreground">{b.edition}</span></div>
            <div className="divide-y divide-border">
              {chapters.map((c) => {
                const maps = data.maps.filter((m) => m.textbook_chapter_id === c.id);
                return (
                  <div key={c.id} className="flex gap-3 px-3 py-2 text-sm">
                    <div className="w-48 shrink-0 text-muted-foreground">Ch {c.number}. {c.title}</div>
                    <div className="flex flex-wrap gap-1">
                      {maps.map((m, i) => (
                        <span key={i} className={`rounded px-1.5 py-0.5 text-[11px] ${m.confidence === "High" ? "bg-emerald-500/15 text-emerald-500" : m.confidence === "Medium" ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground"}`}>{m.survive_topic_label}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
