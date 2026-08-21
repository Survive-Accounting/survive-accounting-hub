// PRACTICE STAGE (08-20) — the try-it-yourself step of Cram → Practice → Review, shared by
// the homepage player and /learn. Deliberately simple: one question at a time, pick a choice,
// see right/wrong + the author's feedback, next — then a summary with ONE forward CTA whose
// label the surface supplies ("Review with Lee →" / "Next set →"). Questions are the set's
// authored CEQ cards served by fetchSetPractice; `questions` can be passed directly (demo).
// Styling is self-contained on the shared navy so it drops into either surface unchanged.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, Loader2, Zap } from "lucide-react";

import { fetchSetPractice, type PracticeQuestion } from "@/lib/student.functions";

const C = {
  text: "#E8ECF5",
  muted: "#93A0B4",
  yellow: "#FCA311",
  green: "#3BF5A0",
  red: "#FF5C6E",
  border: "rgba(148,163,190,0.16)",
  panel: "rgba(9,14,26,0.6)",
};

export function PracticeStage({ setId, questions: override, onDone, doneLabel }: {
  setId: string;
  /** Bypass the server (demo mode) — the caller supplies the questions. */
  questions?: PracticeQuestion[];
  /** The forward CTA at the end — the SURFACE decides where practice leads. */
  onDone: () => void;
  doneLabel: string;
}) {
  const q = useQuery({
    queryKey: ["set-practice", setId],
    queryFn: () => fetchSetPractice({ data: { setId } }),
    enabled: !override,
    staleTime: 300_000,
    networkMode: "always",
  });
  const questions = useMemo<PracticeQuestion[]>(() => {
    if (override) return override;
    return q.data?.status === "ok" ? q.data.questions : [];
  }, [override, q.data]);

  const [idx, setIdx] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const cur = questions[idx];
  const finished = questions.length > 0 && idx >= questions.length;

  const pick = (choiceId: string) => {
    if (pickedId || !cur) return; // one attempt per question — feedback, then move on
    setPickedId(choiceId);
    if (cur.choices.find((c) => c.id === choiceId)?.correct) setRight((n) => n + 1);
  };
  const advance = () => { setPickedId(null); setIdx((i) => i + 1); };

  // ---- non-question states, each with a way FORWARD (practice must never dead-end) --------
  if (!override && q.isLoading) {
    return <div className="grid h-full w-full place-items-center gap-2 text-[12px]" style={{ color: C.muted }}><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading practice…</span></div>;
  }
  const blockedMsg =
    !override && q.isError ? "Couldn't load the practice questions — check your connection." :
    !override && q.data?.status === "locked" ? "Practice for this set is part of the paid exam." :
    !override && (q.data?.status === "empty" || q.data?.status === "not_found") ? "No practice questions in this set yet." :
    questions.length === 0 ? "No practice questions in this set yet." : null;
  if (blockedMsg) {
    return (
      <div className="grid h-full w-full place-items-center p-6 text-center">
        <div>
          <p className="text-[12.5px] font-semibold" style={{ color: C.muted }}>{blockedMsg}</p>
          {!override && q.isError && <button className="mt-2 rounded-lg px-3 py-1.5 text-[11.5px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322" }} onClick={() => void q.refetch()}>Retry</button>}
          <button className="mt-3 block w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322" }} onClick={onDone}>{doneLabel}</button>
        </div>
      </div>
    );
  }

  // ---- summary → the ONE forward CTA -------------------------------------------------------
  if (finished) {
    return (
      <div className="grid h-full w-full place-items-center p-6 text-center">
        <div className="w-full max-w-sm">
          <Zap className="mx-auto h-6 w-6" style={{ color: C.yellow }} />
          <p className="mt-2 text-[16px] font-black" style={{ color: C.text }}>{right} of {questions.length} right</p>
          <p className="mt-1 text-[12px]" style={{ color: C.muted }}>{right === questions.length ? "Clean sweep — keep the streak going." : "The ones you missed are exactly what the review is for."}</p>
          <button className="mt-4 w-full rounded-xl px-4 py-2.5 text-[13px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322" }} onClick={onDone}>{doneLabel}</button>
        </div>
      </div>
    );
  }
  if (!cur) return null;

  // ---- one question ------------------------------------------------------------------------
  const picked = pickedId ? cur.choices.find((c) => c.id === pickedId) ?? null : null;
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto p-4 sm:p-5">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: C.yellow }}>Practice</span>
        <span className="text-[10.5px] font-bold tabular-nums" style={{ color: C.muted }}>Q {idx + 1} / {questions.length}</span>
        {cur.shorthand && <span className="min-w-0 truncate text-[10.5px]" style={{ color: C.muted }}>{cur.shorthand}</span>}
      </div>
      <p className="text-[13.5px] font-semibold leading-relaxed" style={{ color: C.text }}>{cur.prompt}</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {cur.choices.map((c) => {
          const isPicked = pickedId === c.id;
          const showRight = !!pickedId && c.correct;
          const showWrong = isPicked && !c.correct;
          return (
            <button
              key={c.id}
              disabled={!!pickedId}
              onClick={() => pick(c.id)}
              className="flex items-start gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] leading-snug transition-colors disabled:cursor-default"
              style={{
                color: C.text,
                background: showRight ? "rgba(59,245,160,0.12)" : showWrong ? "rgba(255,92,110,0.12)" : C.panel,
                border: `1px solid ${showRight ? "rgba(59,245,160,0.5)" : showWrong ? "rgba(255,92,110,0.5)" : C.border}`,
              }}
            >
              {showRight ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.green }} /> : showWrong ? <CircleX className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.red }} /> : <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full" style={{ border: `1.5px solid ${C.border}` }} />}
              <span className="min-w-0">{c.text}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="mt-3">
          {(picked.feedback || !picked.correct) && (
            <p className="rounded-xl px-3 py-2 text-[12px] leading-relaxed" style={{ color: C.muted, border: `1px dashed ${C.border}` }}>
              {picked.feedback ?? "Not this one — look at the highlighted answer and read its wording again."}
            </p>
          )}
          <button className="mt-2.5 w-full rounded-xl px-4 py-2.5 text-[12.5px] font-black uppercase tracking-wide" style={{ background: C.yellow, color: "#0B1322" }} onClick={advance}>
            {idx + 1 < questions.length ? "Next question →" : "Finish practice →"}
          </button>
        </div>
      )}
    </div>
  );
}
