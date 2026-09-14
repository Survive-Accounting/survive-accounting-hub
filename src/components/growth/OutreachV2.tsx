// OUTREACH V2 — /admin/dm-v2. See lib/outreach-v2.ts for Lee's brief.
//
// Campuses in priority order (▲▼ to rearrange, saved) → a campus opens in a bottom sheet → the three
// councils, each with its three slots (org Instagram · president · scholarship chair) and a toggle
// for its chapters, biggest first → a chapter opens its own three slots. Every slot: the handle,
// Copy DM, Copy link, Open DM, and a Sent tick. Paste / upload a roster or download the template
// from the campus sheet.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import { Check, ChevronDown, ChevronRight, ClipboardPaste, Copy, Download, ExternalLink, Link as LinkIcon, Loader2, Upload, User } from "lucide-react";

import { ActivityFeed } from "@/components/growth/ActivityFeed";
import { BottomSheet } from "@/components/growth/BottomSheet";
import { dmConsoleSaveRoster } from "@/lib/king-dm.functions";
import { ROSTER_HEADERS, bareIg, parseRoster, rosterTemplate } from "@/lib/king-dm";
import { growthIgMarkSent } from "@/lib/growth-ig-dm.functions";
import { chapterPage, councilPage, missingMessage, moveSlug, renderOutreachDm, slotLink, V2_SLOTS, type V2SlotKey } from "@/lib/outreach-v2";
import { v2Campus, v2Overview, v2SaveOrder, type V2CampusData, type V2CampusSummary, type V2Chapter, type V2Council, type V2Slot, type V2Slots } from "@/lib/outreach-v2.functions";
import { cn } from "@/lib/utils";

const btn = "inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-medium hover:bg-muted disabled:opacity-40";

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); }
  catch { toast.error("Clipboard blocked — select and copy by hand."); }
}

export function OutreachV2() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dm-v2"], queryFn: () => v2Overview(), staleTime: 30_000 });
  const [open, setOpen] = useState<V2CampusSummary | null>(null);
  const [tab, setTab] = useState<"campuses" | "activity">("campuses");
  const order = useMutation({
    mutationFn: (slugs: string[]) => v2SaveOrder({ data: { order: slugs } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dm-v2"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const campuses = q.data?.campuses ?? [];
  const move = (slug: string, d: -1 | 1) => {
    const slugs = campuses.map((c) => c.slug);
    const next = moveSlug(slugs, slug, slugs.indexOf(slug) + d);
    qc.setQueryData(["dm-v2"], { ...q.data!, campuses: next.map((s) => campuses.find((c) => c.slug === s)!) });
    order.mutate(next);
  };
  const t = q.data?.totals;

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-4 px-4 py-6">
      <Toaster richColors position="top-center" />
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">Outreach</h1>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">V2</span>
        <div className="ml-auto flex gap-1 rounded-lg border border-border p-0.5">
          {(["campuses", "activity"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-md px-3 py-1 text-[12.5px] font-medium", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {k === "campuses" ? "Campuses" : "Activity"}
            </button>
          ))}
        </div>
      </div>
      {tab === "activity" && (
        <div className="space-y-2">
          <p className="text-[11.5px] text-muted-foreground">Every student action, outreach event, map approval and chapter claim across all campuses. Test data is excluded.</p>
          <div className="rounded-xl border border-border bg-card p-3"><ActivityFeed showFilters /></div>
        </div>
      )}
      {tab === "campuses" && (<>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Campuses", t?.campuses],
          ["Started", t?.started],
          ["Handles on file", t?.filled],
          ["DMs sent", t?.sent],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-xl border border-border px-3 py-2.5">
            <div className="text-[22px] font-semibold tabular-nums leading-none">{v ?? "—"}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {q.isError && <p className="text-sm text-red-500">{(q.error as Error).message}</p>}
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="divide-y divide-border rounded-xl border border-border">
        {campuses.map((c, i) => {
          const prevCluster = i > 0 ? campuses[i - 1].cluster : null;
          return (
            <div key={c.slug}>
              {c.cluster && c.cluster !== prevCluster && <div className="bg-muted/40 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{c.cluster}</div>}
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="w-6 text-right text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="flex flex-col">
                  <button className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0 || order.isPending} onClick={() => move(c.slug, -1)} aria-label={`Move ${c.label} up`}>▲</button>
                  <button className="text-[10px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === campuses.length - 1 || order.isPending} onClick={() => move(c.slug, 1)} aria-label={`Move ${c.label} down`}>▼</button>
                </div>
                <button onClick={() => setOpen(c)} disabled={!c.campusId} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50">
                  <span className="text-[14px] font-semibold hover:underline">{c.label}</span>
                  {!c.campusId && <span className="ml-2 text-[11px] text-muted-foreground">not in the campus table</span>}
                </button>
                {c.slotsSent > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{c.slotsSent} sent</span>}
                <span className="text-[11px] tabular-nums text-muted-foreground">{c.slotsFilled} handle{c.slotsFilled === 1 ? "" : "s"}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>

      </>)}
      {open && <CampusSheet summary={open} onClose={() => { setOpen(null); void qc.invalidateQueries({ queryKey: ["dm-v2"] }); }} />}
    </div>
  );
}

function CampusSheet({ summary, onClose }: { summary: V2CampusSummary; onClose: () => void }) {
  const q = useQuery({ queryKey: ["dm-v2-campus", summary.slug], queryFn: () => v2Campus({ data: { slug: summary.slug } }) });
  const [chapter, setChapter] = useState<{ council: V2Council; chapter: V2Chapter } | null>(null);
  const [openCouncil, setOpenCouncil] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const d = q.data;
  // Keep the open chapter pointed at fresh data after a save.
  const liveChapter = useMemo(() => {
    if (!chapter || !d) return null;
    const c = d.councils.find((x) => x.key === chapter.council.key);
    const ch = c?.chapters.find((x) => x.id === chapter.chapter.id);
    return c && ch ? { council: c, chapter: ch } : null;
  }, [chapter, d]);

  return (
    <>
      <BottomSheet open onClose={onClose} title={<span className="text-[15px] font-semibold">{summary.label}</span>}
        subtitle={d ? <span className="text-[11px] text-muted-foreground">{d.courseCode ?? "course code not on file"}</span> : null}>
        <div className="space-y-3 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => setImportOpen((v) => !v)}><ClipboardPaste className="size-3.5" /> {importOpen ? "Close import" : "Paste / import"}</button>
            {d && <TemplateButton data={d} />}
          </div>
          {importOpen && d && <Importer data={d} onDone={() => { setImportOpen(false); void q.refetch(); }} />}
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {q.isError && <p className="text-sm text-red-500">{(q.error as Error).message}</p>}
          {d?.councils.map((c) => (
            <div key={c.key} className="rounded-xl border border-border">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-[14px] font-semibold">{c.label}</span>
                <span className="text-[11px] text-muted-foreground">{c.name}</span>
              </div>
              <div className="divide-y divide-border/60">
                {V2_SLOTS.map((s) => (
                  <SlotRow key={s.key} data={d} council={c} chapter={null} slotKey={s.key} slot={c.slots[s.key]} onSaved={() => void q.refetch()} />
                ))}
              </div>
              <button onClick={() => setOpenCouncil((v) => (v === c.key ? null : c.key))} className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-left text-[12px] font-medium text-muted-foreground hover:bg-muted/40">
                {openCouncil === c.key ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                {openCouncil === c.key ? "Hide" : "Show"} chapters ({c.chapters.length})
              </button>
              {openCouncil === c.key && (
                <div className="divide-y divide-border/60 border-t border-border">
                  {c.chapters.length === 0 && <p className="px-3 py-2 text-[12px] text-muted-foreground">No chapters on file.</p>}
                  {c.chapters.map((ch) => <ChapterLine key={ch.id} ch={ch} onOpen={() => setChapter({ council: c, chapter: ch })} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </BottomSheet>
      {liveChapter && d && (
        <BottomSheet open depth={1} onClose={() => setChapter(null)} onBack={() => setChapter(null)}
          title={<span className="text-[15px] font-semibold">{liveChapter.chapter.name}{liveChapter.chapter.letters ? ` · ${liveChapter.chapter.letters}` : ""}</span>}
          subtitle={<span className="text-[11px] text-muted-foreground">{summary.label} · {liveChapter.council.label} · {liveChapter.chapter.signups} signup{liveChapter.chapter.signups === 1 ? "" : "s"}</span>}>
          <div className="divide-y divide-border/60 overflow-y-auto p-2">
            {V2_SLOTS.map((s) => (
              <SlotRow key={s.key} data={d} council={liveChapter.council} chapter={liveChapter.chapter} slotKey={s.key} slot={liveChapter.chapter.slots[s.key]} onSaved={() => void q.refetch()} />
            ))}
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/** A chapter row: three sent checks (org · president · scholarship chair), the name, link clicks since
 *  sent, and signups. No size on the row — the list is already in size order. */
function ChapterLine({ ch, onOpen }: { ch: V2Chapter; onOpen: () => void }) {
  const clicks = Object.values(ch.slots).reduce((a, s) => a + (s?.clicksSinceSent ?? 0), 0);
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
      <span className="flex shrink-0 items-center gap-0.5" aria-label={`${V2_SLOTS.filter((s) => ch.slots[s.key]?.sentAt).length} of 3 sent`}>
        {V2_SLOTS.map((s) => {
          const sent = !!ch.slots[s.key]?.sentAt;
          return (
            <span key={s.key} title={`${s.label}: ${sent ? "sent" : ch.slots[s.key] ? "not sent" : "no contact"}`}
              className={cn("grid size-4 place-items-center rounded-full border", sent ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-transparent")}>
              <Check className="size-2.5" strokeWidth={3} />
            </span>
          );
        })}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">{ch.name}{ch.letters ? <span className="text-muted-foreground"> · {ch.letters}</span> : null}</span>
      <span className={cn("inline-flex items-center gap-0.5 text-[11px] tabular-nums", clicks ? "text-sky-500" : "text-muted-foreground")} title="Link clicks after it was marked sent">
        <LinkIcon className="size-3" /> {clicks}
      </span>
      <span className={cn("inline-flex items-center gap-0.5 text-[11px] tabular-nums", ch.signups ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} title="Members who joined this chapter's page">
        <User className="size-3" /> {ch.signups}
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground" />
    </button>
  );
}

function SlotRow({ data, council, chapter, slotKey, slot, onSaved }: { data: V2CampusData; council: V2Council; chapter: V2Chapter | null; slotKey: V2SlotKey; slot: V2Slot | null; onSaved: () => void }) {
  const qc = useQueryClient();
  const [handle, setHandle] = useState(slot?.handle ?? "");
  const [name, setName] = useState(slot?.name ?? "");
  const label = V2_SLOTS.find((s) => s.key === slotKey)!.label;
  const dirty = bareIg(handle) !== (slot?.handle ?? "") || (slotKey !== "org" && name.trim() !== (slot?.name ?? ""));
  // The recipient's informational page: the chapter's page, or the council's. A chapter with no page
  // on the site has no link to send, and the DM says so rather than copying a campus page instead.
  const page = chapter ? (chapter.slug ? chapterPage(data.slug, chapter.slug) : null) : councilPage(data.slug, council.key);
  const link = page ? slotLink(page, slot?.code) : "";
  const dm = renderOutreachDm({
    kind: chapter ? "chapter" : "council",
    campusShorthand: data.campusShort, campusName: data.campusName, courseCode: data.courseCode,
    chapterName: chapter?.name ?? null, council: council.key, orgType: chapter?.orgType ?? null,
    outreachLink: link || null,
  });

  const save = useMutation({
    mutationFn: async () => {
      const h = bareIg(handle);
      if (!h) throw new Error("That doesn't look like an Instagram handle.");
      const row = {
        council: council.key, chapter: chapter?.name ?? "", chapterId: chapter?.id ?? null, line: 1,
        orgIg: slotKey === "org" ? h : "", presidentName: slotKey === "pres" ? name.trim() : "", presidentIg: slotKey === "pres" ? h : "",
        chairName: slotKey === "chair" ? name.trim() : "", chairIg: slotKey === "chair" ? h : "",
      };
      const r = await dmConsoleSaveRoster({ data: { campusId: data.campusId, rows: [row] } });
      if (r.errors.length) throw new Error(r.errors[0]);
      return r;
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mark = useMutation({
    mutationFn: (sent: boolean) => growthIgMarkSent({ data: { contactId: slot!.contactId, sent } }),
    onSuccess: (_r, sent) => { toast.success(sent ? "Marked sent" : "Marked unsent"); onSaved(); void qc.invalidateQueries({ queryKey: ["dm-v2"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ig = bareIg(handle);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2", slot?.sentAt && "bg-emerald-500/5")}>
      <label className="flex items-center gap-1.5" title={slot ? (slot.sentAt ? "Sent — untick to undo" : "Mark sent") : "Save a handle first"}>
        <input type="checkbox" className="size-4 accent-emerald-600" checked={!!slot?.sentAt} disabled={!slot || mark.isPending} onChange={(e) => mark.mutate(e.target.checked)} />
        <span className="w-[118px] text-[12px] font-medium">{label}</span>
      </label>
      {slotKey !== "org" && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-7 w-[130px] rounded-md border border-border bg-background px-2 text-[12px]" />
      )}
      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" className="h-7 w-[150px] rounded-md border border-border bg-background px-2 text-[12px]"
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) save.mutate(); }} />
      {dirty && (
        <button className={cn(btn, "border-primary text-primary")} disabled={save.isPending || !bareIg(handle)} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </button>
      )}
      <span className="flex-1" />
      {slot?.sentAt && (
        <span className={cn("inline-flex items-center gap-0.5 text-[11px] tabular-nums", slot.clicksSinceSent ? "text-sky-500" : "text-muted-foreground")} title="Link clicks after it was marked sent">
          <LinkIcon className="size-3" /> {slot.clicksSinceSent}
        </span>
      )}
      <button className={cn(btn, !dm.ok && "border-amber-500/60 text-amber-600 dark:text-amber-400")} title={dm.ok ? "Copy the DM" : missingMessage(dm.missing)}
        onClick={() => { if (dm.ok) void copy(dm.text, "DM"); else toast.error(missingMessage(dm.missing)); }}><Copy className="size-3.5" /> DM</button>
      <button className={btn} disabled={!link} onClick={() => void copy(link, "Link")} title={link || "No page for this recipient yet"}><LinkIcon className="size-3.5" /> Link</button>
      <a className={cn(btn, !ig && "pointer-events-none opacity-40")} href={ig ? `https://ig.me/m/${ig}` : undefined} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Open</a>
    </div>
  );
}

function TemplateButton({ data }: { data: V2CampusData }) {
  const download = () => {
    const rows = data.councils.flatMap((c) => [{ council: c.label, name: "" }, ...c.chapters.map((ch) => ({ council: c.label, name: ch.name }))]);
    const blob = new Blob([rosterTemplate(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.label.replace(/\s+/g, "-").toLowerCase()}-outreach-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return <button className={btn} onClick={download}><Download className="size-3.5" /> Template</button>;
}

function Importer({ data, onDone }: { data: V2CampusData; onDone: () => void }) {
  const [text, setText] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: (rows: ReturnType<typeof parseRoster>["rows"]) => dmConsoleSaveRoster({ data: { campusId: data.campusId, rows: rows.map((r) => ({ ...r, chapterId: null })) } }),
    onSuccess: (r) => {
      toast.success(`Imported: ${r.saved} new, ${r.updated} updated${r.unmatched.length ? ` · ${r.unmatched.length} chapter name${r.unmatched.length === 1 ? "" : "s"} not matched` : ""}`);
      if (r.unmatched.length) toast.info(`Not matched: ${r.unmatched.slice(0, 6).join(", ")}${r.unmatched.length > 6 ? "…" : ""}`);
      setText(""); onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = (t: string) => {
    const { rows, skipped } = parseRoster(t);
    if (!rows.length) { toast.error(skipped ? `Nothing usable — ${skipped} row${skipped === 1 ? "" : "s"} had no handle or no council.` : "Nothing to import."); return; }
    save.mutate(rows);
  };
  const onFile = async (f: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      submit(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
    } catch (e) { toast.error(`Couldn't read that file: ${(e as Error).message}`); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-[11.5px] text-muted-foreground">One line per chapter; leave Chapter blank for the council itself. Columns: {ROSTER_HEADERS.join(" · ")}. Tabs or commas, header row optional.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full rounded-lg border border-border bg-background p-2 font-mono text-[11.5px]"
        placeholder={"IFC,,@olemissifc,Grayson King,@graysonking04,Luke Habeeb,@lukehabeeb\nIFC,Kappa Alpha Order,@kaolemiss,,,,"} />
      <div className="flex flex-wrap gap-2">
        <button className={cn(btn, "border-primary text-primary")} disabled={save.isPending || !text.trim()} onClick={() => submit(text)}>
          {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Import pasted
        </button>
        <button className={btn} onClick={() => file.current?.click()}><Upload className="size-3.5" /> Upload .csv / .xlsx</button>
        <input ref={file} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

export type { V2Slots };
