// LESSON PUBLISH — "Publish lesson", one button on each lesson in the Script
// editor. Gathers the lesson's frames + their keeper takes, orders the body
// (publish-pipeline), fails loud if a frame is missing a keeper (naming which),
// then hands the ordered keepers to the server pipeline (Mux concat → Auphonic →
// Mux). Polls the staged status and surfaces it: concat → uploading → processing
// → finalizing → ready, with the Auphonic production link + any error. Re-publish
// bumps the version.
import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { AlertTriangle, ExternalLink, Film, Loader2, Rocket } from "lucide-react";

import { listLessonVideos, publishLesson, resolveLessonPublish, type LessonVideoRow } from "@/lib/publish.functions";
import { useFrameTakes } from "./frame-takes";
import { bodyFrames, collectKeepers, introFrame, keeperOf, missingLabel, type PubFrame, type PubTake } from "./publish-pipeline";
import { NEON } from "./theme";
import type { Beat, FrameBox } from "./types";

const STAGE_META: Record<LessonVideoRow["stage"], { label: string; color: string }> = {
  concat: { label: "concat", color: NEON.cyan },
  uploading: { label: "uploading", color: NEON.cyan },
  processing: { label: "processing", color: NEON.yellow },
  finalizing: { label: "finalizing", color: NEON.yellow },
  ready: { label: "ready", color: "#7EF3C0" },
  errored: { label: "error", color: NEON.red },
};

export function LessonPublishControl({ lessonId, courseName }: { lessonId: string; courseName: string | null }) {
  const rf = useReactFlow();
  const { takesFor } = useFrameTakes();
  const [row, setRow] = useState<LessonVideoRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<number | null>(null);

  const lessonLabel = (rf.getNode(lessonId)?.data as { label?: string } | undefined)?.label ?? null;

  // load the newest publish row for this lesson (status + version on open)
  useEffect(() => {
    let alive = true;
    listLessonVideos({ data: { lessonIds: [lessonId] } }).then((rows) => { if (alive && rows[0]) { setRow(rows[0]); if (rows[0].stage !== "ready" && rows[0].stage !== "errored") startPoll(rows[0].id); } }).catch(() => {});
    return () => { alive = false; if (poll.current) window.clearTimeout(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const startPoll = useCallback((publishId: string, attempt = 0) => {
    const run = async () => {
      try {
        const r = await resolveLessonPublish({ data: { publishId } });
        setRow(r);
        if (r.stage === "ready" || r.stage === "errored" || attempt > 200) { poll.current = null; return; }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        poll.current = null;
        return;
      }
      poll.current = window.setTimeout(() => startPoll(publishId, attempt + 1), 5000);
    };
    void run();
  }, []);

  const publish = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // gather the lesson's frames + keeper takes
      const frames: PubFrame[] = rf.getNodes().filter((n) => n.type === "frame" && n.parentId === lessonId).map((n) => {
        const d = n.data as unknown as FrameBox;
        return { id: n.id, beat: (d.beat === "none" ? "hook" : d.beat ?? "hook") as Beat, subIndex: d.subIndex ?? 0, introTake: d.introTake, title: d.title };
      });
      const keeperFor = (frameId: string): PubTake | null => {
        const takes = takesFor(frameId).map((t) => ({ frameId, keeper: t.keeper, muxPlaybackId: t.mux_playback_id, status: t.status, dim: t.width && t.height ? { w: t.width, h: t.height } : null }));
        return keeperOf(takes);
      };
      const intro = introFrame(frames);
      const body = bodyFrames(frames, intro?.id ?? null);
      const { keepers, missing } = collectKeepers(body, keeperFor);
      if (missing.length > 0) { setError(`Can't publish — these frames have no ready keeper take: ${missingLabel(missing)}.`); setBusy(false); return; }
      const introTake = intro ? keeperFor(intro.id) : null;

      const { publishId, version } = await publishLesson({
        data: {
          lessonId,
          courseName,
          lessonLabel,
          intro: introTake ? { frameId: intro!.id, playbackId: introTake.muxPlaybackId!, dim: introTake.dim } : null,
          body: keepers.map((k) => ({ frameId: k.frame.id, playbackId: k.take.muxPlaybackId!, dim: k.take.dim })),
        },
      });
      setRow({ id: publishId, lesson_id: lessonId, version, stage: "concat", error: null, course_name: courseName, lesson_label: lessonLabel, passthrough: null, mux_body_asset_id: null, mux_body_playback_id: null, intro_playback_id: null, auphonic_uuid: null, mux_asset_id: null, playback_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as LessonVideoRow);
      startPoll(publishId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [rf, lessonId, courseName, lessonLabel, takesFor, startPoll]);

  const working = !!row && row.stage !== "ready" && row.stage !== "errored";
  const meta = row ? STAGE_META[row.stage] : null;

  return (
    <span className="ml-1 inline-flex items-center gap-1.5">
      <button
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide disabled:opacity-50"
        style={{ color: "#0B1322", background: NEON.yellow, border: `1px solid ${NEON.yellow}` }}
        title={row ? "Re-publish this lesson (bumps the version)" : "Publish this lesson — concat keeper takes, Auphonic, Mux"}
        disabled={busy || working}
        onClick={() => void publish()}
      >
        {busy || working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
        {row ? `re-publish` : "publish"}
      </button>
      {row && meta && (
        <span className="inline-flex items-center gap-1 rounded px-1 text-[9px] font-bold uppercase" style={{ color: meta.color, border: `1px solid ${meta.color}66` }}>
          v{row.version} · {meta.label}
        </span>
      )}
      {row?.playback_id && row.stage === "ready" && (
        <span className="inline-flex items-center gap-0.5 text-[9px]" style={{ color: "#7EF3C0" }}><Film className="h-3 w-3" /> live</span>
      )}
      {row?.auphonic_uuid && (
        <a href={`https://auphonic.com/api/production/${row.auphonic_uuid}.json`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[9px]" style={{ color: NEON.cyan }} title="Auphonic production">
          Auphonic <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      {(error || row?.error) && (
        <span className="inline-flex items-center gap-0.5 text-[9px]" style={{ color: NEON.red }} title={error ?? row?.error ?? ""}>
          <AlertTriangle className="h-3 w-3" /> <span className="max-w-[220px] truncate">{error ?? row?.error}</span>
        </span>
      )}
    </span>
  );
}
