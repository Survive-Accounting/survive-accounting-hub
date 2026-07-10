// /outreach/video-archive — admin view for the Vimeo→Mux archive.
// Table of migrated videos (title, duration, transcript preview), an
// assign-to-scenario dropdown (sets scenario_slug + course_family + chapter_id),
// and a "Watch" modal that plays the Mux **signed** stream. Gated by the parent
// /outreach AdminGate. Legacy videos stay signed-only until Lee flips one public.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Play, Film } from "lucide-react";
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

function VideoArchivePage() {
  const list = useServerFn(listVideoArchive);
  const loadScenarios = useServerFn(listScenarioOptions);
  const assign = useServerFn(assignScenario);
  const watch = useServerFn(getWatchUrl);

  const [rows, setRows] = useState<VideoArchiveRow[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [watchTitle, setWatchTitle] = useState<string>("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([list({ data: {} }), loadScenarios()]);
      setRows(r);
      setScenarios(s);
    } catch (e) {
      toast.error(`Load failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [list, loadScenarios]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    if (!q) return rows;
    return rows.filter((r) => (r.title ?? r.source_video_id).toLowerCase().includes(q));
  }, [rows, query]);
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
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

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
                <th className="px-3 py-2 font-medium">Scenario</th>
                <th className="px-3 py-2 font-medium text-right">Watch</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.title ?? r.source_video_id}</div>
                    {r.course_family && (
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
              {query && ` (filtered from ${rows.length})`}
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
