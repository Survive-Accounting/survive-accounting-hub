// THE CHAPTER ROSTER — the grid that was missing.
//
// Councils were the only thing the DM board ever collected, so the chapters themselves — where the
// scholarship chairs actually are — had nowhere to live. This is one editable line per chapter:
// the chapter's own account, the president, the scholarship chair. Type into it, or paste a sheet
// for the whole campus at once.
//
// SAVE IS BULK AND IDEMPOTENT. Every dirty row goes in one call, and re-sending a row King has
// already saved updates it instead of duplicating — because he WILL paste the same sheet again
// with three more cells filled in.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ClipboardPaste, Download, ExternalLink, Loader2, Save, Upload, X } from "lucide-react";

import { renderQueryState } from "@/components/growth/QueryState";
import { dmConsoleRoster, dmConsoleSaveRoster, type RosterChapter, type RosterCouncil } from "@/lib/king-dm.functions";
import { ROSTER_HEADERS, bareIg, parseRoster, rosterTemplate } from "@/lib/king-dm";
import { cn } from "@/lib/utils";

/** The editable shape of one chapter line. */
interface Draft { orgIg: string; presidentName: string; presidentIg: string; chairName: string; chairIg: string }
const draftOf = (c: RosterChapter): Draft => ({
  orgIg: c.org?.handle ?? "",
  presidentName: c.president?.name ?? "",
  presidentIg: c.president?.handle ?? "",
  chairName: c.chair?.name ?? "",
  chairIg: c.chair?.handle ?? "",
});
const sameDraft = (a: Draft, b: Draft) =>
  a.orgIg === b.orgIg && a.presidentName === b.presidentName && a.presidentIg === b.presidentIg && a.chairName === b.chairName && a.chairIg === b.chairIg;

export function ChapterRoster({ campusId, campusName }: { campusId: string; campusName: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dm-roster", campusId], queryFn: () => dmConsoleRoster({ data: { campusId } }) });
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const councils = q.data?.councils ?? [];
  const baseline = useMemo(() => {
    const m: Record<string, Draft> = {};
    for (const c of councils) for (const ch of c.chapters) m[ch.chapterId] = draftOf(ch);
    return m;
  }, [councils]);

  const dirtyIds = Object.keys(edits).filter((id) => baseline[id] && !sameDraft(edits[id], baseline[id]));

  const save = useMutation({
    mutationFn: async (rows: Parameters<typeof dmConsoleSaveRoster>[0] extends never ? never : { council: string; chapter: string; chapterId: string | null; orgIg: string; presidentName: string; presidentIg: string; chairName: string; chairIg: string; line: number }[]) =>
      dmConsoleSaveRoster({ data: { campusId, rows } }),
    onSuccess: (r) => {
      const bits = [r.saved ? `${r.saved} added` : "", r.updated ? `${r.updated} updated` : ""].filter(Boolean).join(", ");
      if (r.unmatched.length) toast.warning(`Saved ${bits || "nothing"}. No chapter matched: ${r.unmatched.slice(0, 5).join(", ")}${r.unmatched.length > 5 ? "…" : ""}`);
      else if (r.errors.length) toast.warning(`${bits || "Saved"} — ${r.errors.length} problem${r.errors.length === 1 ? "" : "s"}: ${r.errors[0]}`);
      else toast.success(bits ? `Saved: ${bits}.` : "Nothing to save.");
      setEdits({});
      void qc.invalidateQueries({ queryKey: ["dm-roster", campusId] });
      void qc.invalidateQueries({ queryKey: ["dm-board"] });
      void qc.invalidateQueries({ queryKey: ["ig-campus", campusId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDirty = () => {
    const rows = dirtyIds.map((id, i) => {
      const council = councils.find((c) => c.chapters.some((ch) => ch.chapterId === id))!;
      const chapter = council.chapters.find((ch) => ch.chapterId === id)!;
      const d = edits[id];
      return { council: council.key, chapter: chapter.name, chapterId: id, orgIg: bareIg(d.orgIg), presidentName: d.presidentName.trim(), presidentIg: bareIg(d.presidentIg), chairName: d.chairName.trim(), chairIg: bareIg(d.chairIg), line: i + 1 };
    });
    if (!rows.length) { toast.info("No changes yet."); return; }
    save.mutate(rows as never);
  };

  const submitBulk = (text: string) => {
    const { rows, skipped } = parseRoster(text);
    if (!rows.length) { toast.error(skipped ? `Nothing usable — ${skipped} row${skipped === 1 ? "" : "s"} had no handle or no council.` : "Nothing to import."); return; }
    save.mutate(rows.map((r) => ({ ...r, chapterId: null })) as never);
    if (skipped) toast.info(`${skipped} row${skipped === 1 ? "" : "s"} skipped (no handle or unknown council).`);
    setBulkText(""); setBulkOpen(false);
  };

  const onFile = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      submitBulk(XLSX.utils.sheet_to_csv(sheet));
    } catch (e) { toast.error(`Couldn't read that file: ${(e as Error).message}`); }
  };

  const downloadTemplate = () => {
    const all = councils.flatMap((c) => c.chapters.map((ch) => ({ council: c.key, name: ch.name })));
    const blob = new Blob([rosterTemplate(all)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${campusName.replace(/\s+/g, "-").toLowerCase()}-roster.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totals = councils.reduce((t, c) => {
    for (const ch of c.chapters) { t.chapters++; if (ch.org || ch.president || ch.chair) t.withIg++; }
    return t;
  }, { chapters: 0, withIg: 0 });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted-foreground">
          {totals.withIg} of {totals.chapters} chapter{totals.chapters === 1 ? "" : "s"} have a handle
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => setBulkOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted">
            {bulkOpen ? <><X className="size-3.5" /> Close</> : <><ClipboardPaste className="size-3.5" /> Paste / import</>}
          </button>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted">
            <Download className="size-3.5" /> Template
          </button>
          <button
            onClick={saveDirty}
            disabled={save.isPending || !dirtyIds.length}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save{dirtyIds.length ? ` ${dirtyIds.length}` : ""}
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-[11.5px] text-muted-foreground">
            One line per chapter, or leave Chapter blank for a council account. Columns: {ROSTER_HEADERS.join(" · ")}. A header row is optional, tabs or commas both work, so a paste straight out of a spreadsheet is fine.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"IFC,Sigma Chi,@sigmachi_olemiss,Jordan Ellis,@jordan.ellis,Maddie Carter,@maddiec\nIFC,,@olemissifc,,,,"}
            className="w-full rounded-lg border border-border bg-background p-2 font-mono text-[11.5px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => submitBulk(bulkText)} disabled={save.isPending || !bulkText.trim()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40">
              {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Import pasted
            </button>
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted">
              <Upload className="size-3.5" /> Upload .csv / .xlsx
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </div>
        </div>
      )}

      {renderQueryState(q, { label: "roster" })}
      {q.data && councils.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
          No chapters on file for this campus yet.
        </p>
      )}

      {councils.map((council) => (
        <CouncilBlock
          key={council.key}
          council={council}
          edits={edits}
          baseline={baseline}
          onEdit={(chapterId, patch) => setEdits((e) => ({ ...e, [chapterId]: { ...(e[chapterId] ?? baseline[chapterId]), ...patch } }))}
        />
      ))}
    </div>
  );
}

function CouncilBlock({ council, edits, baseline, onEdit }: {
  council: RosterCouncil;
  edits: Record<string, Draft>;
  baseline: Record<string, Draft>;
  onEdit: (chapterId: string, patch: Partial<Draft>) => void;
}) {
  const filled = council.chapters.filter((c) => c.org || c.president || c.chair).length;
  return (
    <section className="rounded-lg border border-border">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <span className="text-[12px] font-semibold">{council.label}</span>
        <span className="text-[10px] text-muted-foreground">
          {filled}/{council.chapters.length} chapters with a handle
          {council.council.length > 0 && ` · council account ${council.council.map((c) => `@${c.handle}`).join(", ")}`}
        </span>
      </header>

      {/* Column headers, once per council — the grid is dense enough to need them. */}
      <div className="hidden gap-2 border-b border-border/60 px-3 py-1.5 text-[9px] uppercase tracking-wide text-muted-foreground md:grid" style={{ gridTemplateColumns: "minmax(120px,1.4fr) minmax(110px,1fr) minmax(150px,1.4fr) minmax(150px,1.4fr)" }}>
        <span>Chapter</span><span>Chapter IG</span><span>President</span><span>Scholarship chair</span>
      </div>

      <div className="divide-y divide-border/60">
        {council.chapters.map((ch) => {
          const d = edits[ch.chapterId] ?? baseline[ch.chapterId] ?? draftOf(ch);
          const dirty = baseline[ch.chapterId] && !sameDraft(d, baseline[ch.chapterId]);
          return (
            <div key={ch.chapterId} className={cn("grid gap-2 px-3 py-2 md:items-center", dirty && "bg-primary/5")} style={{ gridTemplateColumns: "minmax(120px,1.4fr) minmax(110px,1fr) minmax(150px,1.4fr) minmax(150px,1.4fr)" }}>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium">{ch.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {ch.letters ? `${ch.letters} · ` : ""}{ch.size != null ? `${ch.size} members` : "size unknown"}
                </div>
              </div>
              <IgCell value={d.orgIg} onChange={(v) => onEdit(ch.chapterId, { orgIg: v })} placeholder="@chapter" sent={ch.org} />
              <PersonCell
                name={d.presidentName} handle={d.presidentIg}
                onName={(v) => onEdit(ch.chapterId, { presidentName: v })}
                onHandle={(v) => onEdit(ch.chapterId, { presidentIg: v })}
                slot={ch.president}
              />
              <PersonCell
                name={d.chairName} handle={d.chairIg}
                onName={(v) => onEdit(ch.chapterId, { chairName: v })}
                onHandle={(v) => onEdit(ch.chapterId, { chairIg: v })}
                slot={ch.chair}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-2 py-1 text-[11.5px] outline-none focus:border-primary";

/** A handle cell: the input, a link out to the profile, and the DM state if one has gone out. */
function IgCell({ value, onChange, placeholder, sent }: { value: string; onChange: (v: string) => void; placeholder: string; sent: { sentAt: string | null; repliedAt: string | null } | null }) {
  return (
    <div className="flex items-center gap-1">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} spellCheck={false} />
      {value && (
        <a href={`https://instagram.com/${bareIg(value)}`} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" title="Open profile">
          <ExternalLink className="size-3" />
        </a>
      )}
      <SentDot slot={sent} />
    </div>
  );
}

function PersonCell({ name, handle, onName, onHandle, slot }: {
  name: string; handle: string; onName: (v: string) => void; onHandle: (v: string) => void;
  slot: { sentAt: string | null; repliedAt: string | null } | null;
}) {
  return (
    <div className="flex items-center gap-1">
      <input value={name} onChange={(e) => onName(e.target.value)} placeholder="name" className={cn(inputCls, "min-w-0 flex-1")} />
      <input value={handle} onChange={(e) => onHandle(e.target.value)} placeholder="@handle" className={cn(inputCls, "min-w-0 flex-1")} spellCheck={false} />
      {handle && (
        <a href={`https://instagram.com/${bareIg(handle)}`} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" title="Open profile">
          <ExternalLink className="size-3" />
        </a>
      )}
      <SentDot slot={slot} />
    </div>
  );
}

/** Replied beats sent: a green dot means the conversation is live, amber means we are waiting. */
function SentDot({ slot }: { slot: { sentAt: string | null; repliedAt: string | null } | null }) {
  if (!slot?.sentAt) return <span className="w-2 shrink-0" />;
  const replied = !!slot.repliedAt;
  return (
    <span
      title={replied ? "Replied" : "DM sent, no reply yet"}
      className={cn("size-2 shrink-0 rounded-full", replied ? "bg-emerald-500" : "bg-amber-500")}
    />
  );
}
