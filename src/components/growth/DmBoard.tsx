// THE DM BOARD — one campus, cranked ten DMs at a time.
//
// A sticky bolt in the campus's colors, the campus funnel across the top, then each council with
// its contacts. Per contact: Copy DM (the tracked /s/…?ref= message), a sent tick, live link-click
// and chapter-share counts (from contact_ref_visit), and a reply thread you keep the back-and-forth
// in. Students-per-contact is intentionally absent until the signup wiring lands.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Check, Square, Link as LinkIcon, Landmark, MessageSquare, Send, CornerDownRight, ExternalLink, Loader2, X } from "lucide-react";

import { BottomSheet } from "@/components/growth/BottomSheet";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { schoolByCampusId, boltForSlug } from "@/lib/schools";
import { buildDmMessage } from "@/lib/dm-template";
import {
  growthIgCampus, growthIgMarkSent, growthIgAddMessage, growthIgPopMessage,
  type IgCampus, type IgContact, type ThreadMsg,
} from "@/lib/growth-ig-dm.functions";
import { renderQueryState } from "@/components/growth/QueryState";
import { cn } from "@/lib/utils";

export function DmBoard({ campusId, campusName, onClose }: { campusId: string; campusName: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["ig-campus", campusId], queryFn: () => growthIgCampus({ data: { campusId } }) });
  const school = schoolByCampusId(campusId);
  const c = q.data;
  const slug = school?.slug ?? c?.slug ?? "";
  const courseCode = school?.courseCode ?? c?.courseCode ?? null;
  const { c1, c2 } = boltForSlug(slug);
  const primary = c?.colorPrimary || c1;
  const secondary = c?.colorSecondary || c2;

  return (
    <BottomSheet open onClose={onClose} title={<span className="sa-admin-display text-sm font-semibold">{campusName}</span>}>
      <div className="pb-24">
        {renderQueryState(q)}
        {c && (
          <div className="flex gap-3">
            {/* sticky bolt rail — pinned in the campus colors as the councils scroll */}
            <aside className="sticky top-0 z-10 hidden shrink-0 self-start pt-1 sm:block" style={{ width: 96 }}>
              <div className="flex flex-col items-center gap-1">
                <BoltBoil height={68} red={primary} blue={secondary} />
                <div className="text-center text-[11px] font-semibold leading-tight">{c.name}</div>
                {c.mascot && <div className="text-center text-[9px] text-muted-foreground">{c.mascot}</div>}
                <div className="mt-1 rounded-lg bg-muted/40 px-2 py-1 text-center">
                  <div className="text-[8px] uppercase tracking-wide text-muted-foreground">DMs sent</div>
                  <div className="text-[15px] font-semibold tabular-nums">{c.metrics.dmsSent}</div>
                </div>
              </div>
            </aside>

            <main className="min-w-0 flex-1 space-y-3">
              {/* campus funnel */}
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Stat label="DMs sent" value={c.metrics.dmsSent} />
                <Stat label="Replied" value={c.metrics.replied} />
                <Stat label="Link clicks" value={c.metrics.clicks} accent />
                <Stat label="Chapter opens" value={c.metrics.chapterOpens} accent />
              </div>

              {c.councils.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">No reachable handles yet — add contacts first.</p>
              )}

              {c.councils.map((council) => (
                <div key={council.key} className="rounded-lg border border-border">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
                    <span className="text-[12px] font-semibold">{council.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      sent {council.metrics.sent} · replied {council.metrics.replied} · <LinkIcon className="inline size-2.5" /> {council.metrics.clicks} · <Landmark className="inline size-2.5" /> {council.metrics.chapterOpens}
                    </span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {council.contacts.map((ct) => (
                      <ContactRow key={ct.contactId} contact={ct} councilKey={council.key} slug={slug} courseCode={courseCode} campusId={campusId} />
                    ))}
                  </div>
                </div>
              ))}
            </main>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg px-2.5 py-1.5", accent ? "bg-primary/10" : "bg-muted/40")}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-[16px] font-semibold tabular-nums", accent && "text-primary")}>{value}</div>
    </div>
  );
}

export function ContactRow({ contact, councilKey, slug, courseCode, campusId }: {
  contact: IgContact; councilKey: string; slug: string; courseCode: string | null; campusId: string;
}) {
  const qc = useQueryClient();
  const [openThread, setOpenThread] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ig-campus", campusId] });

  const markSent = useMutation({
    mutationFn: (sent: boolean) => growthIgMarkSent({ data: { contactId: contact.contactId, sent } }),
    onSuccess: invalidate,
  });

  const copyDm = () => {
    if (!slug) { toast.error("This campus isn't in the school list yet — link can't be built."); return; }
    const msg = buildDmMessage({ councilKey, courseCode, slug, contactId: contact.contactId });
    navigator.clipboard.writeText(msg).then(
      () => toast.success("DM copied", { description: contact.sentAt ? undefined : "Paste in Instagram, then tick sent." }),
      () => toast.error("Couldn't copy"),
    );
  };

  // Org rows show just the badge + handle — the name would only repeat "Organization".
  const label = contact.name?.trim() || "";
  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn("rounded px-1.5 py-0.5 text-[8.5px] font-semibold uppercase", contact.isOrg ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary")}>{contact.roleLabel}</span>
        {label && <span className="text-[12px] font-medium">{label}</span>}
        <a href={`https://instagram.com/${contact.handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-pink-400 hover:underline">@{contact.handle} <ExternalLink className="size-2.5" /></a>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={copyDm} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10.5px] font-medium hover:bg-muted"><Copy className="size-3" /> Copy DM</button>
          <button onClick={() => markSent.mutate(!contact.sentAt)} disabled={markSent.isPending} title={contact.sentAt ? "Sent — click to undo" : "Mark sent"}
            className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-medium", contact.sentAt ? "bg-emerald-500/15 text-emerald-400" : "border border-border hover:bg-muted")}>
            {markSent.isPending ? <Loader2 className="size-3 animate-spin" /> : contact.sentAt ? <Check className="size-3" /> : <Square className="size-3" />} sent
          </button>
          <span title="Link clicks" className={cn("inline-flex items-center gap-0.5 text-[11px] tabular-nums", contact.clicks > 0 ? "text-primary" : "text-muted-foreground")}><LinkIcon className="size-3" /> {contact.clicks}</span>
          <span title="Chapter-page opens from their shares" className={cn("inline-flex items-center gap-0.5 text-[11px] tabular-nums", contact.chapterOpens > 0 ? "text-emerald-400" : "text-muted-foreground")}><Landmark className="size-3" /> {contact.chapterOpens}</span>
          <button onClick={() => setOpenThread((v) => !v)} title="Reply thread"
            className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[10.5px] font-medium", contact.repliedAt ? "bg-amber-500/15 text-amber-400" : "border border-border hover:bg-muted")}>
            <MessageSquare className="size-3" /> {contact.repliedAt ? "replied" : "reply"}{contact.thread.length > 0 && ` (${contact.thread.length})`}
          </button>
        </div>
      </div>
      {openThread && <Thread contact={contact} councilKey={councilKey} slug={slug} courseCode={courseCode} onChanged={invalidate} />}
    </div>
  );
}

function Thread({ contact, councilKey, slug, courseCode, onChanged }: {
  contact: IgContact; councilKey: string; slug: string; courseCode: string | null; onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [who, setWho] = useState<"us" | "them">("them");
  const add = useMutation({
    mutationFn: () => growthIgAddMessage({ data: { contactId: contact.contactId, who, text: draft.trim() } }),
    onSuccess: () => { setDraft(""); onChanged(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  const pop = useMutation({
    mutationFn: () => growthIgPopMessage({ data: { contactId: contact.contactId } }),
    onSuccess: onChanged,
  });
  const initialDm = slug ? buildDmMessage({ councilKey, courseCode, slug, contactId: contact.contactId }) : "";

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 p-2.5">
      <div className="flex flex-col gap-1.5">
        {/* the DM you sent — the template, shown as the opening bubble */}
        {initialDm && <Bubble who="us" text={initialDm} muted={!contact.sentAt} />}
        {contact.thread.map((m: ThreadMsg, i) => <Bubble key={i} who={m.who} text={m.text} />)}
        {contact.thread.length > 0 && (
          <button onClick={() => pop.mutate()} disabled={pop.isPending} className="self-end text-[9px] text-muted-foreground hover:text-red-400">undo last</button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded border border-border text-[10px]">
          <button onClick={() => setWho("them")} className={cn("px-2 py-1", who === "them" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>their reply</button>
          <button onClick={() => setWho("us")} className={cn("px-2 py-1", who === "us" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>my reply</button>
        </div>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) add.mutate(); }}
          placeholder={who === "them" ? "paste what they said" : "your reply"} className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px]" />
        <button onClick={() => draft.trim() && add.mutate()} disabled={!draft.trim() || add.isPending} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground disabled:opacity-40">
          {add.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} add
        </button>
      </div>
    </div>
  );
}

function Bubble({ who, text, muted }: { who: "us" | "them"; text: string; muted?: boolean }) {
  const us = who === "us";
  return (
    <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-xl px-2.5 py-1.5 text-[11px]", us ? "self-end bg-primary/15 text-foreground" : "self-start border border-border bg-background", muted && "opacity-60")}>
      {!us && <CornerDownRight className="mr-1 inline size-2.5 text-muted-foreground" />}{text}
    </div>
  );
}
