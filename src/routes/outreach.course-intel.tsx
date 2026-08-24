// /outreach/course-intel — the Course Intel cockpit.
// See everything the scraper/Course-Intel pipeline produces: per-campus
// professor + textbook coverage (a leaderboard), a per-campus drill-down where
// you publish professors to the STUDENT PLAYER (sets active_roster, the flag the
// player's professor picker already reads), and the textbook chapter → Survive-
// topic mappings. A professor shows to students only when the campus is live
// AND the professor is live AND they're RMP-matched.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminGate, getAdminWho, adminEmailFor } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCourseIntelOverview, getCampusProfessors, reviewProfessor, setCampusRoster, getTextbookMappings,
  type CourseIntelRow,
} from "@/lib/course-intel.functions";
import { discoverCourseDocuments, parseCourseDocument, getCampusDocuments } from "@/lib/syllabus-intel.functions";

export const Route = createFileRoute("/outreach/course-intel")({
  head: () => ({ meta: [{ title: "Course Intel — Survive Accounting" }] }),
  component: () => (
    <AdminGate>
      <CourseIntelCockpit />
    </AdminGate>
  ),
});

type Tab = "coverage" | "mappings";
type Filter = "all" | "picker" | "picker_no_profs" | "has_pending" | "live";

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
    else if (filter === "live") r = r.filter((x) => x.campusLive);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((x) => x.name.toLowerCase().includes(q) || (x.state ?? "").toLowerCase().includes(q));
    return [...r].sort((a, b) => b.profTotal - a.profTotal || a.name.localeCompare(b.name));
  }, [rows, filter, search]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Course Intel</h1>
          <p className="text-xs text-muted-foreground">Professor + textbook coverage across every campus. Publish professors to the student player and review the exam-topic mappings.</p>
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
              <Stat label="Campuses live" value={totals.campusesLive} hint="on the student roster" />
              <Stat label="Profs player-ready" value={totals.profsPlayerReady} hint="live + RMP-matched" />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campus or state…" className="h-9 max-w-xs" />
            {([["all", "All"], ["picker", "Pickable"], ["picker_no_profs", "Pickable · no profs"], ["has_pending", "Has pending"], ["live", "Live"]] as [Filter, string][]).map(([f, label]) => (
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
                      {r.campusLive && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">LIVE</span>}
                      {r.inPicker && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">PICKER</span>}
                      {r.hasMapping && <span className="ml-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-500">MAPPED</span>}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{r.state}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.profTotal || <span className="text-muted-foreground/50">0</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.profWithEmail}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-500">{r.profPlayerReady || (r.profLive ? `${r.profLive}*` : "")}</td>
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
          <p className="mt-2 text-[10px] text-muted-foreground">Live column = professors that actually show in the player (on-roster + RMP-matched). <span className="text-emerald-500">N</span> = player-ready; <span className="text-emerald-500">N*</span> = approved but not RMP-matched (won't appear until matched).</p>
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
  const campusLive = profs.data?.campusLive ?? row.campusLive;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["campus-profs", row.campusId] });
    qc.invalidateQueries({ queryKey: ["course-intel-overview"] });
  };
  const review = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" | "unapprove" }) =>
      reviewProfessor({ data: { ...v, who: who ? adminEmailFor(who) : undefined } }),
    onSuccess: invalidate,
  });
  const campusRoster = useMutation({
    mutationFn: (live: boolean) => setCampusRoster({ data: { campusId: row.campusId, live } }),
    onSuccess: invalidate,
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

        <div className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 ${campusLive ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/30"}`}>
          <div className="text-xs">
            <span className="font-medium">{campusLive ? "Campus is LIVE on the student roster" : "Campus not on the student roster"}</span>
            <div className="text-[10px] text-muted-foreground">Professors only show in the player when the campus is live.</div>
          </div>
          <Button size="sm" variant={campusLive ? "outline" : "default"} className="h-7 text-xs" disabled={campusRoster.isPending} onClick={() => campusRoster.mutate(!campusLive)}>
            {campusLive ? "Deactivate campus" : "Activate campus"}
          </Button>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">Approve → the professor appears in the student player's picker (name + RMP rating only; emails never leave outreach). RMP-matched professors are the ones the player can show.</p>
        <div className="mt-3 space-y-2">
          {profs.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {(profs.data?.professors ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {p.name || <span className="text-muted-foreground">(no name)</span>}
                  {p.live && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500">LIVE</span>}
                  {p.live && !p.rmpMatched && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500">not RMP-matched</span>}
                  {p.status === "rejected" && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-500">rejected</span>}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {[p.title, p.department, p.isCpa && "CPA", p.isPhd && "PhD", p.hasEmail && "✉", p.rmpMatched ? (p.rmpRating != null ? `RMP ${p.rmpRating}★ (${p.rmpNumRatings})` : "RMP-matched") : "no RMP"].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {!p.live
                  ? <Button size="sm" className="h-7 text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, action: "approve" })}>Approve</Button>
                  : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, action: "unapprove" })}>Unpublish</Button>}
                {p.status !== "rejected" && <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, action: "reject" })}>✕</Button>}
              </div>
            </div>
          ))}
          {profs.data && profs.data.professors.length === 0 && <div className="text-sm text-muted-foreground">No professors scraped for this campus yet.</div>}
        </div>

        <DocsPanel campusId={row.campusId} />
      </div>
    </div>
  );
}

function DocsPanel({ campusId }: { campusId: string }) {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["campus-docs", campusId], queryFn: () => getCampusDocuments({ data: { campusId } }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["campus-docs", campusId] });
  const discover = useMutation({ mutationFn: () => discoverCourseDocuments({ data: { campusId } }), onSuccess: invalidate });
  const parse = useMutation({ mutationFn: (documentId: string) => parseCourseDocument({ data: { documentId } }), onSuccess: invalidate });

  const evByDoc = (id: string) => (docs.data?.evidence ?? []).filter((e) => e.course_document_id === id);
  const tierLabel = ["", "exam", "structure", "topic", "id"];

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Course documents <span className="text-xs font-normal text-muted-foreground">(public syllabi / study guides)</span></h3>
        <Button size="sm" className="h-7 text-xs" disabled={discover.isPending} onClick={() => discover.mutate()}>
          {discover.isPending ? "Discovering…" : "Discover syllabi"}
        </Button>
      </div>
      {discover.data && <p className="mt-1 text-[11px] text-muted-foreground">Found {discover.data.total} ({discover.data.public} public, {discover.data.restricted} restricted-skipped) · {discover.data.serpCalls} searches · code {discover.data.code || "—"}</p>}
      <p className="mt-1 text-[10px] text-muted-foreground">Discovery uses public web search; restricted doc mills (Course Hero, Scribd, …) are skipped, never fetched. Parse fetches the public page and extracts textbook + exam→chapter ranges only.</p>

      <div className="mt-3 space-y-2">
        {docs.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {(docs.data?.docs ?? []).map((d) => {
          const ev = evByDoc(d.id);
          return (
            <div key={d.id} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.value_tier === 1 ? "bg-emerald-500/15 text-emerald-500" : d.value_tier === 2 ? "bg-sky-500/15 text-sky-500" : "bg-muted text-muted-foreground"}`}>{d.document_type}</span>
                <a href={d.source_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-foreground hover:underline">{d.title || d.source_url}</a>
                <span className="text-[10px] text-muted-foreground">{d.file_type}</span>
                {d.processing_status !== "parsed"
                  ? <Button size="sm" variant="outline" className="h-6 text-[11px]" disabled={parse.isPending} onClick={() => parse.mutate(d.id)}>Parse</Button>
                  : <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500">parsed</span>}
              </div>
              {ev.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 pl-1">
                  {ev.map((e) => (
                    <span key={e.id} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {e.evidence_type === "exam_chapter_range" ? `${e.exam_label}: Ch ${(e.exam_chapters as number[] | null)?.join(", ")}` : `📖 ${e.textbook_ref}${e.edition_ref ? " " + e.edition_ref : ""}`}
                      <span className="ml-1 opacity-60">{e.confidence}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {docs.data && docs.data.docs.length === 0 && <div className="text-xs text-muted-foreground">No documents yet — click “Discover syllabi”.</div>}
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
