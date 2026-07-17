// /outreach/profintel-metrics — ProfIntel "Metrics".
// A simple dashboard over profintel_sends: how many emails went out, open % and
// reply % (once send tracking is live), and an itemized list of each email with
// its campus, professor, and matched RMP courses.
//
// NOTE: ProfIntel is drafts-only today — nothing sends automatically yet, so
// "Sent" reads 0 and open/reply are "—" until the send worker + open/reply
// tracking are wired. The itemized list and draft/scheduled counts work now.
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Ban, Copy, Loader2, Mail, Plus, Power, Trash2 } from "lucide-react";

import {
  addReplySnippet,
  deleteReplySnippet,
  effectiveDailyCap,
  familiesForMatches,
  fetchCampusFamilyMaps,
  getProfintelSettings,
  listReplySnippets,
  listSends,
  markReplied,
  markStopped,
  updateProfintelSettings,
  warmupStatus,
  type ProfIntelSend,
} from "@/lib/profintel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

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
/** Engagement score for follow-up prioritization. Replies float to the top; STOPs
 *  (opt-outs) sink to the bottom. Opens/clicks aren't tracked, so they don't factor. */
function engagement(s: ProfIntelSend): number {
  if (has(s, "stopped_at")) return -1000;
  return has(s, "replied_at") ? 100 : 0;
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

// null = default (sent/engagement) order; else sort by scheduled send time.
type TimeSort = null | "asc" | "desc";

function ProfIntelMetrics() {
  const sendsQuery = useQuery({ queryKey: ["profintel-all-sends"], queryFn: () => listSends() });
  const sends = useMemo(() => sendsQuery.data ?? [], [sendsQuery.data]);
  const settingsQuery = useQuery({
    queryKey: ["profintel-settings"],
    queryFn: getProfintelSettings,
  });
  const settings = settingsQuery.data ?? null;
  const familyMapsQuery = useQuery({
    queryKey: ["profintel-family-maps"],
    queryFn: fetchCampusFamilyMaps,
  });
  const familyMaps = familyMapsQuery.data ?? {};
  const [timeSort, setTimeSort] = useState<TimeSort>(null);

  // Reusable reply snippets (copied when answering from the inbox).
  const snippetsQuery = useQuery({
    queryKey: ["profintel-reply-snippets"],
    queryFn: listReplySnippets,
  });
  const snippets = snippetsQuery.data ?? [];
  const [snipName, setSnipName] = useState("");
  const [snipBody, setSnipBody] = useState("");
  const [snipBusy, setSnipBusy] = useState(false);

  async function copySnippet(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Copied — paste it into your reply.");
    } catch {
      toast.error("Copy failed (clipboard blocked).");
    }
  }
  async function addSnippet() {
    if (!snipName.trim() || !snipBody.trim()) return toast.error("Give the snippet a name and text.");
    setSnipBusy(true);
    try {
      await addReplySnippet(snipName, snipBody);
      setSnipName("");
      setSnipBody("");
      snippetsQuery.refetch();
      toast.success("Snippet saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save snippet.");
    } finally {
      setSnipBusy(false);
    }
  }
  async function removeSnippet(id: string) {
    try {
      await deleteReplySnippet(id);
      snippetsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    }
  }

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

  async function toggleStopped(s: ProfIntelSend) {
    try {
      await markStopped(s.id, !has(s, "stopped_at"));
      sendsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  }

  const m = useMemo(() => {
    const counts = { draft: 0, scheduled: 0, sent: 0, canceled: 0 } as Record<string, number>;
    const blank = () => ({ sent: 0, replied: 0, stopped: 0 });
    const variants: Record<"A" | "B", ReturnType<typeof blank>> = { A: blank(), B: blank() };
    let replied = 0,
      stopped = 0;
    for (const s of sends) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
      const isReply = !!has(s, "replied_at");
      const isStop = !!has(s, "stopped_at");
      if (isReply) replied += 1;
      if (isStop) stopped += 1;
      const v = s.variant === "A" || s.variant === "B" ? s.variant : null;
      if (v && s.status === "sent") {
        variants[v].sent += 1;
        if (isReply) variants[v].replied += 1;
        if (isStop) variants[v].stopped += 1;
      }
    }
    const sent = counts.sent ?? 0;
    const pct = (n: number) => (sent > 0 ? `${Math.round((n / sent) * 100)}%` : "—");
    return {
      counts,
      sent,
      replied,
      stopped,
      replyPct: pct(replied),
      stopPct: pct(stopped),
      variants,
      abActive: variants.A.sent + variants.B.sent > 0,
      // Reply + Stop are manual marks in the log (no open/click tracking), so
      // rates are meaningful the moment anything has sent.
      tracked: sent > 0,
    };
  }, [sends]);

  // Default: sent first (most-engaged at top, so follow-ups surface), then
  // scheduled, then drafts. When the Send-time header is toggled, sort purely by
  // scheduled_at (nulls last) in the chosen direction.
  const rows = useMemo(() => {
    const rank = (s: ProfIntelSend) =>
      s.status === "sent" ? 0 : s.status === "scheduled" ? 1 : s.status === "draft" ? 2 : 3;
    const arr = [...sends];
    if (timeSort) {
      arr.sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : null;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : null;
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1; // nulls last
        if (tb === null) return -1;
        return timeSort === "asc" ? ta - tb : tb - ta;
      });
      return arr;
    }
    arr.sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r) return r;
      if (a.status === "sent" && b.status === "sent") {
        const e = engagement(b) - engagement(a);
        if (e) return e;
      }
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    return arr;
  }, [sends, timeSort]);

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
            <span className="text-muted-foreground/80"> ({warmupStatus(settings)})</span> · sent
            today <span className="font-medium text-foreground">{settings.sent_today ?? 0}</span>
            {settings.last_run_at && ` · worker last ran ${fmtWhen(settings.last_run_at)}`}
          </span>
          {!settings.sending_enabled && (
            <span className="text-amber-600">Off — scheduled emails are queued but not sent.</span>
          )}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Emails sent" value={String(m.sent)} />
        <Stat label="Scheduled" value={String(m.counts.scheduled ?? 0)} />
        <Stat label="Drafts" value={String(m.counts.draft ?? 0)} />
        <Stat
          label="Reply rate"
          value={m.replyPct}
          sub={m.sent ? `${m.replied} replied` : undefined}
        />
        <Stat label="Stop rate" value={m.stopPct} sub={m.sent ? `${m.stopped} opted out` : undefined} />
      </div>

      {/* A/B comparison — only once split sends exist. */}
      {m.abActive && (
        <div className="mb-4 overflow-x-auto rounded-lg border border-border text-xs">
          <table className="w-full">
            <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">A/B variant</th>
                <th className="px-3 py-2 text-right">Sent</th>
                <th className="px-3 py-2 text-right">Reply %</th>
                <th className="px-3 py-2 text-right">Stop %</th>
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
                    <td className="px-3 py-2 text-right tabular-nums">{p(d.replied)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p(d.stopped)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!m.tracked && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Reply / Stop rates populate once real emails start sending (drafts-only for now). Both are
          marked by hand from the log below — there's no open/click tracking. Sent counts and the
          log are live.
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
                <th className="px-3 py-2 text-left">Course</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-center">A/B</th>
                <th className="px-3 py-2 text-left">
                  <button
                    type="button"
                    onClick={() =>
                      setTimeSort((t) => (t === "desc" ? "asc" : t === "asc" ? null : "desc"))
                    }
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    title="Sort by send time"
                  >
                    Send time
                    {timeSort === "desc" ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : timeSort === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2 text-left">Replied</th>
                <th className="px-3 py-2 text-left">Stopped</th>
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
                    {(() => {
                      const fams = familiesForMatches(
                        s.course_matches,
                        familyMaps[s.campus_id ?? ""],
                      );
                      if (fams.length === 0) return "—";
                      return (
                        <div className="flex flex-wrap gap-1">
                          {fams.map((f) => (
                            <span
                              key={f.label}
                              title={f.code}
                              className="cursor-help rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                            >
                              {f.label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
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
                  <td className="px-3 py-2 tabular-nums">
                    <button
                      type="button"
                      onClick={() => toggleStopped(s)}
                      className={`inline-flex items-center gap-1 hover:underline ${has(s, "stopped_at") ? "text-red-600" : "text-muted-foreground"}`}
                      title={has(s, "stopped_at") ? "Click to unmark STOP" : "Mark as opted out (STOP)"}
                      disabled={s.status !== "sent"}
                    >
                      {has(s, "stopped_at") ? (
                        <>
                          <Ban className="h-3 w-3" />
                          {fmtWhen(has(s, "stopped_at"))}
                        </>
                      ) : s.status === "sent" ? (
                        "mark"
                      ) : (
                        "—"
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reply snippets — reusable canned replies to copy into the inbox. */}
      <details className="mt-6 rounded-lg border border-border">
        <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium">
          Reply snippets ({snippets.length})
        </summary>
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            Save canned replies here, then copy one into your email when a professor replies.
            Answering from your own inbox threads automatically. <code>{"{first_name}"}</code> is a
            manual placeholder — swap in the name before you send.
          </p>
          {snippets.length > 0 && (
            <ul className="space-y-2">
              {snippets.map((s) => (
                <li key={s.id} className="rounded-md border border-border bg-card/60 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => copySnippet(s.body)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600"
                        onClick={() => removeSnippet(s.id)}
                        title="Delete snippet"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-[11px] text-muted-foreground">
                    {s.body}
                  </pre>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2 rounded-md border border-dashed border-border p-2">
            <input
              value={snipName}
              onChange={(e) => setSnipName(e.target.value)}
              placeholder="Snippet name (e.g. Thanks for flagging)"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
            <textarea
              value={snipBody}
              onChange={(e) => setSnipBody(e.target.value)}
              placeholder="Reply text…"
              className="min-h-[90px] w-full rounded-md border border-input bg-background px-2 py-1 text-[13px]"
            />
            <Button size="sm" className="h-8" disabled={snipBusy} onClick={addSnippet}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Save snippet
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}
