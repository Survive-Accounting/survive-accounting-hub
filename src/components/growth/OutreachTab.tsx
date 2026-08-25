// OUTREACH tab — King's (and Lee's) work surface for one campus.
// Entity tree → checkboxes → queue assembly → full preview of EVERY rendered
// email → per-item Approve / Edit / Wrong data / Skip → one explicit
// "Send N approved" action. Instagram handles are shown + manually logged
// (no Meta automation — deliberately not faked).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Instagram, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  growthAssembleQueue,
  growthCampusOutreachHistory,
  growthLogDm,
  growthOutreachContacts,
  growthQueueAction,
  growthQueueList,
  growthSendApproved,
  growthTemplates,
  type GrowthQueueItem,
  type OutreachEntity,
} from "@/lib/growth-queue.functions";
import { Pill, Section } from "@/components/growth/shared";
import { cn } from "@/lib/utils";

const CLASS_LABEL: Record<string, string> = {
  CURRENT_HIGH: "HIGH CONFIDENCE",
  USABLE: "USABLE",
  VERIFY: "VERIFY",
  SOCIAL: "SOCIAL",
  ADVISORY: "ADVISORY",
};
const CLASS_TONE: Record<string, string> = {
  CURRENT_HIGH: "text-emerald-600 bg-emerald-500/10",
  USABLE: "text-sky-600 bg-sky-500/10",
  VERIFY: "text-amber-600 bg-amber-500/10",
  SOCIAL: "text-fuchsia-600 bg-fuchsia-500/10",
  ADVISORY: "text-muted-foreground bg-muted",
};

export function OutreachTab({ campusId, campusName }: { campusId: string; campusName: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set()); // qc ids
  const [templateKey, setTemplateKey] = useState<string>("council_intro_v1");
  const [previewing, setPreviewing] = useState(false);

  const contacts = useQuery({
    queryKey: ["growth-outreach-contacts", campusId],
    queryFn: () => growthOutreachContacts({ data: { campusId } }),
  });
  const templates = useQuery({ queryKey: ["growth-templates"], queryFn: () => growthTemplates() });
  const history = useQuery({
    queryKey: ["growth-outreach-history", campusId],
    queryFn: () => growthCampusOutreachHistory({ data: { campusId } }),
  });
  const queue = useQuery({
    queryKey: ["growth-queue", campusId],
    queryFn: () => growthQueueList({ data: { campusId } }),
  });

  const campaignId = `campus-${campusId.slice(0, 8)}`;
  const assemble = useMutation({
    mutationFn: () =>
      growthAssembleQueue({ data: { campusId, qcIds: [...selected], templateKey, campaignId } }),
    onSuccess: (r) => {
      toast.success(`${r.queued} emails queued${r.held.length ? ` · ${r.held.length} held` : ""}`);
      if (r.held.length) {
        for (const h of r.held.slice(0, 5))
          toast.info(`Held ${h.email ?? h.name ?? "contact"}: ${h.reason.replace(/_/g, " ")}`);
      }
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["growth-queue", campusId] });
      setPreviewing(true);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Queue assembly failed"),
  });
  const logDm = useMutation({
    mutationFn: (v: {
      chapterId?: string | null;
      councilType?: string | null;
      qcId?: string | null;
    }) => growthLogDm({ data: { campusId, ...v, note: "manual DM logged from dashboard" } }),
    onSuccess: () => {
      toast.success("DM logged");
      qc.invalidateQueries({ queryKey: ["growth-outreach-history", campusId] });
    },
  });

  const entities = contacts.data?.entities ?? [];
  const selectableCount = useMemo(
    () =>
      entities
        .flatMap((e) => e.contacts)
        .filter(
          (c) => c.email && c.outreachEligible && c.class !== "VERIFY" && c.class !== "ADVISORY",
        ).length,
    [entities],
  );
  const queued = queue.data?.items ?? [];

  const toggleEntity = (e: OutreachEntity, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const def = e.contacts.find((c) => c.isDefault);
      if (def) {
        if (on) next.add(def.qcId);
        else for (const c of e.contacts) next.delete(c.qcId);
      }
      return next;
    });
  };

  if (contacts.isLoading)
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading contacts…
      </div>
    );

  return (
    <div className="space-y-4">
      {history.data && (history.data.emailsSent > 0 || history.data.igDms > 0) && (
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <Stat label="Emails sent" v={history.data.emailsSent} />
          <Stat label="Replies" v={history.data.replies} />
          <Stat label="Positive" v={history.data.positive} />
          <Stat label="IG DMs" v={history.data.igDms} />
          <Stat label="Follow-ups due" v={history.data.followUpsDue} />
        </div>
      )}

      {queued.length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <div className="text-xs font-medium">
            {queued.length} emails in the queue for {campusName}
          </div>
          <button
            onClick={() => setPreviewing(true)}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
          >
            Preview queue
          </button>
        </div>
      )}

      <Section title="Choose recipients">
        {entities.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No legitimate contacts on file for this campus yet — run ✨ Enrichment (council
            contacts) first.
          </div>
        )}
        <div className="space-y-2">
          {entities.map((e) => {
            const def = e.contacts.find((c) => c.isDefault);
            const entityChecked =
              def != null &&
              selected.has(def.qcId) &&
              ![...e.contacts.filter((c) => !c.isDefault)].some((c) => selected.has(c.qcId));
            return (
              <div key={e.key} className="rounded-md border border-border p-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    disabled={!def}
                    checked={entityChecked || e.contacts.some((c) => selected.has(c.qcId))}
                    onChange={(ev) => toggleEntity(e, ev.target.checked)}
                  />
                  {e.label}
                  {e.sublabel && (
                    <span className="font-normal text-muted-foreground">{e.sublabel}</span>
                  )}
                  {!def && (
                    <span className="font-normal text-[10px] text-amber-600">
                      no auto-pickable email
                    </span>
                  )}
                </label>
                <div className="mt-1 space-y-0.5 pl-6">
                  {e.contacts.map((c) => (
                    <div key={c.qcId} className="flex items-center gap-2 text-[11px]">
                      {c.email ? (
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selected.has(c.qcId)}
                            disabled={
                              !c.outreachEligible || c.class === "VERIFY" || c.class === "ADVISORY"
                            }
                            onChange={(ev) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (ev.target.checked) next.add(c.qcId);
                                else next.delete(c.qcId);
                                return next;
                              })
                            }
                          />
                          <Mail className="size-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{c.email}</span>
                          {c.name && (
                            <span className="truncate text-muted-foreground">
                              · {c.name}
                              {c.role ? ` (${c.role})` : ""}
                            </span>
                          )}
                        </label>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-[18px]">
                          <Instagram className="size-3 shrink-0 text-muted-foreground" />
                          {c.instagram ? (
                            <a
                              href={
                                c.instagram.startsWith("http")
                                  ? c.instagram
                                  : `https://instagram.com/${c.instagram.replace(/^@/, "")}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="truncate underline"
                            >
                              {c.instagram}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">no reachable path</span>
                          )}
                          {c.instagram && (
                            <button
                              onClick={() =>
                                logDm.mutate({
                                  chapterId: c.chapterId,
                                  councilType: c.councilType,
                                  qcId: c.qcId,
                                })
                              }
                              className="shrink-0 rounded border border-border px-1.5 text-[10px] hover:bg-muted"
                            >
                              Log DM
                            </button>
                          )}
                        </span>
                      )}
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold",
                          CLASS_TONE[c.class],
                        )}
                        title={
                          c.class === "VERIFY"
                            ? "Named officer without current-term evidence — verify before use"
                            : undefined
                        }
                      >
                        {CLASS_LABEL[c.class]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {entities.length > 0 && (
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background py-2">
          <select
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
          >
            {(templates.data?.templates ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => assemble.mutate()}
            disabled={selected.size === 0 || assemble.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {assemble.isPending
              ? "Assembling…"
              : `Build queue (${selected.size} selected · ${selectableCount} selectable)`}
          </button>
        </div>
      )}

      {history.data && history.data.timeline.length > 0 && (
        <Section title="Recent activity">
          <div className="space-y-1">
            {history.data.timeline.slice(0, 12).map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 shrink-0 text-muted-foreground">
                  {new Date(t.at).toISOString().slice(5, 10)}
                </span>
                <span>{t.label}</span>
                {t.note && <span className="truncate text-muted-foreground">· {t.note}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {previewing && (
        <QueuePreview
          campusId={campusId}
          campaignId={campaignId}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <div className="text-base font-semibold">{v}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// Full-queue preview: every rendered email, one at a time, with actions.
// ---------------------------------------------------------------------------------

function QueuePreview({
  campusId,
  campaignId,
  onClose,
}: {
  campusId: string;
  campaignId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [editDraft, setEditDraft] = useState<{ subject: string; body: string } | null>(null);
  const queue = useQuery({
    queryKey: ["growth-queue", campusId],
    queryFn: () => growthQueueList({ data: { campusId } }),
  });
  const items = queue.data?.items ?? [];
  const item: GrowthQueueItem | undefined = items[Math.min(idx, Math.max(0, items.length - 1))];
  const approvedCount = items.filter((i) => i.approvedBy).length;
  const readyCount = items.filter((i) => !i.needsReview).length;

  const act = useMutation({
    mutationFn: (v: {
      action: "approve" | "unapprove" | "skip" | "edit" | "wrong_data";
      subject?: string;
      body?: string;
      note?: string;
    }) => growthQueueAction({ data: { eventId: item!.id, ...v } }),
    onSuccess: () => {
      setEditDraft(null);
      qc.invalidateQueries({ queryKey: ["growth-queue", campusId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });
  const approveAllReady = useMutation({
    mutationFn: async () => {
      for (const i of items.filter((x) => !x.needsReview && !x.approvedBy)) {
        await growthQueueAction({ data: { eventId: i.id, action: "approve" } });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth-queue", campusId] }),
  });
  const send = useMutation({
    mutationFn: () => growthSendApproved({ data: { campaignId } }),
    onSuccess: (r) => {
      toast.success(`Sent ${r.sent} · failed ${r.failed} · skipped ${r.skipped}`);
      qc.invalidateQueries({ queryKey: ["growth-queue", campusId] });
      qc.invalidateQueries({ queryKey: ["growth-outreach-history", campusId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="text-sm font-semibold">Outreach queue · {items.length} emails</div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Queue is empty.</div>
        ) : item ? (
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-30"
              >
                <ChevronLeft className="size-3.5" /> Previous
              </button>
              <div className="text-xs text-muted-foreground">
                {Math.min(idx + 1, items.length)} / {items.length}
              </div>
              <button
                onClick={() => setIdx((i) => Math.min(items.length - 1, i + 1))}
                disabled={idx >= items.length - 1}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-30"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            </div>
            <div className="rounded-md border border-border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">To: {item.to}</span>
                <span className="text-muted-foreground">
                  · {item.entityLabel ?? item.entityType}
                </span>
                <span className="text-muted-foreground">· {item.templateId}</span>
                {item.approvedBy ? (
                  <Pill status="active">Approved</Pill>
                ) : item.needsReview ? (
                  <Pill status="paused">⚠ Review</Pill>
                ) : (
                  <Pill>Ready</Pill>
                )}
              </div>
              {item.needsReview && item.reviewNote && (
                <div className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700">
                  {item.reviewNote}
                </div>
              )}
              {editDraft ? (
                <div className="mt-2 space-y-2">
                  <input
                    value={editDraft.subject}
                    onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })}
                    className="w-full rounded border border-border bg-card px-2 py-1 text-xs"
                  />
                  <textarea
                    value={editDraft.body}
                    onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })}
                    rows={12}
                    className="w-full rounded border border-border bg-card px-2 py-1 font-mono text-[11px]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        act.mutate({
                          action: "edit",
                          subject: editDraft.subject,
                          body: editDraft.body,
                        })
                      }
                      className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                    >
                      Save edit
                    </button>
                    <button
                      onClick={() => setEditDraft(null)}
                      className="rounded border border-border px-2 py-1 text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 border-t border-border pt-2 font-medium">{item.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                    {item.body}
                  </pre>
                </>
              )}
            </div>
            {!editDraft && (
              <div className="flex flex-wrap gap-2">
                {item.approvedBy ? (
                  <button
                    onClick={() => act.mutate({ action: "unapprove" })}
                    className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    Un-approve
                  </button>
                ) : (
                  <button
                    onClick={() => act.mutate({ action: "approve" })}
                    className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                )}
                <button
                  onClick={() =>
                    setEditDraft({ subject: item.subject ?? "", body: item.body ?? "" })
                  }
                  className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    const note =
                      window.prompt("What's wrong with this contact's data?") ?? undefined;
                    act.mutate({ action: "wrong_data", note });
                  }}
                  className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  Wrong data
                </button>
                <button
                  onClick={() => act.mutate({ action: "skip" })}
                  className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        ) : null}
        {items.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <button
              onClick={() => approveAllReady.mutate()}
              disabled={approveAllReady.isPending || readyCount === 0}
              className="rounded border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
            >
              {approveAllReady.isPending
                ? "Approving…"
                : `Approve ${items.filter((x) => !x.needsReview && !x.approvedBy).length} ready`}
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Send ${approvedCount} approved emails now?`)) send.mutate();
              }}
              disabled={send.isPending || approvedCount === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {send.isPending ? "Sending…" : `Send ${approvedCount} approved`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
