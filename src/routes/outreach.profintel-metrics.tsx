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
import { toast } from "sonner";
import { BarChart3, Loader2, Mail, Power } from "lucide-react";

import {
  effectiveDailyCap,
  getProfintelSettings,
  listSends,
  markReplied,
  updateProfintelSettings,
  warmupStatus,
  type ProfIntelSend,
} from "@/lib/profintel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
/** Numeric field reader (open_count / click_count), 0 when absent. */
function num(s: ProfIntelSend, k: string): number {
  const v = (s as unknown as Record<string, unknown>)[k];
  return typeof v === "number" ? v : 0;
}
/** Engagement score for follow-up prioritization: replies count most, then
 *  clicks, then repeat opens. Lets you sort out who's actually interested. */
function engagement(s: ProfIntelSend): number {
  return (
    (has(s, "replied_at") ? 100 : 0) +
    (has(s, "clicked_at") ? 20 : 0) +
    num(s, "click_count") * 5 +
    (has(s, "opened_at") ? 5 : 0) +
    Math.max(0, num(s, "open_count") - 1) * 2
  );
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
  const settingsQuery = useQuery({
    queryKey: ["profintel-settings"],
    queryFn: getProfintelSettings,
  });
  const settings = settingsQuery.data ?? null;

  async function toggleSending() {
    if (!settings) return;
    const next = !settings.sending_enabled;
    if (
      next &&
      !confirm(
        "Turn ON real email sending? Scheduled ProfIntel emails will start going out to professors at their scheduled times.",
      )
    )
      return;
    try {
      await updateProfintelSettings({ sending_enabled: next });
      toast.success(
        next ? "Sending ENABLED — the worker will fire due emails." : "Sending paused.",
      );
      settingsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }

  async function toggleReplied(s: ProfIntelSend) {
    try {
      await markReplied(s.id, !has(s, "replied_at"));
      sendsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }

  const m = useMemo(() => {
    const counts = { draft: 0, scheduled: 0, sent: 0, canceled: 0 } as Record<string, number>;
    const blank = () => ({ sent: 0, opened: 0, clicked: 0, replied: 0 });
    const variants: Record<"A" | "B", ReturnType<typeof blank>> = { A: blank(), B: blank() };
    let opened = 0,
      replied = 0,
      clicked = 0;
    for (const s of sends) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
      const isOpen = !!has(s, "opened_at");
      const isReply = !!has(s, "replied_at");
      const isClick = !!has(s, "clicked_at");
      if (isOpen) opened += 1;
      if (isReply) replied += 1;
      if (isClick) clicked += 1;
      const v = s.variant === "A" || s.variant === "B" ? s.variant : null;
      if (v && s.status === "sent") {
        variants[v].sent += 1;
        if (isOpen) variants[v].opened += 1;
        if (isClick) variants[v].clicked += 1;
        if (isReply) variants[v].replied += 1;
      }
    }
    const sent = counts.sent ?? 0;
    const pct = (n: number) => (sent > 0 ? `${Math.round((n / sent) * 100)}%` : "—");
    return {
      counts,
      sent,
      opened,
      replied,
      clicked,
      openPct: pct(opened),
      replyPct: pct(replied),
      clickPct: pct(clicked),
      variants,
      abActive: variants.A.sent + variants.B.sent > 0,
      tracked: sent > 0 && (opened > 0 || replied > 0 || clicked > 0),
    };
  }, [sends]);

  // Sent first (most-engaged at the very top, so follow-up targets surface),
  // then scheduled, then drafts.
  const rows = useMemo(() => {
    const rank = (s: ProfIntelSend) =>
      s.status === "sent" ? 0 : s.status === "scheduled" ? 1 : s.status === "draft" ? 2 : 3;
    return [...sends].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r) return r;
      if (a.status === "sent" && b.status === "sent") {
        const e = engagement(b) - engagement(a);
        if (e) return e;
      }
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [sends]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">ProfIntel metrics</h1>
      </div>

      {/* Sending control (kill-switch). Present only once 0048 is applied. */}
      {settings && (
        <div
          className={`mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs ${
            settings.sending_enabled
              ? "border-emerald-300 bg-emerald-50"
              : "border-border bg-card/60"
          }`}
        >
          <Button
            size="sm"
            variant={settings.sending_enabled ? "default" : "outline"}
            className="h-7"
            onClick={toggleSending}
          >
            <Power className="mr-1 h-3.5 w-3.5" />
            Sending: {settings.sending_enabled ? "ON" : "OFF"}
          </Button>
          <span className="text-muted-foreground">
            Today's cap{" "}
            <span className="font-medium text-foreground">{effectiveDailyCap(settings)}</span>
            <span className="text-muted-foreground/80"> ({warmupStatus(settings)})</span> · sent today{" "}
            <span className="font-medium text-foreground">{settings.sent_today ?? 0}</span>
            {settings.last_run_at && ` · worker last ran ${fmtWhen(settings.last_run_at)}`}
          </span>
          {!settings.sending_enabled && (
            <span className="text-amber-600">Off — scheduled emails are queued but not sent.</span>
          )}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Stat label="Emails sent" value={String(m.sent)} />
        <Stat label="Scheduled" value={String(m.counts.scheduled ?? 0)} />
        <Stat label="Drafts" value={String(m.counts.draft ?? 0)} />
        <Stat label="Open rate" value={m.openPct} sub={m.sent ? `${m.opened} opened` : undefined} />
        <Stat
          label="Click rate"
          value={m.clickPct}
          sub={m.sent ? `${m.clicked} clicked` : undefined}
        />
        <Stat
          label="Reply rate"
          value={m.replyPct}
          sub={m.sent ? `${m.replied} replied` : undefined}
        />
      </div>

      {/* A/B comparison — only once split sends exist. */}
      {m.abActive && (
        <div className="mb-4 overflow-x-auto rounded-lg border border-border text-xs">
          <table className="w-full">
            <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">A/B variant</th>
                <th className="px-3 py-2 text-right">Sent</th>
                <th className="px-3 py-2 text-right">Open %</th>
                <th className="px-3 py-2 text-right">Click %</th>
                <th className="px-3 py-2 text-right">Reply %</th>
              </tr>
            </thead>
            <tbody>
              {(["A", "B"] as const).map((v) => {
                const d = m.variants[v];
                const p = (n: number) => (d.sent > 0 ? `${Math.round((n / d.sent) * 100)}%` : "—");
                return (
                  <tr key={v} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">Variant {v}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.sent}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p(d.opened)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p(d.clicked)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p(d.replied)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!m.tracked && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Open / Click / Reply rates populate once real sending + tracking are turned on (drafts-only
          for now). Click % also needs click tracking enabled on the Resend domain. Sent counts and
          the log below are live.
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
                <th className="px-3 py-2 text-center">A/B</th>
                <th className="px-3 py-2 text-left">Send time</th>
                <th className="px-3 py-2 text-left">Opened</th>
                <th className="px-3 py-2 text-center">Clicks</th>
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
                  <td className="px-3 py-2 text-center">
                    {s.variant ? (
                      <Badge variant="outline" className="text-[10px]">
                        {s.variant}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtWhen(s.scheduled_at)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {fmtWhen(has(s, "opened_at"))}
                    {num(s, "open_count") > 1 && (
                      <span className="ml-1 text-emerald-700" title={`${num(s, "open_count")} opens`}>
                        ×{num(s, "open_count")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {has(s, "clicked_at") ? (
                      <span
                        className="font-medium text-emerald-700"
                        title={has(s, "last_clicked_url") ?? "clicked"}
                      >
                        {num(s, "click_count") || 1}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <button
                      type="button"
                      onClick={() => toggleReplied(s)}
                      className={`hover:underline ${has(s, "replied_at") ? "text-emerald-700" : "text-muted-foreground"}`}
                      title={has(s, "replied_at") ? "Click to unmark reply" : "Mark as replied"}
                      disabled={s.status !== "sent"}
                    >
                      {has(s, "replied_at")
                        ? fmtWhen(has(s, "replied_at"))
                        : s.status === "sent"
                          ? "mark"
                          : "—"}
                    </button>
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
