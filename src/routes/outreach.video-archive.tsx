// /outreach/video-archive — admin view for the Vimeo→Mux archive.
// Table of migrated videos (title, duration, transcript preview), an
// assign-to-scenario dropdown (sets scenario_slug + course_family + chapter_id),
// and a "Watch" modal that plays the Mux **signed** stream. Gated by the parent
// /outreach AdminGate. Legacy videos stay signed-only until Lee flips one public.
//
// 2026-09-17 — LABELS: the archive becomes a course library. A stats strip, course / kind /
// unlabeled filters, inline label editing (course, kind, chapter, ref, position, playlist) and
// "Label next 25" (AI pass, label_source = ai; Lee's edits stamp lee and are never overwritten).
// Needs migration 20260917_1200_video_archive_labels.sql — until then a loud banner, the rest of
// the page keeps working.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Play, Film, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listVideoArchive,
  listScenarioOptions,
  assignScenario,
  getWatchUrl,
  type VideoArchiveRow,
  type ScenarioOption,
} from "@/lib/video-archive.functions";
import {
  listArchiveLabels,
  archiveLabelStats,
  setArchiveLabel,
  labelArchiveBatch,
  type ArchiveLabel,
  type ArchiveLabelStats,
} from "@/lib/video-archive-labels.functions";
import { COURSE_FAMILIES, COURSE_LABEL, VIDEO_KINDS, isCourseFamily, isVideoKind } from "@/lib/video-archive-labels";

export const Route = createFileRoute("/outreach/video-archive")({
  component: VideoArchivePage,
});

function fmtDuration(sec: number | null): string {
  if (!sec && sec !== 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_COLOR: Record<string, string> = {
  imported: "bg-slate-100 text-slate-700",
  transcribed: "bg-blue-100 text-blue-700",
  assigned: "bg-green-100 text-green-700",
  archived: "bg-amber-100 text-amber-700",
};

const KIND_COLOR: Record<string, string> = {
  homework: "bg-violet-100 text-violet-700",
  review: "bg-sky-100 text-sky-700",
  cram: "bg-orange-100 text-orange-700",
};

// "Label next 25" runs as 5 server calls of 5 so the button shows real progress and no single
// request outlives a serverless timeout.
const LABEL_BATCH = 25;
const LABEL_CHUNK = 5;

const inputCls = "h-7 rounded-md border border-input bg-background px-1.5 text-xs";

type CourseFilter = "" | "none" | (typeof COURSE_FAMILIES)[number] | "other";
type KindFilter = "" | "none" | (typeof VIDEO_KINDS)[number];

function VideoArchivePage() {
  const list = useServerFn(listVideoArchive);
  const loadScenarios = useServerFn(listScenarioOptions);
  const assign = useServerFn(assignScenario);
  const watch = useServerFn(getWatchUrl);
  const loadLabels = useServerFn(listArchiveLabels);
  const loadStats = useServerFn(archiveLabelStats);
  const saveLabel = useServerFn(setArchiveLabel);
  const runBatch = useServerFn(labelArchiveBatch);

  const [rows, setRows] = useState<VideoArchiveRow[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [watchTitle, setWatchTitle] = useState<string>("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  // Labels live beside the rows (own server fn) so an unapplied migration breaks only the label
  // features, loudly, and never the archive table itself.
  const [labels, setLabels] = useState<Record<string, ArchiveLabel>>({});
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [stats, setStats] = useState<ArchiveLabelStats | null>(null);
  const [courseFilter, setCourseFilter] = useState<CourseFilter>("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [unlabeledOnly, setUnlabeledOnly] = useState(false);
  const [labeling, setLabeling] = useState<{ done: number; total: number } | null>(null);
  const [session, setSession] = useState({ labeled: 0, failed: 0, costUsd: 0 });

  const refreshLabels = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([loadLabels(), loadStats()]);
      if (!l.ok) {
        setLabelsError(l.error);
        return;
      }
      setLabels(l.labels);
      setStats(s.ok ? s : null);
      setLabelsError(s.ok ? null : s.error);
    } catch (e) {
      setLabelsError(`Labels failed to load: ${(e as Error).message}`);
    }
  }, [loadLabels, loadStats]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([list({ data: {} }), loadScenarios(), refreshLabels()]);
      setRows(r);
      setScenarios(s);
    } catch (e) {
      toast.error(`Load failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [list, loadScenarios, refreshLabels]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSaveLabel = async (id: string, patch: Partial<Omit<ArchiveLabel, "id" | "label_source" | "labeled_at" | "label_confidence" | "label_note">>) => {
    const cur = labels[id];
    const next = {
      id,
      course_family: isCourseFamily(cur?.course_family) ? cur.course_family : null,
      kind: cur?.kind ?? null,
      chapter_number: cur?.chapter_number ?? null,
      source_ref: cur?.source_ref ?? null,
      position: cur?.position ?? null,
      playlist_key: cur?.playlist_key ?? null,
      ...patch,
    };
    // The editor only offers the four library values; a scenario-written course_family that is not one of
    // them is dropped on the first hand edit (it shows as "other" until then).
    if (next.course_family !== null && !isCourseFamily(next.course_family)) next.course_family = null;
    try {
      const res = await saveLabel({ data: { ...next, course_family: next.course_family as (typeof COURSE_FAMILIES)[number] | null } });
      if (!res.ok) {
        setLabelsError(res.error);
        toast.error(res.error);
        return;
      }
      setLabels((m) => ({ ...m, [id]: res.label }));
      void loadStats().then((s) => s.ok && setStats(s));
    } catch (e) {
      toast.error(`Label save failed: ${(e as Error).message}`);
    }
  };

  const onLabelNext = async () => {
    if (labeling) return;
    setLabeling({ done: 0, total: LABEL_BATCH });
    let labeled = 0, failed = 0, cost = 0, remaining: number | null = null;
    const errors: string[] = [];
    try {
      for (let done = 0; done < LABEL_BATCH; done += LABEL_CHUNK) {
        const res = await runBatch({ data: { limit: Math.min(LABEL_CHUNK, LABEL_BATCH - done), onlyUnlabeled: true } });
        if (!res.ok) {
          setLabelsError(res.error);
          toast.error(res.error);
          return;
        }
        labeled += res.labeled;
        failed += res.failed;
        cost += res.costUsd;
        remaining = res.remaining;
        errors.push(...res.errors);
        setLabels((m) => {
          const next = { ...m };
          for (const it of res.items) {
            const prev = next[it.id];
            next[it.id] = {
              id: it.id,
              course_family: it.course_family,
              kind: it.kind,
              chapter_number: it.chapter_number,
              source_ref: it.source_ref,
              position: prev?.position ?? null,
              playlist_key: prev?.playlist_key ?? null,
              label_source: "ai",
              label_confidence: it.confidence,
              label_note: it.note || null,
              labeled_at: new Date().toISOString(),
            };
          }
          return next;
        });
        setLabeling({ done: done + res.attempted, total: LABEL_BATCH });
        if (res.attempted < LABEL_CHUNK) break; // nothing left to label
        if (res.labeled === 0 && res.failed > 0) break; // whole chunk failed (AI key / gateway) — the next chunk would hit the same rows
      }
      setSession((s) => ({ labeled: s.labeled + labeled, failed: s.failed + failed, costUsd: s.costUsd + cost }));
      if (labeled === 0 && failed === 0) toast.info("Nothing left to label");
      else toast[failed ? "warning" : "success"](`Labeled ${labeled}${failed ? `, ${failed} failed` : ""} · ${remaining ?? "?"} left · $${cost.toFixed(3)}`);
      if (errors.length) console.warn("[archive-labels] failures:", errors);
      void loadStats().then((s) => s.ok && setStats(s));
    } catch (e) {
      toast.error(`Labeling failed: ${(e as Error).message}`);
    } finally {
      setLabeling(null);
    }
  };

  // Group scenarios by course_family for <optgroup>s.
  const grouped = useMemo(() => {
    const g = new Map<string, ScenarioOption[]>();
    for (const s of scenarios) {
      const k = s.course_family ?? "other";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(s);
    }
    return Array.from(g.entries());
  }, [scenarios]);

  // Paginate + filter so we never render 1,327 rows × a 200-option <select> at
  // once (that many DOM nodes freezes the browser). Only the current page mounts.
  const PAGE_SIZE = 50;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(r.title ?? r.source_video_id).toLowerCase().includes(q)) return false;
      const l = labels[r.id];
      if (unlabeledOnly && l?.labeled_at) return false;
      if (courseFilter) {
        const c = l?.course_family ?? null;
        if (courseFilter === "none" ? c !== null : courseFilter === "other" ? c === null || isCourseFamily(c) : c !== courseFilter) return false;
      }
      if (kindFilter) {
        const k = l?.kind ?? null;
        if (kindFilter === "none" ? k !== null : k !== kindFilter) return false;
      }
      return true;
    });
  }, [rows, query, labels, unlabeledOnly, courseFilter, kindFilter]);
  const isFiltered = Boolean(query || unlabeledOnly || courseFilter || kindFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const onAssign = async (id: string, slug: string) => {
    try {
      await assign({ data: { id, scenario_slug: slug || null } });
      toast.success(slug ? "Assigned" : "Unassigned");
      await refresh();
    } catch (e) {
      toast.error(`Assign failed: ${(e as Error).message}`);
    }
  };

  const onWatch = async (row: VideoArchiveRow) => {
    try {
      const { player } = await watch({ data: { id: row.id } });
      setWatchTitle(row.title ?? row.source_video_id);
      setWatchUrl(player);
    } catch (e) {
      toast.error(`Can't play: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Film className="h-5 w-5" /> Video archive
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Vimeo → Mux migration. Signed playback only until you flip a video public.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search titles…"
            className="h-8 w-52 rounded-md border border-input bg-background px-2 text-sm"
          />
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value as CourseFilter);
              setPage(0);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            title="Filter by course"
          >
            <option value="">All courses</option>
            {COURSE_FAMILIES.map((c) => (
              <option key={c} value={c}>
                {COURSE_LABEL[c]}
              </option>
            ))}
            <option value="other">Other course value</option>
            <option value="none">No course</option>
          </select>
          <select
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value as KindFilter);
              setPage(0);
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            title="Filter by kind"
          >
            <option value="">All kinds</option>
            {VIDEO_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
            <option value="none">No kind</option>
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={unlabeledOnly}
              onChange={(e) => {
                setUnlabeledOnly(e.target.checked);
                setPage(0);
              }}
            />
            Unlabeled only
          </label>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => void onLabelNext()} disabled={loading || !!labeling || !!labelsError} title="AI-label the next unlabeled videos (never touches rows you set by hand)">
            {labeling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {labeling ? `Labeling ${labeling.done}/${labeling.total}…` : `Label next ${LABEL_BATCH}`}
          </Button>
        </div>
      </div>

      {labelsError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Labels are off: {labelsError}</div>
            <div className="text-xs">The archive table still works. Filters, inline labels and the AI pass wait for the migration.</div>
          </div>
        </div>
      )}

      {stats && !labelsError && (
        <div className="mt-4 flex flex-wrap items-stretch gap-3">
          <div className="flex gap-3">
            {[
              ["Total", stats.total],
              ["Labeled", stats.labeled],
              ["Unlabeled", stats.unlabeled],
              ["By AI", stats.bySource.ai],
              ["By Lee", stats.bySource.lee],
            ].map(([k, v]) => (
              <div key={String(k)} className="min-w-[84px] rounded-lg border border-border bg-card px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className="text-lg font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-2 py-1 text-left font-medium">course × kind</th>
                  {VIDEO_KINDS.map((k) => (
                    <th key={k} className="px-2 py-1 text-right font-medium">
                      {k}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-right font-medium">no kind</th>
                </tr>
              </thead>
              <tbody>
                {[...COURSE_FAMILIES.map((c) => [c, COURSE_LABEL[c]] as const), ...Object.keys(stats.matrix).filter((c) => c && !isCourseFamily(c)).map((c) => [c, c] as const), ["", "no course"] as const].map(([c, name]) => (
                  <tr key={c || "none"} className="border-t border-border/60">
                    <td className="px-2 py-1">{name}</td>
                    {[...VIDEO_KINDS, ""].map((k) => (
                      <td key={k || "none"} className="px-2 py-1 text-right tabular-nums">
                        {stats.matrix[c]?.[k] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(session.labeled > 0 || session.failed > 0) && (
            <div className="self-center text-xs text-muted-foreground">
              This session: {session.labeled} labeled{session.failed ? `, ${session.failed} failed` : ""} · ${session.costUsd.toFixed(3)}
            </div>
          )}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="mt-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No videos yet. Run <code>bun scripts/vimeo-to-mux.ts --limit 3</code> to import.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Transcript</th>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Ch</th>
                <th className="px-3 py-2 font-medium">Ref</th>
                <th className="px-3 py-2 font-medium">Pos</th>
                <th className="px-3 py-2 font-medium">Playlist</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Scenario</th>
                <th className="px-3 py-2 font-medium text-right">Watch</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.title ?? r.source_video_id}</div>
                    {r.course_family && !isCourseFamily(r.course_family) && (
                      <div className="text-xs text-muted-foreground">{r.course_family}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtDuration(r.duration_sec)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLOR[r.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[280px]">
                    {r.has_transcript ? (
                      <span className="text-xs text-muted-foreground" title={r.transcript_preview ?? ""}>
                        {r.transcript_preview}
                        <span className="ml-1 rounded bg-muted px-1 py-0.5">{r.transcript_source}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <LabelCells label={labels[r.id]} fallbackCourse={r.course_family} disabled={!!labelsError} onSave={(patch) => void onSaveLabel(r.id, patch)} />
                  <td className="px-3 py-2 min-w-[220px]">
                    <select
                      value={r.scenario_slug ?? ""}
                      onChange={(e) => void onAssign(r.id, e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="">— unassigned —</option>
                      {grouped.map(([family, opts]) => (
                        <optgroup key={family} label={family}>
                          {opts.map((o) => (
                            <option key={o.slug} value={o.slug}>
                              {o.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!r.mux_playback_id}
                      onClick={() => void onWatch(r)}
                      title={r.mux_playback_id ? "Play signed stream" : "No Mux playback yet"}
                    >
                      <Play className="h-4 w-4" /> Watch
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>
              {filtered.length === 0
                ? "No matches"
                : `${clampedPage * PAGE_SIZE + 1}–${Math.min((clampedPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
              {isFiltered && ` (filtered from ${rows.length})`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={clampedPage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Prev
              </Button>
              <span>
                Page {clampedPage + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={clampedPage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!watchUrl} onOpenChange={(o) => !o && setWatchUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{watchTitle}</DialogTitle>
          </DialogHeader>
          {watchUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                src={watchUrl}
                title={watchTitle}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Text/number input that commits on blur or Enter, so a 1,300-row grid never saves per keystroke. */
function CommitInput({
  value,
  onCommit,
  className,
  placeholder,
  numeric,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  numeric?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value.trim()) onCommit(draft.trim());
  };
  return (
    <input
      type="text"
      inputMode={numeric ? "numeric" : undefined}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
      className={`${inputCls} ${className ?? ""}`}
    />
  );
}

const toIntOrNull = (s: string): number | null | undefined => {
  if (!s) return null;
  return /^\d+$/.test(s) ? parseInt(s, 10) : undefined; // undefined = invalid, ignore
};

/** The six label cells + the AI/Lee chip for one archive row. Every change saves as Lee's. */
function LabelCells({
  label,
  fallbackCourse,
  disabled,
  onSave,
}: {
  label: ArchiveLabel | undefined;
  fallbackCourse: string | null;
  disabled: boolean;
  onSave: (patch: Partial<Omit<ArchiveLabel, "id" | "label_source" | "labeled_at" | "label_confidence" | "label_note">>) => void;
}) {
  const course = label?.course_family ?? fallbackCourse ?? null;
  const courseKnown = isCourseFamily(course);
  const conf = label?.label_confidence;
  return (
    <>
      <td className="px-3 py-2">
        <select
          value={courseKnown ? course : ""}
          disabled={disabled}
          onChange={(e) => onSave({ course_family: e.target.value ? e.target.value : null })}
          className={inputCls}
          title={course && !courseKnown ? `Scenario value: ${course}` : undefined}
        >
          <option value="">{course && !courseKnown ? `— ${course} —` : "—"}</option>
          {COURSE_FAMILIES.map((c) => (
            <option key={c} value={c}>
              {COURSE_LABEL[c]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={isVideoKind(label?.kind) ? label!.kind! : ""}
          disabled={disabled}
          onChange={(e) => onSave({ kind: isVideoKind(e.target.value) ? e.target.value : null })}
          className={`${inputCls} ${label?.kind ? KIND_COLOR[label.kind] ?? "" : ""}`}
        >
          <option value="">—</option>
          {VIDEO_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <CommitInput
          value={label?.chapter_number != null ? String(label.chapter_number) : ""}
          numeric
          disabled={disabled}
          className="w-12 text-right tabular-nums"
          onCommit={(v) => {
            const n = toIntOrNull(v);
            if (n !== undefined) onSave({ chapter_number: n });
          }}
        />
      </td>
      <td className="px-3 py-2">
        <CommitInput value={label?.source_ref ?? ""} disabled={disabled} placeholder="E5.4" className="w-20" onCommit={(v) => onSave({ source_ref: v || null })} />
      </td>
      <td className="px-3 py-2">
        <CommitInput
          value={label?.position != null ? String(label.position) : ""}
          numeric
          disabled={disabled}
          className="w-12 text-right tabular-nums"
          onCommit={(v) => {
            const n = toIntOrNull(v);
            if (n !== undefined) onSave({ position: n });
          }}
        />
      </td>
      <td className="px-3 py-2">
        <CommitInput value={label?.playlist_key ?? ""} disabled={disabled} placeholder="—" className="w-24" onCommit={(v) => onSave({ playlist_key: v || null })} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {label?.label_source === "lee" ? (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700" title={label.labeled_at ?? undefined}>
            Lee
          </span>
        ) : label?.label_source === "ai" ? (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${conf != null && conf < 0.5 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"}`}
            title={[conf != null ? `confidence ${Math.round(conf * 100)}%` : "", label.label_note ?? ""].filter(Boolean).join(" · ") || undefined}
          >
            AI{conf != null ? ` ${Math.round(conf * 100)}%` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </td>
    </>
  );
}
