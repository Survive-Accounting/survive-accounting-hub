// Nested chapter drawer — progressive disclosure of everything known about one
// chapter. Empty sections are OMITTED (never rows of "Not available"). GPA is
// context only; 990 people are LATEST 990-REPORTED context, never current roles
// and never outreach recipients.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Instagram, Loader2, Mail } from "lucide-react";
import { growthChapterDetail } from "@/lib/growth-dashboard.functions";
import { Drawer, Pill, Section } from "@/components/growth/shared";

const money = (n: number | null): string => (n == null ? "—" : `$${n.toLocaleString()}`);
const ENTITY_LABEL: Record<string, string> = {
  HOUSE_CORPORATION: "House Corporation",
  PROPERTY_HOLDING_ENTITY: "Property Holding",
  ALUMNI_CORPORATION: "Alumni Corporation",
  EDUCATIONAL_FOUNDATION: "Educational Foundation",
  SCHOLARSHIP_FOUNDATION: "Scholarship Foundation",
  LOCAL_CHAPTER_ENTITY: "Chapter Entity",
};

export function ChapterDrawer({
  chapterId,
  campusName,
  onClose,
}: {
  chapterId: string;
  campusName: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["growth-chapter", chapterId],
    queryFn: () => growthChapterDetail({ data: { chapterId } }),
  });
  const c = q.data;
  return (
    <Drawer
      open
      onClose={onClose}
      title={c ? c.name : "Chapter"}
      subtitle={
        c ? `${campusName}${c.council ? ` · ${String(c.council).toUpperCase()}` : ""}` : undefined
      }
      width="max-w-lg"
    >
      {q.isLoading && (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      )}
      {c && (
        <div className="space-y-4 p-4">
          {c.survive && (
            <Section title="Survive">
              <div className="flex gap-2 text-xs">
                {c.survive.claimed && <Pill status="active">Chapter claimed</Pill>}
                {c.survive.accessRequests > 0 && (
                  <span>
                    {c.survive.accessRequests} access request
                    {c.survive.accessRequests > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </Section>
          )}

          {c.academics && (c.academics.members != null || c.academics.gpa != null) && (
            <Section title="Chapter">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {c.academics.members != null && <KV k="Members" v={String(c.academics.members)} />}
                {c.academics.membersRecentAvg != null && (
                  <KV k="Recent average" v={String(Math.round(c.academics.membersRecentAvg))} />
                )}
                {c.academics.memberTrend != null && c.academics.memberTrend !== 0 && (
                  <KV
                    k="Membership trend"
                    v={`${c.academics.memberTrend > 0 ? "+" : ""}${c.academics.memberTrend}`}
                  />
                )}
              </div>
              {c.academics.gpa != null && (
                <div className="mt-2 rounded-md bg-muted/60 p-2 text-xs">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Academic context
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <KV k="Latest GPA" v={c.academics.gpa.toFixed(2)} />
                    {c.academics.diffFromCouncil != null && (
                      <KV
                        k="vs council avg"
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
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
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
                        source
                        <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </Section>
          )}

          {c.contacts.length > 0 && (
            <Section title="Contacts">
              <div className="space-y-1">
                {c.contacts.map((ct) => (
                  <div key={ct.qcId} className="flex items-center gap-2 text-[11px]">
                    {ct.email ? (
                      <Mail className="size-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <Instagram className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {ct.email ?? ct.instagram}
                      {ct.name && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {ct.name}
                          {ct.role ? ` (${ct.role})` : ""}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold">
                      {ct.class}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {c.legal.kind === "chapter" && c.legal.entities.length > 0 && (
            <Section title="990 context">
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
                      {ENTITY_LABEL[c.legal.stakeholder.entityType] ??
                        c.legal.stakeholder.entityType}
                    </div>
                    <div className="mt-0.5 text-[10px] font-medium text-amber-600">
                      990 CONTEXT · LATEST 990-REPORTED · TY{c.legal.stakeholder.taxYear}
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Context / escalation reserve only — 990 people are never first-touch outreach
                  recipients. Financials are entity-level (house corp / foundation), not chapter
                  spending budget.
                </p>
              </div>
            </Section>
          )}
          {c.legal.kind === "national_only" && (
            <div className="rounded-md border border-border p-2 text-[11px] text-muted-foreground">
              National organization on file; no chapter-specific legal entity found.
            </div>
          )}

          {c.history.length > 0 && (
            <Section title="Outreach timeline">
              <div className="space-y-1">
                {c.history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 shrink-0 text-muted-foreground">
                      {new Date(h.at).toISOString().slice(5, 10)}
                    </span>
                    <span>{h.label}</span>
                    {h.note && <span className="truncate text-muted-foreground">· {h.note}</span>}
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

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
