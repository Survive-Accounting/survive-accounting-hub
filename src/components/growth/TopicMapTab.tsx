// TOPIC MAP tab — Lee's course-readiness workflow.
// Shows the currently-resolved map (Starter or Campus), the evidence-backed
// SUGGESTED campus map (real textbook chapter titles only), quick checkbox
// editing against the exact Survive Units, professor variations, and the
// explicit Approve / Keep Starter actions (transactional server-side).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  growthApproveMap,
  growthKeepStarter,
  growthTopicMapState,
  type SuggestedExam,
  type TopicMapState,
  type TopicSet,
} from "@/lib/growth-topicmap.functions";
import { Pill, Section } from "@/components/growth/shared";
import { Chip, Hint } from "@/components/growth/v2";
import { HINTS } from "@/components/growth/hints";
import { cn } from "@/lib/utils";

export function TopicMapTab({ campusId }: { campusId: string }) {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ["growth-topicmap", campusId],
    queryFn: () => growthTopicMapState({ data: { campusId } }),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["growth-topicmap", campusId] });
    qc.invalidateQueries({ queryKey: ["growth-campus-detail", campusId] });
  };
  if (state.isLoading)
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading map…
      </div>
    );
  const s = state.data;
  if (!s) return <div className="p-4 text-sm text-muted-foreground">Map unavailable.</div>;
  return <TopicMapBody s={s} campusId={campusId} onChanged={invalidate} />;
}

function TopicMapBody({
  s,
  campusId,
  onChanged,
}: {
  s: TopicMapState;
  campusId: string;
  onChanged: () => void;
}) {
  const unitName = useMemo(() => new Map(s.units.map((u) => [u.id, u.name])), [s.units]);
  const [editing, setEditing] = useState(false);
  // editable proposal: exam label -> selected topic ids (seeded from suggestion / starter)
  const [draft, setDraft] = useState<{ name: string; topicIds: string[] }[] | null>(null);

  const startDraft = () => {
    const source = s.suggested.length
      ? s.suggested.map((e) => ({ name: e.label, topicIds: [...e.suggestedTopicIds] }))
      : s.starterExams.map((e) => ({ name: e.name, topicIds: [...e.topicIds] }));
    setDraft(source);
    setEditing(true);
  };

  const approve = useMutation({
    mutationFn: (exams: { name: string; topicIds: string[] }[]) =>
      growthApproveMap({
        data: {
          campusId,
          professorId: null,
          exams: exams.filter((e) => e.topicIds.length > 0),
          textbookId: s.textbook?.id ?? null,
          source: {
            suggested: s.suggested.map((x) => ({
              label: x.label,
              chapters: x.chapters,
              confidence: x.confidence,
            })),
          },
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Campus map approved — live for students at this campus.");
        setEditing(false);
        onChanged();
      } else toast.error(r.error ?? "Approval failed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Approval failed"),
  });
  const revert = useMutation({
    mutationFn: () => growthKeepStarter({ data: { campusId, professorId: null } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Reverted to the Global Starter Map.");
        onChanged();
      } else toast.error(r.error ?? "Revert failed");
    },
  });

  return (
    <div className="space-y-4">
      <Section title="Current map">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <Pill status={s.level === "campus" ? "active" : undefined}>
            {s.level === "campus" ? "CAMPUS MAP" : "GLOBAL STARTER MAP"}
          </Pill>
          {s.mapStatus && <span className="text-muted-foreground">map_meta: {s.mapStatus}</span>}
          {s.level === "campus" && (
            <button
              onClick={() => revert.mutate()}
              disabled={revert.isPending}
              className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
            >
              Revert to Starter
            </button>
          )}
        </div>
        <div className="space-y-2">
          {s.currentExams.map((e) => (
            <div key={e.name} className="rounded-md border border-border p-2">
              <div className="text-xs font-semibold">{e.name}</div>
              <div className="mt-1 space-y-0.5">
                {e.topicIds.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">No topics mapped yet</span>
                )}
                {e.topicIds.map((t) => (
                  <TopicRow key={t} name={unitName.get(t) ?? t} sets={s.setsByUnit?.[t] ?? []} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={s.suggested.length ? "Suggested campus map (from evidence)" : "Campus evidence"}
      >
        {s.suggested.length === 0 && !editing && (
          <div className="text-xs text-muted-foreground">
            No campus-specific exam evidence yet — this campus uses the Global Starter Map, which is
            a solid default. Run ✨ Enrichment (syllabi / docs) to look for campus evidence.
            <div className="mt-2">
              <button
                onClick={startDraft}
                className="rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
              >
                Build a campus map manually
              </button>
            </div>
          </div>
        )}
        {s.textbook && (
          <div className="mb-2 text-xs text-muted-foreground">
            Evidence textbook:{" "}
            <span className="font-medium text-foreground">
              {s.textbook.title}
              {s.textbook.edition ? `, ${s.textbook.edition}` : ""}
            </span>
          </div>
        )}
        {!editing &&
          s.suggested.map((e) => <SuggestedExamCard key={e.label} exam={e} unitName={unitName} />)}
        {!editing && s.suggested.length > 0 && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                approve.mutate(
                  s.suggested.map((e) => ({ name: e.label, topicIds: e.suggestedTopicIds })),
                )
              }
              disabled={
                approve.isPending || s.suggested.every((e) => e.suggestedTopicIds.length === 0)
              }
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              {approve.isPending ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={startDraft}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Edit
            </button>
            <button
              onClick={() => revert.mutate()}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Keep Starter
            </button>
          </div>
        )}
        {editing && draft && (
          <div className="space-y-3">
            {draft.map((ex, i) => (
              <div key={ex.name} className="rounded-md border border-border p-2">
                <div className="mb-1 text-xs font-semibold">{ex.name}</div>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {s.units.map((u) => {
                    const on = ex.topicIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px]",
                          on ? "bg-primary/10" : "hover:bg-muted",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setDraft((d) =>
                              d!.map((x, j) =>
                                j !== i
                                  ? x
                                  : {
                                      ...x,
                                      topicIds: on
                                        ? x.topicIds.filter((t) => t !== u.id)
                                        : [...x.topicIds, u.id],
                                    },
                              ),
                            )
                          }
                        />
                        <span>{u.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                onClick={() => approve.mutate(draft)}
                disabled={approve.isPending || draft.every((e) => e.topicIds.length === 0)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
              >
                {approve.isPending ? "Approving…" : "Approve edited map"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Professor variations">
        {s.professors.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No Intro-1 professor evidence for this campus yet.
          </div>
        )}
        <div className="space-y-1">
          {s.professors.map((p) => (
            <div
              key={p.id ?? p.name}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {p.evidenceState?.replace("_INTRO1", "") ?? ""}
              </span>
              <Pill status={p.mapState === "professor" ? "active" : undefined}>
                {p.mapState === "professor"
                  ? "Verified"
                  : p.mapState === "proposed"
                    ? "Proposed"
                    : p.mapState === "campus"
                      ? "Campus map"
                      : "Starter"}
              </Pill>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Professors inherit the campus map (or Starter) automatically — professor-specific maps are
          a refinement, approved from a professor's own syllabus evidence in the professor drawer.
        </p>
      </Section>
    </div>
  );
}

function SuggestedExamCard({
  exam,
  unitName,
}: {
  exam: SuggestedExam;
  unitName: Map<string, string>;
}) {
  return (
    <div className="mb-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{exam.label}</span>
        <span className="text-[11px] text-muted-foreground">
          Textbook Ch {exam.chapters.join(", ")}
        </span>
        <Pill status={exam.confidence === "High" ? "active" : undefined}>
          {exam.confidence.toUpperCase()}
        </Pill>
      </div>
      {exam.chapterTitles.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          {exam.chapterTitles.map((c) => (
            <li key={c.number}>
              Chapter {c.number} — {c.title}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Mapped Survive topics:
        </span>
        {exam.suggestedTopicIds.length === 0 && (
          <span className="text-[11px] text-muted-foreground">none prefilled — use Edit</span>
        )}
        {exam.suggestedTopicIds.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
          >
            <Check className="size-3" />
            {unitName.get(t) ?? t}
          </span>
        ))}
      </div>
      {exam.sources.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          Sources:
          {exam.sources.map((src, i) =>
            src.url ? (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                {src.type ?? "doc"}
                <ExternalLink className="size-2.5" />
              </a>
            ) : (
              <span key={i}>{src.type ?? "doc"}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** A topic on the map, expandable to the SETS a student would actually receive.
 *  Mapping decisions get made against real content this way, not against a topic name. */
function TopicRow({ name, sets }: { name: string; sets: TopicSet[] }) {
  const [open, setOpen] = useState(false);
  const questions = sets.reduce((n, s) => n + s.questions, 0);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted/60"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90 text-primary",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {sets.length > 0 ? (
          <Hint text={HINTS.topicSets}>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {sets.length} set{sets.length === 1 ? "" : "s"} · {questions} Q
            </span>
          </Hint>
        ) : (
          <Hint text="No sets are built for this topic yet — a student mapped to it would see nothing here.">
            <span className="shrink-0 text-[10px] text-amber-400">no content</span>
          </Hint>
        )}
      </button>
      {open && sets.length > 0 && (
        <div className="ml-4 space-y-0.5 border-l border-border pl-2">
          {sets.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-[10px]">
              <span className="min-w-0 flex-1 truncate">{s.shortLabel || s.name}</span>
              {s.questions > 0 && (
                <span className="shrink-0 text-muted-foreground">{s.questions} Q</span>
              )}
              {s.hasCram && <Chip tone="info">cram</Chip>}
              {s.hasReview && <Chip tone="neutral">review</Chip>}
              {s.access === "paid" && <Chip tone="warn">paid</Chip>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
