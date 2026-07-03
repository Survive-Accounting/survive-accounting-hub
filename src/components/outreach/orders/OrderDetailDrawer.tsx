// Right-side detail drawer for an order. Opens on row click (parent passes a
// short_ref), closes on Esc / backdrop. Shows the monospace receipt, student
// contact, chapters, and admin controls (status, syllabus toggle, notes autosave,
// copy order link). All writes go through the service-role admin server fns.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Loader2, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrder, updateOrderStatus, updateOrderAdminNotes, setAwaitingSyllabus,
  getOrderTimeline, advanceOrderStage,
  type AdminOrderDetail, type AdminStageEvent,
} from "@/lib/orders-admin.functions";

const NAVY = "#14213D";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const STATUSES = ["new", "in_progress", "delivered", "paid", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = {
  new: "New", in_progress: "In progress", delivered: "Delivered", paid: "Paid", cancelled: "Cancelled",
};
const STATUS_CLASS: Record<string, string> = {
  new: "bg-sky-100 text-sky-700",
  in_progress: "bg-amber-100 text-amber-700",
  delivered: "bg-violet-100 text-violet-700",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-200 text-gray-600",
};
const TIER_LABEL: Record<string, string> = {
  free_teaser: "Free teaser", made_to_order: "Help Video request", one_on_one: "Premium 1-on-1",
  something_else: "Something else",
};
const STAGE_DISPLAY: Record<string, string> = {
  request_received: "Request received", reviewing: "Reviewing your class",
  preview_in_progress: "Preview in progress", preview_ready: "Preview ready",
  unlocked: "Unlocked", delivered: "Delivered", post_exam_check_in: "Post-exam check-in",
};
const ADMIN_STAGE_OPTS: [string, string][] = [
  ["reviewing", "Reviewing your class"], ["preview_in_progress", "Preview in progress"],
  ["preview_ready", "Preview ready"], ["unlocked", "Unlocked"], ["delivered", "Delivered"],
  ["post_exam_check_in", "Post-exam check-in"],
];
const money = (c: number) => `$${Math.round((c ?? 0) / 100)}`;
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`)).catch(() => toast.error("Copy failed"));
}

const humanSize = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Student uploads live in the private student-syllabi bucket; only authenticated
// admins can read, so sign a short-lived URL on click and open it in a new tab.
async function openAttachment(path: string) {
  const { data, error } = await supabase.storage.from("student-syllabi").createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) { toast.error("Couldn’t open file"); return; }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function OrderDetailDrawer({ shortRef, onClose, onChanged }: {
  shortRef: string | null; onClose: () => void; onChanged: () => void;
}) {
  const getFn = useServerFn(getOrder);
  const statusFn = useServerFn(updateOrderStatus);
  const notesFn = useServerFn(updateOrderAdminNotes);
  const syllabusFn = useServerFn(setAwaitingSyllabus);

  const q = useQuery({
    queryKey: ["admin-order", shortRef],
    queryFn: () => getFn({ data: { short_ref: shortRef! } }),
    enabled: !!shortRef,
  });
  const order = q.data as AdminOrderDetail | null | undefined;

  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNotes(order?.admin_notes ?? ""); setNotesSaved(false); }, [order?.short_ref, order?.admin_notes]);

  useEffect(() => {
    if (!shortRef) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortRef, onClose]);

  if (!shortRef) return null;

  const refresh = async () => { await q.refetch(); onChanged(); };

  const changeStatus = async (status: (typeof STATUSES)[number]) => {
    if (!order) return;
    setBusy(true);
    try { await statusFn({ data: { short_ref: order.short_ref, status } }); await refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const toggleSyllabus = async (received: boolean) => {
    if (!order) return;
    setBusy(true);
    try { await syllabusFn({ data: { short_ref: order.short_ref, value: !received } }); await refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const saveNotes = async () => {
    if (!order || notes === (order.admin_notes ?? "")) return;
    try { await notesFn({ data: { short_ref: order.short_ref, admin_notes: notes } }); setNotesSaved(true); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-3">
          <span className="text-sm font-semibold" style={{ color: NAVY }}>Order #{shortRef}</span>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>

        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : !order ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Order not found.</div>
        ) : (
          <div className="space-y-6 p-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
            {/* LEFT: receipt + contact + chapters */}
            <div className="space-y-5">
              {/* receipt */}
              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span style={{ fontFamily: MONO, fontWeight: 700, color: NAVY }}>#{order.short_ref}</span>
                  <StatusPill status={order.status} />
                </div>
                <p className="mb-3 text-[11px] text-muted-foreground" style={{ fontFamily: MONO }}>Created {fmtDateTime(order.created_at)}</p>
                <div className="space-y-1">
                  <Row label="SCHOOL" value={order.campus_name || order.campus_text || "—"} />
                  <Row label="COURSE" value={[order.course_code, order.course_name].filter(Boolean).join(" · ") || "—"} />
                  <Row label="PROFESSOR" value={order.professor_name || "—"} />
                  <Row label="TEXTBOOK" value={order.textbook_name || "—"} />
                  <Row label="CHAPTERS" value={order.chapter_count_only != null ? String(order.chapter_count_only) : (order.chapter_count != null ? String(order.chapter_count) : "—")} />
                  <Row label="EXAM" value={order.exam_date ? fmtDate(order.exam_date) : order.exam_timeframe ? order.exam_timeframe.replace(/_/g, " ") : "—"} />
                </div>
                <div className="my-2 border-t border-dashed border-gray-300" />
                <div className="space-y-1">
                  <Row label="PRE-ORDER" value={money(order.subtotal_cents)} strong />
                  {order.rush && <Row label="RUSH" value={money(order.rush_fee_cents)} />}
                  <Row label="TOTAL" value={money(order.total_cents)} strong />
                  <Row label="DELIVERY TARGET" value={order.delivery_target_date ? `by ${fmtDate(order.delivery_target_date)}` : (order.awaiting_syllabus ? "TBD (syllabus pending)" : "—")} />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground" style={{ fontFamily: MONO }}>
                  Tier: {TIER_LABEL[order.tier] ?? order.tier}
                  {(order.requested_options?.length ?? 0) > 1 && (
                    <> · Requested: {order.requested_options!.map((o) => TIER_LABEL[o] ?? o).join(", ")}</>
                  )}
                </p>
              </div>

              {/* contact */}
              <div className="rounded-2xl border p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student</p>
                <p className="text-sm font-medium">{[order.first_name, order.last_name].filter(Boolean).join(" ") || "—"}</p>
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <a href={`mailto:${order.email}`} className="text-primary hover:underline">{order.email}</a>
                    <button onClick={() => copy(order.email, "Email")} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`tel:${order.phone}`} className="text-primary hover:underline">{order.phone}</a>
                    <button onClick={() => copy(order.phone, "Phone")} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {order.interested_in_group && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    Interested in group{order.group_size ? ` — ${order.group_size} classmates` : ""}
                  </div>
                )}
              </div>

              {/* chapters */}
              <div className="rounded-2xl border p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chapters</p>
                {order.chapters.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {order.chapters.map((c, i) => (
                      <li key={i} className="border-b pb-2 last:border-0 last:pb-0">
                        <span className="font-medium">{c.chapter_number != null ? `Ch ${c.chapter_number}: ` : ""}{c.chapter_label}</span>
                        {c.struggle_note && <span className="block text-xs text-muted-foreground">“{c.struggle_note}”</span>}
                      </li>
                    ))}
                  </ul>
                ) : order.chapter_count_only != null ? (
                  <p className="text-sm text-amber-700">Awaiting syllabus for chapter details ({order.chapter_count_only} chapter{order.chapter_count_only === 1 ? "" : "s"}).</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No chapters.</p>
                )}
              </div>

              {/* student note + uploaded files ("Provide more detail" from /order) */}
              {(order.special_requests || (order.attachments_json?.length ?? 0) > 0) && (
                <div className="rounded-2xl border p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student note &amp; files</p>
                  {order.special_requests && (
                    <p className="whitespace-pre-wrap text-sm text-foreground">“{order.special_requests}”</p>
                  )}
                  {(order.attachments_json?.length ?? 0) > 0 && (
                    <ul className={`space-y-1.5 ${order.special_requests ? "mt-3" : ""}`}>
                      {order.attachments_json!.map((a) => (
                        <li key={a.path}>
                          <button type="button" onClick={() => openAttachment(a.path)}
                            className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate">{a.name}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{humanSize(a.size)}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: admin controls */}
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <div className="flex flex-col gap-1.5">
                  {STATUSES.map((s) => (
                    <Button key={s} size="sm" variant={order.status === s ? "default" : "outline"}
                      disabled={busy || order.status === s} onClick={() => changeStatus(s)} className="justify-start">
                      {STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={!order.awaiting_syllabus} disabled={busy}
                  onChange={(e) => toggleSyllabus(e.target.checked)} />
                Syllabus received
              </label>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin notes</p>
                <textarea rows={5} value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
                  onBlur={saveNotes}
                  placeholder="Internal notes…"
                  className="w-full rounded-lg border border-input bg-background p-2 text-sm" />
                {notesSaved && <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check className="h-3 w-3" /> Saved</p>}
              </div>

              <Button size="sm" variant="outline" className="w-full gap-1.5"
                onClick={() => copy(`${window.location.origin}/order/${order.short_ref}`, "Order link")}>
                <Copy className="h-3.5 w-3.5" /> Copy order link
              </Button>
            </div>
            </div>

            <OrderTimeline shortRef={order.short_ref} onChanged={onChanged} />
          </div>
        )}
      </div>
    </div>
  );
}

// Help Video stage timeline + "Advance stage" (emails the student).
function OrderTimeline({ shortRef, onChanged }: { shortRef: string; onChanged: () => void }) {
  const timelineFn = useServerFn(getOrderTimeline);
  const advanceFn = useServerFn(advanceOrderStage);
  const q = useQuery({ queryKey: ["order-timeline", shortRef], queryFn: () => timelineFn({ data: { short_ref: shortRef } }) });
  const events = (q.data ?? []) as AdminStageEvent[];

  const [stage, setStage] = useState("reviewing");
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [unlockDollars, setUnlockDollars] = useState("");
  const [unlockUrl, setUnlockUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!msg.trim()) { toast.error("Add a student-visible message — it's emailed to the student."); return; }
    setBusy(true);
    try {
      const cents = unlockDollars.trim() ? Math.round(Number(unlockDollars) * 100) : null;
      const r = await advanceFn({
        data: {
          short_ref: shortRef, stage, student_visible_message: msg.trim(),
          note: note.trim() || null, preview_url: previewUrl.trim() || null,
          unlock_price_cents: Number.isFinite(cents as number) ? cents : null, unlock_url: unlockUrl.trim() || null,
        },
      });
      toast.success(`Update added. Email: ${r.email.ok ? "sent" : (r.email.error ?? "not sent")}.`);
      setMsg(""); setNote(""); setPreviewUrl(""); setUnlockDollars(""); setUnlockUrl("");
      await q.refetch(); onChanged();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const showPreviewFields = stage === "preview_ready" || stage === "unlocked";

  return (
    <div className="rounded-2xl border p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</p>
      {q.isLoading ? (
        <div className="py-3 text-center text-xs text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stage events yet.</p>
      ) : (
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 pl-3" style={{ borderColor: NAVY }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: NAVY }}>{STAGE_DISPLAY[e.stage] ?? e.stage}</span>
                <span className="text-[11px] text-muted-foreground">{fmtDateTime(e.created_at)}</span>
              </div>
              {e.student_visible_message && <p className="mt-0.5 text-sm text-gray-700">{e.student_visible_message}</p>}
              {e.preview_url && <a href={e.preview_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">preview link</a>}
              {e.unlock_price_cents != null && <p className="text-xs text-muted-foreground">Unlock: {money(e.unlock_price_cents)}</p>}
              {e.note && <p className="mt-0.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800"><span className="font-semibold">Admin only:</span> {e.note}</p>}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 space-y-2 border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Advance stage</p>
        <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={stage} onChange={(e) => setStage(e.target.value)}>
          {ADMIN_STAGE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Student-visible message (emailed to the student)…"
          className="w-full rounded-md border border-input bg-background p-2 text-sm" />
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin-only note (optional)…"
          className="w-full rounded-md border border-input bg-background p-2 text-sm" />
        {showPreviewFields && (
          <>
            <Input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="Preview URL (Loom/video)…" className="h-9 text-sm" />
            <div className="flex gap-2">
              <Input value={unlockDollars} onChange={(e) => setUnlockDollars(e.target.value)} placeholder="Unlock $ (e.g. 75)" type="number" className="h-9 text-sm" />
              <Input value={unlockUrl} onChange={(e) => setUnlockUrl(e.target.value)} placeholder="Unlock URL (optional)" className="h-9 text-sm" />
            </div>
          </>
        )}
        <Button size="sm" className="w-full" onClick={submit} disabled={busy}>
          {busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Adding…</> : "Add update"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5" style={{ fontFamily: MONO, fontSize: "12.5px", color: strong ? NAVY : "#374151" }}>
      <span className={strong ? "font-bold" : ""}>{label}</span>
      <span className="mb-[3px] flex-1 border-b border-dotted border-gray-400" />
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
export function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[status] ?? status}</span>;
}
