// Right-side detail drawer for an order. Opens on row click (parent passes a
// short_ref), closes on Esc / backdrop. Shows the monospace receipt, student
// contact, chapters, and admin controls (status, syllabus toggle, notes autosave,
// copy order link). All writes go through the service-role admin server fns.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getOrder, updateOrderStatus, updateOrderAdminNotes, setAwaitingSyllabus,
  type AdminOrderDetail,
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
  free_teaser: "Free teaser", made_to_order: "Pre-order (Cram Pack)", one_on_one: "Premium 1-on-1",
};
const money = (c: number) => `$${Math.round((c ?? 0) / 100)}`;
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`)).catch(() => toast.error("Copy failed"));
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
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_240px]">
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
                <p className="mt-2 text-[11px] text-muted-foreground" style={{ fontFamily: MONO }}>Tier: {TIER_LABEL[order.tier] ?? order.tier}</p>
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
        )}
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
