// SAVE TO LIBRARY (author from canvas — the content-reset core). A JE card
// becomes an AUTHORED scenario doc: caption, lines, amounts, memos, traps,
// solution all round-trip through docFromJeCard. Already-linked cards
// (scenarioId set) choose update-in-place vs save-as-new; either way the card
// remembers its scenario id afterward — the JE↔scenario mapping.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { fetchCourseOptions } from "@/lib/je-api";
import { nextScenarioSort, saveScenarioDoc } from "@/lib/canvas.functions";
import { docFromJeCard } from "../library";
import { NEON } from "../theme";
import type { JeCard } from "../types";

export function SaveToLibraryDialog({ card, defaultCourseId, defaultChapterId, onSaved, onClose }: {
  card: JeCard;
  defaultCourseId: string | null;
  defaultChapterId: string | null;
  onSaved: (scenarioId: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const coursesQuery = useQuery({ queryKey: ["course-options"], queryFn: fetchCourseOptions, staleTime: 600_000 });
  const [courseId, setCourseId] = useState<string>(defaultCourseId ?? "");
  const [chapterId, setChapterId] = useState<string>(defaultChapterId ?? "");
  const [sortOrder, setSortOrder] = useState<number | "">("");
  const [title, setTitle] = useState(card.caption || "");
  const [mode, setMode] = useState<"update" | "new">(card.scenarioId ? "update" : "new");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const course = useMemo(() => (coursesQuery.data ?? []).find((c) => c.id === courseId) ?? null, [coursesQuery.data, courseId]);

  // sort_order default: next in the chosen chapter
  useEffect(() => {
    if (!chapterId) return;
    let alive = true;
    void nextScenarioSort({ data: { chapter_id: chapterId } })
      .then((r) => { if (alive) setSortOrder((cur) => (cur === "" ? r.next : cur)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [chapterId]);

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await saveScenarioDoc({
        data: {
          id: mode === "update" && card.scenarioId ? card.scenarioId : undefined,
          course_id: courseId,
          chapter_id: chapterId,
          sort_order: typeof sortOrder === "number" ? sortOrder : 1,
          title: title.trim(),
          doc_json: JSON.stringify(docFromJeCard(card, title.trim())),
        },
      });
      void qc.invalidateQueries({ queryKey: ["je-tree"] });
      onSaved(res.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canSave = !!courseId && !!chapterId && title.trim().length > 0 && !busy;

  return createPortal(
    <div className="fixed inset-0 z-[130] grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-96 max-w-[92vw] rounded-xl p-4"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Save to library</span>
          <button className="ml-auto" style={{ color: NEON.muted }} onClick={onClose} title="Close"><X className="h-4 w-4" /></button>
        </div>

        {card.scenarioId && (
          <div className="mb-2 flex gap-1">
            {(["update", "new"] as const).map((m) => (
              <button
                key={m}
                className="flex-1 rounded px-1 py-1 text-[10px] font-bold uppercase"
                style={{
                  color: mode === m ? NEON.yellow : NEON.muted,
                  border: `1px solid ${mode === m ? "rgba(252,163,17,0.5)" : NEON.borderSoft}`,
                  background: mode === m ? "rgba(252,163,17,0.12)" : "transparent",
                }}
                onClick={() => setMode(m)}
              >
                {m === "update" ? "Update linked scenario" : "Save as new"}
              </button>
            ))}
          </div>
        )}

        <label className="block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
          title
          <input
            className="mt-0.5 w-full rounded bg-black/30 px-2 py-1 text-[12px] font-normal normal-case outline-none"
            style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Owner invests cash"
          />
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
            course
            <select
              value={courseId}
              onChange={(e) => { setCourseId(e.target.value); setChapterId(""); setSortOrder(""); }}
              className="mt-0.5 w-full rounded bg-black/40 px-1 py-1 text-[11px] font-normal normal-case outline-none"
              style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
            >
              <option value="">— pick —</option>
              {(coursesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.code ?? c.course_name ?? c.id.slice(0, 8)}</option>
              ))}
            </select>
          </label>
          <label className="block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
            chapter
            <select
              value={chapterId}
              onChange={(e) => { setChapterId(e.target.value); setSortOrder(""); }}
              className="mt-0.5 w-full rounded bg-black/40 px-1 py-1 text-[11px] font-normal normal-case outline-none"
              style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
              disabled={!course}
            >
              <option value="">— pick —</option>
              {(course?.chapters ?? []).map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.number != null ? `Ch ${ch.number}` : ""} {ch.name ?? ""}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-2 block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
          sort order <span className="opacity-60 normal-case">(default: next in chapter)</span>
          <input
            type="number"
            min={1}
            className="mt-0.5 w-24 rounded bg-black/30 px-2 py-1 text-[12px] font-normal outline-none"
            style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </label>

        {err && <p className="mt-2 rounded px-2 py-1 text-[11px]" style={{ color: NEON.red, border: "1px solid rgba(255,92,122,0.4)" }}>{err}</p>}

        <div className="mt-3 flex justify-end gap-2">
          <button className="rounded px-2.5 py-1 text-[11.5px] font-semibold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose}>
            cancel
          </button>
          <button
            className="rounded px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-40"
            style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)", background: "rgba(252,163,17,0.12)" }}
            disabled={!canSave}
            onClick={() => void save()}
          >
            {busy ? "saving…" : mode === "update" && card.scenarioId ? "update scenario" : "save scenario"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
