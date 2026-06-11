// Resource Bank blocks: keyboard-first Journal Entry editor (chart-of-accounts
// type-ahead, ??? amount placeholders with tooltips), auto-derived T-accounts
// (a T-account is a render of JE data, never separately stored), and simple
// editors for formulas / concepts to discuss / real-world examples / mistakes.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, GripVertical, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  deleteTeachingBlock, fetchChartOfAccounts, fetchConcepts, saveTeachingBlock,
  type BlockType, type ConceptRow, type JeLine, type TeachingBlockRow,
} from "@/lib/ceq-api";

const BLOCK_META: { type: BlockType; icon: string; label: string; hint: string }[] = [
  { type: "journal_entry", icon: "📒", label: "Journal Entries", hint: "Account names and Dr/Cr structure — amounts stay ??? on purpose." },
  { type: "formula", icon: "∑", label: "Formulas to Memorize", hint: "One formula per block — line breaks preserved (top/down)." },
  { type: "concept", icon: "💡", label: "Concepts to Discuss", hint: "Big ideas, definitions, and 'why this matters' angles." },
  { type: "real_world", icon: "🌍", label: "Real World Examples", hint: "Stories, companies, scenarios that bring the chapter to life." },
  { type: "common_mistake", icon: "⚠️", label: "Common Mistakes", hint: "Traps you've seen students fall into, repeatedly." },
];

export function ResourceBankSection({ chapterId, blocks, onChanged }: {
  chapterId: string;
  blocks: TeachingBlockRow[];
  onChanged: () => void;
}) {
  const conceptsQuery = useQuery({ queryKey: ["concepts"], queryFn: fetchConcepts, retry: 1, staleTime: 300_000 });
  const concepts = conceptsQuery.data ?? [];
  const [editor, setEditor] = useState<{ type: BlockType; existing?: TeachingBlockRow } | null>(null);

  const byType = useMemo(() => {
    const m = new Map<string, TeachingBlockRow[]>();
    for (const b of blocks) {
      if (!m.has(b.block_type)) m.set(b.block_type, []);
      m.get(b.block_type)!.push(b);
    }
    return m;
  }, [blocks]);

  const jeBlocks = byType.get("journal_entry") ?? [];

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
        These accumulate across the <strong>whole chapter</strong> and are tagged to <strong>concepts</strong> behind
        the scenes — so they'll follow this material to any textbook later. Blocks here feed CEQ dictation in Stage 2.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Journal Entries */}
        <BlockCard
          meta={BLOCK_META[0]}
          count={jeBlocks.length}
          onAdd={() => setEditor({ type: "journal_entry" })}
        >
          {jeBlocks.map((b) => (
            <JePreview key={b.id} block={b} concepts={concepts}
              onEdit={() => setEditor({ type: "journal_entry", existing: b })}
              onDelete={async () => { await deleteTeachingBlock(b.id); onChanged(); }}
            />
          ))}
        </BlockCard>

        {/* T-Accounts — derived, never authored */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <span className="text-base">📊</span>
            <span className="text-sm font-semibold">T-Accounts</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1">auto-derived</Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Rendered automatically from your Journal Entry blocks — one source of truth, two views.
          </p>
          <div className="mt-2 grid gap-2">
            {deriveTAccounts(jeBlocks).map((t) => <TAccountMini key={t.account} t={t} />)}
            {jeBlocks.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">Add a Journal Entry block and its T-accounts appear here.</p>
            )}
          </div>
        </div>

        {/* Simple text blocks */}
        {BLOCK_META.slice(1).map((meta) => (
          <BlockCard
            key={meta.type}
            meta={meta}
            count={(byType.get(meta.type) ?? []).length}
            onAdd={() => setEditor({ type: meta.type })}
          >
            {(byType.get(meta.type) ?? []).map((b) => (
              <SimpleBlockPreview key={b.id} block={b} concepts={concepts}
                onEdit={() => setEditor({ type: meta.type, existing: b })}
                onDelete={async () => { await deleteTeachingBlock(b.id); onChanged(); }}
              />
            ))}
          </BlockCard>
        ))}
      </div>

      {editor && (
        <BlockEditorDialog
          key={editor.existing?.id ?? editor.type}
          chapterId={chapterId}
          type={editor.type}
          existing={editor.existing}
          concepts={concepts}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function BlockCard({ meta, count, onAdd, children }: {
  meta: { icon: string; label: string; hint: string };
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="text-base">{meta.icon}</span>
        <span className="text-sm font-semibold">{meta.label}</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1">{count}</Badge>
        <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={onAdd}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{meta.hint}</p>
      <div className="mt-2 space-y-2">
        {count === 0 ? (
          <p className="text-[11px] italic text-muted-foreground">Nothing here yet. Hit + Add to start the library.</p>
        ) : children}
      </div>
    </div>
  );
}

function ConceptChips({ ids, concepts }: { ids: string[]; concepts: ConceptRow[] }) {
  if (!ids.length) return null;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ids.map((id, i) => {
        const c = byId.get(id);
        if (!c) return null;
        return (
          <span key={id} className={cn(
            "rounded-full border px-1.5 py-0.5 text-[9px]",
            i === 0 ? "border-[#14213D]/40 bg-[#14213D]/5 font-semibold" : "border-border text-muted-foreground",
          )}>
            {c.name}
          </span>
        );
      })}
    </div>
  );
}

function SimpleBlockPreview({ block, concepts, onEdit, onDelete }: {
  block: TeachingBlockRow; concepts: ConceptRow[]; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="group rounded-md border border-border/70 bg-muted/20 p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {block.title && <div className="text-xs font-semibold">{block.title}</div>}
          <div className="whitespace-pre-wrap text-[11px] text-muted-foreground line-clamp-3">{block.body}</div>
          <ConceptChips ids={block.concept_ids} concepts={concepts} />
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    </div>
  );
}

// ============ Journal Entry rendering ============

function JePreview({ block, concepts, onEdit, onDelete }: {
  block: TeachingBlockRow; concepts: ConceptRow[]; onEdit: () => void; onDelete: () => void;
}) {
  const lines = (block.payload?.lines ?? []) as JeLine[];
  return (
    <div className="group rounded-md border border-border/70 bg-muted/20 p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {block.title && <div className="mb-1 text-xs font-semibold">{block.title}</div>}
          <TooltipProvider delayDuration={150}>
            <table className="w-full text-[11px]">
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className={cn("py-0.5", l.side === "credit" && "pl-6")}>{l.account}</td>
                    <td className="w-14 text-right tabular-nums">
                      {l.side === "debit" ? <AmountChip line={l} /> : ""}
                    </td>
                    <td className="w-14 text-right tabular-nums">
                      {l.side === "credit" ? <AmountChip line={l} /> : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TooltipProvider>
          <ConceptChips ids={block.concept_ids} concepts={concepts} />
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    </div>
  );
}

function AmountChip({ line }: { line: JeLine }) {
  const text = line.label?.trim() || "???";
  if (!line.tooltip?.trim()) return <span className="text-muted-foreground">{text}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-muted-foreground/60 text-muted-foreground">{text}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[220px] text-xs">{line.tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface DerivedT { account: string; debits: { label: string; from: string }[]; credits: { label: string; from: string }[] }

function deriveTAccounts(jeBlocks: TeachingBlockRow[]): DerivedT[] {
  const map = new Map<string, DerivedT>();
  for (const b of jeBlocks) {
    for (const l of (b.payload?.lines ?? []) as JeLine[]) {
      if (!l.account) continue;
      if (!map.has(l.account)) map.set(l.account, { account: l.account, debits: [], credits: [] });
      const entry = { label: l.label?.trim() || "???", from: b.title ?? "JE" };
      if (l.side === "debit") map.get(l.account)!.debits.push(entry);
      else map.get(l.account)!.credits.push(entry);
    }
  }
  return Array.from(map.values());
}

function TAccountMini({ t }: { t: DerivedT }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-2">
      <div className="border-b-2 border-foreground/70 pb-0.5 text-center text-[11px] font-semibold">{t.account}</div>
      <div className="grid grid-cols-2 text-[10px]">
        <div className="border-r-2 border-foreground/70 p-1 space-y-0.5">
          {t.debits.map((d, i) => (
            <div key={i} className="flex justify-between gap-1">
              <span className="truncate text-muted-foreground">{d.from}</span>
              <span className="tabular-nums">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="p-1 space-y-0.5">
          {t.credits.map((c, i) => (
            <div key={i} className="flex justify-between gap-1">
              <span className="truncate text-muted-foreground">{c.from}</span>
              <span className="tabular-nums">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ Editor dialog (all block types) ============

function BlockEditorDialog({ chapterId, type, existing, concepts, onClose, onSaved }: {
  chapterId: string;
  type: BlockType;
  existing?: TeachingBlockRow;
  concepts: ConceptRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = BLOCK_META.find((m) => m.type === type)!;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [lines, setLines] = useState<JeLine[]>(
    (existing?.payload?.lines as JeLine[] | undefined) ??
    [{ account: "", side: "debit", label: "???", tooltip: "" }, { account: "", side: "credit", label: "???", tooltip: "" }],
  );
  const [tagIds, setTagIds] = useState<string[]>(existing?.concept_ids ?? []);
  const [tagSearch, setTagSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const coaQuery = useQuery({ queryKey: ["chart-of-accounts"], queryFn: fetchChartOfAccounts, retry: 1, staleTime: 300_000, enabled: type === "journal_entry" });
  const coa = coaQuery.data ?? [];

  const save = async () => {
    if (type === "journal_entry") {
      const filled = lines.filter((l) => l.account.trim());
      if (!filled.some((l) => l.side === "debit") || !filled.some((l) => l.side === "credit")) {
        toast.error("A journal entry needs at least one debit and one credit");
        return;
      }
      setSaving(true);
      try {
        const summary = filled.map((l) => `${l.side === "credit" ? "    " : ""}${l.account} (${l.side === "debit" ? "Dr" : "Cr"} ${l.label || "???"})`).join("\n");
        await saveTeachingBlock(chapterId, { block_type: type, title: title.trim() || null, body: summary, payload: { lines: filled } }, tagIds, existing?.id);
        onSaved();
      } catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setSaving(false); }
      return;
    }
    if (!body.trim()) { toast.error("Body required"); return; }
    setSaving(true);
    try {
      await saveTeachingBlock(chapterId, { block_type: type, title: title.trim() || null, body: body.trim() }, tagIds, existing?.id);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); } finally { setSaving(false); }
  };

  const filteredConcepts = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const list = q ? concepts.filter((c) => c.name.toLowerCase().includes(q)) : concepts.filter((c) => !c.parent_id);
    return list.slice(0, 12);
  }, [concepts, tagSearch]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit" : "New"} — {meta.label.replace(/s$/, "")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Title {type === "journal_entry" ? "(what transaction is this?)" : "(optional)"}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "journal_entry" ? 'e.g. "Record sale on account"' : ""} className="h-9" autoFocus />
          </div>

          {type === "journal_entry" ? (
            <JeLinesEditor lines={lines} setLines={setLines} coa={coa} />
          ) : (
            <div className="grid gap-1.5">
              <Label className="text-xs">{type === "formula" ? "Formula (line breaks preserved)" : "Content"}</Label>
              <Textarea rows={type === "formula" ? 4 : 6} value={body} onChange={(e) => setBody(e.target.value)}
                className={cn("text-sm", type === "formula" && "font-mono")} />
            </div>
          )}

          {/* Concept tags */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Concepts (first = primary) — this is what makes it textbook-proof</Label>
            <div className="flex flex-wrap gap-1">
              {tagIds.map((id, i) => {
                const c = concepts.find((x) => x.id === id);
                return (
                  <button key={id} onClick={() => setTagIds((p) => p.filter((x) => x !== id))}
                    className={cn("rounded-full border px-2 py-0.5 text-[10px]",
                      i === 0 ? "border-[#14213D] bg-[#14213D]/10 font-semibold" : "border-border")}
                    title="Click to remove">
                    {c?.name ?? "?"} ×
                  </button>
                );
              })}
            </div>
            <Input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search concepts…" className="h-8 text-xs" />
            <div className="flex flex-wrap gap-1">
              {filteredConcepts.filter((c) => !tagIds.includes(c.id)).map((c) => (
                <button key={c.id} onClick={() => setTagIds((p) => [...p, c.id])}
                  className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-foreground hover:text-foreground">
                  + {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Keyboard-first JE lines editor ============

function JeLinesEditor({ lines, setLines, coa }: {
  lines: JeLine[];
  setLines: React.Dispatch<React.SetStateAction<JeLine[]>>;
  coa: { canonical_name: string; account_type: string; normal_balance: string }[];
}) {
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [acQuery, setAcQuery] = useState("");

  const update = (i: number, patch: Partial<JeLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addLine = (after: number) =>
    setLines((prev) => {
      const next = [...prev];
      next.splice(after + 1, 0, { account: "", side: prev[after]?.side ?? "debit", label: "???", tooltip: "" });
      return next;
    });

  const suggestions = useMemo(() => {
    const q = acQuery.trim().toLowerCase();
    if (!q) return [];
    return coa.filter((a) => a.canonical_name.toLowerCase().includes(q)).slice(0, 6);
  }, [coa, acQuery]);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">
        Lines — <span className="text-muted-foreground">Enter adds a row · amounts stay ??? (label them instead)</span>
      </Label>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="w-8 px-1 py-1.5"></th>
              <th className="px-2 py-1.5">Account</th>
              <th className="w-20 px-2 py-1.5">Side</th>
              <th className="w-28 px-2 py-1.5">Amount label</th>
              <th className="px-2 py-1.5">Tooltip (behind the scenes)</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l, i) => (
              <tr key={i} className={cn(l.side === "credit" && "bg-muted/20")}>
                <td className="px-1 text-center text-muted-foreground"><GripVertical className="mx-auto h-3 w-3" /></td>
                <td className="relative px-1 py-1">
                  <Input
                    value={l.account}
                    onChange={(e) => { update(i, { account: e.target.value }); setActiveRow(i); setAcQuery(e.target.value); }}
                    onFocus={() => { setActiveRow(i); setAcQuery(l.account); }}
                    onBlur={() => setTimeout(() => setActiveRow((r) => (r === i ? null : r)), 150)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(i); } }}
                    placeholder={l.side === "credit" ? "    Credit account…" : "Debit account…"}
                    className={cn("h-7 text-xs", l.side === "credit" && "pl-6")}
                  />
                  {activeRow === i && suggestions.length > 0 && (
                    <div className="absolute left-1 right-1 z-20 mt-0.5 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                      {suggestions.map((s) => (
                        <button key={s.canonical_name} type="button"
                          onMouseDown={(e) => { e.preventDefault(); update(i, { account: s.canonical_name }); setActiveRow(null); }}
                          className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-muted">
                          <span>{s.canonical_name}</span>
                          <span className="ml-auto text-[9px] text-muted-foreground">{s.account_type} · {s.normal_balance}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-1 py-1">
                  <button type="button"
                    onClick={() => update(i, { side: l.side === "debit" ? "credit" : "debit" })}
                    className={cn("w-full rounded border px-1 py-0.5 text-[10px] font-semibold",
                      l.side === "debit" ? "border-emerald-400 text-emerald-700" : "border-amber-400 text-amber-700")}>
                    {l.side === "debit" ? "Dr" : "Cr"}
                  </button>
                </td>
                <td className="px-1 py-1">
                  <Input value={l.label} onChange={(e) => update(i, { label: e.target.value })} className="h-7 font-mono text-xs" />
                </td>
                <td className="px-1 py-1">
                  <Input value={l.tooltip} onChange={(e) => update(i, { tooltip: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(i); } }}
                    placeholder="why / where this number comes from" className="h-7 text-xs" />
                </td>
                <td className="px-1 text-center">
                  <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-red-600" tabIndex={-1}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" size="sm" variant="outline" className="h-7 w-fit text-xs" onClick={() => addLine(lines.length - 1)}>
        <Plus className="h-3 w-3" /> Add line
      </Button>
    </div>
  );
}

export default ResourceBankSection;
