// Ported from the original app (ProfessorOutreach.tsx — ScheduleDateNavigator).
// Counts come in as a prop; Supabase wiring lands later.
import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  addDaysISO,
  formatPretty,
  isoToLocalDate,
  manilaTodayISO,
  mondayOfISO,
} from "@/lib/outreach-mock";

export function WeekNavigator({
  selectedDate,
  onChange,
  counts,
}: {
  selectedDate: string;
  onChange: (iso: string) => void;
  counts: Record<string, number>;
}) {
  const todayISO = manilaTodayISO();
  const weekMonday = useMemo(() => mondayOfISO(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekMonday, i)),
    [weekMonday],
  );

  const todayWeekMonday = mondayOfISO(todayISO);
  const isCurrentWeek = weekMonday === todayWeekMonday;
  const mondayPretty = formatPretty(weekMonday);
  const sundayPretty = formatPretty(weekDays[6]);

  const goPrevWeek = () => onChange(addDaysISO(weekMonday, -7 + 1)); // Tue of prev week
  const goNextWeek = () => onChange(addDaysISO(weekMonday, 7 + 1)); // Tue of next week
  const jumpToToday = () => {
    const tDow = isoToLocalDate(todayISO).getDay();
    if (tDow === 0) onChange(addDaysISO(todayISO, -1)); // Sun -> Sat
    else if (tDow === 1) onChange(addDaysISO(todayISO, 1)); // Mon -> Tue
    else onChange(todayISO);
  };

  return (
    <Card className="overflow-hidden border-border/60 py-0 gap-0">
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border/60 bg-muted/30">
        <button
          onClick={goPrevWeek}
          className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {isCurrentWeek ? "This week" : weekMonday < todayWeekMonday ? "Past week" : "Upcoming week"}
            </div>
            {!isCurrentWeek && (
              <button
                onClick={jumpToToday}
                className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Jump to today
              </button>
            )}
          </div>
          <div className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
            Week of Mon {mondayPretty.full.split(", ").slice(1).join(", ").replace(/, \d{4}$/, "")} – Sun{" "}
            {sundayPretty.full.split(", ").slice(1).join(", ").replace(/, \d{4}$/, "")}
          </div>
        </div>

        <button
          onClick={goNextWeek}
          className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Next week"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-2 py-2">
        {weekDays.map((iso, idx) => {
          const p = formatPretty(iso);
          const count = counts[iso] ?? 0;
          const isSel = iso === selectedDate;
          const isTodayCell = iso === todayISO;
          const isMonday = idx === 0;
          const isSunday = idx === 6;
          const isMarketing = !isMonday && !isSunday;

          if (isMonday || isSunday) {
            return (
              <div
                key={iso}
                aria-disabled
                className={cn(
                  "relative flex flex-col items-center rounded-md border px-2 py-1.5 cursor-not-allowed select-none",
                  isMonday
                    ? "border-indigo-200/60 bg-indigo-50/40 dark:bg-indigo-950/20"
                    : "border-dashed border-border/60 bg-muted/40 opacity-60",
                )}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {p.short}
                </span>
                <span className="mt-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
                  {p.dayNum}
                </span>
                {isMonday ? (
                  <span className="mt-1 inline-block -rotate-12 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                    Meet on Discord
                  </span>
                ) : (
                  <span className="mt-1 inline-flex h-3.5 items-center justify-center px-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Off
                  </span>
                )}
                {isTodayCell && (
                  <span className="absolute top-1 right-1 h-1 w-1 rounded-full bg-[#CE1126]" />
                )}
              </div>
            );
          }

          return (
            <button
              key={iso}
              onClick={() => onChange(iso)}
              className={cn(
                "group relative flex flex-col items-center rounded-md border px-2 py-1.5 transition",
                isSel
                  ? "border-[#14213D]/70 bg-[#14213D]/5 text-foreground"
                  : isMarketing
                    ? "border-[#CE1126]/20 bg-[#CE1126]/5 hover:border-[#CE1126]/40 hover:bg-[#CE1126]/10"
                    : "border-transparent hover:border-border hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "text-[9px] font-semibold uppercase tracking-wider",
                  isSel ? "text-[#14213D]" : "text-[#CE1126]/80",
                )}
              >
                {p.short}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-sm font-semibold tabular-nums",
                  isSel ? "text-[#14213D]" : "text-foreground",
                )}
              >
                {p.dayNum}
              </span>
              <span
                className={cn(
                  "mt-1 inline-flex h-3.5 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[9px] font-semibold tabular-nums",
                  count === 0
                    ? "bg-muted text-muted-foreground/60"
                    : isSel
                      ? "bg-[#14213D] text-white"
                      : "bg-[#CE1126]/15 text-[#CE1126]",
                )}
              >
                {count}
              </span>
              {isTodayCell && !isSel && <span className="mt-0.5 h-1 w-1 rounded-full bg-[#CE1126]" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export default WeekNavigator;
