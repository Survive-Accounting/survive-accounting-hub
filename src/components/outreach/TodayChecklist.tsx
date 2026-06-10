import { CheckCircle2, Circle, Upload, Send, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMO_CAMPUSES = [
  { name: "Alabama A&M University", approved: false },
  { name: "Alabama State University", approved: false },
  { name: "Auburn University at Montgomery", approved: false },
  { name: "Jacksonville State University", approved: false },
  { name: "Troy University", approved: false },
];

export function TodayChecklist({
  onOpenEmailQueue,
  onOpenCampus,
}: {
  onOpenEmailQueue?: () => void;
  onOpenCampus?: (name: string) => void;
}) {
  const n = DEMO_CAMPUSES.length;
  const approvedCount = DEMO_CAMPUSES.filter((c) => c.approved).length;
  const campusesWithProfs = 0;

  return (
    <Card className="p-6 space-y-6">
      {/* STEP 1 */}
      <div>
        <div className="flex items-start gap-3">
          <StepBadge n={1} />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold leading-tight">
              Approve {n} campuses for outreach today
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {approvedCount} of {n} approved
            </p>
          </div>
        </div>

        <ul className="ml-11 mt-3 space-y-0.5">
          {DEMO_CAMPUSES.map((c) => (
            <li key={c.name}>
              <button
                onClick={() => onOpenCampus?.(c.name)}
                className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-sm text-left transition hover:bg-muted"
              >
                {c.approved ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                )}
                <span
                  className={cn(
                    "truncate text-[#14213D] underline decoration-[#14213D]/20 underline-offset-2 group-hover:decoration-[#14213D]",
                    c.approved &&
                      "text-muted-foreground line-through decoration-muted-foreground/40",
                  )}
                >
                  {c.name}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 ml-auto shrink-0" />
              </button>
            </li>
          ))}
        </ul>

        <div className="ml-11 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>~$18,400 avg tuition/yr</span>
          <span>~6,200 target students/yr</span>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* STEP 2 */}
      <div className="flex items-start gap-3">
        <StepBadge n={2} />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold leading-tight">
            Import accounting professors for each campus
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {campusesWithProfs} of {n} campuses have professors imported
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0">
          <Upload className="h-3.5 w-3.5" /> Import
        </Button>
      </div>

      <div className="h-px bg-border" />

      {/* STEP 3 */}
      <div className="flex items-start gap-3">
        <StepBadge n={3} />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold leading-tight">Schedule Outreach Emails 🚧</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">0 ready · 0 sent today</p>
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
    </Card>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
      {n}
    </div>
  );
}
