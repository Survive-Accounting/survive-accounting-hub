// /outreach/profintel-metrics — ProfIntel "Metrics".
// A simple dashboard over profintel_sends: how many emails went out, open % and
// reply % (once send tracking is live), and an itemized list of each email with
// its campus, professor, and matched RMP courses.
//
// NOTE: ProfIntel is drafts-only today — nothing sends automatically yet, so
// "Sent" reads 0 and open/reply are "—" until the send worker + open/reply
// tracking are wired. The itemized list and draft/scheduled counts work now.
import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2, Mail } from "lucide-react";

import { listSends, type ProfIntelSend } from "@/lib/profintel";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/outreach/profintel-metrics")({
  head: () => ({
    meta: [
      { title: "ProfIntel — Metrics" },
      {
        name: "description",
        content: "Sent / open / reply metrics and an itemized log of professor emails.",
      },
    ],
  }),
  component: ProfIntelMetrics,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  scheduled: "secondary",
  sent: "default",
  canceled: "destructive",
};

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

/** opened_at / replied_at may not exist on the row yet (added when send tracking
 *  ships). Read them defensively so the dashboard renders either way. */
function has(s: ProfIntelSend, k: string): string | null {
  const v = (s as unknown as Record<string, unknown>)[k];
  return typeof v === "string" ? v : null;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ProfIntelMetrics() {
  const sendsQuery = useQuery({ queryKey: ["profintel-all-sends"], queryFn: () => listSends() });
  const sends = useMemo(() => sendsQuery.data ?? [], [sendsQuery.data]);

  const m = useMemo(() => {
    const counts = { draft: 0, scheduled: 0, sent: 0, canceled: 0 } as Record<string, number>;
    let opened = 0,
      replied = 0;
    for (const s of sends) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
      if (has(s, "opened_at")) opened += 1;
      if (has(s, "replied_at")) replied += 1;
    }
    const sent = counts.sent ?? 0;
    const pct = (n: number) => (sent > 0 ? `${Math.round((n / sent) * 100)}%` : "—");
    return {
      counts,
      sent,
      opened,
      replied,
      openPct: pct(opened),
      replyPct: pct(replied),
      tracked: sent > 0 && (opened > 0 || replied > 0),
    };
  }, [sends]);

  // Newest activity first: sent, then scheduled (by time), then drafts.
  const rows = useMemo(() => {
    const rank = (s: ProfIntelSend) =>
      s.status === "sent" ? 0 : s.status === "scheduled" ? 1 : s.status === "draft" ? 2 : 3;
    return [...sends].sort(
      (a, b) => rank(a) - rank(b) || (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );
  }, [sends]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">ProfIntel metrics</h1>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Emails sent" value={String(m.sent)} />
        <Stat label="Scheduled" value={String(m.counts.scheduled ?? 0)} />
        <Stat label="Drafts" value={String(m.counts.draft ?? 0)} />
        <Stat label="Open rate" value={m.openPct} sub={m.sent ? `${m.opened} opened` : undefined} />
        <Stat
          label="Reply rate"
          value={m.replyPct}
          sub={m.sent ? `${m.replied} replied` : undefined}
        />
      </div>

      {!m.tracked && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Open % and Reply % populate once real sending + tracking are turned on (drafts-only for
          now). Sent/scheduled/draft counts and the log below are live.
        </div>
      )}

      {sendsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
          No emails yet.{" "}
          <Link to="/outreach/profintel" className="text-primary underline underline-offset-2">
            Choose campus leads
          </Link>{" "}
          to create drafts.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border text-xs">
          <table className="w-full">
            <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Professor</th>
                <th className="px-3 py-2 text-left">Campus</th>
                <th className="px-3 py-2 text-left">RMP courses matched</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Send time</th>
                <th className="px-3 py-2 text-left">Opened</th>
                <th className="px-3 py-2 text-left">Replied</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
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
                  <td className="px-3 py-2">
                    {s.course_matches ? (
                      <span className="text-emerald-700">{s.course_matches}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={STATUS_VARIANT[s.status] ?? "outline"}
                      className="text-[10px] capitalize"
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtWhen(s.scheduled_at)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {fmtWhen(has(s, "opened_at"))}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {fmtWhen(has(s, "replied_at"))}
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
