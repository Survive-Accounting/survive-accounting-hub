// /admin/growth/outreach — the work queue. Feels like a to-do list, not
// Salesforce: Follow up today · Overdue · Never contacted · Recently replied.
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RotateCw } from "lucide-react";
import { getOutreachQueue, type QueueView } from "@/lib/growth-outreach.functions";
import {
  ChannelPill,
  EmptyRow,
  LoadingRow,
  Pill,
  StorageBanner,
  fmtDate,
  relTime,
} from "@/components/growth/shared";
import { OutreachActions } from "@/components/growth/OutreachActions";

type Search = { view?: string };

export const Route = createFileRoute("/admin/growth/outreach")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    view: typeof s.view === "string" ? s.view : undefined,
  }),
  component: OutreachPage,
});

const VIEWS: { key: QueueView; label: string }[] = [
  { key: "today", label: "Follow up today" },
  { key: "overdue", label: "Overdue" },
  { key: "never", label: "Never contacted" },
  { key: "replied", label: "Recently replied" },
];

function OutreachPage() {
  const search = Route.useSearch();
  const [view, setView] = useState<QueueView>((search.view as QueueView) ?? "today");
  const [channel, setChannel] = useState<string>("all");

  const query = useQuery({
    queryKey: ["growth-queue", view, channel],
    queryFn: () =>
      getOutreachQueue({
        data: { view, channel: channel === "all" ? undefined : (channel as never) },
      }),
    placeholderData: keepPreviousData,
  });
  const items = query.data?.items ?? [];
  const counts = query.data?.counts;
  const storageReady = query.data?.storageReady ?? true;

  return (
    <div className="space-y-4">
      {!storageReady && <StorageBanner />}

      <div className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === v.key ? "bg-primary text-primary-foreground" : "border hover:bg-accent/40"}`}
          >
            {v.label}
            {counts && (
              <span
                className={`rounded-full px-1.5 text-xs ${view === v.key ? "bg-primary-foreground/20" : "bg-muted"}`}
              >
                {counts[v.key]}
              </span>
            )}
          </button>
        ))}
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All channels</option>
          <option value="email">Email</option>
          <option value="ig_dm">IG DM</option>
          <option value="text">Text</option>
          <option value="call">Call</option>
        </select>
        <button
          onClick={() => query.refetch()}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/40"
        >
          <RotateCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <tbody>
            {query.isLoading ? (
              <LoadingRow colSpan={2} />
            ) : items.length === 0 ? (
              <EmptyRow colSpan={2}>
                {view === "today"
                  ? "Nothing due today. 🎉"
                  : view === "overdue"
                    ? "Nothing overdue."
                    : view === "never"
                      ? "Every greek-ready campus has been contacted."
                      : "No replies in the last two weeks."}
              </EmptyRow>
            ) : (
              items.map((it) => (
                <tr key={it.key} className="border-b last:border-0 align-top hover:bg-accent/20">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{it.label}</span>
                      {it.event && <ChannelPill channel={it.event.channel} />}
                      {it.event && <Pill status={it.event.status} />}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {it.campusName && <span>{it.campusName}</span>}
                      {it.sublabel && (
                        <span>
                          {it.campusName ? " · " : ""}
                          {it.sublabel}
                        </span>
                      )}
                      {it.dueAt && (view === "today" || view === "overdue") && (
                        <span className={view === "overdue" ? "text-rose-600" : "text-amber-600"}>
                          {" "}
                          · due {fmtDate(it.dueAt)}
                        </span>
                      )}
                      {it.event && view === "replied" && (
                        <span> · {relTime(it.event.occurredAt)}</span>
                      )}
                    </div>
                  </td>
                  <td className="w-px whitespace-nowrap px-3 py-2.5">
                    <OutreachActions
                      compact
                      target={
                        it.kind === "campus"
                          ? {
                              entityType: "campus",
                              entityId: it.campusId ?? null,
                              campusId: it.campusId ?? null,
                            }
                          : {
                              contactId: it.event?.contactId ?? null,
                              entityType: (it.event?.entityType as never) ?? null,
                              entityId: it.event?.entityId ?? null,
                              campusId: it.event?.campusId ?? null,
                            }
                      }
                      onLogged={() => query.refetch()}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
