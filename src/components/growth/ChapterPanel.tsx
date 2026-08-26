// CHAPTER PANEL — opens inside the campus, nested under the chapter's own row.
// Progressive disclosure: sections with nothing in them are omitted entirely rather than
// rendered as rows of "Not available". GPA is context, never a ranking. 990 people are
// LATEST-990-REPORTED context, never presented as current officers or as contacts.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Instagram, Loader2, Mail } from "lucide-react";
import { growthChapterDetail } from "@/lib/growth-dashboard.functions";
import { Chip, Hint, Panel } from "@/components/growth/v2";
import { ContactList } from "@/components/growth/ContactList";
import { ActivityFeed } from "@/components/growth/ActivityFeed";
import { HINTS } from "@/components/growth/hints";

const money = (n: number | null): string => (n == null ? "—" : `$${n.toLocaleString()}`);
const ENTITY_LABEL: Record<string, string> = {
  HOUSE_CORPORATION: "House Corporation",
  PROPERTY_HOLDING_ENTITY: "Property Holding",
  ALUMNI_CORPORATION: "Alumni Corporation",
  EDUCATIONAL_FOUNDATION: "Educational Foundation",
  SCHOLARSHIP_FOUNDATION: "Scholarship Foundation",
  LOCAL_CHAPTER_ENTITY: "Chapter Entity",
};

export function ChapterPanel({
  chapterId,
  campusId,
  campusName,
}: {
  chapterId: string;
  campusId: string;
  campusName: string;
}) {
  const q = useQuery({
    queryKey: ["growth-chapter", chapterId],
    queryFn: () => growthChapterDetail({ data: { chapterId } }),
  });
  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading…
      </div>
    );
  }
  const c = q.data;
  if (!c)
    return <div className="py-2 text-xs text-muted-foreground">Couldn't load this chapter.</div>;

  return (
    <div className="space-y-3">
      {c.survive && (
        <Panel title="Survive">
          <div className="flex flex-wrap gap-2 text-xs">
            {c.survive.claimed && <Chip tone="good">chapter claimed</Chip>}
            {c.survive.accessRequests > 0 && (
              <span>
                {c.survive.accessRequests} access request{c.survive.accessRequests > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </Panel>
      )}

      {c.academics && (c.academics.members != null || c.academics.gpa != null) && (
        <Panel title="Chapter" hint={HINTS.members}>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {c.academics.members != null && <KV k="Members" v={String(c.academics.members)} />}
            {c.academics.membersRecentAvg != null && (
              <KV k="Recent average" v={String(Math.round(c.academics.membersRecentAvg))} />
            )}
            {c.academics.memberTrend != null && c.academics.memberTrend !== 0 && (
              <KV
                k="Trend"
                v={`${c.academics.memberTrend > 0 ? "+" : ""}${c.academics.memberTrend}`}
              />
            )}
          </div>
          {c.academics.gpa != null && (
            <div className="mt-2 rounded-md bg-muted/60 p-2 text-xs">
              <Hint text={HINTS.gpa}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Academic context
                </div>
              </Hint>
              <div className="grid grid-cols-2 gap-2">
                <KV k="Latest GPA" v={c.academics.gpa.toFixed(2)} />
                {c.academics.diffFromCouncil != null && (
                  <KV
                    k="vs council average"
                    v={`${c.academics.diffFromCouncil > 0 ? "+" : ""}${c.academics.diffFromCouncil.toFixed(2)}`}
                  />
                )}
              </div>
              {c.academics.labels.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.academics.labels.map((l) => (
                    <span key={l} className="rounded bg-background px-1.5 py-0.5 text-[10px]">
                      {l.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                {c.academics.confidence && <span>confidence: {c.academics.confidence}</span>}
                {(c.academics.term || c.academics.year) && (
                  <span>{[c.academics.term, c.academics.year].filter(Boolean).join(" ")}</span>
                )}
                {c.academics.sourceUrl && (
                  <a
                    className="inline-flex items-center gap-0.5 underline"
                    href={c.academics.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    source <ExternalLink className="size-2.5" />
                  </a>
                )}
              </div>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Contacts" hint={HINTS.addContact}>
        <ContactList
          campusId={campusId}
          entityType="chapter"
          entityId={chapterId}
          entityLabel={`${c.name} · ${campusName}`}
        />
      </Panel>

      {c.legal.kind === "chapter" && c.legal.entities.length > 0 && (
        <Panel title="990 context" hint={HINTS.has990}>
          <div className="space-y-2">
            {c.legal.entities.map((e) => (
              <div key={e.name} className="rounded-md border border-border p-2 text-xs">
                <div className="font-medium">{e.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {ENTITY_LABEL[e.type] ?? e.type}
                  {e.ein ? ` · EIN ${e.ein}` : ""}
                </div>
                {e.filesN990Only ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Files a 990-N e-postcard (no financial detail).
                  </div>
                ) : (
                  e.latestFilingYear != null && (
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      <KV k="Latest filing" v={`TY${e.latestFilingYear}`} />
                      <KV k="Revenue" v={money(e.revenue)} />
                      <KV k="Assets" v={money(e.assets)} />
                    </div>
                  )
                )}
              </div>
            ))}
            {c.legal.stakeholder && (
              <div className="rounded-md bg-muted/60 p-2 text-xs">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Latest 990-reported stakeholder
                </div>
                <div className="mt-0.5 font-medium">{c.legal.stakeholder.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {c.legal.stakeholder.role} ·{" "}
                  {ENTITY_LABEL[c.legal.stakeholder.entityType] ?? c.legal.stakeholder.entityType}
                </div>
                <Hint text="This is the person named on the most recent tax filing. They may no longer hold the role — never write to them as if they're current, and never as a first contact.">
                  <div className="mt-0.5 text-[10px] font-medium text-amber-400">
                    990 CONTEXT · LATEST 990-REPORTED · TY{c.legal.stakeholder.taxYear}
                  </div>
                </Hint>
              </div>
            )}
          </div>
        </Panel>
      )}
      {c.legal.kind === "national_only" && (
        <div className="rounded-md border border-border p-2 text-[11px] text-muted-foreground">
          National organization on file; no chapter-specific legal entity found.
        </div>
      )}

      {c.history.length > 0 && (
        <Panel title="Outreach timeline">
          <ActivityFeed campusId={campusId} entityId={chapterId} compact />
        </Panel>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

export { Mail, Instagram };
