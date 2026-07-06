// /outreach/profintel-schedule — ProfIntel "Schedule emails".
// The outgoing queue: every ProfIntel draft across campuses, with its status,
// ready flag, and scheduled send time. Read-mostly — drafts are edited on the
// "Choose campus leads" tab. NOTHING sends automatically yet; "scheduled" rows
// are just queued for a future worker once real sending is turned on.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2, Mail, Shuffle } from "lucide-react";

import { listSends, updateSend, type ProfIntelSend } from "@/lib/profintel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Deliverability-friendly send times: weekday Tue/Wed/Thu, 10:00 AM–3:00 PM local,
 *  jittered minutes (never on the hour), ~12/day, starting the next such weekday.
 *  Spreading + randomizing avoids the burst pattern spam filters flag. */
function spreadSendTimes(n: number, perDay = 12): string[] {
  const dayList: Date[] = [];
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1); // start tomorrow
  let guard = 0;
  while (dayList.length < Math.ceil(n / perDay) && guard++ < 120) {
    const dow = day.getDay(); // 2=Tue, 3=Wed, 4=Thu
    if (dow >= 2 && dow <= 4) dayList.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }
  const out: string[] = [];
  let i = 0;
  for (const d of dayList) {
    const slots: string[] = [];
    for (let k = 0; k < perDay && i < n; k++, i++) {
      const hour = 10 + Math.floor(Math.random() * 5); // 10..14 → 10:00–2:59 PM
      const min = Math.floor(Math.random() * 60);
      slots.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, min).toISOString());
    }
    slots.sort();
    out.push(...slots);
  }
  return out;
}

export const Route = createFileRoute("/outreach/profintel-schedule")({
  head: () => ({
    meta: [
      { title: "ProfIntel — Schedule emails" },
      {
        name: "description",
        content: "Outgoing professor-outreach drafts and their scheduled send times.",
      },
    ],
  }),
  component: ProfIntelSchedule,
});

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  scheduled: "secondary",
  sent: "default",
  canceled: "destructive",
};

function ProfIntelSchedule() {
  const sendsQuery = useQuery({ queryKey: ["profintel-all-sends"], queryFn: () => listSends() });
  const sends = useMemo(() => sendsQuery.data ?? [], [sendsQuery.data]);

  const counts = useMemo(() => {
    const c = { draft: 0, scheduled: 0, sent: 0, canceled: 0 } as Record<string, number>;
    for (const s of sends) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [sends]);

  // scheduled first (by time), then drafts, then the rest.
  const ordered = useMemo(() => {
    const rank = (s: ProfIntelSend) =>
      s.status === "scheduled" ? 0 : s.status === "draft" ? 1 : 2;
    return [...sends].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
      const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
      return at - bt;
    });
  }, [sends]);

  const [spreading, setSpreading] = useState(false);

  async function cancel(s: ProfIntelSend) {
    if (!confirm(`Cancel the scheduled send to ${s.to_name || s.to_email || "this lead"}?`)) return;
    try {
      await updateSend(s.id, { status: "draft", ready: false, scheduled_at: null });
      toast.success("Moved back to draft.");
      sendsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel.");
    }
  }

  // Spread every unscheduled draft across randomized Tue–Thu 10–3 send times, so
  // the eventual send worker fires them naturally instead of in one burst.
  async function autoSchedule() {
    const drafts = sends.filter((s) => s.status === "draft");
    if (drafts.length === 0) {
      toast.message("No drafts to schedule.");
      return;
    }
    if (
      !confirm(
        `Spread ${drafts.length} draft${drafts.length === 1 ? "" : "s"} across Tue–Thu, 10 AM–3 PM (randomized)?`,
      )
    )
      return;
    setSpreading(true);
    try {
      const times = spreadSendTimes(drafts.length);
      let ok = 0;
      for (let i = 0; i < drafts.length; i++) {
        await updateSend(drafts[i].id, {
          scheduled_at: times[i],
          ready: true,
          status: "scheduled",
        });
        ok += 1;
      }
      toast.success(
        `Scheduled ${ok} — spread across ${new Set(times.map((t) => t.slice(0, 10))).size} day(s).`,
      );
      await sendsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to auto-schedule.");
    } finally {
      setSpreading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <CalendarClock className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">Outgoing professor emails</h1>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8"
          onClick={autoSchedule}
          disabled={spreading || (counts.draft ?? 0) === 0}
          title="Assign randomized Tue–Thu 10 AM–3 PM send times to all drafts"
        >
          {spreading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Shuffle className="mr-1 h-3.5 w-3.5" />
          )}
          Auto-schedule drafts (spread 10–3)
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{counts.scheduled ?? 0} scheduled</Badge>
        <Badge variant="outline">{counts.draft ?? 0} draft</Badge>
        <Badge variant="default">{counts.sent ?? 0} sent</Badge>
        {(counts.canceled ?? 0) > 0 && (
          <Badge variant="destructive">{counts.canceled} canceled</Badge>
        )}
      </div>

      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Drafts-only for now — nothing here sends automatically. Scheduled rows are queued for
        review.
      </div>

      {sendsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : ordered.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No drafts yet.{" "}
          <Link to="/outreach/profintel" className="text-primary underline underline-offset-2">
            Choose campus leads
          </Link>{" "}
          to create some.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border text-xs">
          <table className="w-full">
            <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Professor</th>
                <th className="px-3 py-2 text-left">School</th>
                <th className="px-3 py-2 text-left">Subject</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Send time</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.to_name || "—"}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {s.to_email || "no email"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.school || "—"}</td>
                  <td className="px-3 py-2 max-w-[260px] truncate">{s.subject || "—"}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={STATUS_VARIANT[s.status] ?? "outline"}
                      className="text-[10px] capitalize"
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtWhen(s.scheduled_at)}</td>
                  <td className="px-3 py-2 text-right">
                    {s.status === "scheduled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground"
                        onClick={() => cancel(s)}
                      >
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
