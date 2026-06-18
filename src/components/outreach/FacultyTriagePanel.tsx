import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X, ExternalLink, Loader2, Inbox, ArrowUp, ArrowDown, ArrowUpDown, Tag, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";

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
  fetchTagsFromOtherCampuses,
  fetchTriageRows, importKeptLeads, setTriageFlag,
  setTriageTagsBulk, unimportLead, type TriageRow,
} from "@/lib/faculty-triage";

import {
  INTRO_TARGET_TAG, ROLE_KEYWORDS, isIntroLikely, matchRoles,
} from "@/lib/role-keywords";

type SortKey = "title" | "name";

export type TriageStats = { leads: number; kept: number; pending: number; tagged: number };



export function FacultyTriagePanel({
  campusId,
  campusName,
  refreshToken,
  hideHeader = false,
  onStatsChange,
}: {
  campusId: string;
  campusName: string;
  /** Bumped after a scrape completes to force a reload. */
  refreshToken?: number;
  /** Hide the panel's internal header (use when parent provides its own import button & stats). */
  hideHeader?: boolean;
  /** Fires whenever counts change so the parent can mirror them in its own toolbar. */
  onStatsChange?: (s: TriageStats) => void;
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
  // Click-and-drag selection. Refs so we don't churn renders during mousemove.
  const dragAnchorRef = useRef<string | null>(null);
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);
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

  // Auto-tag intro-likely rows with "Intro Target" as soon as they appear
  // (once per row, idempotent). Lets the user skip Step #3 — every checked
  // row will be imported when they click Import Leads.
  const autoTaggedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading || rows.length === 0) return;
    const toTag: string[] = [];
    for (const r of rows) {
      if (autoTaggedRef.current.has(r.id)) continue;
      autoTaggedRef.current.add(r.id);
      const hasTag = (r.title_tags ?? [])
        .map((t) => t.toLowerCase())
        .includes(INTRO_TARGET_TAG.toLowerCase());
      if (!hasTag && isIntroLikely(r.title)) toTag.push(r.id);
    }
    if (toTag.length === 0) return;
    // Optimistic local update, then persist quietly.
    setRows((prev) => prev.map((r) =>
      toTag.includes(r.id)
        ? { ...r, title_tags: Array.from(new Set([...(r.title_tags ?? []), INTRO_TARGET_TAG])) }
        : r,
    ));
    void setTriageTagsBulk(toTag, "add", [INTRO_TARGET_TAG], tagsCurrentById)
      .catch(() => { /* surface only on retry */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, loading]);


  // Clear selection on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setSelected(new Set()); setLastClickedId(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clear selection when clicking outside the panel (ignore Radix portals: dropdowns/dialogs/popovers/tooltips/toasts)
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (selected.size === 0) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (t.closest('[data-radix-popper-content-wrapper],[role="menu"],[role="dialog"],[role="tooltip"],[data-sonner-toaster],[data-radix-portal]')) return;
      setSelected(new Set());
      setLastClickedId(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [selected.size]);

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


  const onRowClick = (id: string, e: React.MouseEvent) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
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

  // Drag-select: hold mouse down on a row, drag across rows to highlight all
  // of them at once. A real drag (≥2 rows touched) suppresses the trailing
  // click so we don't accidentally toggle the anchor row off.
  const onRowMouseDown = (id: string) => {
    dragAnchorRef.current = id;
    dragMovedRef.current = false;
  };
  const onRowMouseEnter = (id: string) => {
    if (!dragAnchorRef.current) return;
    dragMovedRef.current = true;
    setSelected((prev) => {
      const order = sortedRows.map((r) => r.id);
      const a = order.indexOf(dragAnchorRef.current!);
      const b = order.indexOf(id);
      if (a < 0 || b < 0) return prev;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) next.add(order[i]);
      return next;
    });
  };
  useEffect(() => {
    function onUp() {
      if (dragMovedRef.current) suppressClickRef.current = true;
      dragAnchorRef.current = null;
      dragMovedRef.current = false;
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);


  const selectedRows = useMemo(
    () => sortedRows.filter((r) => selected.has(r.id)),
    [sortedRows, selected],
  );

  const tagsCurrentById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) m.set(r.id, r.title_tags ?? []);
    return m;
  }, [rows]);


  /** Every tag currently applied to any row in this campus, A–Z. */
  const allKnownTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const t of r.title_tags ?? []) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [rows]);

  /** Tag suggestions for the current selection. Combines:
   *   - role keywords detected in any selected person's title
   *   - tags already in use elsewhere in this campus that match a selected title
   *  Excludes tags every selected row already has. */
  const suggestedTags = useMemo(() => {
    if (selectedRows.length === 0) return [] as string[];
    const out = new Set<string>();
    for (const r of selectedRows) {
      const title = (r.title ?? "").trim();
      if (!title) continue;
      for (const label of matchRoles(title)) out.add(label);
      for (const t of allKnownTags) {
        if (t.toLowerCase() === title.toLowerCase()) out.add(t);
      }
    }
    const everyHas = (tag: string) =>
      selectedRows.every((r) => (r.title_tags ?? []).map((x) => x.toLowerCase()).includes(tag.toLowerCase()));
    return Array.from(out).filter((t) => !everyHas(t)).sort();
  }, [selectedRows, allKnownTags]);

  /** Step #3 — title-driven chips. Each role keyword that matches at least one
   *  row in this campus becomes a one-click chip. Click = add tag to every
   *  matching row. Click again (when every match already has the tag) = remove. */
  const roleChips = useMemo(() => {
    return ROLE_KEYWORDS.map(({ label, re, intro }) => {
      const matchedIds: string[] = [];
      for (const r of rows) if (re.test((r.title ?? "").trim())) matchedIds.push(r.id);
      if (matchedIds.length === 0) return null;
      const allTagged = matchedIds.every((id) =>
        (rows.find((r) => r.id === id)?.title_tags ?? [])
          .map((t) => t.toLowerCase())
          .includes(label.toLowerCase()),
      );
      return { label, intro, matchedIds, allTagged };
    }).filter((x): x is { label: string; intro: boolean; matchedIds: string[]; allTagged: boolean } => x !== null);
  }, [rows]);

  /** Rows that qualify as Intro 1 / Intro 2 likely teachers. */
  const introMatchIds = useMemo(
    () => rows.filter((r) => isIntroLikely(r.title)).map((r) => r.id),
    [rows],
  );
  const introAllTagged = useMemo(
    () =>
      introMatchIds.length > 0 &&
      introMatchIds.every((id) =>
        (rows.find((r) => r.id === id)?.title_tags ?? [])
          .map((t) => t.toLowerCase())
          .includes(INTRO_TARGET_TAG.toLowerCase()),
      ),
    [rows, introMatchIds],
  );

  /** Cross-campus tag suggestions: tags used on prior campuses whose source
   *  titles share keywords with titles seen on this campus. Excludes tags
   *  already represented by a built-in role chip or already in use here. */
  const pastTagsQuery = useQuery({
    queryKey: ["faculty-triage-past-tags", campusId],
    queryFn: () => fetchTagsFromOtherCampuses(campusId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const pastCampusSuggestions = useMemo(() => {
    const past = pastTagsQuery.data ?? [];
    if (past.length === 0 || rows.length === 0) return [] as string[];
    const builtin = new Set(ROLE_KEYWORDS.map((k) => k.label.toLowerCase()));
    const here = new Set(allKnownTags.map((t) => t.toLowerCase()));
    // Build a vocabulary of significant words from this campus's titles.
    const stop = new Set(["the","of","and","for","a","an","in","on","to","at","de","la"]);
    const vocab = new Set<string>();
    for (const r of rows) {
      for (const w of ((r.title ?? "").toLowerCase().match(/[a-z][a-z\-]{2,}/g) ?? [])) {
        if (!stop.has(w)) vocab.add(w);
      }
    }
    const out: string[] = [];
    for (const { tag, sourceTitle } of past) {
      if (builtin.has(tag.toLowerCase())) continue;
      if (here.has(tag.toLowerCase())) continue;
      const words = (sourceTitle.toLowerCase().match(/[a-z][a-z\-]{2,}/g) ?? [])
        .filter((w) => !stop.has(w));
      if (words.some((w) => vocab.has(w))) out.push(tag);
    }
    return Array.from(new Set(out)).slice(0, 8);
  }, [pastTagsQuery.data, rows, allKnownTags]);



  /** Remove a tag from every row in this campus (used by the dropdown ×). */
  const removeTagFromCampus = async (tag: string) => {
    if (!confirm(`Remove tag "${tag}" from every person in this campus?`)) return;
    const targets = rows.filter((r) => (r.title_tags ?? []).includes(tag));
    if (targets.length === 0) return;
    const ids = targets.map((r) => r.id);
    setRows((prev) => prev.map((r) =>
      ids.includes(r.id)
        ? { ...r, title_tags: (r.title_tags ?? []).filter((t) => t !== tag) }
        : r,
    ));
    try {
      await setTriageTagsBulk(ids, "remove", [tag], tagsCurrentById);
      toast.success(`Removed "${tag}" from ${ids.length} row${ids.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(`Could not remove tag: ${e instanceof Error ? e.message : "unknown"}`);
      void load();
    }
  };

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

  /** Apply (or remove) a single tag on a specific set of rows, regardless of
   *  the current selection. Used by the Step #3 chip panel. */
  const applyTagToIds = async (ids: string[], tag: string, mode: "add" | "remove") => {
    if (ids.length === 0) return;
    setRows((prev) => prev.map((r) => {
      if (!ids.includes(r.id)) return r;
      const cur = r.title_tags ?? [];
      const next = mode === "add"
        ? Array.from(new Set([...cur, tag]))
        : cur.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      return { ...r, title_tags: next };
    }));
    try {
      await setTriageTagsBulk(ids, mode, [tag], tagsCurrentById);
      toast.success(
        `${mode === "add" ? "Tagged" : "Untagged"} ${ids.length} matching row${ids.length === 1 ? "" : "s"} · "${tag}"`,
      );
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
      qc.invalidateQueries({ queryKey: ["campus-lead-stats"] });
      qc.invalidateQueries({ queryKey: ["cold-imported-lead-counts-rmp"] });
      qc.invalidateQueries({ queryKey: ["lead-suggestions"] });
      await load();

    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setImporting(false);
    }
  };

  const importedCount = rows.filter((r) => r.imported_lead_id).length;
  // "tagged" for the Import button = tagged AND not yet imported. Already-
  // imported rows show as checked but don't re-trigger an insert.
  const taggedCount = rows.filter(
    (r) => (r.title_tags ?? []).length > 0 && !r.imported_lead_id,
  ).length;
  const untaggedCount = rows.length - taggedCount - importedCount;

  useEffect(() => {
    // `kept` mirrors `tagged` now — tagging is the keep signal.
    onStatsChange?.({ leads: rows.length, kept: taggedCount, pending: untaggedCount, tagged: taggedCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, taggedCount, untaggedCount]);


  return (
    <div ref={panelRef} className="rounded-lg border border-border bg-card">
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <div className="text-sm font-semibold">Faculty triage — {campusName}</div>
            <div className="text-[11px] text-muted-foreground">
              {loading ? "Loading…" : `${rows.length} lead${rows.length === 1 ? "" : "s"} · ${importedCount} imported · ${taggedCount} tagged`}
            </div>

          </div>
          <Button
            size="sm"
            onClick={onImport}
            disabled={importing || taggedCount === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {importing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</> : <>Import {taggedCount} tagged lead{taggedCount === 1 ? "" : "s"}</>}
          </Button>
        </div>
      )}


      {/* Step #3 chip panel removed — intro-likely rows are auto-tagged on load
          and shown as checked rows below. Power users can still adjust tags via
          the toolbar (All tags dropdown / new-tag input). */}


      {false && (
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs">

        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">
          {selected.size > 0 ? <><span className="font-medium text-foreground">{selected.size} selected</span> — tag as:</> : "Select rows to tag — pick from:"}
        </span>

        {/* All tags dropdown (A–Z). Click a tag to add to selection; × deletes from every row in this campus. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]">
              All tags ({allKnownTags.length}) <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
            {allKnownTags.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                No tags yet. Type below and Add.
              </div>
            ) : (
              allKnownTags.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={(e) => {
                    e.preventDefault();
                    if (selected.size === 0) {
                      toast.info("Select at least one row first.");
                      return;
                    }
                    applyTagsToSelection([t], "add");
                  }}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">{t}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      void removeTagFromCampus(t);
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete this tag from every person in this campus"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Suggested tags — role keywords detected in selected titles. */}
        {selected.size > 0 && suggestedTags.length > 0 && (
          <>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested:</span>
            {suggestedTags.slice(0, 6).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => applyTagsToSelection([t], "add")}
                title={`Tag ${selected.size} selected as "${t}"`}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                + {t}
              </button>
            ))}
          </>
        )}


        <div className="flex items-center gap-1">
          <Input
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customTag.trim()) {
                if (selected.size === 0) { toast.info("Select at least one row first."); return; }
                applyTagsToSelection([customTag.trim()], "add");
                setCustomTag("");
              }
            }}
            placeholder="new tag…"
            className="h-7 w-36 text-[11px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={!customTag.trim() || selected.size === 0}
            onClick={() => {
              applyTagsToSelection([customTag.trim()], "add");
              setCustomTag("");
            }}
            title={selected.size === 0 ? "Select rows first" : "Add this tag to the selected rows"}
          >
            Add
          </Button>
        </div>


        {selected.size > 0 && (
          <button
            type="button"
            className="ml-auto text-[11px] text-muted-foreground underline"
            onClick={() => { setSelected(new Set()); setLastClickedId(null); }}
          >
            Clear selection (Esc)
          </button>
        )}
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
              <TableHead className="w-[40px] text-center">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Import?">Imp</span>
              </TableHead>
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
              <TableHead className="w-[24%]">Email</TableHead>
              <TableHead className="w-[90px] text-center" title="RateMyProfessors rating (lower = better lead)">RMP</TableHead>
              <TableHead className="w-[110px] text-center">Creds</TableHead>

            </TableRow>
          </TableHeader>

          <TableBody>
            {sortedRows.map((r) => {
              const isSel = selected.has(r.id);
              const hasTags = (r.title_tags ?? []).length > 0;
              const isImported = !!r.imported_lead_id;
              const checked = isImported || hasTags;
              return (
                <TableRow
                  key={r.id}
                  className={[
                    "group",
                    isImported ? "bg-sky-50/60" : hasTags ? "bg-emerald-50/40" : "",
                    isSel ? "ring-1 ring-inset ring-amber-400 bg-amber-50/60" : "",
                  ].join(" ")}
                >
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (!next && isImported) {
                          // Un-import: delete the outreach_lead. Cascades take
                          // care of campaign_leads / send_log / email_events.
                          const who = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.email || "this lead";
                          if (!confirm(`Un-import ${who}? This deletes the lead row and removes it from any campaigns.`)) return;
                          const leadId = r.imported_lead_id!;
                          setRows((prev) => prev.map((x) =>
                            x.id === r.id ? { ...x, imported_lead_id: null, title_tags: [] } : x,
                          ));
                          void unimportLead(leadId)
                            .then(() => {
                              toast.success(`Un-imported ${who}`);
                              qc.invalidateQueries({ queryKey: ["outreach-leads"] });
                              qc.invalidateQueries({ queryKey: ["outreach-leads-total"] });
                              qc.invalidateQueries({ queryKey: ["campus-lead-stats"] });
                              qc.invalidateQueries({ queryKey: ["cold-imported-lead-counts-rmp"] });
                            })
                            .catch((err) => {
                              toast.error(`Un-import failed: ${err instanceof Error ? err.message : "unknown"}`);
                              void load();
                            });
                          return;
                        }
                        if (next) {
                          void applyTagToIds([r.id], INTRO_TARGET_TAG, "add");
                        } else {
                          const cur = r.title_tags ?? [];
                          if (cur.length === 0) return;
                          setRows((prev) => prev.map((x) =>
                            x.id === r.id ? { ...x, title_tags: [] } : x,
                          ));
                          void setTriageTagsBulk([r.id], "remove", cur, tagsCurrentById)
                            .catch((err) => {
                              toast.error(`Could not update: ${err instanceof Error ? err.message : "unknown"}`);
                              void load();
                            });
                        }
                      }}
                      className={`h-4 w-4 cursor-pointer ${isImported ? "accent-sky-600" : "accent-emerald-600"}`}
                      title={
                        isImported
                          ? "Already imported as a lead. Uncheck to un-import (deletes the lead)."
                          : hasTags
                            ? "Will be imported as a lead. Uncheck to skip."
                            : "Check to import this row as a lead."
                      }
                    />
                  </TableCell>

                  <TableCell
                    className="cursor-pointer select-none font-medium"
                    onClick={(e) => onRowClick(r.id, e)}
                    onMouseDown={(e) => { if (e.button === 0) onRowMouseDown(r.id); }}
                    onMouseEnter={() => onRowMouseEnter(r.id)}
                    title="Click to select. Click + drag across rows for multi-select. Shift-click for range."
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
                    onMouseDown={(e) => { if (e.button === 0) onRowMouseDown(r.id); }}
                    onMouseEnter={() => onRowMouseEnter(r.id)}
                    title="Click to select. Click + drag across rows for multi-select."
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
                  <TableCell className="text-center text-xs tabular-nums">
                    {r.rmp_rating != null ? (
                      r.rmp_profile_url ? (
                        <a
                          href={r.rmp_profile_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 hover:underline"
                          title={`${r.rmp_num_ratings ?? 0} ratings · difficulty ${r.rmp_difficulty?.toFixed(1) ?? "—"} · ${r.rmp_would_take_again != null ? Math.round(r.rmp_would_take_again) + "% take again" : "no take-again %"}`}
                        >
                          <span className="text-amber-500">★</span>
                          <span className="font-medium">{r.rmp_rating.toFixed(1)}</span>
                          {r.rmp_num_ratings != null && (
                            <span className="text-muted-foreground">({r.rmp_num_ratings})</span>
                          )}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-amber-500">★</span>
                          <span className="font-medium">{r.rmp_rating.toFixed(1)}</span>
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How tagging &amp; triage works</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed">
            <div>
              <div className="font-semibold">Selecting rows</div>
              <ul className="ml-4 list-disc text-muted-foreground">
                <li>Click a <em>Name</em> or <em>Title</em> cell to select that row.</li>
                <li><kbd className="rounded border px-1 text-xs">Shift</kbd>-click another row to fill the range.</li>
                <li><kbd className="rounded border px-1 text-xs">Cmd</kbd>/<kbd className="rounded border px-1 text-xs">Ctrl</kbd>-click to toggle one row.</li>
                <li>Press <kbd className="rounded border px-1 text-xs">Esc</kbd> to clear selection.</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold">Tags</div>
              <ul className="ml-4 list-disc text-muted-foreground">
                <li>Tags are short labels like <em>Assistant Professor</em> or <em>Intermediate I</em>.</li>
                <li>Open <strong>All tags</strong> and click one to add it to every selected row.</li>
                <li>Type in <em>new tag</em> and click <strong>Add</strong> to create a brand-new tag. It will show up in <strong>All tags</strong> after.</li>
                <li>Click the <strong>×</strong> next to a tag in the dropdown to delete it from every person in this campus.</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold">PhD &amp; CPA (not tags)</div>
              <ul className="ml-4 list-disc text-muted-foreground">
                <li>Tick <strong>PhD</strong> if you see <em>PhD</em>, <em>Ph.D.</em>, <em>D.B.A.</em>, or <em>Ed.D.</em> — this turns on the “Dr. {`{LastName}`}” greeting in emails.</li>
                <li>Tick <strong>CPA</strong> if you see <em>CPA</em> — used to send the right pitch.</li>
              </ul>
            </div>
            <div>
              <div className="font-semibold">Importing</div>
              <ul className="ml-4 list-disc text-muted-foreground">
                <li>Any row with at least one tag is imported as a lead when you click <em>Step #4 · Import Leads</em>.</li>
                <li>Untagged rows are left alone — no Keep/Skip needed.</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
