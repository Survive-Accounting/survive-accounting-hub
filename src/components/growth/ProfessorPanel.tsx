// PROFESSOR PANEL — opens inside the campus, nested under the professor's own row.
// Evidence first. No "Students" column: no student→professor selection table exists yet,
// and inventing one would be worse than the gap.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { growthProfessorDetail } from "@/lib/growth-dashboard.functions";
import { Chip, Hint, Panel } from "@/components/growth/v2";
import { HINTS } from "@/components/growth/hints";

export function ProfessorPanel({
  campusId,
  professorId,
  name,
}: {
  campusId: string;
  professorId: string | null;
  name: string;
}) {
  const q = useQuery({
    queryKey: ["growth-professor", campusId, professorId, name],
    queryFn: () => growthProfessorDetail({ data: { campusId, professorId, name } }),
  });
  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading…
      </div>
    );
  }
  const p = q.data;
  if (!p)
    return <div className="py-2 text-xs text-muted-foreground">Couldn't load this professor.</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {p.title && <span className="text-muted-foreground">{p.title}</span>}
        {p.department && <span className="text-muted-foreground">· {p.department}</span>}
        <Chip
          tone={p.mapState === "professor" ? "good" : "neutral"}
          hint={
            p.mapState === "professor"
              ? "This professor has their own approved topic map."
              : p.mapState === "campus"
                ? "Inherits the approved campus map."
                : "Inherits the Global Starter Map."
          }
        >
          {p.mapState === "professor"
            ? "own map"
            : p.mapState === "campus"
              ? "campus map"
              : "starter map"}
        </Chip>
      </div>

      {p.email && (
        <div className="text-xs">
          <span className="text-muted-foreground">Email: </span>
          <span className="font-medium">{p.email}</span>
        </div>
      )}
      {p.rmp?.rating != null && (
        <Hint text="RateMyProfessors rating. Useful colour, but never used to decide whether they teach Intro-1.">
          <div className="text-[11px] text-muted-foreground">
            RMP {p.rmp.rating} ({p.rmp.count} ratings){" "}
            {p.rmp.url && (
              <a href={p.rmp.url} target="_blank" rel="noreferrer" className="underline">
                profile
              </a>
            )}
          </div>
        </Hint>
      )}

      {p.evidence.length > 0 && (
        <Panel
          title="Intro-1 evidence"
          hint="Documents and pages that tie this person to the intro course."
        >
          <div className="space-y-1">
            {p.evidence.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-[11px]">
                <Chip
                  tone={
                    e.state === "CONFIRMED_INTRO1"
                      ? "good"
                      : e.state === "LIKELY_INTRO1"
                        ? "info"
                        : "neutral"
                  }
                  hint={HINTS.evidenceState(e.state)}
                >
                  {e.state.replace("_INTRO1", "")}
                </Chip>
                {e.confidence && (
                  <span className="text-muted-foreground">{e.confidence} confidence</span>
                )}
                {(e.term || e.year) && (
                  <Hint text="The term this evidence is from. Most of what we scraped is historical — it proves they HAVE taught it, not that they're teaching it now.">
                    <span className="text-muted-foreground">
                      {[e.term, e.year].filter(Boolean).join(" ")}
                    </span>
                  </Hint>
                )}
                {e.sourceUrl && (
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 underline"
                  >
                    source <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {p.documents.length > 0 && (
        <Panel title={`Documents · ${p.documents.length}`}>
          <div className="space-y-0.5">
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
        </Panel>
      )}

      {p.textbookEvidence.length > 0 && (
        <Panel title="Textbook evidence">
          <div className="space-y-0.5 text-[11px]">
            {p.textbookEvidence.map((t, i) => (
              <div key={i}>{t}</div>
            ))}
          </div>
        </Panel>
      )}

      {p.examEvidence.length > 0 && (
        <Panel
          title="Exam-range evidence"
          hint="What chapters this professor's own materials say each exam covers."
        >
          <div className="space-y-0.5 text-[11px]">
            {p.examEvidence.map((e, i) => (
              <div key={i}>
                {e.label ?? "exam"} — Ch {e.chapters.join(", ")}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {p.evidence.length === 0 && p.documents.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No documents yet for this professor. Running ✨ Enrichment → Syllabi / course docs may
          find some.
        </p>
      )}
    </div>
  );
}
