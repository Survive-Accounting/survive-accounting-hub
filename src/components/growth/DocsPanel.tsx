// DOCS PANEL — read the source, not just the summary.
//
// Topic mapping is a judgement call, and the AI's proposal is only worth as much as the
// document behind it. So every document we hold for a campus is listed here with its type,
// term, professor and the evidence extracted from it — and previews inline where the host
// allows it. Student submissions are called out separately because a syllabus from someone
// actually in the class beats anything the crawler found.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, GraduationCap, Loader2 } from "lucide-react";
import { growthCampusDocs, type CampusDoc } from "@/lib/growth-docs.functions";
import { Chip, Hint, when } from "@/components/growth/v2";
import { cn } from "@/lib/utils";

const TYPE_TONE: Record<string, "neutral" | "good" | "warn" | "info"> = {
  syllabus: "good",
  schedule: "info",
  "study guide": "neutral",
  exam: "warn",
};

export function DocsPanel({ campusId }: { campusId: string }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [preview, setPreview] = useState<CampusDoc | null>(null);
  const q = useQuery({
    queryKey: ["growth-docs", campusId],
    queryFn: () => growthCampusDocs({ data: { campusId } }),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading documents…
      </div>
    );
  }
  const data = q.data;
  if (!data || data.docs.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        No documents for this campus yet. Run ✨ Enrichment → Syllabi / course docs to look for
        public ones.
      </p>
    );
  }

  const types = Object.entries(data.counts.byType).sort((a, b) => b[1] - a[1]);
  const shown = filter
    ? data.docs.filter((d) =>
        filter === "submitted" ? d.origin === "submitted" : d.docType === filter,
      )
    : data.docs;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chipish active={filter == null} onClick={() => setFilter(null)}>
          All {data.counts.total}
        </Chipish>
        {data.counts.submitted > 0 && (
          <Hint text="Syllabi uploaded by students in the class — the most reliable source we can get.">
            <Chipish
              active={filter === "submitted"}
              onClick={() => setFilter(filter === "submitted" ? null : "submitted")}
            >
              Student-submitted {data.counts.submitted}
            </Chipish>
          </Hint>
        )}
        {types.map(([t, n]) => (
          <Chipish key={t} active={filter === t} onClick={() => setFilter(filter === t ? null : t)}>
            {t} {n}
          </Chipish>
        ))}
      </div>

      <div className="max-h-80 divide-y divide-border/60 overflow-y-auto rounded-md border border-border">
        {shown.map((d) => (
          <button
            key={d.id}
            onClick={() => setPreview(preview?.id === d.id ? null : d)}
            className={cn(
              "flex w-full items-start gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-muted/60",
              preview?.id === d.id && "bg-muted/60",
            )}
          >
            {d.origin === "submitted" ? (
              <GraduationCap className="mt-0.5 size-3 shrink-0 text-emerald-400" />
            ) : (
              <FileText className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{d.title}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {[d.professor, d.term, d.domain].filter(Boolean).join(" · ") || "no further detail"}
              </span>
              {d.evidence.length > 0 && (
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {d.evidence.slice(0, 4).map((e, i) => (
                    <span
                      key={i}
                      className="rounded bg-background px-1 text-[9px] text-muted-foreground"
                    >
                      {e.label ? `${e.label}: ` : ""}
                      {e.detail ?? e.type.replace(/_/g, " ")}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Chip tone={TYPE_TONE[d.docType] ?? "neutral"}>{d.docType}</Chip>
              <span className="text-[9px] text-muted-foreground">{when(d.firstSeen)}</span>
            </span>
          </button>
        ))}
      </div>

      {preview && <Preview doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Preview({ doc, onClose }: { doc: CampusDoc; onClose: () => void }) {
  // Many university hosts refuse to be framed (X-Frame-Options), and we cannot detect that
  // from here — so the link out is always offered, and the frame is a bonus when it works.
  const embeddable = !!doc.url && /\.(pdf|txt)$|docs\.google|drive\.google/i.test(doc.url);
  return (
    <div className="rounded-md border border-primary/40 bg-muted/30 p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{doc.title}</span>
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
          >
            Open <ExternalLink className="size-2.5" />
          </a>
        )}
        <button
          onClick={onClose}
          className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      {embeddable ? (
        <iframe
          src={doc.url ?? ""}
          title={doc.title}
          className="h-96 w-full rounded border border-border bg-white"
        />
      ) : (
        <p className="text-[10px] text-muted-foreground">
          {doc.url
            ? "This host usually blocks embedding — open it in a new tab to read it."
            : "No file link stored for this document."}
        </p>
      )}
      {doc.evidence.length > 0 && (
        <div className="mt-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            What we pulled out of it
          </div>
          <div className="mt-0.5 space-y-0.5">
            {doc.evidence.map((e, i) => (
              <div key={i} className="text-[10px]">
                {e.label ? `${e.label} — ` : ""}
                {e.detail ?? e.type.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chipish({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] capitalize",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
