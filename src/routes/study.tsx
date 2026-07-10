// /study — the student study surface (formerly /je; a permanent 301 redirect lives at
// src/routes/je.tsx + je.$.tsx). Journal Entry Scenario Engine (v2 layout).
//
// The journal entry is the ANCHOR. Everything is arranged as a hierarchy that flows
// out of it:  Chart of Accounts → JOURNAL ENTRY → (Ledger | Statements) → Equation.
// Toggle a condition and the entry + every downstream projection re-derive LIVE. All
// projections come from the pure engine in src/lib/je-engine.ts ("one truth, many views").
//
// v2 adds: a chapter browser (reuses the existing chapters/courses tables), collapsible
// panels with thin connector arrows that light up as you trace a line through the system,
// contextual "why/how" panels, and flag-gated placeholders (sequence sidebar, practice
// exam questions, memorization grid, and a disabled "reveal numbers" seam). Amounts stay
// ??? in Phase 1 — the pedagogy lives in the structure.
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Lock, PencilLine, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { isAdminUnlocked } from "@/components/AdminGate";
import { saveScenarioDoc } from "@/lib/je.functions";
import { scenarioDocV2Schema } from "@/lib/je/scenario-schema";
import {
  fetchAccountMeta,
  fetchJeBrowserTree,
  fetchPrinciples,
  type BrowserChapter,
  type BrowserCourse,
} from "@/lib/je-api";
import {
  deriveEquationEffect,
  deriveLedger,
  deriveStatementEffects,
  resolveComputationPath,
  resolveVariant,
  tracePostingsToStatementLine,
  type AccountMeta,
  type Dir,
  type EngineLine,
  type EntryTemplate,
  type ScenarioDoc,
} from "@/lib/je-engine";
import { entryAt, type Derivation, type DerivedEntry } from "@/lib/je/amortization";
import { buildExplore, formatEvent, resolveLiteralAmount } from "@/lib/je/explore";
import {
  DEFAULT_PANELS,
  getGlobalPanels,
  PANEL_KEYS,
  resolveVisiblePanels,
  setGlobalPanels,
  type PanelKey,
} from "@/lib/je/panel-settings";
import {
  Amount,
  DerivationPopover,
  GivenLine,
  LifeTAccounts,
  MemorizeSection,
  PresentationBlock,
  ScheduleTable,
  type PopoverState,
} from "@/components/je/explore";
import { BuildMode } from "@/components/je/build-mode";
import { PresentMode } from "@/components/je/present-mode";
import { buildDocQuestions, Hub, InlineQuestions, MemorizeDeck, PracticeMix } from "@/components/je/hub";
import { ChapterGrid } from "@/components/je/chapter-grid";

// Accounts that make an entry a "periodic interest payment" (schedule-driven → row-click drives it).
const PAYMENT_ACCTS = new Set([
  "Interest Expense",
  "Cash",
  "Discount on Bonds Payable",
  "Premium on Bonds Payable",
]);
const AUTHORED_PERIOD = 1; // authored entries bind schedule:1 → period 1 keeps the teaching notes

export const Route = createFileRoute("/study")({
  head: () => ({
    meta: [
      { title: "Study — Survive Accounting" },
      {
        name: "description",
        content:
          "Work real accounting journal-entry scenarios: toggle the conditions and watch the entry, ledger, statements, and the accounting equation re-derive live.",
      },
      { property: "og:title", content: "Study — Survive Accounting" },
      {
        property: "og:description",
        content:
          "Interactive journal-entry practice across Intro, Intermediate, and Foundations accounting.",
      },
      { property: "og:url", content: "https://surviveaccounting.com/study" },
      { name: "twitter:title", content: "Study — Survive Accounting" },
      { name: "twitter:description", content: "Interactive journal-entry practice across Intro, Intermediate, and Foundations accounting." },
    ],
    links: [{ rel: "canonical", href: "https://surviveaccounting.com/study" }],
  }),
  // ?mode=build|present makes those links shareable; anything else is Explore. (present is
  // admin-gated at render time — a non-admin ?mode=present falls back to Explore.)
  validateSearch: (s: Record<string, unknown>): { mode?: "build" | "present" } => ({
    mode: s.mode === "build" ? "build" : s.mode === "present" ? "present" : undefined,
  }),
  component: JePrototype,
});

// Brand
const NAVY = "#14213D";
const RED = "#CE1126";

const lineKey = (entryId: string, lineId: string) => `${entryId}:${lineId}`;
const courseKey = (c: BrowserCourse) => c.id ?? "__unassigned_course__";

function chapterLabel(ch: BrowserChapter | null): string {
  if (!ch) return "this chapter";
  const name = ch.chapter_name ?? "Untitled chapter";
  return ch.chapter_number != null ? `Ch ${ch.chapter_number} · ${name}` : name;
}

function firstWithScenarios(chapters: BrowserChapter[]): BrowserChapter | undefined {
  return chapters.find((c) => c.scenarios.length > 0);
}

function defaultConditions(doc: ScenarioDoc): Record<string, string> {
  const c: Record<string, string> = {};
  for (const axis of doc.axes) c[axis.key] = axis.options[0]?.value ?? "";
  return c;
}

function JePrototype() {
  // staleTime keeps tab-switches/remounts from refetching the whole ~600KB library.
  const treeQuery = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, retry: 1, staleTime: 300_000 });
  const coaQuery = useQuery({ queryKey: ["je-coa"], queryFn: fetchAccountMeta, retry: 1, staleTime: 300_000 });
  const principlesQuery = useQuery({ queryKey: ["je-principles"], queryFn: fetchPrinciples, retry: 1, staleTime: 300_000 });

  const courses = treeQuery.data?.courses ?? [];
  const coa = coaQuery.data ?? [];
  const principles = principlesQuery.data ?? [];
  const principleLabel = useMemo(() => new Map(principles.map((p) => [p.key, p])), [principles]);
  const coaByName = useMemo(() => new Map(coa.map((a) => [a.canonical_name, a])), [coa]);

  // ---- Browse selection (course → chapter → scenario). Effective values fall back so a
  // stale id from a previous course never strands the UI. ----
  const [selectedCourseKey, setSelectedCourseKey] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const activeCourse = courses.find((c) => courseKey(c) === selectedCourseKey) ?? courses[0] ?? null;
  const chapters = activeCourse?.chapters ?? [];
  const activeChapter =
    chapters.find((c) => c.id === selectedChapterId) ?? firstWithScenarios(chapters) ?? chapters[0] ?? null;
  const scenarios = activeChapter?.scenarios ?? [];
  const activeScenario = scenarios.find((s) => s.slug === selectedSlug) ?? scenarios[0] ?? null;

  // ---- Engine-facing UI state ----
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const [highlightAccount, setHighlightAccount] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ coa: true });
  const toggleCollapse = (id: string) => setCollapsed((p) => ({ ...p, [id]: !p[id] }));

  // ---- Admin raw editor (visible only behind the same AdminGate flag /outreach uses).
  // Raw doc JSON + Zod validation IS the whole feature — no pretty authoring UI.
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState(false);
  useEffect(() => setAdmin(isAdminUnlocked()), []); // localStorage only exists client-side

  // Global panel-visibility defaults (localStorage). Load client-side to avoid a hydration
  // mismatch; a doc's ui.panels overrides these per scenario.
  const [globalPanels, setGlobalPanelsState] = useState<Record<PanelKey, boolean>>(DEFAULT_PANELS);
  useEffect(() => setGlobalPanelsState(getGlobalPanels()), []);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const toggleGlobalPanel = (k: PanelKey) =>
    setGlobalPanelsState((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      setGlobalPanels(next);
      return next;
    });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorText, setEditorText] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);

  const openEditor = () => {
    if (!activeScenario) return;
    setEditorText(JSON.stringify(activeScenario.doc, null, 2));
    setEditorError(null);
    setEditorOpen(true);
  };

  const saveEditor = async () => {
    // Fast local validation first (same schema the server re-runs).
    let json: unknown;
    try {
      json = JSON.parse(editorText);
    } catch (e) {
      setEditorError(`Not valid JSON: ${e instanceof Error ? e.message : e}`);
      return;
    }
    const parsed = scenarioDocV2Schema.safeParse(json);
    if (!parsed.success) {
      setEditorError(
        parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n"),
      );
      return;
    }
    setEditorSaving(true);
    setEditorError(null);
    try {
      const res = await saveScenarioDoc({ data: { docJson: editorText } });
      await queryClient.invalidateQueries({ queryKey: ["je-tree"] });
      setSelectedSlug(res.slug);
      setEditorOpen(false);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditorSaving(false);
    }
  };

  // ---- Explore-mode state (numbers layer) ----
  const [seed, setSeed] = useState(1);
  const [regenerated, setRegenerated] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(AUTHORED_PERIOD);
  const [tacctView, setTacctView] = useState<"entry" | "life">("life");
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [activeTraceRefs, setActiveTraceRefs] = useState<Set<string>>(new Set());
  const [memorizeCollapsed, setMemorizeCollapsed] = useState(false);

  // Reset all derived UI state when the active scenario changes (first load included).
  useEffect(() => {
    if (!activeScenario) return;
    setConditions(pendingConditions.current ?? defaultConditions(activeScenario.doc));
    pendingConditions.current = null;
    setRevealed(new Set());
    setActiveLineKey(null);
    setHighlightAccount(null);
    setSeed(activeScenario.doc.params?.defaultSeed ?? 1);
    setRegenerated(false);
    setSelectedPeriod(AUTHORED_PERIOD);
    setTacctView("life");
    setPopover(null);
    setActiveTraceRefs(new Set());
  }, [activeScenario?.slug]);

  const doc = activeScenario?.doc ?? null;

  // Per-scenario practice questions for the Explore view (resolvable ones only —
  // literal-arithmetic for paramless docs, schedule-backed for bond docs).
  const inlineQuestions = useMemo(
    () =>
      activeScenario && doc
        ? buildDocQuestions({ slug: activeScenario.slug, title: activeScenario.title, doc })
        : [],
    [activeScenario, doc],
  );

  // Explore | Build | Present mode. Build needs a build.accountBank; Present is admin-only
  // (students never enter it — a non-admin ?mode=present resolves to Explore). URL-driven.
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const mode: "explore" | "build" | "present" =
    search.mode === "build" && doc?.build ? "build" : search.mode === "present" && admin ? "present" : "explore";
  const setMode = (m: "explore" | "build" | "present") =>
    navigate({ search: (prev) => ({ ...prev, mode: m === "explore" ? undefined : m }) });
  const [cleanScreen, setCleanScreen] = useState(false);

  const variant = doc ? resolveVariant(doc, conditions) : null;
  const entries: EntryTemplate[] = variant?.entries ?? [];
  const compPath = variant ? resolveComputationPath(variant, conditions) : null;

  // Explore context: effective params → schedule → slot resolver. null for v1/paramless docs.
  const explore = useMemo(
    () => (doc ? buildExplore(doc, conditions, seed, regenerated) : null),
    [doc, conditions, seed, regenerated],
  );
  const openPopover = (derivation: Derivation, x: number, y: number) => setPopover({ derivation, x, y });
  const toggleTraceRef = (ref: string) =>
    setActiveTraceRefs((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });

  // Any revealable numbers? true when a schedule exists OR any line carries a literal amount.
  const hasNumbers =
    !!explore ||
    entries.some((e) => e.lines.some((l) => typeof l.amount === "number" && !Number.isNaN(l.amount)));

  // A "computation scenario" (EPS, income taxes, cash flows) resolves to a variant with no
  // entries — the computationPath is the primary content, not a journal entry.
  const isComputation = !!variant && entries.length === 0;
  const resolveStep = (ref: string) => {
    if (!explore) return null;
    try {
      return explore.resolve(ref);
    } catch {
      return null;
    }
  };

  // Effective panel visibility: a doc's ui.panels overrides the global defaults.
  const visiblePanels = resolveVisiblePanels(doc?.ui?.panels, globalPanels);
  const visible = (k: PanelKey) => visiblePanels[k];
  const anyConsequenceVisible =
    (!!explore && (visible("schedule") || visible("presentation"))) ||
    (!isComputation && (visible("ledger") || visible("statements") || visible("equation")));

  // Schedule-driven entries: a single periodic-interest payment whose lines bind schedule:N
  // slots. For those, clicking a schedule row ≠ the authored period re-renders the entry via
  // entryAt(); everything else keeps its authored reveal-grid entry.
  const scheduleBound =
    !!explore &&
    entries.length === 1 &&
    entries[0].lines.some((l) => /^schedule:\d+:/.test(l.amountSlotKey ?? "")) &&
    entries[0].lines.every((l) => PAYMENT_ACCTS.has(l.account));
  const periodEntry: DerivedEntry | null = useMemo(() => {
    if (!scheduleBound || !explore || selectedPeriod === AUTHORED_PERIOD || selectedPeriod < 1) return null;
    const row = explore.schedule.rows[selectedPeriod - 1];
    if (!row) return null;
    try {
      return entryAt(explore.schedule, row.date, "payment");
    } catch {
      return null;
    }
  }, [scheduleBound, explore, selectedPeriod]);

  const ledger = useMemo(() => deriveLedger(entries, coa), [entries, coa]);
  const statementEffects = useMemo(() => deriveStatementEffects(entries, coa), [entries, coa]);
  const equation = useMemo(() => deriveEquationEffect(entries, coa), [entries, coa]);

  // Bidirectional highlight: which entry lines sit behind the highlighted account.
  const highlightRefs = useMemo(() => {
    if (!highlightAccount) return new Set<string>();
    return new Set(
      tracePostingsToStatementLine(entries, coa, highlightAccount).map((r) => lineKey(r.entryId, r.lineId)),
    );
  }, [highlightAccount, entries, coa]);

  // Accounts referenced by the current entry → the "vocabulary" shown in the COA panel.
  const usedAccounts = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; meta?: AccountMeta }[] = [];
    for (const e of entries) {
      for (const l of e.lines) {
        if (l.account && !seen.has(l.account)) {
          seen.add(l.account);
          out.push({ name: l.account, meta: coaByName.get(l.account) });
        }
      }
    }
    return out;
  }, [entries, coaByName]);

  // Ordered reveal cells (reading order): for each line, the account cell then its amount cell.
  const cellOrder = useMemo(() => {
    const ids: string[] = [];
    for (const e of entries) for (const l of e.lines) {
      ids.push(`${lineKey(e.id, l.id)}:account`);
      ids.push(`${lineKey(e.id, l.id)}:amount`);
    }
    return ids;
  }, [entries]);

  const revealNext = () => {
    const next = cellOrder.find((id) => !revealed.has(id));
    if (next) setRevealed((prev) => new Set(prev).add(next));
  };
  const revealAll = () => setRevealed(new Set(cellOrder));
  const resetReveal = () => setRevealed(new Set());
  const revealAccountsOnly = () => setRevealed(new Set(cellOrder.filter((id) => id.endsWith(":account"))));
  const revealNumbers = () =>
    setRevealed((prev) => new Set([...prev, ...cellOrder.filter((id) => id.endsWith(":amount"))]));
  const newNumbers = () => {
    setSeed((s) => s + 1);
    setRegenerated(true);
  };

  const selectLine = (entryId: string, line: EngineLine) => {
    setActiveLineKey(lineKey(entryId, line.id));
    setHighlightAccount(line.account);
  };
  const toggleHighlight = (account: string) =>
    setHighlightAccount((cur) => (cur === account ? null : account));

  const activeLine: EngineLine | null = useMemo(() => {
    if (!activeLineKey) return null;
    for (const e of entries) for (const l of e.lines) if (lineKey(e.id, l.id) === activeLineKey) return l;
    return null;
  }, [activeLineKey, entries]);

  const isSequence = !!(doc?.isSequence || doc?.sequenceGroup);
  const hasMemGrid = !!doc?.hasMemorizationGrid;

  // ---- Chapter-hub view: hub (study path) | scenario | deck | practice | grid ----
  const [view, setView] = useState<"hub" | "scenario" | "deck" | "practice" | "grid">("hub");
  useEffect(() => setView("hub"), [activeChapter?.id]);

  // Clean-screen chrome hiding applies to Present mode and the Grid view (both filming/print surfaces).
  const chromeHidden = cleanScreen && (mode === "present" || view === "grid");
  useEffect(() => {
    if (!(mode === "present" || view === "grid")) setCleanScreen(false);
  }, [mode, view]);
  const hubScenarios = useMemo(
    () => scenarios.map((s) => ({ slug: s.slug, title: s.title, doc: s.doc })),
    [scenarios],
  );
  const pendingConditions = useRef<Record<string, string> | null>(null);
  const openScenario = (slug: string, m: "explore" | "build") => {
    setSelectedSlug(slug);
    setMode(m);
    setView("scenario");
  };
  const showInTool = (slug: string, variantId?: string) => {
    const target = scenarios.find((s) => s.slug === slug);
    if (target && variantId) {
      const v = target.doc.variants.find((x) => x.id === variantId);
      if (v) pendingConditions.current = { ...defaultConditions(target.doc), ...v.conditions };
    }
    setSelectedSlug(slug);
    setMode("explore");
    setView("scenario");
  };

  // ---- Loading / error ----
  // Render the page H1 + intro even while the (client-only) scenario tree loads, so the
  // SSR markup carries exactly one H1 and a crawlable description — not just a spinner.
  if (treeQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Home</Link>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: RED }} aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>Journal Entry Scenario Engine</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The journal entry is the anchor. Toggle a condition — the entry, ledger, statements, and the accounting
          equation all re-derive live. Click a line to trace it through the system.
        </p>
        <div className="mt-10 flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (treeQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm">
        <h1 className="text-lg font-bold">Couldn't load scenarios</h1>
        <p className="mt-1 text-muted-foreground">
          Run migration <code>0021_je_scenarios.sql</code> (and <code>0025_je_chapter_links.sql</code>) against the
          database, then refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {/* Header chrome — hidden under Present clean-screen */}
      {!chromeHidden && (
        <>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Home</Link>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: RED }} aria-hidden />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>Journal Entry Scenario Engine</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The journal entry is the anchor. Toggle a condition — the entry, ledger, statements, and the accounting
            equation all re-derive live. Click a line to trace it through the system.
          </p>
        </>
      )}

      {/* ---- Chapter browser (top selector) — hidden under Present clean-screen ---- */}
      {!chromeHidden && (courses.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No scenarios seeded yet.</p>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
          {courses.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {courses.map((c) => {
                const k = courseKey(c);
                const active = courseKey(activeCourse ?? courses[0]) === k;
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setSelectedCourseKey(k);
                      setSelectedChapterId(null);
                      setSelectedSlug(null);
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition-all",
                      active ? "text-white" : "text-muted-foreground hover:text-foreground",
                    )}
                    style={
                      active
                        ? {
                            background: `linear-gradient(180deg, #1E2F55 0%, ${NAVY} 100%)`,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 4px rgba(20,33,61,0.30)",
                          }
                        : undefined
                    }
                  >
                    {c.code ?? c.course_name ?? "Course"}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {activeCourse?.course_name ?? activeCourse?.code ?? "Chapters"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chapters.map((ch) => {
              const active = activeChapter?.id === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    setSelectedChapterId(ch.id);
                    setSelectedSlug(null);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition",
                    active ? "font-semibold" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                  )}
                  style={active ? { borderColor: NAVY, color: NAVY, backgroundColor: `${NAVY}0d` } : undefined}
                >
                  <span>{chapterLabel(ch)}</span>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {ch.scenarios.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )
      )}

      {/* ---- Body: optional sequence sidebar + the hierarchy ---- */}
      {courses.length > 0 && (
        <div className="mt-5 flex gap-4">
          {isSequence && <SequenceSidebar entries={entries} group={doc?.sequenceGroup} />}

          {/* keyed by view+chapter so switching surfaces gets a soft entrance */}
          <div key={`${view}:${activeChapter?.id ?? ""}`} className="min-w-0 flex-1 animate-in fade-in slide-in-from-bottom-1 duration-300">
            {/* Hub (study path) / deck / practice / scenario views */}
            {scenarios.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No scenarios in {chapterLabel(activeChapter)} yet — this is where you'd author one.
              </p>
            ) : view === "hub" ? (
              <Hub
                courseLabel={activeCourse?.course_name ?? activeCourse?.code ?? "Course"}
                chapterLabel={chapterLabel(activeChapter)}
                scenarios={hubScenarios}
                onOpen={openScenario}
                onDeck={() => setView("deck")}
                onPractice={() => setView("practice")}
                onGrid={() => setView("grid")}
              />
            ) : view === "grid" ? (
              <ChapterGrid
                courseLabel={activeCourse?.course_name ?? activeCourse?.code ?? "Course"}
                chapterLabel={chapterLabel(activeChapter)}
                scenarios={hubScenarios}
                onBack={() => setView("hub")}
                onOpenCell={showInTool}
                onCleanToggle={() => setCleanScreen((v) => !v)}
                cleanScreen={cleanScreen}
              />
            ) : view === "deck" ? (
              <MemorizeDeck
                chapterLabel={chapterLabel(activeChapter)}
                scenarios={hubScenarios}
                onBack={() => setView("hub")}
                onOpenScenario={(slug) => openScenario(slug, "explore")}
              />
            ) : view === "practice" ? (
              <PracticeMix
                chapterLabel={chapterLabel(activeChapter)}
                chapterKey={activeChapter?.id ?? "?"}
                scenarios={hubScenarios}
                onBack={() => setView("hub")}
                onShowInTool={showInTool}
              />
            ) : (
              <>
              {!chromeHidden && (
                <button
                  onClick={() => setView("hub")}
                  className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  ← {chapterLabel(activeChapter)} hub
                </button>
              )}
              {!chromeHidden && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {scenarios.map((s) => {
                  const active = activeScenario?.slug === s.slug;
                  return (
                    <button
                      key={s.slug}
                      onClick={() => setSelectedSlug(s.slug)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                        active ? "font-semibold" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                      )}
                      style={active ? { borderColor: NAVY, backgroundColor: `${NAVY}0d`, color: NAVY } : undefined}
                    >
                      {s.title}
                    </button>
                  );
                })}
                {admin && activeScenario && (
                  <button
                    onClick={openEditor}
                    title="Edit this scenario's raw JSON (admin)"
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-foreground hover:text-foreground"
                  >
                    <PencilLine className="h-3.5 w-3.5" /> Edit scenario
                  </button>
                )}
                {admin && (
                  <div className="relative">
                    <button
                      onClick={() => setPanelsOpen((o) => !o)}
                      title="Choose which explore panels show (global; admin)"
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-foreground hover:text-foreground"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Panels
                    </button>
                    {panelsOpen && (
                      <div
                        className="absolute left-0 z-30 mt-1 w-52 rounded-lg border-2 bg-card p-2 shadow-lg"
                        style={{ borderColor: NAVY }}
                      >
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Show panels (global)
                        </div>
                        {PANEL_KEYS.map((k) => (
                          <label key={k} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs capitalize">
                            <input type="checkbox" checked={globalPanels[k]} onChange={() => toggleGlobalPanel(k)} />
                            {k}
                          </label>
                        ))}
                        {doc?.ui?.panels && (
                          <p className="mt-1 border-t border-border/60 pt-1 text-[9px] text-amber-600">
                            This scenario overrides globals via <code>ui.panels</code>.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

            {/* Admin raw editor — textarea → Zod validate → upsert → re-render */}
            {admin && editorOpen && activeScenario && (
              <section className="mb-4 rounded-xl border-2 bg-card p-3" style={{ borderColor: RED }}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold" style={{ color: RED }}>
                    Edit scenario (raw JSON) — {activeScenario.slug}
                  </h2>
                  <span className="text-[11px] text-muted-foreground">
                    Validated against the v2 schema on save; upserts by slug.
                  </span>
                </div>
                <textarea
                  value={editorText}
                  onChange={(e) => setEditorText(e.target.value)}
                  spellCheck={false}
                  rows={22}
                  className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed"
                />
                {editorError && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
                    {editorError}
                  </pre>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={saveEditor}
                    disabled={editorSaving}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: NAVY }}
                  >
                    {editorSaving ? "Saving…" : "Validate & save"}
                  </button>
                  <button
                    onClick={() => setEditorOpen(false)}
                    disabled={editorSaving}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}

            {!activeScenario ? null : (
              <div className="mx-auto max-w-3xl">
                {/* Explore | Build | Present toggle. Build needs an account bank; Present is admin-only. */}
                {(doc?.build || admin) && !chromeHidden && (
                  <div className="mb-3 flex justify-center gap-1">
                    {(
                      [
                        "explore",
                        ...(doc?.build ? (["build"] as const) : []),
                        ...(admin ? (["present"] as const) : []),
                      ] as ("explore" | "build" | "present")[]
                    ).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "rounded-md px-3 py-1 text-xs font-semibold capitalize transition",
                          mode === m ? "text-white" : "border border-border text-muted-foreground hover:text-foreground",
                        )}
                        style={mode === m ? { backgroundColor: NAVY } : undefined}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                {mode === "present" ? (
                  <PresentMode
                    doc={doc!}
                    variant={variant}
                    explore={explore}
                    conditions={conditions}
                    onSetConditions={(c) => setConditions(c)}
                    onOpen={openPopover}
                    onCleanToggle={() => setCleanScreen((v) => !v)}
                  />
                ) : mode === "build" && doc?.build ? (
                  variant ? (
                    <BuildMode
                      doc={doc}
                      variant={variant}
                      explore={explore}
                      conditions={conditions}
                      onSetConditions={(c) => setConditions(c)}
                    />
                  ) : (
                    <p className="text-sm italic text-muted-foreground">This combination isn't built yet.</p>
                  )
                ) : (
                  <>
                {!isComputation && (
                  <>
                {/* COA — the vocabulary (collapsed by default) */}
                <Panel
                  title="Chart of Accounts"
                  subtitle="The vocabulary — the accounts this entry draws from."
                  collapsible
                  collapsed={collapsed.coa}
                  onToggle={() => toggleCollapse("coa")}
                >
                  {usedAccounts.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">No accounts yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {usedAccounts.map((a) => {
                        const on = highlightAccount === a.name;
                        return (
                          <button
                            key={a.name}
                            onClick={() => toggleHighlight(a.name)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
                              on ? "" : "border-border hover:border-foreground",
                            )}
                            style={on ? { borderColor: NAVY, color: NAVY, backgroundColor: `${NAVY}0d` } : undefined}
                          >
                            <span className="font-medium">{a.name}</span>
                            {a.meta && (
                              <span className="text-[10px] text-muted-foreground">
                                {a.meta.account_type.replace(/_/g, " ")} · nb {a.meta.normal_balance === "debit" ? "Dr" : "Cr"}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Panel>

                <VConnector active={!!activeLine} />
                  </>
                )}

                {/* JOURNAL ENTRY — the anchor */}
                <Panel
                  emphasis
                  title={isComputation ? "Computation" : "Journal Entry"}
                  collapsible
                  collapsed={collapsed.je}
                  onToggle={() => toggleCollapse("je")}
                  right={
                    isComputation ? undefined : (
                    <div className="flex flex-wrap items-center gap-1">
                      <MiniBtn onClick={revealNext}>Reveal next</MiniBtn>
                      <MiniBtn onClick={revealAccountsOnly}>Accounts only</MiniBtn>
                      <MiniBtn onClick={revealAll}>Reveal all</MiniBtn>
                      <MiniBtn onClick={resetReveal}>Reset</MiniBtn>
                      {hasNumbers ? (
                        <MiniBtn onClick={revealNumbers}>Reveal numbers</MiniBtn>
                      ) : (
                        <button
                          disabled
                          title="Concrete amounts — coming for this topic"
                          className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground/50"
                        >
                          <Lock className="h-3 w-3" /> Reveal numbers
                        </button>
                      )}
                    </div>
                    )
                  }
                >
                  {/* Event (with {param} placeholders resolved) + Given line + principles + toggles */}
                  <p className="text-sm text-foreground/90">{formatEvent(doc?.event ?? "", explore?.effectiveParams)}</p>
                  {explore && <GivenLine params={explore.effectiveParams} seed={seed} onNewNumbers={newNumbers} />}
                  {(doc?.principleKeys ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(doc?.principleKeys ?? []).map((k) => {
                        const p = principleLabel.get(k);
                        return (
                          <span
                            key={k}
                            title={p?.short_desc ?? undefined}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {p?.label ?? k}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    {(doc?.axes ?? []).map((axis) => (
                      <div key={axis.key} className="flex flex-wrap items-center gap-2">
                        <span className="w-32 shrink-0 text-xs font-semibold text-muted-foreground">{axis.label}</span>
                        <div className="flex flex-wrap gap-1">
                          {axis.options.map((opt) => {
                            const on = conditions[axis.key] === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setConditions((c) => ({ ...c, [axis.key]: opt.value }))}
                                className={cn(
                                  "rounded-md border px-2.5 py-1 text-xs font-medium transition",
                                  on ? "text-white" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                                )}
                                style={on ? { backgroundColor: NAVY, borderColor: NAVY } : undefined}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* The entry — reveal grid (authored) OR a schedule-driven period entry */}
                  <div className="mt-4 border-t border-border/60 pt-3">
                    {!variant ? (
                      <p className="text-sm italic text-muted-foreground">This combination isn't built yet.</p>
                    ) : isComputation ? (
                      !compPath ? (
                        <p className="text-sm italic text-muted-foreground">No computation is built for this combination yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {variant.label && (
                            <div className="text-xs font-semibold text-muted-foreground">{variant.label}</div>
                          )}
                          <p className="text-sm text-foreground/90">{compPath.narration}</p>
                          {(compPath.steps ?? []).length > 0 && (
                            <ol className="mt-1">
                              {compPath.steps!.map((s, i) => {
                                const stepRes = s.resultSlotKey ? resolveStep(s.resultSlotKey) : null;
                                return (
                                  <li
                                    key={i}
                                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-border/40 py-1.5 text-[13px]"
                                  >
                                    <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                                    <span className="font-medium">{s.label}</span>
                                    {s.formulaText && (
                                      <span className="font-mono text-[11px] text-muted-foreground">{s.formulaText}</span>
                                    )}
                                    {stepRes && (
                                      <span className="ml-auto">
                                        <Amount
                                          res={stepRes}
                                          slotRef={s.resultSlotKey}
                                          glowRefs={activeTraceRefs}
                                          onOpen={openPopover}
                                          className="font-semibold"
                                        />
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          )}
                        </div>
                      )
                    ) : periodEntry ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ backgroundColor: NAVY }}>
                            Period {selectedPeriod}
                          </span>
                          <span className="text-muted-foreground">{periodEntry.date} — computed from the schedule.</span>
                          <button className="underline hover:text-foreground" onClick={() => setSelectedPeriod(AUTHORED_PERIOD)}>
                            ← teaching entry (P{AUTHORED_PERIOD})
                          </button>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              <th className="py-1 text-left font-semibold">Account</th>
                              <th className="w-24 py-1 text-right font-semibold">Dr</th>
                              <th className="w-24 py-1 text-right font-semibold">Cr</th>
                            </tr>
                          </thead>
                          <tbody>
                            {periodEntry.lines.map((ln, i) => (
                              <tr key={i} className="border-t border-border/50">
                                <td className={cn("py-1", ln.side === "credit" && "pl-6")}>
                                  <span className="font-medium">{ln.account}</span>
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {ln.side === "debit" && (
                                    <Amount res={{ value: ln.amount, derivation: ln.derivation }} glowRefs={activeTraceRefs} onOpen={openPopover} className="ml-auto" />
                                  )}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {ln.side === "credit" && (
                                    <Amount res={{ value: ln.amount, derivation: ln.derivation }} glowRefs={activeTraceRefs} onOpen={openPopover} className="ml-auto" />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {variant.label && (
                          <div className="text-xs font-semibold text-muted-foreground">{variant.label}</div>
                        )}
                        {entries.map((entry) => (
                          <div key={entry.id}>
                            {entry.caption && (
                              <div className="mb-1 text-[11px] font-medium text-muted-foreground">{entry.caption}</div>
                            )}
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  <th className="py-1 text-left font-semibold">Account</th>
                                  <th className="w-24 py-1 text-right font-semibold">Dr</th>
                                  <th className="w-24 py-1 text-right font-semibold">Cr</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.lines.map((l) => {
                                  const k = lineKey(entry.id, l.id);
                                  const highlighted = highlightRefs.has(k);
                                  const isActive = activeLineKey === k;
                                  const amt = (explore ? explore.resolveLine(l) : null) ?? resolveLiteralAmount(l);
                                  const shown = revealed.has(`${k}:amount`);
                                  const revealAmt = () => {
                                    setRevealed((p) => new Set(p).add(`${k}:amount`));
                                    selectLine(entry.id, l);
                                  };
                                  const amountCell = (side: "debit" | "credit") =>
                                    l.side !== side ? null : shown && amt ? (
                                      <Amount
                                        res={amt}
                                        slotRef={amt.slotRef}
                                        glowRefs={activeTraceRefs}
                                        onOpen={(d, x, y) => {
                                          selectLine(entry.id, l);
                                          openPopover(d, x, y);
                                        }}
                                        className="ml-auto"
                                      />
                                    ) : (
                                      <RevealCell revealed={shown} onClick={revealAmt}>
                                        {l.label?.trim() || "???"}
                                      </RevealCell>
                                    );
                                  return (
                                    <tr
                                      key={l.id}
                                      className={cn(
                                        "border-t border-border/50",
                                        highlighted && "bg-amber-100/70 dark:bg-amber-900/30",
                                        isActive && !highlighted && "bg-muted/40",
                                      )}
                                    >
                                      <td className={cn("py-1", l.side === "credit" && "pl-6")}>
                                        <RevealCell
                                          revealed={revealed.has(`${k}:account`)}
                                          onClick={() => {
                                            setRevealed((p) => new Set(p).add(`${k}:account`));
                                            selectLine(entry.id, l);
                                          }}
                                        >
                                          <span className="font-medium">{l.account}</span>
                                        </RevealCell>
                                      </td>
                                      <td className="py-1 text-right tabular-nums">{amountCell("debit")}</td>
                                      <td className="py-1 text-right tabular-nums">{amountCell("credit")}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Contextual: why this account/side + how the amount is computed (only when a line is selected) */}
                  {activeLine && (
                    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      <div className="text-sm font-semibold">
                        {activeLine.account}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({activeLine.side === "debit" ? "Debit" : "Credit"})
                        </span>
                      </div>
                      {activeLine.why && <p className="text-[13px] text-foreground/90">{activeLine.why}</p>}
                      {activeLine.trap && (
                        <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-[13px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
                          <span className="font-semibold">Trap: </span>
                          {activeLine.trap}
                        </p>
                      )}
                      {(activeLine.principleKeys ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(activeLine.principleKeys ?? []).map((k) => (
                            <span key={k} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                              {principleLabel.get(k)?.label ?? k}
                            </span>
                          ))}
                        </div>
                      )}
                      {compPath && (
                        <div className="mt-1 border-t border-border/60 pt-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            How the amount is computed
                          </div>
                          <p className="mt-0.5 text-[13px] text-foreground/90">{compPath.narration}</p>
                          {compPath.steps && compPath.steps.length > 0 && (
                            <ol className="mt-1 space-y-0.5">
                              {compPath.steps.map((s, i) => (
                                <li key={i} className="flex gap-2 text-[12px]">
                                  <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                                  <span>
                                    <span className="font-medium">{s.label}</span>
                                    {s.formulaText && (
                                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">{s.formulaText}</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Panel>

                {/* ---- Consequence panels — visibility per the Panels config / doc.ui.panels ---- */}
                {anyConsequenceVisible && <VConnector active={!!highlightAccount || selectedPeriod > 0} />}
                <div className="space-y-4">

                {explore && visible("schedule") && (
                  <Panel
                    title="Amortization schedule"
                    subtitle="Click a row to drive the entry & statements; click any number to trace it."
                  >
                    <ScheduleTable
                      schedule={explore.schedule}
                      selectedPeriod={selectedPeriod}
                      onSelectPeriod={setSelectedPeriod}
                      onOpen={openPopover}
                      glowRefs={activeTraceRefs}
                    />
                  </Panel>
                )}

                {/* Balance-sheet presentation (params-derived + visible) */}
                {explore && visible("presentation") && (
                  <Panel title="Balance-sheet presentation" subtitle="Live at the selected schedule period.">
                    <PresentationBlock
                      schedule={explore.schedule}
                      selectedPeriod={selectedPeriod}
                      pricing={explore.pricing}
                      onOpen={openPopover}
                      glowRefs={activeTraceRefs}
                    />
                  </Panel>
                )}

                {/* Ledger / T-accounts (entry-derived + visible) */}
                {!isComputation && visible("ledger") && (
                  <Panel
                    title="Ledger (T-accounts)"
                    subtitle="Click an account to trace it."
                    collapsible
                    collapsed={collapsed.ledger}
                    onToggle={() => toggleCollapse("ledger")}
                  >
                    {explore && (
                      <div className="mb-2 flex gap-1">
                        {(["entry", "life"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setTacctView(v)}
                            className={cn(
                              "rounded border px-2 py-0.5 text-[11px] font-medium transition",
                              tacctView === v ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {v === "entry" ? "This entry" : "Over the life"}
                          </button>
                        ))}
                      </div>
                    )}
                    {explore && tacctView === "life" ? (
                      <LifeTAccounts
                        schedule={explore.schedule}
                        pricing={explore.pricing}
                        selectedPeriod={selectedPeriod}
                        onSelectPeriod={setSelectedPeriod}
                      />
                    ) : ledger.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">No postings.</p>
                    ) : (
                      <div className="space-y-2">
                        {ledger.map((acct) => {
                          const on = highlightAccount === acct.account;
                          return (
                            <button
                              key={acct.account}
                              onClick={() => toggleHighlight(acct.account)}
                              className={cn(
                                "w-full rounded-md border p-2 text-left transition",
                                on ? "bg-amber-100/60 dark:bg-amber-900/30" : "border-border bg-muted/20 hover:border-foreground",
                              )}
                              style={on ? { borderColor: NAVY } : undefined}
                            >
                              <div className="border-b-2 border-foreground/70 pb-0.5 text-center text-[11px] font-semibold">
                                {acct.account}
                                {acct.normalBalance && (
                                  <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                                    (nb: {acct.normalBalance === "debit" ? "Dr" : "Cr"})
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 text-[10px]">
                                <div className="space-y-0.5 border-r-2 border-foreground/70 p-1">
                                  {acct.debits.map((p, i) => (
                                    <div key={i} className="text-right tabular-nums">{p.label?.trim() || "???"}</div>
                                  ))}
                                </div>
                                <div className="space-y-0.5 p-1">
                                  {acct.credits.map((p, i) => (
                                    <div key={i} className="text-right tabular-nums">{p.label?.trim() || "???"}</div>
                                  ))}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Panel>
                )}

                {/* Statement effects (entry-derived + visible) */}
                {!isComputation && visible("statements") && (
                  <Panel
                    title="Statement effects"
                    subtitle="Click a line to trace it back."
                    collapsible
                    collapsed={collapsed.statements}
                    onToggle={() => toggleCollapse("statements")}
                  >
                    <div className="space-y-3 text-sm">
                      <StatementGroup label="Income statement" empty="No income-statement accounts move.">
                        {statementEffects.income.map((e) => (
                          <StatementRow
                            key={e.account}
                            account={e.account}
                            dir={e.dir}
                            tag={e.accountType}
                            active={highlightAccount === e.account}
                            onClick={() => toggleHighlight(e.account)}
                          />
                        ))}
                      </StatementGroup>
                      <StatementGroup label="Balance sheet" empty="No balance-sheet accounts move.">
                        {statementEffects.balanceSheet.map((e) => (
                          <StatementRow
                            key={e.account}
                            account={e.account}
                            dir={e.dir}
                            tag={e.accountType}
                            active={highlightAccount === e.account}
                            onClick={() => toggleHighlight(e.account)}
                          />
                        ))}
                      </StatementGroup>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cash flow</div>
                        {statementEffects.cashFlow.touchesCash ? (
                          <div className="flex items-center gap-2 text-sm">
                            <span>Cash</span>
                            <DirArrow dir={statementEffects.cashFlow.dir} />
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                              {statementEffects.cashFlow.classification ?? "—"}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">This entry doesn't touch Cash.</p>
                        )}
                      </div>
                    </div>
                  </Panel>
                )}

                {/* Accounting equation (entry-derived + visible) */}
                {!isComputation && visible("equation") && (
                <Panel title="Accounting equation">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <EquationCell label="Assets" dir={equation.assets} />
                    <span className="text-lg font-bold text-muted-foreground">=</span>
                    <EquationCell label="Liabilities" dir={equation.liabilities} />
                    <span className="text-lg font-bold text-muted-foreground">+</span>
                    <EquationCell label="Equity" dir={equation.equity} />
                    <span
                      className={cn(
                        "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        equation.balanced === true && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
                        equation.balanced === false && "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
                        equation.balanced === "unknown" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {equation.balanced === true
                        ? "balances"
                        : equation.balanced === false
                          ? "out of balance"
                          : "balance: unknown (no amounts yet)"}
                    </span>
                  </div>
                </Panel>
                )}
                </div>
                  </>
                )}

                {/* ---- Memorize (cloze in Build mode) + placeholders ---- */}
                <div className="mt-4 space-y-4">
                  {(doc?.memorize ?? []).length > 0 && (
                    <MemorizeSection
                      items={doc!.memorize!}
                      collapsed={memorizeCollapsed}
                      onToggleCollapsed={() => setMemorizeCollapsed((c) => !c)}
                      activeTraceRefs={activeTraceRefs}
                      onToggleTraceRef={toggleTraceRef}
                      cloze={mode === "build"}
                    />
                  )}

                  {mode === "explore" && inlineQuestions.length > 0 && (
                    <Panel title="Check yourself" subtitle="Quick questions on this scenario">
                      <InlineQuestions key={activeScenario?.slug ?? "none"} questions={inlineQuestions} />
                    </Panel>
                  )}
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Click-through derivation popover (walks the ref chain when a schedule exists) */}
      {popover && (
        <DerivationPopover state={popover} resolve={explore?.resolve} onClose={() => setPopover(null)} />
      )}
    </div>
  );
}

// ============ small presentational helpers ============

function Panel({
  title,
  subtitle,
  right,
  emphasis,
  collapsible,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  emphasis?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl bg-card",
        emphasis
          ? "border-2 shadow-[0_2px_12px_rgba(20,33,61,0.10)]"
          : "border border-border shadow-[0_1px_2px_rgba(20,33,61,0.05),0_2px_8px_rgba(20,33,61,0.04)]",
      )}
      style={emphasis ? { borderColor: NAVY } : undefined}
    >
      <header className="flex items-start gap-2 px-3 py-2">
        {collapsible && (
          <button
            onClick={onToggle}
            className="mt-0.5 text-muted-foreground transition hover:text-foreground"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
        <div className="min-w-0">
          <h2 className={cn("font-semibold", emphasis ? "text-base" : "text-sm")} style={emphasis ? { color: NAVY } : undefined}>
            {title}
          </h2>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </header>
      {!collapsed && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

function RevealCell({ revealed, onClick, children }: { revealed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("rounded px-1 text-left transition hover:bg-muted", revealed ? "" : "italic text-muted-foreground/50")}
    >
      {revealed ? children : "???"}
    </button>
  );
}

/** Thin vertical connector arrow; lights navy when the trace runs through this level. */
function VConnector({ active }: { active: boolean }) {
  return (
    <div className={cn("flex justify-center py-1", active ? "" : "text-border")} style={active ? { color: NAVY } : undefined}>
      <svg viewBox="0 0 24 28" className="h-7 w-6" fill="none" stroke="currentColor">
        <line x1="12" y1="0" x2="12" y2="20" strokeWidth={active ? 2 : 1.25} />
        <path d="M7 16 L12 23 L17 16" strokeWidth={active ? 2 : 1.25} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}


function DirArrow({ dir }: { dir: Dir }) {
  const glyph = dir === "up" ? "↑" : dir === "down" ? "↓" : dir === "unknown" ? "?" : "·";
  return (
    <span
      className={cn(
        "font-bold",
        dir === "up" && "text-emerald-600",
        dir === "down" && "text-rose-600",
        (dir === "none" || dir === "unknown") && "text-muted-foreground",
      )}
    >
      {glyph}
    </span>
  );
}

function StatementGroup({ label, empty, children }: { label: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {has ? children : <p className="text-xs italic text-muted-foreground">{empty}</p>}
    </div>
  );
}

function StatementRow({ account, dir, tag, active, onClick }: {
  account: string;
  dir: Dir;
  tag?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm transition",
        active ? "bg-amber-100/70 dark:bg-amber-900/30" : "hover:bg-muted/50",
      )}
    >
      <DirArrow dir={dir} />
      <span>{account}</span>
      {tag && <span className="ml-auto text-[10px] text-muted-foreground">{tag.replace(/_/g, " ")}</span>}
    </button>
  );
}

function EquationCell({ label, dir }: { label: string; dir: Dir }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <span className="font-medium">{label}</span>
      <DirArrow dir={dir} />
    </span>
  );
}

/** Conditional left sidebar for lifecycle/sequence topics — stubbed (no multi-period engine yet). */
function SequenceSidebar({ entries, group }: { entries: EntryTemplate[]; group?: string }) {
  return (
    <aside className="hidden w-52 shrink-0 lg:block">
      <div className="sticky top-4 rounded-xl border border-dashed border-border p-3">
        <div className="text-xs font-semibold" style={{ color: NAVY }}>Sequence view</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Coming for multi-entry topics{group ? ` (${group})` : ""}. The lifecycle's connected entries will appear here in
          order; click one to load it.
        </p>
        <ol className="mt-2 space-y-1">
          {entries.map((e, i) => (
            <li key={e.id} className="flex gap-2 text-[11px]">
              <span className="text-muted-foreground">{i + 1}.</span>
              <span>{e.caption ?? `Entry ${i + 1}`}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
