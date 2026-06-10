import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + offset);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

const SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function WeekNavigator({
  selected,
  onChange,
  counts = {},
}: {
  selected?: Date;
  onChange?: (d: Date) => void;
  counts?: Record<string, number>;
}) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [internalSel, setInternalSel] = useState<Date>(selected ?? today);
  const sel = selected ?? internalSel;
  const setSel = (d: Date) => {
    setInternalSel(d);
    onChange?.(d);
  };

  const weekMonday = useMemo(() => startOfWeekMonday(sel), [sel]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i)),
    [weekMonday],
  );

  const todayWeekMonday = startOfWeekMonday(today);
  const isCurrentWeek = weekMonday.getTime() === todayWeekMonday.getTime();
  const monLabel = days[0].toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const sunLabel = days[6].toLocaleDateString("en-US", { month: "long", day: "numeric" });

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const isoKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <Card className="overflow-hidden border-border/60">
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border/60 bg-muted/30">
        <button
          onClick={() => setSel(addDays(weekMonday, -6))}
          className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {isCurrentWeek
              ? "This week"
              : weekMonday < todayWeekMonday
                ? "Past week"
                : "Upcoming week"}
          </div>
          <div className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
            Week of Mon {monLabel} – Sun {sunLabel}
          </div>
        </div>

        <button
          onClick={() => setSel(addDays(weekMonday, 8))}
          className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Next week"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-2 py-2">
        {days.map((d, idx) => {
          const isSel = sameDay(d, sel);
          const isTodayCell = sameDay(d, today);
          const isMonday = idx === 0;
          const isSunday = idx === 6;
          const count = counts[isoKey(d)] ?? 0;

          if (isMonday || isSunday) {
            return (
              <div
                key={idx}
                aria-disabled
                className={cn(
                  "relative flex flex-col items-center rounded-md border px-2 py-1.5 cursor-not-allowed select-none",
                  isMonday
                    ? "border-indigo-200/60 bg-indigo-50/40"
                    : "border-dashed border-border/60 bg-muted/40 opacity-60",
                )}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {SHORT[idx]}
                </span>
                <span className="mt-0.5 text-sm font-semibold tabular-nums text-muted-foreground">
                  {d.getDate()}
                </span>
                {isMonday ? (
                  <span className="mt-1 inline-block -rotate-12 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-indigo-600">
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
              key={idx}
              onClick={() => setSel(d)}
              className={cn(
                "group relative flex flex-col items-center rounded-md border px-2 py-1.5 transition",
                isSel
                  ? "border-[#14213D]/70 bg-[#14213D]/5 text-foreground"
                  : "border-[#CE1126]/20 bg-[#CE1126]/5 hover:border-[#CE1126]/40 hover:bg-[#CE1126]/10",
              )}
            >
              <span
                className={cn(
                  "text-[9px] font-semibold uppercase tracking-wider",
                  isSel ? "text-[#14213D]" : "text-[#CE1126]/80",
                )}
              >
                {SHORT[idx]}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-sm font-semibold tabular-nums",
                  isSel ? "text-[#14213D]" : "text-foreground",
                )}
              >
                {d.getDate()}
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
              {isTodayCell && !isSel && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-[#CE1126]" />
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
