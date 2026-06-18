import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, ExternalLink, Loader2, Inbox, ArrowUp, ArrowDown, ArrowUpDown, Tag, ChevronDown, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  fetchTriageRows, importKeptLeads, setTriageFlag, setTriageStatus,
  setTriageTagsBulk, type TriageRow,
} from "@/lib/faculty-triage";

function toTriageStatus(status: string | null): "pending_triage" | "kept" | "skipped" {
  if (status === "accepted" || status === "kept") return "kept";
  if (status === "rejected" || status === "skipped") return "skipped";
  return "pending_triage";
}

type SortKey = "title" | "name";

export function FacultyTriagePanel({
  campusId,
  campusName,
  refreshToken,
}: {
  campusId: string;
  campusName: string;
  /** Bumped after a scrape completes to force a reload. */
  refreshToken?: number;
}) {
  const [rows, setRows] = useState<TriageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const qc = useQueryClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchTriageRows(campusId));
    } catch (e) {
      toast.error(`Could not load candidates: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoading(false);
    }
  }, [campusId]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // Clear selection on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setSelected(new Set()); setLastClickedId(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sortedRows = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (r: TriageRow) =>
      sortKey === "title"
        ? (r.title ?? "").trim()
        : `${r.last_name ?? ""} ${r.first_name ?? ""}`.trim();
    return [...rows].sort((a, b) => {
      const av = get(a), bv = get(b);
      const aE = !av, bE = !bv;
      if (aE !== bE) return aE ? 1 : -1;
      return collator.compare(av, bv) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };
  const sortIcon = (k: SortKey) =>
    sortKey !== k ? <ArrowUpDown className="h-3 w-3 opacity-50" />
      : sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;

  const update = (id: string, patch: Partial<TriageRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const onFlag = async (id: string, field: "is_phd" | "is_cpa", value: boolean) => {
    update(id, { [field]: value } as Partial<TriageRow>);
    try { await setTriageFlag(id, { [field]: value }); }
    catch (e) { toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`); void load(); }
  };

  const onStatus = async (id: string, status: "kept" | "skipped" | "pending_triage") => {
    update(id, { status });
    try { await setTriageStatus(id, status); }
    catch (e) { toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`); void load(); }
  };

  const onRowClick = (id: string, e: React.MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedId) {
        // Range select on the currently-sorted order
        const order = sortedRows.map((r) => r.id);
        const a = order.indexOf(lastClickedId);
        const b = order.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(order[i]);
        } else next.add(id);
      } else if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id); else next.add(id);
      } else {
        // Plain click: toggle this row (sticky selection so multi-tag is easy)
        if (next.has(id) && next.size === 1) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    setLastClickedId(id);
  };

  const selectedRows = useMemo(
    () => sortedRows.filter((r) => selected.has(r.id)),
    [sortedRows, selected],
  );

  const tagsCurrentById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) m.set(r.id, r.title_tags ?? []);
    return m;
  }, [rows]);

  const distinctTitleStringsInSelection = useMemo(() => {
    const set = new Set<string>();
    for (const r of selectedRows) {
      const t = (r.title ?? "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [selectedRows]);

  const applyTagsToSelection = async (tags: string[], mode: "add" | "remove" | "replace") => {
    if (selected.size === 0 || tags.length === 0) return;
    const ids = Array.from(selected);
    // optimistic
    setRows((prev) => prev.map((r) => {
      if (!selected.has(r.id)) return r;
      const cur = r.title_tags ?? [];
      let next: string[];
      if (mode === "replace") next = Array.from(new Set(tags));
      else if (mode === "add") next = Array.from(new Set([...cur, ...tags]));
      else next = cur.filter((t) => !tags.includes(t));
      return { ...r, title_tags: next };
    }));
    try {
      await setTriageTagsBulk(ids, mode, tags, tagsCurrentById);
      toast.success(`${mode === "add" ? "Tagged" : mode === "remove" ? "Untagged" : "Replaced tags on"} ${ids.length} row${ids.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(`Tagging failed: ${e instanceof Error ? e.message : "unknown"}`);
      void load();
    }
  };

  const onImport = async () => {
    setImporting(true);
    try {
      const result = await importKeptLeads(campusId);
      const parts = [
        `Imported ${result.inserted} new lead${result.inserted === 1 ? "" : "s"}`,
      ];
      if (result.mergedTags) parts.push(`merged tags onto ${result.mergedTags} existing`);
      if (result.skipped) parts.push(`skipped ${result.skipped} duplicate`);
      toast.success(parts.join(" · "));
      qc.invalidateQueries({ queryKey: ["outreach-leads"] });
      await load();
    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setImporting(false);
    }
  };

  const keptCount = rows.filter((r) => toTriageStatus(r.status) === "kept").length;
  const pendingCount = rows.filter((r) => toTriageStatus(r.status) === "pending_triage").length;
  const taggedCount = rows.filter((r) => (r.title_tags ?? []).length > 0).length;
  const hasAnyTags = taggedCount > 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold">Faculty triage — {campusName}</div>
          <div className="text-[11px] text-muted-foreground">
            {loading
              ? "Loading…"
              : `${rows.length} candidate${rows.length === 1 ? "" : "s"} · ${pendingCount} pending · ${keptCount} kept · ${taggedCount} tagged`}
          </div>
        </div>
        <Button
          size="sm"
          onClick={onImport}
          disabled={importing || keptCount === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {importing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</> : <>Import {keptCount} kept lead{keptCount === 1 ? "" : "s"}</>}
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50/70 px-4 py-2 text-xs">
          <Tag className="h-3.5 w-3.5 text-amber-700" />
          <span className="font-medium text-amber-900">
            {selected.size} selected
          </span>
          <span className="text-amber-700">— tag as:</span>
          {distinctTitleStringsInSelection.map((t) => (
            <Button
              key={t}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px] border-amber-300 bg-white hover:bg-amber-100"
              onClick={() => applyTagsToSelection([t], "add")}
            >
              <Plus className="h-3 w-3" /> {t}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Input
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customTag.trim()) {
                  applyTagsToSelection([customTag.trim()], "add");
                  setCustomTag("");
                }
              }}
              placeholder="custom tag…"
              className="h-6 w-32 text-[11px]"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={!customTag.trim()}
              onClick={() => {
                applyTagsToSelection([customTag.trim()], "add");
                setCustomTag("");
              }}
            >
              Add
            </Button>
          </div>
          <button
            type="button"
            className="ml-auto text-[11px] text-amber-800 underline"
            onClick={() => { setSelected(new Set()); setLastClickedId(null); }}
          >
            Clear selection (Esc)
          </button>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading candidates…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-muted-foreground">
          <Inbox className="h-6 w-6" />
          <div className="text-sm">No candidates yet.</div>
          <div className="text-[11px]">Click <strong>Scrape faculty</strong> above to pull names from the school's directory page(s).</div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">
                <button type="button" onClick={() => toggleSort("name")}
                  className="inline-flex items-center gap-1 hover:text-foreground">
                  Name {sortIcon("name")}
                </button>
              </TableHead>
              <TableHead className="w-[16%]">
                <button type="button" onClick={() => toggleSort("title")}
                  className="inline-flex items-center gap-1 hover:text-foreground">
                  Title {sortIcon("title")}
                </button>
              </TableHead>
              <TableHead className="w-[20%]">Email</TableHead>
              {hasAnyTags && <TableHead className="w-[18%]">Tags</TableHead>}
              <TableHead className="w-[110px] text-center">Creds</TableHead>
              <TableHead className="w-[140px] text-center">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((r) => {
              const status = toTriageStatus(r.status);
              const isSel = selected.has(r.id);
              const tags = r.title_tags ?? [];
              return (
                <TableRow
                  key={r.id}
                  className={[
                    "group",
                    status === "skipped" ? "opacity-50" : "",
                    status === "kept" ? "bg-emerald-50/40" : "",
                    isSel ? "ring-1 ring-inset ring-amber-400 bg-amber-50/60" : "",
                  ].join(" ")}
                >
                  <TableCell
                    className="cursor-pointer select-none font-medium"
                    onClick={(e) => onRowClick(r.id, e)}
                    title="Click to select. Shift-click to fill range. Cmd/Ctrl-click to toggle."
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {(r.first_name ?? "") + " " + (r.last_name ?? "")}
                      {r.source_url && (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                          title="Open source page"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </span>
                  </TableCell>
                  <TableCell
                    className="cursor-pointer select-none text-xs text-muted-foreground"
                    onClick={(e) => onRowClick(r.id, e)}
                    title="Click to select. Shift-click to fill range."
                  >
                    {r.title ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.email ? (
                      <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a>
                    ) : (
                      <span className="text-amber-700">no email found</span>
                    )}
                  </TableCell>
                  {hasAnyTags && (
                    <TableCell className="text-xs">
                      {tags.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="cursor-pointer border-amber-300 bg-amber-50 text-[10px] text-amber-900 hover:bg-amber-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = tags.filter((x) => x !== t);
                                update(r.id, { title_tags: next });
                                setTriageTagsBulk([r.id], "replace", next, tagsCurrentById)
                                  .catch(() => void load());
                              }}
                              title="Click to remove"
                            >
                              {t} ✕
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onFlag(r.id, "is_phd", !r.is_phd)}
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition ${
                          r.is_phd
                            ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                        title="Toggle PhD"
                      >
                        PhD
                      </button>
                      <button
                        type="button"
                        onClick={() => onFlag(r.id, "is_cpa", !r.is_cpa)}
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition ${
                          r.is_cpa
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                        title="Toggle CPA"
                      >
                        CPA
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="sm"
                        variant={status === "kept" ? "default" : "outline"}
                        className={status === "kept" ? "h-7 bg-emerald-600 hover:bg-emerald-700 px-2 text-xs" : "h-7 px-2 text-xs"}
                        onClick={() => onStatus(r.id, status === "kept" ? "pending_triage" : "kept")}
                      >
                        <Check className="h-3 w-3" /> Keep
                      </Button>
                      <Button
                        size="sm"
                        variant={status === "skipped" ? "default" : "outline"}
                        className={status === "skipped" ? "h-7 bg-muted-foreground hover:bg-muted-foreground/90 px-2 text-xs" : "h-7 px-2 text-xs"}
                        onClick={() => onStatus(r.id, status === "skipped" ? "pending_triage" : "skipped")}
                      >
                        <X className="h-3 w-3" /> Skip
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
