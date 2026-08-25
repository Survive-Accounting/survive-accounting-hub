// CAMPUS DRAWER — the working surface for one campus.
// Header: animated campus bolt + identity + course readiness + ✨ Enrichment.
// Tabs: OVERVIEW (launch picture, checklist, professors, chapters) ·
//       OUTREACH (King's queue flow) · TOPIC MAP (Lee's approval flow).
// Nested drawers open for professors and chapters.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Pin, PinOff } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  growthCampusDetail,
  growthSetPin,
  type CampusDetail,
  type ChecklistItem,
} from "@/lib/growth-dashboard.functions";
import {
  AnimatedCampusBolt,
  ANIMATED_CAMPUS_BOLT_CSS,
  type BoltCampus,
} from "@/components/site/bolt";
import { Drawer, Pill, Section } from "@/components/growth/shared";
import { EnrichmentPanel } from "@/components/growth/EnrichmentPanel";
import { OutreachTab } from "@/components/growth/OutreachTab";
import { TopicMapTab } from "@/components/growth/TopicMapTab";
import { ProfessorDrawer } from "@/components/growth/ProfessorDrawer";
import { ChapterDrawer } from "@/components/growth/ChapterDrawer";
import { cn } from "@/lib/utils";

type Tab = "overview" | "outreach" | "map";

export function CampusDrawer({
  campusId,
  pinned,
  onClose,
}: {
  campusId: string;
  pinned: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [prof, setProf] = useState<{ id: string | null; name: string } | null>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["growth-campus-detail", campusId],
    queryFn: () => growthCampusDetail({ data: { campusId } }),
  });
  const d = q.data;

  const pin = useMutation({
    mutationFn: (v: boolean) => growthSetPin({ data: { campusId, pinned: v } }),
    onSuccess: (_r, v) => {
      toast.success(v ? "Pinned" : "Unpinned");
      qc.invalidateQueries({ queryKey: ["growth-campus-list"] });
    },
  });

  const bolt: BoltCampus | null = useMemo(
    () =>
      d
        ? {
            id: d.slug ?? d.campusId,
            name: d.name,
            code: d.courseCode,
            primary: d.colorPrimary ?? "#1e293b",
            secondary: d.colorSecondary ?? "#facc15",
          }
        : null,
    [d],
  );

  const readiness = d?.priority?.components
    ? Number((d.priority.components as any).readiness ?? 0)
    : null;

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-3xl"
      title={
        <div className="flex items-center gap-3">
          {bolt && (
            <div className="w-16 shrink-0">
              <style>{ANIMATED_CAMPUS_BOLT_CSS}</style>
              <AnimatedCampusBolt campuses={[bolt]} autoplay={false} showLabel={false} />
            </div>
          )}
          <div>
            <div className="text-base font-semibold uppercase tracking-wide">{d?.name ?? "…"}</div>
            <div className="text-xs font-normal text-muted-foreground">
              {[d?.courseCode, d?.courseTitle ?? "Intro Financial Accounting"]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
      }
      subtitle={
        <div className="mt-1 flex items-center gap-3">
          {readiness != null && (
            <span className="text-xs">
              Course readiness <span className="font-semibold">{Math.round(readiness)}%</span>
            </span>
          )}
          {d?.priority && (
            <span className="text-[11px] text-muted-foreground">
              #{d.priority.rank} · {d.priority.why.join(" · ")}
            </span>
          )}
          <button
            onClick={() => pin.mutate(!pinned)}
            title={pinned ? "Unpin" : "Pin to top"}
            className="text-muted-foreground hover:text-foreground"
          >
            {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <div className="ml-auto">
            <EnrichmentPanel campusId={campusId} />
          </div>
        </div>
      }
    >
      <div className="border-b border-border px-4">
        <div className="flex gap-1">
          {(
            [
              ["overview", "Overview"],
              ["outreach", "Outreach"],
              ["map", "Topic Map"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "border-b-2 px-3 py-2 text-xs font-medium",
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        {q.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading campus…
          </div>
        )}
        {d && tab === "overview" && (
          <OverviewTab
            d={d}
            onOpenProfessor={(id, name) => setProf({ id, name })}
            onOpenChapter={(id) => setChapter(id)}
          />
        )}
        {d && tab === "outreach" && <OutreachTab campusId={campusId} campusName={d.name} />}
        {d && tab === "map" && <TopicMapTab campusId={campusId} />}
      </div>
      {prof && d && (
        <ProfessorDrawer
          campusId={campusId}
          professorId={prof.id}
          name={prof.name}
          onClose={() => setProf(null)}
        />
      )}
      {chapter && d && (
        <ChapterDrawer chapterId={chapter} campusName={d.name} onClose={() => setChapter(null)} />
      )}
    </Drawer>
  );
}

function OverviewTab({
  d,
  onOpenProfessor,
  onOpenChapter,
}: {
  d: CampusDetail;
  onOpenProfessor: (id: string | null, name: string) => void;
  onOpenChapter: (id: string) => void;
}) {
  const r = d.results;
  const metrics: [string, string | null][] = [
    ["Page views", r.pageViews != null ? String(r.pageViews) : null],
    ["Identified users", r.identified > 0 ? String(r.identified) : null],
    ["Paid users", r.paid > 0 ? String(r.paid) : null],
    ["Questions answered", r.questionsAnswered > 0 ? String(r.questionsAnswered) : null],
    ["Waitlist", r.waitlist > 0 ? String(r.waitlist) : null],
    ["Orders", r.orders > 0 ? String(r.orders) : null],
  ];
  const liveMetrics = metrics.filter(([, v]) => v != null);
  const done = d.checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-4">
      {liveMetrics.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {liveMetrics.map(([k, v]) => (
            <div
              key={k}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-center"
            >
              <div className="text-base font-semibold">{v}</div>
              <div className="text-[10px] text-muted-foreground">{k}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
          No student activity observed at this campus yet.
        </div>
      )}

      {d.examTiming.isCurrentTerm && d.examTiming.date ? (
        <div className="rounded-md bg-primary/10 px-3 py-2 text-xs">
          Exam 1: <span className="font-semibold">{d.examTiming.date}</span> ({d.examTiming.term})
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">
          Estimated Exam 1 window · approximately term week 5–6{" "}
          <span className="rounded bg-muted px-1 text-[9px] font-semibold">ESTIMATED</span>
        </div>
      )}

      {d.exams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {d.exams.map((e) => (
            <div
              key={e.name}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
            >
              <span className="font-medium">{e.name}</span>
              <Pill
                status={
                  e.status === "READY" ? "active" : e.status === "PARTIAL" ? "paused" : undefined
                }
              >
                {e.status.replace("_", " ")}
              </Pill>
              {e.topics > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {e.coveredTopics}/{e.topics} topics
                </span>
              )}
            </div>
          ))}
          <span className="self-center text-[10px] text-muted-foreground">
            ({d.exams[0].level} map)
          </span>
        </div>
      )}

      {(d.market || d.competitive) && (
        <Section title="Market">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            {d.market?.businessBachelors != null && (
              <KV k="Business grads / yr" v={d.market.businessBachelors.toLocaleString()} />
            )}
            {d.market?.estimatedIntro1 != null && (
              <KV k="Est. Intro-1 seats / yr" v={`~${d.market.estimatedIntro1.toLocaleString()}`} />
            )}
            {d.market?.undergradEnrollment != null && (
              <KV k="Undergrads" v={d.market.undergradEnrollment.toLocaleString()} />
            )}
            {d.market?.growthLabel && <KV k="Growth" v={d.market.growthLabel.replace(/_/g, " ")} />}
            {d.competitive?.paidMarketStatus && (
              <KV k="Paid support market" v={d.competitive.paidMarketStatus} />
            )}
            {d.competitive?.introPaidStatus && (
              <KV
                k="Intro Accounting paid"
                v={
                  d.competitive.introPaidStatus === "STRONG" ||
                  d.competitive.introPaidStatus === "MODERATE"
                    ? "Yes"
                    : d.competitive.introPaidStatus
                }
              />
            )}
            {d.competitive?.courseSpecificCompetitors != null &&
              d.competitive.courseSpecificCompetitors > 0 && (
                <KV
                  k="Course-specific competitors"
                  v={String(d.competitive.courseSpecificCompetitors)}
                />
              )}
            {d.competitive?.studyEdge && <KV k="Study Edge" v="Active" />}
            {d.competitive?.marketStatus && (
              <KV k="Market" v={d.competitive.marketStatus.replace(/_/g, " ")} />
            )}
          </div>
          {d.competitive?.strongestCompetitor && (
            <div
              className="mt-1 text-[10px] text-muted-foreground"
              title={d.competitive.priceContext ?? undefined}
            >
              Strongest competitor: {d.competitive.strongestCompetitor}
            </div>
          )}
        </Section>
      )}

      <Section title={`Launch checklist · ${done}/${d.checklist.length}`}>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {d.checklist.map((c) => (
            <ChecklistRow key={c.key} item={c} />
          ))}
        </div>
      </Section>

      <Section title={`Professors · ${d.professors.length} with Intro-1 evidence`}>
        {d.professors.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No Intro-1 professor evidence yet — run ✨ Enrichment.
          </div>
        )}
        <div className="space-y-0.5">
          {d.professors.map((p) => (
            <button
              key={p.id ?? p.name}
              onClick={() => onOpenProfessor(p.id, p.name)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted/70"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold",
                  p.evidenceState === "CONFIRMED_INTRO1"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : p.evidenceState === "LIKELY_INTRO1"
                      ? "bg-sky-500/10 text-sky-600"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {(p.evidenceState ?? "").replace("_INTRO1", "") || "?"}
              </span>
              {p.docCount > 0 && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {p.docCount} doc{p.docCount > 1 ? "s" : ""}
                </span>
              )}
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {p.mapState === "professor"
                  ? "Own map"
                  : p.mapState === "campus"
                    ? "Campus map"
                    : "Starter"}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={`Organizations · ${d.chapters.length}`}>
        {d.chapters.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No social Greek chapters on the roster.
          </div>
        )}
        {d.chapters.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Organization</th>
                  <th className="py-1 pr-2 font-medium">Council</th>
                  <th className="py-1 pr-2 text-right font-medium">Members</th>
                  <th className="py-1 pr-2 font-medium">Reach</th>
                  <th className="py-1 font-medium">Contacted</th>
                </tr>
              </thead>
              <tbody>
                {d.chapters.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onOpenChapter(c.id)}
                    className="cursor-pointer border-t border-border/60 hover:bg-muted/60"
                  >
                    <td className="py-1.5 pr-2 font-medium">
                      {c.name}
                      {c.claimed && (
                        <span className="ml-1.5 rounded bg-emerald-500/10 px-1 text-[9px] font-semibold text-emerald-600">
                          CLAIMED
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 uppercase text-muted-foreground">
                      {c.council ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{c.members ?? "—"}</td>
                    <td className="py-1.5 pr-2">
                      <span className="text-[10px] text-muted-foreground">
                        {[
                          c.hasEmail ? "email" : null,
                          c.hasInstagram ? "IG" : null,
                          c.has990 ? "990" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </td>
                    <td className="py-1.5">{c.contacted ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full text-[10px]",
          item.done ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
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

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
