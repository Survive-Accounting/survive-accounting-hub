// Upcoming email sends: initial, follow-ups (1/2/3), and broadcasts.
// Filter by email type and by send-date window.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Mail } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Campus } from "@/lib/outreach-mock";
import { fetchUpcomingSends, type UpcomingKind, type UpcomingSend } from "@/lib/outreach-api";

const KIND_LABEL: Record<UpcomingKind, string> = {
  initial: "Initial email",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2",
  follow_up_3: "Follow-up 3",
  broadcast: "Broadcast",
};

const KIND_BADGE: Record<UpcomingKind, string> = {
  initial: "border-emerald-400 text-emerald-700",
  follow_up_1: "border-blue-400 text-blue-700",
  follow_up_2: "border-blue-400 text-blue-700",
  follow_up_3: "border-blue-400 text-blue-700",
  broadcast: "border-amber-400 text-amber-700",
};

type DateWindow = "all" | "week" | "month" | "quarter" | "year";

function windowEnd(win: DateWindow): number | null {
  if (win === "all") return null;
  const d = new Date();
  if (win === "week") d.setDate(d.getDate() + 7);
  else if (win === "month") d.setMonth(d.getMonth() + 1);
  else if (win === "quarter") d.setMonth(d.getMonth() + 3);
  else if (win === "year") d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

export function UpcomingSendsPanel({ campuses }: { campuses: Campus[] }) {
  const { data: sends = [], isError, isLoading } = useQuery({
    queryKey: ["upcoming-sends"], queryFn: fetchUpcomingSends, retry: 1, refetchInterval: 60_000,
  });
  const [kind, setKind] = useState<"all" | UpcomingKind>("all");
  const [win, setWin] = useState<DateWindow>("month");

  const campusName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campuses) m.set(c.id, c.school_name);
    return (id: string | null) => (id ? m.get(id) ?? "—" : "All campuses");
  }, [campuses]);

  const filtered = useMemo(() => {
    const end = windowEnd(win);
    return sends.filter((s) => {
      if (kind !== "all" && s.kind !== kind) return false;
      if (end !== null && new Date(s.send_at).getTime() > end) return false;
      return true;
    });
  }, [sends, kind, win]);

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Upcoming Email Sends</h2>
        <span className="text-[11px] text-muted-foreground">{filtered.length} queued</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All email types</SelectItem>
              <SelectItem value="initial" className="text-xs">Initial email</SelectItem>
              <SelectItem value="follow_up_1" className="text-xs">Follow-up 1</SelectItem>
              <SelectItem value="follow_up_2" className="text-xs">Follow-up 2</SelectItem>
              <SelectItem value="follow_up_3" className="text-xs">Follow-up 3</SelectItem>
              <SelectItem value="broadcast" className="text-xs">Broadcast</SelectItem>
            </SelectContent>
          </Select>
          <Select value={win} onValueChange={(v) => setWin(v as DateWindow)}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week" className="text-xs">This week</SelectItem>
              <SelectItem value="month" className="text-xs">This month</SelectItem>
              <SelectItem value="quarter" className="text-xs">This quarter</SelectItem>
              <SelectItem value="year" className="text-xs">This year</SelectItem>
              <SelectItem value="all" className="text-xs">All upcoming</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError ? (
        <div className="p-4 text-xs text-muted-foreground">Couldn't load upcoming sends.</div>
      ) : isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">Nothing scheduled in this window.</div>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Send at</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Campus</th>
                <th className="px-3 py-2 text-left font-medium">Professor</th>
                <th className="px-3 py-2 text-left font-medium">Email / Subject</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: UpcomingSend) => (
                <tr key={s.id} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    <CalendarClock className="mr-1 inline h-3 w-3" />
                    {new Date(s.send_at).toLocaleString([], {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`h-4 px-1 text-[10px] ${KIND_BADGE[s.kind]}`}>
                      {KIND_LABEL[s.kind]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{campusName(s.campus_id)}</td>
                  <td className="px-3 py-2">{s.recipient}</td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-muted-foreground" title={s.detail ? `${s.detail} — ${s.email}` : s.email}>
                    {s.email}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default UpcomingSendsPanel;
