import { useState, useEffect } from "react";
import { Sun, Moon, ArrowRight } from "lucide-react";

function getParts(now: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const parts = fmt.formatToParts(now).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const hourNum = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now)
  );
  const isDay = hourNum >= 6 && hourNum < 18;
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`,
    weekday: parts.weekday,
    isDay,
    dateKey,
  };
}

export function DualClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Puerto Vallarta is in Jalisco — America/Mexico_City (Central, no DST).
  const mx = getParts(now, "America/Mexico_City");
  const ph = getParts(now, "Asia/Manila");

  // Day-ahead detection: compare calendar dates as strings.
  const phAhead = ph.dateKey > mx.dateKey;

  const Cell = ({
    label,
    flag,
    time,
    weekday,
    isDay,
  }: {
    label: string;
    flag: string;
    time: string;
    weekday: string;
    isDay: boolean;
  }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px]">{flag}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wider opacity-60">
          {weekday}
        </span>
        <span className="flex items-center gap-1 font-mono text-[11px] text-white/90">
          {isDay ? (
            <Sun className="h-2.5 w-2.5 text-amber-300" />
          ) : (
            <Moon className="h-2.5 w-2.5 text-indigo-300" />
          )}
          {time}
        </span>
      </div>
    </div>
  );

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white">
      <Cell label="MX" flag="🇲🇽" time={mx.time} weekday={mx.weekday} isDay={mx.isDay} />
      <div className="flex flex-col items-center px-0.5">
        <ArrowRight className="h-3 w-3 opacity-50" />
        {phAhead && (
          <span className="rounded bg-amber-400/20 px-1 text-[8px] font-semibold leading-none text-amber-300">
            +1d
          </span>
        )}
      </div>
      <Cell label="PH" flag="🇵🇭" time={ph.time} weekday={ph.weekday} isDay={ph.isDay} />
    </div>
  );
}
