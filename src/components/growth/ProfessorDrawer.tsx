// Nested professor drawer — evidence-first: Intro-1 state, documents, textbook
// and exam evidence, resolved map level. Only shows what exists (no placeholder
// rows); the Students signal deliberately absent (no student→professor table yet).
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { growthProfessorDetail } from "@/lib/growth-dashboard.functions";
import { Drawer, Pill, Section } from "@/components/growth/shared";

export function ProfessorDrawer({
  campusId,
  professorId,
  name,
  onClose,
}: {
  campusId: string;
  professorId: string | null;
  name: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["growth-professor", campusId, professorId, name],
    queryFn: () => growthProfessorDetail({ data: { campusId, professorId, name } }),
  });
  const p = q.data;
  return (
    <Drawer open onClose={onClose} title={name} subtitle={p?.title ?? undefined} width="max-w-lg">
      {q.isLoading && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}
      {p && (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {p.evidence[0] && (
              <Pill
                status={
                  p.evidence.some((e) => e.state === "CONFIRMED_INTRO1") ? "active" : undefined
                }
              >
                {p.evidence.some((e) => e.state === "CONFIRMED_INTRO1")
                  ? "CONFIRMED INTRO-1"
                  : p.evidence.some((e) => e.state === "LIKELY_INTRO1")
                    ? "LIKELY INTRO-1"
                    : "POSSIBLE INTRO-1"}
              </Pill>
            )}
            <Pill>
              {p.mapState === "professor"
                ? "Professor map"
                : p.mapState === "campus"
                  ? "Campus map"
                  : "Starter map"}
            </Pill>
            {p.department && <span className="text-muted-foreground">{p.department}</span>}
          </div>
          {p.email && (
            <div className="text-xs">
              Email: <span className="font-medium">{p.email}</span>
            </div>
          )}
          {p.rmp?.rating != null && (
            <div className="text-xs text-muted-foreground">
              RMP {p.rmp.rating} ({p.rmp.count} ratings){" "}
              {p.rmp.url && (
                <a className="underline" href={p.rmp.url} target="_blank" rel="noreferrer">
                  profile
                </a>
              )}
            </div>
          )}
          {p.evidence.length > 0 && (
            <Section title="Intro-1 teaching evidence">
              <div className="space-y-1">
                {p.evidence.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="font-medium">{e.state.replace("_INTRO1", "")}</span>
                    {e.confidence && <span className="text-muted-foreground">{e.confidence}</span>}
                    {(e.term || e.year) && (
                      <span className="text-muted-foreground">
                        {[e.term, e.year].filter(Boolean).join(" ")}
                      </span>
                    )}
                    {e.sourceUrl && (
                      <a
                        href={e.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 underline"
                      >
                        source
                        <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Terms shown are mostly historical — treat as "has taught it", not "teaching it now".
              </p>
            </Section>
          )}
          {p.documents.length > 0 && (
            <Section title={`Documents (${p.documents.length})`}>
              <div className="space-y-1">
                {p.documents.map((d, i) => (
                  <div key={i} className="truncate text-[11px]">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="underline">
                        {d.title || d.type || d.url}
                      </a>
                    ) : (
                      (d.title ?? d.type ?? "document")
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}
          {p.textbookEvidence.length > 0 && (
            <Section title="Textbook evidence">
              <div className="space-y-0.5 text-[11px]">
                {p.textbookEvidence.map((t, i) => (
                  <div key={i}>{t}</div>
                ))}
              </div>
            </Section>
          )}
          {p.examEvidence.length > 0 && (
            <Section title="Exam-range evidence">
              <div className="space-y-0.5 text-[11px]">
                {p.examEvidence.map((e, i) => (
                  <div key={i}>
                    {e.label ?? "exam"} — Ch {e.chapters.join(", ")}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </Drawer>
  );
}
