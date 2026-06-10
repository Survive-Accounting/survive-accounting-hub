// Ported from the original app (ProfessorOutreach.tsx — DueTodayChecklist).
import { useMemo } from "react";
import { CheckCircle2, ChevronRight, Circle, Send, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mockCampusesForDate, type Campus } from "@/lib/outreach-mock";

function StepBadge({ n }: { n: number }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
      {n}
    </div>
  );
}

export function TodayChecklist({
  dateISO,
  campuses,
  todaysCampuses: todaysCampusesProp,
  onFocusCampus,
  onImportProfessors,
  onOpenEmailQueue,
}: {
  dateISO: string;
  campuses: Campus[];
  todaysCampuses?: Campus[];
  onFocusCampus: (name: string) => void;
  onImportProfessors: () => void;
  onOpenEmailQueue: () => void;
}) {
  const todaysCampuses = useMemo(
    () => todaysCampusesProp ?? mockCampusesForDate(dateISO, campuses),
    [todaysCampusesProp, dateISO, campuses],
  );
  const n = todaysCampuses.length;
  const approvedCount = todaysCampuses.filter((c) => c.approval_status === "approved").length;
  const campusesWithProfs = 0; // leads import not wired yet
  const readyCount = campuses.filter((c) => c.ready_for_outreach).length;
  const todaySent = 0;

  const tuitionValues = todaysCampuses
    .map((c) => c.tuition_out_state ?? c.tuition_in_state)
    .filter((v): v is number => v != null);
  const avgTuition = tuitionValues.length
    ? Math.round(tuitionValues.reduce((a, b) => a + b, 0) / tuitionValues.length)
    : null;
  const studentsTotal = todaysCampuses.reduce((sum, c) => sum + (c.tam_total ?? 0), 0);

  return (
    <Card className="p-6 space-y-5">
      {/* STEP 1 */}
      <div>
        <div className="flex items-start gap-3">
          <StepBadge n={1} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold leading-tight">
              Approve {n || 5} campuses for outreach today
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {approvedCount} of {n || 5} approved
            </p>
          </div>
        </div>

        {n === 0 ? (
          <div className="ml-11 mt-3 text-xs text-muted-foreground">
            Assign campuses to King with a due date from the Campuses tab.
          </div>
        ) : (
          <>
            <ul className="ml-11 mt-3 space-y-0.5">
              {todaysCampuses.map((c) => {
                const approved = c.approval_status === "approved";
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => onFocusCampus(c.school_name)}
                      className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm text-left transition hover:bg-muted"
                      title="Open in Campuses tab"
                    >
                      {approved ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate text-[#14213D] underline decoration-[#14213D]/20 underline-offset-2 group-hover:decoration-[#14213D]",
                          approved && "text-muted-foreground line-through decoration-muted-foreground/40",
                        )}
                      >
                        {c.school_name}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 ml-auto shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="ml-11 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {avgTuition != null && <span>~${avgTuition.toLocaleString()} avg tuition/yr</span>}
              {studentsTotal > 0 && <span>~{studentsTotal.toLocaleString()} target students/yr</span>}
            </div>
          </>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* STEP 2 */}
      <div>
        <div className="flex items-start gap-3">
          <StepBadge n={2} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold leading-tight">
              Import accounting professors for each campus
            </h3>
            {n > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {campusesWithProfs} of {n} campuses have professors imported
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={onImportProfessors} className="shrink-0">
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* STEP 3 */}
      <div>
        <div className="flex items-start gap-3">
          <StepBadge n={3} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold leading-tight">Schedule Outreach Emails 🚧</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {readyCount} ready · {todaySent} sent today
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenEmailQueue}
            className="shrink-0 border-[#14213D]/30 text-[#14213D] hover:bg-[#14213D]/5"
          >
            <Send className="h-3.5 w-3.5" /> Open Email Queue <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default TodayChecklist;
