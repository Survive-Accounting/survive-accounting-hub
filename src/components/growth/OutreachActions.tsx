// Fast manual outreach actions from any entity/contact. One click records an
// event with the current timestamp — no giant form. Follow-up / note use a tiny
// inline field. Everything writes growth_outreach_events via server fns.
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  AtSign,
  CalendarClock,
  Instagram,
  MessageSquare,
  Phone,
  Reply,
  StickyNote,
} from "lucide-react";
import { logOutreachEvent, setFollowUp } from "@/lib/growth-outreach.functions";
import { useGrowthWho } from "@/components/growth/shared";

export type OutreachTarget = {
  contactId?: string | null;
  entityType?: "campus" | "chapter" | "council" | "org" | null;
  entityId?: string | null;
  campusId?: string | null;
  councilSlug?: string | null;
};

export function OutreachActions({
  target,
  onLogged,
  compact,
}: {
  target: OutreachTarget;
  onLogged?: () => void;
  compact?: boolean;
}) {
  const { who } = useGrowthWho();
  const logEvent = useServerFn(logOutreachEvent);
  const doFollowUp = useServerFn(setFollowUp);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<null | "note" | "followup">(null);
  const [text, setText] = useState("");
  const [days, setDays] = useState(3);

  const base = { ...target, who: who ?? undefined };

  const quick = async (
    channel: "email" | "ig_dm" | "text" | "call" | "other",
    status: string,
    label: string,
    direction: "outbound" | "inbound" = "outbound",
  ) => {
    setBusy(true);
    try {
      const res = (await logEvent({
        data: { ...base, channel, status: status as never, direction },
      })) as { ok: boolean; error?: string; storageReady?: boolean };
      if (!res.ok) {
        toast.error(
          res.storageReady === false
            ? "Apply the growth migration to log outreach"
            : (res.error ?? "Failed"),
        );
      } else {
        toast.success(label);
        onLogged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = (await logEvent({
        data: { ...base, channel: "other", status: "logged" as never, notes: text.trim() },
      })) as { ok: boolean; error?: string; storageReady?: boolean };
      if (!res.ok)
        toast.error(
          res.storageReady === false ? "Apply the growth migration first" : (res.error ?? "Failed"),
        );
      else {
        toast.success("Note added");
        setText("");
        setMode(null);
        onLogged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const saveFollowUp = async () => {
    setBusy(true);
    try {
      const when = new Date();
      when.setDate(when.getDate() + days);
      const res = (await doFollowUp({
        data: { ...base, nextFollowUpAt: when.toISOString(), note: text.trim() || undefined },
      })) as { ok: boolean; error?: string; storageReady?: boolean };
      if (!res.ok)
        toast.error(
          res.storageReady === false ? "Apply the growth migration first" : (res.error ?? "Failed"),
        );
      else {
        toast.success(`Follow-up set for ${days}d`);
        setText("");
        setMode(null);
        onLogged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent/50 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          className={btn}
          disabled={busy}
          onClick={() => quick("ig_dm", "sent", "IG DM logged")}
        >
          <Instagram className="h-3.5 w-3.5" /> IG DM
        </button>
        <button
          className={btn}
          disabled={busy}
          onClick={() => quick("email", "sent", "Email logged")}
        >
          <AtSign className="h-3.5 w-3.5" /> Email
        </button>
        <button
          className={btn}
          disabled={busy}
          onClick={() => quick("text", "sent", "Text logged")}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Text
        </button>
        <button
          className={btn}
          disabled={busy}
          onClick={() => quick("call", "no_answer", "Call logged")}
        >
          <Phone className="h-3.5 w-3.5" /> Call
        </button>
        <button
          className={btn}
          disabled={busy}
          onClick={() => quick("other", "replied", "Reply logged", "inbound")}
        >
          <Reply className="h-3.5 w-3.5" /> Reply
        </button>
        <button
          className={btn}
          disabled={busy}
          onClick={() => setMode(mode === "followup" ? null : "followup")}
        >
          <CalendarClock className="h-3.5 w-3.5" /> Follow-up
        </button>
        {!compact && (
          <button
            className={btn}
            disabled={busy}
            onClick={() => setMode(mode === "note" ? null : "note")}
          >
            <StickyNote className="h-3.5 w-3.5" /> Note
          </button>
        )}
      </div>

      {mode === "note" && (
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Quick note…"
            className="h-8 flex-1 rounded-md border px-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && saveNote()}
            autoFocus
          />
          <button className={btn} disabled={busy || !text.trim()} onClick={saveNote}>
            Save
          </button>
        </div>
      )}
      {mode === "followup" && (
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-8 rounded-md border px-2 text-sm"
          >
            <option value={1}>Tomorrow</option>
            <option value={3}>In 3 days</option>
            <option value={7}>In 1 week</option>
            <option value={14}>In 2 weeks</option>
            <option value={30}>In 1 month</option>
          </select>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reason (optional)…"
            className="h-8 flex-1 rounded-md border px-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && saveFollowUp()}
          />
          <button className={btn} disabled={busy} onClick={saveFollowUp}>
            Set
          </button>
        </div>
      )}
    </div>
  );
}
