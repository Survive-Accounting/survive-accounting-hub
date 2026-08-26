// CAMPUS PANEL — everything about one campus, opened IN PLACE beneath its row.
//
// V2 replaced the side drawer with this: the row you clicked stays where it was and the
// detail unfolds under it, so the list never loses its place and nested things (a chapter,
// a professor) can open inside their own parent rather than covering it.
//
// Three sections, same as V1 — Overview / Outreach / Topic Map — but as accordions rather
// than tabs, because with disclosure the whole campus is one scrollable column.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import {
  growthCampusDetail,
  growthSetPin,
  type CampusDetail,
  type ChecklistItem,
} from "@/lib/growth-dashboard.functions";
import { Accordion, Chip, Hint, InfoDot, Metric, MiniBolt, Panel } from "@/components/growth/v2";
import { EnrichmentPanel } from "@/components/growth/EnrichmentPanel";
import { OutreachTab } from "@/components/growth/OutreachTab";
import { TopicMapTab } from "@/components/growth/TopicMapTab";
import { ProfessorPanel } from "@/components/growth/ProfessorPanel";
import { ChapterPanel } from "@/components/growth/ChapterPanel";
import { DocsPanel } from "@/components/growth/DocsPanel";
import { ActivityFeed } from "@/components/growth/ActivityFeed";
import { HINTS } from "@/components/growth/hints";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { useLayoutMode } from "@/components/growth/layout-mode";
import { cn } from "@/lib/utils";

type Section = "overview" | "outreach" | "map" | "docs" | "activity";

export function CampusPanel({ campusId, pinned }: { campusId: string; pinned: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Section | null>("overview");
  const q = useQuery({
    queryKey: ["growth-campus-detail", campusId],
    queryFn: () => growthCampusDetail({ data: { campusId } }),
  });
  const pin = useMutation({
    mutationFn: (v: boolean) => growthSetPin({ data: { campusId, pinned: v } }),
    onSuccess: (_r, v) => {
      toast.success(v ? "Pinned to the top" : "Unpinned");
      qc.invalidateQueries({ queryKey: ["growth-campus-list"] });
    },
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading campus…
      </div>
    );
  }
  const d = q.data;
  if (!d)
    return <div className="py-4 text-sm text-muted-foreground">Couldn't load this campus.</div>;

  const readiness = d.priority?.components
    ? Number((d.priority.components as any).readiness ?? 0)
    : null;
  const toggle = (s: Section) => setOpen((cur) => (cur === s ? null : s));

  return (
    <div className="space-y-3">
      {/* header — identity, readiness, the two campus-level actions */}
      <div className="flex flex-wrap items-center gap-3">
        <MiniBolt primary={d.colorPrimary} secondary={d.colorSecondary} size={34} title={d.name} />
        <div className="min-w-0">
          <div className="sa-admin-display truncate text-sm font-semibold uppercase tracking-wide">
            {d.name}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {[d.courseCode, d.courseTitle ?? "Intro Financial Accounting"]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {readiness != null && (
          <Hint text={HINTS.courseReadiness}>
            <div className="rounded-md border border-border bg-card px-2 py-1 text-center">
              <div className="sa-admin-display text-sm font-semibold">{Math.round(readiness)}%</div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Course ready
              </div>
            </div>
          </Hint>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Hint text={pinned ? "Unpin — return to the computed order." : HINTS.pin}>
            <button
              onClick={() => pin.mutate(!pinned)}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={pinned ? "Unpin campus" : "Pin campus"}
            >
              {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </button>
          </Hint>
          <EnrichmentPanel campusId={campusId} />
        </div>
      </div>

      {d.priority && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Hint text={HINTS.rank}>
            <span className="rounded bg-muted px-1.5 py-0.5 font-medium">#{d.priority.rank}</span>
          </Hint>
          {d.priority.why.map((w) => (
            <Hint key={w} text={HINTS.why[w] ?? "Why this campus ranks where it does."}>
              <span className="rounded bg-muted px-1.5 py-0.5">{w}</span>
            </Hint>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <Accordion
          open={open === "overview"}
          onToggle={() => toggle("overview")}
          header={<SectionHead label="Overview" note="Launch state, professors, chapters" />}
        >
          <OverviewBody d={d} campusId={campusId} />
        </Accordion>
        <Accordion
          open={open === "outreach"}
          onToggle={() => toggle("outreach")}
          header={<SectionHead label="Outreach" note="Contacts, queue, history" />}
        >
          <OutreachTab campusId={campusId} campusName={d.name} />
        </Accordion>
        <Accordion
          open={open === "map"}
          onToggle={() => toggle("map")}
          header={<SectionHead label="Topic Map" note="Starter vs campus map, approvals" />}
        >
          <TopicMapTab campusId={campusId} />
        </Accordion>
        <Accordion
          open={open === "docs"}
          onToggle={() => toggle("docs")}
          header={<SectionHead label="Documents" note="Scraped + student-submitted" />}
        >
          <DocsPanel campusId={campusId} />
        </Accordion>
        <Accordion
          open={open === "activity"}
          onToggle={() => toggle("activity")}
          header={<SectionHead label="Activity" note="Everything that happened here" />}
        >
          <ActivityFeed campusId={campusId} compact />
        </Accordion>
      </div>
    </div>
  );
}

function SectionHead({ label, note }: { label: string; note: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="sa-admin-display text-xs font-semibold uppercase tracking-wide">
        {label}
      </span>
      <span className="truncate text-[10px] text-muted-foreground">{note}</span>
    </span>
  );
}

/* ── OVERVIEW ───────────────────────────────────────────────────────────────────────────── */

function OverviewBody({ d, campusId }: { d: CampusDetail; campusId: string }) {
  const [openProf, setOpenProf] = useState<string | null>(null);
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const [log, setLog] = useState<{ title: string; kinds: string[] } | null>(null);
  const [layout] = useLayoutMode();
  const r = d.results;

  return (
    <div className="space-y-4">
      {/* first-party numbers — each one opens its own log */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Questions answered"
          value={r.questionsAnswered || null}
          hint={HINTS.questionsAnswered}
          onClick={
            r.questionsAnswered
              ? () => setLog({ title: "Questions answered", kinds: ["practice"] })
              : undefined
          }
        />
        <Metric
          label="Identified users"
          value={r.identified || null}
          hint={HINTS.identified}
          onClick={
            r.identified
              ? () => setLog({ title: "Identified students", kinds: ["practice", "seat"] })
              : undefined
          }
        />
        <Metric
          label="Waitlist"
          value={r.waitlist || null}
          hint={HINTS.waitlist}
          onClick={
            r.waitlist
              ? () => setLog({ title: "Waitlist signups", kinds: ["waitlist"] })
              : undefined
          }
        />
        <Metric
          label="Paid students"
          value={r.paid || null}
          hint={HINTS.paid}
          tone={r.paid ? "good" : "default"}
        />
      </div>

      {log && (
        <div className="rounded-md border border-primary/40 bg-muted/40 p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold">{log.title}</span>
            <button
              onClick={() => setLog(null)}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <ActivityFeed campusId={campusId} kinds={log.kinds} compact />
        </div>
      )}

      {/* exam timing + readiness ladder */}
      <div className="flex flex-wrap items-center gap-2">
        {d.examTiming.isCurrentTerm && d.examTiming.date ? (
          <Chip tone="info" hint="Current-term evidence — safe to plan against.">
            Exam 1 · {d.examTiming.date}
          </Chip>
        ) : (
          <Hint text={HINTS.estimatedWindow}>
            <span className="text-[11px] text-muted-foreground">
              Estimated Exam 1 window · term week 5–6 <Chip tone="neutral">estimated</Chip>
            </span>
          </Hint>
        )}
        {d.exams.map((e) => (
          <Hint key={e.name} text={HINTS.examStatus(e.topics, e.coveredTopics, e.level)}>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px]">
              <span className="font-medium">{e.name}</span>
              <Chip
                tone={e.status === "READY" ? "good" : e.status === "PARTIAL" ? "warn" : "neutral"}
              >
                {e.status.replace("_", " ")}
              </Chip>
            </span>
          </Hint>
        ))}
      </div>

      {(d.market || d.competitive) && (
        <Panel title="Market" hint={HINTS.market}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
            {d.market?.businessBachelors != null && (
              <KV
                k="Business grads / yr"
                v={d.market.businessBachelors.toLocaleString()}
                hint={HINTS.businessGrads}
              />
            )}
            {d.market?.estimatedIntro1 != null && (
              <KV
                k="Est. Intro-1 seats / yr"
                v={`~${d.market.estimatedIntro1.toLocaleString()}`}
                hint={HINTS.estIntro1}
              />
            )}
            {d.market?.undergradEnrollment != null && (
              <KV k="Undergrads" v={d.market.undergradEnrollment.toLocaleString()} />
            )}
            {d.market?.growthLabel && (
              <KV
                k="Growth"
                v={d.market.growthLabel.replace(/_/g, " ")}
                hint={HINTS.growthLabel(d.market.growthLabel)}
              />
            )}
            {d.competitive?.paidMarketStatus && (
              <KV
                k="Paid support market"
                v={d.competitive.paidMarketStatus}
                hint={HINTS.paidMarket}
              />
            )}
            {d.competitive?.courseSpecificCompetitors != null &&
              d.competitive.courseSpecificCompetitors > 0 && (
                <KV
                  k="Course-specific competitors"
                  v={String(d.competitive.courseSpecificCompetitors)}
                  hint={HINTS.courseSpecific}
                />
              )}
            {d.competitive?.marketStatus && (
              <KV
                k="Market"
                v={d.competitive.marketStatus.replace(/_/g, " ")}
                hint={HINTS.marketStatus}
              />
            )}
          </div>
          {d.competitive?.strongestCompetitor && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              Strongest competitor: {d.competitive.strongestCompetitor}
              {d.competitive.priceContext && <> · {d.competitive.priceContext}</>}
            </div>
          )}
        </Panel>
      )}

      <Panel
        title={`Launch checklist · ${d.checklist.filter((c) => c.done).length}/${d.checklist.length}`}
        hint={HINTS.checklist}
      >
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {d.checklist.map((c) => (
            <ChecklistRow key={c.key} item={c} />
          ))}
        </div>
      </Panel>

      <Panel title={`Professors · ${d.professors.length}`} hint={HINTS.professors}>
        {d.professors.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No Intro-1 professor evidence yet — run ✨ Enrichment to look for it.
          </p>
        )}
        <div className="rounded-md border border-border">
          {d.professors.map((p) => (
            <NestedRow
              key={p.id ?? p.name}
              layout={layout}
              open={openProf === (p.id ?? p.name)}
              onToggle={() =>
                setOpenProf((cur) => (cur === (p.id ?? p.name) ? null : (p.id ?? p.name)))
              }
              onClose={() => setOpenProf(null)}
              sheetTitle={p.name}
              header={
                <span className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <Chip
                    tone={
                      p.evidenceState === "CONFIRMED_INTRO1"
                        ? "good"
                        : p.evidenceState === "LIKELY_INTRO1"
                          ? "info"
                          : "neutral"
                    }
                    hint={HINTS.evidenceState(p.evidenceState)}
                  >
                    {(p.evidenceState ?? "").replace("_INTRO1", "") || "no evidence"}
                  </Chip>
                  {p.docCount > 0 && (
                    <Hint text="Public documents that name this professor.">
                      <span className="text-[10px] text-muted-foreground">
                        {p.docCount} doc{p.docCount > 1 ? "s" : ""}
                      </span>
                    </Hint>
                  )}
                </span>
              }
            >
              <ProfessorPanel campusId={campusId} professorId={p.id} name={p.name} />
            </NestedRow>
          ))}
        </div>
      </Panel>

      <Panel title={`Organizations · ${d.chapters.length}`} hint={HINTS.organizations}>
        {d.chapters.length === 0 && (
          <p className="text-xs text-muted-foreground">No social Greek chapters on the roster.</p>
        )}
        <div className="rounded-md border border-border">
          {d.chapters.map((c) => (
            <NestedRow
              key={c.id}
              layout={layout}
              open={openChapter === c.id}
              onToggle={() => setOpenChapter((cur) => (cur === c.id ? null : c.id))}
              onClose={() => setOpenChapter(null)}
              sheetTitle={c.name}
              sheetSubtitle={d.name}
              header={
                <span className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  {c.council && (
                    <span className="text-[10px] uppercase text-muted-foreground">{c.council}</span>
                  )}
                  {c.members != null && (
                    <Hint text={HINTS.members}>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {c.members} members
                      </span>
                    </Hint>
                  )}
                  <span className="flex gap-1">
                    {c.hasEmail && (
                      <Chip tone="good" hint="Has an email we can use.">
                        email
                      </Chip>
                    )}
                    {c.hasInstagram && (
                      <Chip tone="info" hint="Instagram handle on file.">
                        IG
                      </Chip>
                    )}
                    {c.has990 && (
                      <Chip tone="neutral" hint={HINTS.has990}>
                        990
                      </Chip>
                    )}
                    {c.claimed && (
                      <Chip tone="good" hint="A member claimed this chapter on Survive.">
                        claimed
                      </Chip>
                    )}
                  </span>
                </span>
              }
            >
              <ChapterPanel chapterId={c.id} campusId={campusId} campusName={d.name} />
            </NestedRow>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full text-[10px]",
          item.done ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground",
        )}
      >
        {item.done ? "✓" : "·"}
      </span>
      <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
      {item.detail && (
        <span className="truncate text-[10px] text-muted-foreground">· {item.detail}</span>
      )}
    </div>
  );
}

function KV({ k, v, hint }: { k: string; v: string; hint?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {k}
        {hint && <InfoDot text={hint} />}
      </div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

export { ExternalLink };

/** A nested row (professor or organization) that honours the layout A/B: an accordion
 *  that opens in place, or a row that stacks a sheet over the campus. Children are only
 *  mounted while open, so a closed row costs nothing. */
function NestedRow({
  layout,
  open,
  onToggle,
  onClose,
  header,
  sheetTitle,
  sheetSubtitle,
  children,
}: {
  layout: "accordion" | "sheet";
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  header: React.ReactNode;
  sheetTitle: string;
  sheetSubtitle?: string;
  children: React.ReactNode;
}) {
  if (layout === "accordion") {
    return (
      <Accordion level={2} open={open} onToggle={onToggle} header={header}>
        {open && children}
      </Accordion>
    );
  }
  return (
    <>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 border-b border-border/60 px-2 py-1.5 text-left last:border-b-0 hover:bg-muted/60"
      >
        {header}
      </button>
      {open && (
        <BottomSheet
          open
          depth={1}
          onBack={onClose}
          onClose={onClose}
          title={<span className="sa-admin-display text-sm font-semibold">{sheetTitle}</span>}
          subtitle={
            sheetSubtitle ? (
              <span className="text-[11px] text-muted-foreground">{sheetSubtitle}</span>
            ) : undefined
          }
        >
          {children}
        </BottomSheet>
      )}
    </>
  );
}
