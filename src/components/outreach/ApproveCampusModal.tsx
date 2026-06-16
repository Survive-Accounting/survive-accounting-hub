// Ported from the original app (components/outreach/ApproveCampusModal.tsx).
// Autosave patches go to the parent via onPatch; Supabase wiring lands later.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BookOpen, Bug, Check, CheckCircle2, ChevronDown, Clipboard, ExternalLink, FileText, Loader2, RefreshCw, Save, Sparkles, Store, Wand2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Info } from "lucide-react";
import type { Campus, CourseFamilyTerms } from "@/lib/outreach-mock";
import {
  researchCampusAI,
  type CampusResearchResult,
  type AiConfidence,
  getCampusCourseAvailability,
  getCourseFamilyDefaults,
  upsertCampusCourseAvailability,
  type CourseFamily,
  type CourseFamilyDefaults,
  type TutoringAvailability,
  type TextbookMatchStatus,
  patchCampusDb,
} from "@/lib/outreach-api";
import LeadSuggestionsPanel, { type LeadSuggestionsSummary } from "./LeadSuggestionsPanel";
import ClassScheduleIntelligencePanel from "./ClassScheduleIntelligencePanel";
import { ScrapeFacultyButton } from "./ScrapeFacultyButton";
import { FacultyTriagePanel } from "./FacultyTriagePanel";
import { supabase } from "@/integrations/supabase/client";

type FamilyStatus = "matches" | "likely_match" | "different" | "not_found" | "not_offered" | "not_checked";

/** Legacy values from the old app collapse into the simplified set. */
function normalizeStatus(v: string | undefined): FamilyStatus {
  if (
    v === "matches" || v === "likely_match" || v === "different" ||
    v === "not_found" || v === "not_offered"
  ) return v;
  if (v === "not_viewable") return "not_found";
  return "not_checked";
}

type FamilyBook = { isbn13: string; title: string; authors: string; publisher: string };
const EMPTY_BOOK = (): FamilyBook => ({ isbn13: "", title: "", authors: "", publisher: "" });
type TextbookStatus = "same_textbook_confirmed" | "different_textbook" | "textbook_not_viewable" | "not_checked";

const FAMILIES = [
  { key: "intro_1", label: "Intro 1 — Financial Accounting Principles", shortLabel: "Intro 1", textbook: "McGraw Hill — Financial and Managerial Accounting (Wild/Shaw)", sampleCode: "ACCY 201", sampleTitle: "Principles of Financial Accounting" },
  { key: "intro_2", label: "Intro 2 — Managerial Accounting Principles", shortLabel: "Intro 2", textbook: "McGraw Hill — Financial and Managerial Accounting (Wild/Shaw)", sampleCode: "ACCY 202", sampleTitle: "Principles of Managerial Accounting" },
  { key: "intermediate_1", label: "Intermediate Accounting I", shortLabel: "IA1", textbook: "Wiley — Intermediate Accounting, Kieso/Weygandt/Warfield", sampleCode: "ACCY 303", sampleTitle: "Intermediate Accounting I" },
  { key: "intermediate_2", label: "Intermediate Accounting II", shortLabel: "IA2", textbook: "Wiley — Intermediate Accounting, Kieso/Weygandt/Warfield", sampleCode: "ACCY 304", sampleTitle: "Intermediate Accounting II" },
];

const FAMILY_STATUS_LABELS: Record<FamilyStatus, string> = {
  matches: "Matched",
  likely_match: "Likely Match",
  different: "Not Matched",
  not_found: "Unknown",
  not_offered: "Not Offered / Skip",
  not_checked: "Not Checked",
};

const STATUS_BADGE: Record<FamilyStatus, string> = {
  matches: "bg-emerald-600 text-white",
  likely_match: "bg-teal-500 text-white",
  different: "bg-red-600 text-white",
  not_found: "bg-amber-500 text-white",
  not_offered: "bg-slate-500 text-white",
  not_checked: "bg-muted text-muted-foreground",
};

function googleUrl(q: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function openExternal(url: string) {
  const fallbackCopy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  };
  const done = () => toast.success("Link copied — paste into a new tab");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => {
      if (fallbackCopy()) done();
      else toast.error("Couldn't copy link");
    });
  } else if (fallbackCopy()) {
    done();
  } else {
    toast.error("Couldn't copy link");
  }
}

const CONF_META: Record<AiConfidence, { label: string; bar: string; text: string; segs: number }> = {
  high:   { label: "high confidence",        bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", segs: 3 },
  medium: { label: "medium — double-check",  bar: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400",   segs: 2 },
  low:    { label: "low — verify",           bar: "bg-red-500",     text: "text-red-700 dark:text-red-400",       segs: 1 },
};

/** Red/amber/green meter for an AI-suggested field. No numbers — just a bar + source. */
function ConfidenceMeter({
  confidence, source, touched,
}: { confidence: AiConfidence; source: string | null; touched?: boolean }) {
  if (touched) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
        <Check className="h-3 w-3" /> Edited by you
      </span>
    );
  }
  const m = CONF_META[confidence];
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <span className="inline-flex items-center gap-px" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`h-1.5 w-3 rounded-sm ${i < m.segs ? m.bar : "bg-muted"}`} />
        ))}
      </span>
      <span className={`text-[10px] font-medium ${m.text}`}>AI · {m.label}</span>
      {source && (
        <button
          type="button"
          onClick={() => openExternal(source)}
          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-2.5 w-2.5" /> source
        </button>
      )}
    </span>
  );
}

/** Shown under a field when AI was run but returned null for it (and the user hasn't filled it in). */
function NotFoundHint({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
      <AlertTriangle className="h-3 w-3 text-amber-500" />
      {message}
    </span>
  );
}

export default function ApproveCampusModal({
  campus, onClose, onPatch, onApprove, autoStartResearch,
}: {
  campus: Campus | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Campus>) => void;
  onApprove: (id: string, patch: Partial<Campus>) => void;
  /** When set to a campus id, automatically kick off full AI research once after the modal opens. */
  autoStartResearch?: string | null;
}) {
  const [step, setStep] = useState("1");
  const [familyCodes, setFamilyCodes] = useState<Record<string, string>>({});
  const [familyTitles, setFamilyTitles] = useState<Record<string, string>>({});
  const [familyStatus, setFamilyStatus] = useState<Record<string, FamilyStatus>>({});
  const [familyBooks, setFamilyBooks] = useState<Record<string, FamilyBook>>({});
  const [familyTerms, setFamilyTerms] = useState<Record<string, CourseFamilyTerms>>({});
  const [programName, setProgramName] = useState("");
  const programTimer = useRef<number | null>(null);
  const [isbnLookup, setIsbnLookup] = useState<Record<string, "idle" | "loading" | "found" | "notfound">>({});
  const bookTimer = useRef<number | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  const [aiResearching, setAiResearching] = useState(false);
  const [aiResult, setAiResult] = useState<CampusResearchResult | null>(null);
  const [aiTouched, setAiTouched] = useState<Set<string>>(new Set());

  // Phase 4 — per-campus course availability overrides + global defaults
  type AvailabilityOverride = "inherit" | TutoringAvailability;
  const FAMILY_KEYS: CourseFamily[] = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];
  const [familyAvail, setFamilyAvail] = useState<Record<CourseFamily, AvailabilityOverride>>({
    intro_1: "inherit", intro_2: "inherit", intermediate_1: "inherit", intermediate_2: "inherit",
  });
  const [familyReqSyllabus, setFamilyReqSyllabus] = useState<Record<CourseFamily, boolean>>({
    intro_1: false, intro_2: false, intermediate_1: false, intermediate_2: false,
  });
  const [globalDefaults, setGlobalDefaults] = useState<CourseFamilyDefaults | null>(null);

  // Phase 4 — lead review gating
  const [leadSummary, setLeadSummary] = useState<LeadSuggestionsSummary>({
    total: 0, pending: 0, accepted: 0, rejected: 0, needs_lee: 0,
  });
  const [skipLeadImport, setSkipLeadImport] = useState(false);
  const [leadsRefreshKey, setLeadsRefreshKey] = useState(0);

  const markTouched = (fieldId: string) =>
    setAiTouched((prev) => (prev.has(fieldId) ? prev : new Set(prev).add(fieldId)));

  useEffect(() => {
    if (!campus) return;
    setStep("1");
    const existingCodes = campus.course_family_codes_json ?? {};
    const existingTitles = campus.course_family_titles_json ?? {};
    const initCodes: Record<string, string> = {};
    const initTitles: Record<string, string> = {};
    FAMILIES.forEach((f) => {
      initCodes[f.key] = existingCodes[f.key] ?? "";
      initTitles[f.key] = existingTitles[f.key] ?? "";
    });
    setFamilyCodes(initCodes);
    setFamilyTitles(initTitles);

    const existing = campus.course_family_status_json ?? {};
    const existingBooksForStatus = campus.course_family_textbooks_json ?? {};
    const init: Record<string, FamilyStatus> = {};
    FAMILIES.forEach((f) => {
      const saved = normalizeStatus(existing[f.key]);
      // Hydrate from textbook json when no explicit status saved yet —
      // e.g. after a textbook-only backfill ran. Without this, all chips
      // show "Not Checked" even though we already know the textbook.
      if (saved === "not_checked") {
        const b = existingBooksForStatus[f.key];
        if (b && (b.title || b.authors || b.publisher || b.isbn13)) {
          init[f.key] = "likely_match";
          return;
        }
      }
      init[f.key] = saved;
    });
    setFamilyStatus(init);

    const existingBooks = campus.course_family_textbooks_json ?? {};
    const initBooks: Record<string, FamilyBook> = {};
    FAMILIES.forEach((f) => {
      const b = existingBooks[f.key];
      initBooks[f.key] = {
        isbn13: b?.isbn13 ?? "",
        title: b?.title ?? "",
        authors: b?.authors ?? "",
        publisher: b?.publisher ?? "",
      };
    });
    setFamilyBooks(initBooks);

    const existingTerms = campus.course_family_terms_json ?? {};
    const initTerms: Record<string, CourseFamilyTerms> = {};
    FAMILIES.forEach((f) => {
      const t = existingTerms[f.key];
      initTerms[f.key] = {
        terms_text: t?.terms_text ?? null,
        fall: t?.fall ?? null,
        spring: t?.spring ?? null,
        summer: t?.summer ?? null,
      };
    });
    setFamilyTerms(initTerms);

    setIsbnLookup({});
    setProgramName(campus.accounting_department_name ?? "");
    setLastSavedAt(null);
    setAiResult(null);
    setAiResearching(false);
    setAiTouched(new Set());
    setSkipLeadImport(false);
    setLeadSummary({ total: 0, pending: 0, accepted: 0, rejected: 0, needs_lee: 0 });

    // Load Phase 4 availability rows + global defaults
    getCourseFamilyDefaults().then(setGlobalDefaults).catch(() => setGlobalDefaults(null));
    getCampusCourseAvailability(campus.id)
      .then((rows) => {
        const avail: Record<CourseFamily, AvailabilityOverride> = {
          intro_1: "inherit", intro_2: "inherit", intermediate_1: "inherit", intermediate_2: "inherit",
        };
        const req: Record<CourseFamily, boolean> = {
          intro_1: false, intro_2: false, intermediate_1: false, intermediate_2: false,
        };
        for (const r of rows) {
          avail[r.course_family] = (r.tutoring_availability ?? "inherit") as AvailabilityOverride;
          req[r.course_family] = !!r.requires_syllabus_review;
        }
        setFamilyAvail(avail);
        setFamilyReqSyllabus(req);
      })
      .catch(() => {
        setFamilyAvail({ intro_1: "inherit", intro_2: "inherit", intermediate_1: "inherit", intermediate_2: "inherit" });
        setFamilyReqSyllabus({ intro_1: false, intro_2: false, intermediate_1: false, intermediate_2: false });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus?.id]);

  const codesArray = useMemo(
    () => Object.values(familyCodes).map((s) => s.trim()).filter(Boolean),
    [familyCodes],
  );

  const step1Done = codesArray.length > 0;
  const step2Done = FAMILIES.every((f) => (familyStatus[f.key] ?? "not_checked") !== "not_checked");
  const step3Done = skipLeadImport || leadSummary.accepted > 0;
  const canApprove = step1Done && step2Done && step3Done;

  const aggregateTextbookStatus = (status: Record<string, FamilyStatus>): TextbookStatus => {
    const vals = FAMILIES.map((f) => status[f.key] ?? "not_checked");
    if (vals.some((v) => v === "different")) return "different_textbook";
    if (vals.every((v) => v === "not_found")) return "textbook_not_viewable";
    if (vals.some((v) => v === "matches")) return "same_textbook_confirmed";
    return "not_checked";
  };

  // ============ Textbook capture (Different Textbook) ============
  const booksToJson = (books: Record<string, FamilyBook>) => {
    const out: Record<string, FamilyBook> = {};
    for (const f of FAMILIES) {
      const b = books[f.key];
      if (b && (b.isbn13 || b.title || b.authors || b.publisher)) out[f.key] = b;
    }
    return out;
  };

  const debouncedSaveBooks = (books: Record<string, FamilyBook>) => {
    if (bookTimer.current) window.clearTimeout(bookTimer.current);
    bookTimer.current = window.setTimeout(() => {
      writePatch({ course_family_textbooks_json: booksToJson(books) });
    }, 700);
  };

  const updateBook = (key: string, field: keyof FamilyBook, val: string) => {
    markTouched(`book:${key}`);
    setFamilyBooks((prev) => {
      const next = { ...prev, [key]: { ...(prev[key] ?? EMPTY_BOOK()), [field]: val } };
      debouncedSaveBooks(next);
      return next;
    });
    if (field === "isbn13") maybeLookupIsbn(key, val);
  };

  /** ISBN lookup — Google Books first, Open Library as fallback. Fills title/authors/publisher. */
  const maybeLookupIsbn = async (key: string, raw: string) => {
    const isbn = raw.replace(/[^0-9Xx]/g, "");
    if (isbn.length !== 13 && isbn.length !== 10) return;
    setIsbnLookup((p) => ({ ...p, [key]: "loading" }));

    type Found = { title?: string; authors?: string; publisher?: string };
    let found: Found | null = null;

    // Google Books
    try {
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      if (r.ok) {
        const data = await r.json();
        const info = data?.items?.[0]?.volumeInfo;
        if (info) {
          found = {
            title: info.title,
            authors: Array.isArray(info.authors) ? info.authors.join(", ") : undefined,
            publisher: info.publisher,
          };
        }
      }
    } catch { /* fall through */ }

    // Open Library fallback
    if (!found) {
      try {
        const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
        if (r.ok) {
          const data = await r.json();
          const info = data?.[`ISBN:${isbn}`];
          if (info) {
            found = {
              title: info.title,
              authors: Array.isArray(info.authors) ? info.authors.map((a: any) => a.name).filter(Boolean).join(", ") : undefined,
              publisher: Array.isArray(info.publishers) ? info.publishers.map((p: any) => p.name).filter(Boolean).join(", ") : undefined,
            };
          }
        }
      } catch { /* ignore */ }
    }

    if (!found) {
      setIsbnLookup((p) => ({ ...p, [key]: "notfound" }));
      return;
    }

    setIsbnLookup((p) => ({ ...p, [key]: "found" }));
    setFamilyBooks((prev) => {
      const cur = prev[key] ?? EMPTY_BOOK();
      const next = {
        ...prev,
        [key]: {
          ...cur,
          title: found!.title ?? cur.title,
          authors: found!.authors ?? cur.authors,
          publisher: found!.publisher ?? cur.publisher,
        },
      };
      debouncedSaveBooks(next);
      return next;
    });
    toast.success(`Found: ${found.title ?? "textbook"}`);
  };

  // ============ Autosave (to parent state) ============
  const writePatch = (patch: Partial<Campus>) => {
    if (!campus) return;
    setAutoSaving(true);
    onPatch(campus.id, patch);
    window.setTimeout(() => {
      setAutoSaving(false);
      setLastSavedAt(Date.now());
    }, 250);
  };

  const debouncedSaveCourseDetails = (codes: Record<string, string>, titles: Record<string, string>) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const codesArr = Object.values(codes).map((s) => s.trim()).filter(Boolean);
      writePatch({
        course_family_codes_json: codes,
        course_family_titles_json: titles,
        course_codes: codesArr,
      });
    }, 700);
  };

  const updateFamilyCode = (key: string, val: string) => {
    markTouched(`code:${key}`);
    setFamilyCodes((prev) => {
      const next = { ...prev, [key]: val };
      debouncedSaveCourseDetails(next, familyTitles);
      return next;
    });
  };

  const updateFamilyTitle = (key: string, val: string) => {
    markTouched(`title:${key}`);
    setFamilyTitles((prev) => {
      const next = { ...prev, [key]: val };
      debouncedSaveCourseDetails(familyCodes, next);
      return next;
    });
  };

  const updateFamilyStatus = (key: string, val: FamilyStatus) => {
    markTouched(`status:${key}`);
    setFamilyStatus((prev) => {
      const next = { ...prev, [key]: val };
      writePatch({ course_family_status_json: next });
      return next;
    });
  };

  const termsTimer = useRef<number | null>(null);
  const updateFamilyTerms = (key: string, patch: Partial<CourseFamilyTerms>) => {
    markTouched(`terms:${key}`);
    setFamilyTerms((prev) => {
      const cur = prev[key] ?? {};
      const merged: CourseFamilyTerms = { ...cur, ...patch };
      // Keep booleans in sync when the text is edited and matches obvious keywords.
      if ("terms_text" in patch) {
        const t = (patch.terms_text ?? "").toLowerCase();
        if (t) {
          merged.fall = /fall/.test(t) ? true : merged.fall;
          merged.spring = /spring/.test(t) ? true : merged.spring;
          merged.summer = /summer/.test(t) ? true : merged.summer;
        }
      }
      const next = { ...prev, [key]: merged };
      if (termsTimer.current) window.clearTimeout(termsTimer.current);
      termsTimer.current = window.setTimeout(() => {
        writePatch({ course_family_terms_json: next });
      }, 700);
      return next;
    });
  };

  // ============ AI research (suggestions only — human reviews) ============
  /** Fill ONLY empty fields from AI suggestions; never clobber human-entered data. */
  const applySuggestions = (res: CampusResearchResult) => {
    if (!programName.trim() && res.program.value) {
      setProgramName(res.program.value);
      writePatch({ accounting_department_name: res.program.value });
    }
    const nextCodes = { ...familyCodes };
    const nextTitles = { ...familyTitles };
    const nextStatus = { ...familyStatus };
    const nextBooks = { ...familyBooks };
    const nextTerms = { ...familyTerms };
    for (const f of FAMILIES) {
      const fam = res.families[f.key];
      if (!fam) continue;
      if (!(nextCodes[f.key] ?? "").trim() && fam.code.value) nextCodes[f.key] = fam.code.value;
      if (!(nextTitles[f.key] ?? "").trim() && fam.title.value) nextTitles[f.key] = fam.title.value;
      if ((nextStatus[f.key] ?? "not_checked") === "not_checked" && fam.textbook_status.value) {
        nextStatus[f.key] = fam.textbook_status.value as FamilyStatus;
      }
      const b = fam.book;
      const cur = nextBooks[f.key] ?? EMPTY_BOOK();
      const bookEmpty = !cur.isbn13 && !cur.title && !cur.authors && !cur.publisher;
      if (bookEmpty && (b.isbn13 || b.title || b.authors || b.publisher)) {
        nextBooks[f.key] = {
          isbn13: b.isbn13 ?? "",
          title: b.title ?? "",
          authors: b.authors ?? "",
          publisher: b.publisher ?? "",
        };
      }
      // Course offering terms — only fill if user hasn't touched the field.
      const t = fam.terms;
      const curTerms = nextTerms[f.key] ?? {};
      const termsEmpty =
        !curTerms.terms_text &&
        curTerms.fall == null && curTerms.spring == null && curTerms.summer == null;
      if (t && termsEmpty) {
        nextTerms[f.key] = {
          terms_text: t.terms_text?.value ?? null,
          fall: t.offered_fall,
          spring: t.offered_spring,
          summer: t.offered_summer,
        };
      }
    }
    setFamilyCodes(nextCodes);
    setFamilyTitles(nextTitles);
    setFamilyStatus(nextStatus);
    setFamilyBooks(nextBooks);
    setFamilyTerms(nextTerms);
    const codesArr = Object.values(nextCodes).map((s) => s.trim()).filter(Boolean);
    writePatch({
      course_family_codes_json: nextCodes,
      course_family_titles_json: nextTitles,
      course_codes: codesArr,
      course_family_status_json: nextStatus,
      course_family_textbooks_json: booksToJson(nextBooks),
      course_family_terms_json: nextTerms,
    });
  };

  // ============ Debug capture for Research Debug Panel ============
  type RunStatus = "success" | "failed" | "running" | "pending";
  type ResearchRunDebug = {
    status: RunStatus;
    started_at: string;
    duration_ms: number;
    error: string | null;
    model: string | null;
    finish_reason: string | null;
    raw_text: string | null;
    raw_text_chars: number;
    sources: string[];
    counts: Record<string, number>;
  };
  type ResearchDebugBlob = {
    last_run_at: string | null;
    course?: ResearchRunDebug;
    leads?: ResearchRunDebug;
  };
  const [debugBlob, setDebugBlob] = useState<ResearchDebugBlob>({ last_run_at: null });

  // Hydrate debug from existing campus row when modal opens
  useEffect(() => {
    if (!campus) return;
    const existing = (campus.ai_research_debug_json ?? null) as ResearchDebugBlob | null;
    setDebugBlob(existing ?? { last_run_at: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus?.id]);

  const persistDebug = async (next: ResearchDebugBlob) => {
    setDebugBlob(next);
    if (!campus?.id) return;
    // Optimistic patch into parent state too (so re-open shows it immediately).
    onPatch(campus.id, { ai_research_debug_json: next });
    // Belt-and-suspenders: also write directly to DB using the captured id,
    // so a parent state swap / unmount can't silently drop the debug log.
    try {
      await patchCampusDb(campus.id, { ai_research_debug_json: next });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[persistDebug] direct save failed:", e);
      toast.error(`Couldn't save debug log: ${e?.message ?? "unknown error"}`);
    }
  };

  const [courseRunning, setCourseRunning] = useState(false);
  const [leadsRunning, setLeadsRunning] = useState(false);

  const runCourseResearch = async (): Promise<ResearchRunDebug | null> => {
    if (!campus) return null;
    setCourseRunning(true);
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    try {
      const r = await researchCampusAI({
        school_name: campus.school_name,
        state: campus.state,
        course_codes: campus.course_codes,
      });
      const dur = Math.round(performance.now() - t0);
      if (!r.ok || !r.result) {
        const d: ResearchRunDebug = {
          status: "failed", started_at: startedAt, duration_ms: dur,
          error: r.error ?? "Research failed",
          model: r.debug?.model ?? null,
          finish_reason: r.debug?.finish_reason ?? null,
          raw_text: r.debug?.raw_text ?? null,
          raw_text_chars: r.debug?.raw_text_chars ?? 0,
          sources: r.debug?.sources ?? [],
          counts: {},
        };
        return d;
      }
      setAiResult(r.result);
      setAiTouched(new Set());
      applySuggestions(r.result);
      const fams = Object.values(r.result.families) as any[];
      const counts = {
        parsed_course_count: fams.filter((f) => f?.code?.value || f?.title?.value).length,
        parsed_textbook_count: fams.filter((f) => f?.textbook_status?.value).length,
      };
      return {
        status: "success", started_at: startedAt, duration_ms: dur, error: null,
        model: r.debug?.model ?? null,
        finish_reason: r.debug?.finish_reason ?? null,
        raw_text: r.debug?.raw_text ?? null,
        raw_text_chars: r.debug?.raw_text_chars ?? 0,
        sources: r.debug?.sources ?? [],
        counts,
      };
    } catch (e: any) {
      return {
        status: "failed", started_at: startedAt, duration_ms: Math.round(performance.now() - t0),
        error: String(e?.message ?? e), model: null, finish_reason: null,
        raw_text: null, raw_text_chars: 0, sources: [], counts: {},
      };
    } finally {
      setCourseRunning(false);
    }
  };

  const runLeadResearch = async (): Promise<ResearchRunDebug | null> => {
    if (!campus) return null;
    setLeadsRunning(true);
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke("research-campus-leads", {
        body: { campus_id: campus.id },
      });
      const dur = Math.round(performance.now() - t0);
      if (error) {
        let msg = error.message ?? "Lead research failed";
        try {
          const ctx = (error as any).context;
          if (ctx) {
            const j = await ctx.json();
            msg = j?.detail ?? j?.error ?? msg;
          }
        } catch { /* keep */ }
        return {
          status: "failed", started_at: startedAt, duration_ms: dur, error: msg,
          model: null, finish_reason: null, raw_text: null, raw_text_chars: 0,
          sources: [], counts: {},
        };
      }
      const d = data as any;
      const dbg = d?.debug ?? {};
      const succeeded = d?.success !== false;
      const errMsg = !succeeded
        ? (d?.error ?? d?.insert_error ?? "Lead research reported failure")
        : null;
      return {
        status: succeeded ? "success" : "failed",
        started_at: startedAt, duration_ms: dur, error: errMsg,
        model: dbg.model ?? null,
        finish_reason: dbg.finish_reason ?? null,
        raw_text: dbg.raw_text ?? null,
        raw_text_chars: dbg.raw_text_chars ?? 0,
        sources: dbg.sources ?? [],
        counts: {
          raw_suggestion_count: dbg.raw_suggestion_count ?? 0,
          parsed_lead_count: dbg.parsed_lead_count ?? 0,
          rejected_count: dbg.rejected_count ?? 0,
          insert_attempted: dbg.insert_attempted ?? 0,
          saved_lead_count: d?.inserted_count ?? 0,
          skipped_duplicate_count: d?.skipped_duplicate_count ?? 0,
        },
        // stash extra fields into raw_text if not already set so the debug panel surfaces them
        ...(dbg.insert_errors || dbg.rejected_samples || dbg.note || dbg.usage
          ? { raw_text: `${dbg.note ? `NOTE: ${dbg.note}\n\n` : ""}${dbg.insert_errors?.length ? `INSERT ERRORS:\n${dbg.insert_errors.join("\n")}\n\n` : ""}${dbg.rejected_samples?.length ? `REJECTED SAMPLES:\n${JSON.stringify(dbg.rejected_samples, null, 2)}\n\n` : ""}${dbg.usage ? `USAGE: ${JSON.stringify(dbg.usage)}\n\n` : ""}---RAW AI RESPONSE---\n${dbg.raw_text ?? ""}` }
          : {}),
      };
    } catch (e: any) {
      return {
        status: "failed", started_at: startedAt, duration_ms: Math.round(performance.now() - t0),
        error: String(e?.message ?? e), model: null, finish_reason: null,
        raw_text: null, raw_text_chars: 0, sources: [], counts: {},
      };
    } finally {
      setLeadsRunning(false);
    }
  };

  const rerunCourseOnly = async () => {
    const t = toast.loading("Re-running course research…");
    // Stamp a "running" snapshot up front so a crash mid-run still leaves evidence.
    const startedAt = new Date().toISOString();
    await persistDebug({
      ...debugBlob,
      last_run_at: startedAt,
      course: { status: "running" as any, started_at: startedAt, duration_ms: 0, error: null, model: null, finish_reason: null, raw_text: null, raw_text_chars: 0, sources: [], counts: {} },
    });
    const d = await runCourseResearch();
    if (!d) { toast.dismiss(t); return; }
    await persistDebug({ ...debugBlob, last_run_at: new Date().toISOString(), course: d });
    d.status === "success"
      ? toast.success("Course research updated", { id: t })
      : toast.error(d.error ?? "Course research failed", { id: t });
  };

  const rerunLeadsOnly = async () => {
    const t = toast.loading("Re-running lead research…");
    const startedAt = new Date().toISOString();
    await persistDebug({
      ...debugBlob,
      last_run_at: startedAt,
      leads: { status: "running" as any, started_at: startedAt, duration_ms: 0, error: null, model: null, finish_reason: null, raw_text: null, raw_text_chars: 0, sources: [], counts: {} },
    });
    const d = await runLeadResearch();
    if (!d) { toast.dismiss(t); return; }
    await persistDebug({ ...debugBlob, last_run_at: new Date().toISOString(), leads: d });
    d.status === "success"
      ? toast.success(`Leads updated — ${d.counts.saved_lead_count ?? 0} new`, { id: t })
      : toast.error(d.error ?? "Lead research failed", { id: t });
  };

  const runAiResearch = async () => {
    if (!campus || aiResearching) return;
    setAiResearching(true);
    const t = toast.loading("Researching the web — this can take up to a minute…");
    const startedAt = new Date().toISOString();
    // 1) Persist a "running" snapshot immediately so even a hard crash leaves a trace.
    let snapshot: ResearchDebugBlob = {
      ...debugBlob,
      last_run_at: startedAt,
      course: { status: "running" as any, started_at: startedAt, duration_ms: 0, error: null, model: null, finish_reason: null, raw_text: null, raw_text_chars: 0, sources: [], counts: {} },
      leads: { status: "pending" as any, started_at: startedAt, duration_ms: 0, error: null, model: null, finish_reason: null, raw_text: null, raw_text_chars: 0, sources: [], counts: {} },
    };
    await persistDebug(snapshot);

    try {
      // 2) Course phase — persist immediately after it returns.
      const courseDebug = await runCourseResearch();
      snapshot = { ...snapshot, last_run_at: new Date().toISOString(), course: courseDebug ?? snapshot.course };
      await persistDebug(snapshot);

      if (courseDebug?.status === "success") {
        toast.success("AI suggestions added — review every field before approving.", { id: t });

        // 3) Leads phase — persist immediately after it returns, BEFORE any UI re-render
        //    that might crash (e.g., rendering 13 new leads in Step 3).
        const leadDebug = await runLeadResearch();
        snapshot = { ...snapshot, last_run_at: new Date().toISOString(), leads: leadDebug ?? snapshot.leads };
        await persistDebug(snapshot);

        if (leadDebug?.status === "success") {
          const n = leadDebug.counts.saved_lead_count ?? 0;
          toast.success(`Added ${n} suggested lead${n === 1 ? "" : "s"} for review on Step 3.`);
        } else if (leadDebug) {
          toast.message("Lead research couldn't run automatically — open Research Debug for details.");
        }
      } else if (courseDebug) {
        toast.error(courseDebug.error ?? "Research failed", { id: t });
      }
    } catch (e: any) {
      // 4) Any unexpected exception → record it on whichever phase was active.
      const errMsg = String(e?.message ?? e);
      // eslint-disable-next-line no-console
      console.error("[runAiResearch] unexpected error:", e);
      toast.error(`Research crashed: ${errMsg}`, { id: t });
      const failedStub = (started_at: string) => ({
        status: "failed" as const, started_at, duration_ms: 0, error: errMsg,
        model: null, finish_reason: null, raw_text: null, raw_text_chars: 0, sources: [], counts: {},
      });
      const courseStatus = (snapshot.course as any)?.status;
      const phase = courseStatus === "success" ? "leads" : "course";
      snapshot = { ...snapshot, last_run_at: new Date().toISOString(), [phase]: failedStub(startedAt) } as ResearchDebugBlob;
      try { await persistDebug(snapshot); } catch { /* already toasted */ }
    } finally {
      setAiResearching(false);
    }
  };

  // Auto-start full AI research once when the modal is opened from the
  // "Add Campus → Create & Run AI Research" flow.
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!campus || !autoStartResearch) return;
    if (autoStartResearch !== campus.id) return;
    if (autoStartedRef.current === campus.id) return;
    autoStartedRef.current = campus.id;
    // Fire and forget — runAiResearch handles its own toasts and persistence.
    runAiResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus?.id, autoStartResearch]);

  // Map the existing per-family textbook status to the Phase 4 textbook_match_status enum.
  const mapTextbookMatch = (s: FamilyStatus): TextbookMatchStatus => {
    if (s === "matches") return "matched";
    if (s === "likely_match") return "likely_match";
    if (s === "different") return "not_matched";
    if (s === "not_offered") return "not_offered";
    return "unknown"; // not_found, not_checked
  };

  const persistAvailability = async () => {
    if (!campus) return;
    for (const fam of FAMILY_KEYS) {
      const tb = mapTextbookMatch((familyStatus[fam] ?? "not_checked") as FamilyStatus);
      const userOverride = familyAvail[fam];
      // Auto-rule: if textbook isn't matched and the admin left this on "inherit",
      // record an explicit waitlist override (Lee can flip it back later).
      const effectiveOverride: TutoringAvailability | null =
        userOverride !== "inherit"
          ? userOverride
          : tb !== "matched"
          ? "waitlist"
          : null;
      try {
        await upsertCampusCourseAvailability(campus.id, fam, {
          textbook_match_status: tb,
          tutoring_availability: effectiveOverride,
          requires_syllabus_review: familyReqSyllabus[fam],
        });
      } catch (e: any) {
        // Don't block approval on availability persistence — surface and continue.
        console.warn(`availability save failed for ${fam}`, e);
      }
    }
  };

  const approve = () => {
    if (!campus) return;
    onApprove(campus.id, {
      course_family_codes_json: familyCodes,
      course_family_titles_json: familyTitles,
      course_codes: codesArray,
      course_family_status_json: familyStatus,
      course_family_textbooks_json: booksToJson(familyBooks),
      course_family_terms_json: familyTerms,
      approval_status: "approved",
      ready_for_outreach: true,
    });
    persistAvailability();
    toast.success("Campus approved & ready for outreach");
    onClose();
  };

  if (!campus) return null;

  const steps = [
    { id: "1", label: "Course Details", done: step1Done },
    { id: "2", label: "Textbook Research", done: step2Done },
    { id: "3", label: "Lead Review", done: step3Done },
    { id: "4", label: "Approval", done: canApprove },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <Dialog open={!!campus} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 text-base">
              <span>Research &amp; Approve Campus — {campus.school_name}</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  {autoSaving ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                  ) : lastSavedAt ? (
                    <><Save className="h-3 w-3 text-emerald-600" /> Auto-saved</>
                  ) : null}
                </span>
              </div>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Review course codes, textbook matches, and suggested leads before approving outreach.
            </DialogDescription>
          </DialogHeader>

          {/* Single Stepper */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-2">
            {steps.map((s, i) => {
              const isCurrent = step === s.id;
              const isDone = s.done && !isCurrent;
              return (
                <div key={s.id} className="flex flex-1 items-center gap-1">
                  <button
                    onClick={() => setStep(s.id)}
                    className={`flex flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition ${
                      isCurrent
                        ? "bg-background border border-primary shadow-sm font-semibold text-foreground"
                        : isDone
                        ? "text-emerald-700 hover:bg-background/60"
                        : "text-muted-foreground hover:bg-background/60"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                          isCurrent ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                        }`}
                      >
                        {s.id}
                      </span>
                    )}
                    <span className="leading-tight">{s.label}</span>
                  </button>
                  {i < steps.length - 1 && <span className="h-px w-3 shrink-0 bg-border" />}
                </div>
              );
            })}
          </div>

          {/* Research — single primary action + secondary tools */}
          <div className="mt-3 mb-1 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                type="button"
                onClick={runAiResearch}
                disabled={aiResearching}
                size="sm"
                className="h-9 gap-2 font-semibold"
              >
                {aiResearching ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Researching…</>
                ) : (
                  <><Wand2 className="h-4 w-4" /> Run Full AI Research</>
                )}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Finds course codes, textbook matches, and suggested leads. You’ll review everything before saving.
              </span>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Open Research Tools
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[380px] sm:w-[420px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="text-base">🔍 Research Tools</SheetTitle>
                  <p className="text-xs text-muted-foreground font-normal">
                    Quick Google searches for {campus.school_name}. Opens in new tabs.
                  </p>
                </SheetHeader>
                <div className="mt-4 space-y-4 px-4 pb-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Campus-wide
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { emoji: "📚", label: "Course Catalog", q: `${campus.school_name} course catalog accounting` },
                        { emoji: "🎓", label: "Accounting Degree Plan", q: `${campus.school_name} accounting degree plan` },
                        { emoji: "🧾", label: "Accounting Courses", q: `${campus.school_name} accounting courses` },
                        { emoji: "📖", label: "Undergraduate Catalog", q: `${campus.school_name} undergraduate catalog accounting` },
                        { emoji: "🏫", label: "Accounting Department", q: `${campus.school_name} accounting department` },
                        { emoji: "📋", label: "Accounting Curriculum", q: `${campus.school_name} accounting curriculum` },
                        { emoji: "🛒", label: "Bookstore", q: `${campus.school_name} bookstore accounting` },
                      ].map((b) => (
                        <Button
                          key={b.label}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full justify-start h-8 text-xs gap-2 font-normal"
                          onClick={() => openExternal(googleUrl(b.q))}
                        >
                          <span>{b.emoji}</span> {b.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {FAMILIES.some((f) => (familyCodes[f.key] ?? "").trim()) && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Per-Course
                      </p>
                      <div className="space-y-2">
                        {FAMILIES.map((f) => {
                          const code = (familyCodes[f.key] ?? "").trim();
                          if (!code) return null;
                          return (
                            <div key={f.key} className="rounded-md border bg-background/60 p-2 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium">{f.shortLabel}</span>
                                <Badge variant="outline" className="font-mono text-[10px]">{code}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} ${code} textbook`))}>
                                  🔍 Textbook
                                </Button>
                                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} ${code} syllabus`))}>
                                  🔍 Syllabus
                                </Button>
                                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} bookstore ${code}`))}>
                                  🔍 Bookstore
                                </Button>
                                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} ${code}`))}>
                                  🔍 Google
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {aiResult && (
            <div className="mx-auto -mt-1 flex max-w-2xl items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-2 text-[11px] text-blue-800 dark:text-blue-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                AI filled the blank fields below from web sources, each with a confidence meter
                (<span className="text-red-600 dark:text-red-400 font-medium">red</span> = verify,
                <span className="text-amber-600 dark:text-amber-400 font-medium"> amber</span> = double-check,
                <span className="text-emerald-600 dark:text-emerald-400 font-medium"> green</span> = solid).
                A blank field means nothing was found — research it manually. Nothing is approved automatically;
                review everything, then click Approve.
              </span>
            </div>
          )}

          <Tabs value={step} onValueChange={setStep} className="mt-2">
            {/* STEP 1 — Course Details */}
            <TabsContent value="1" className="space-y-3 pt-3">
              {(() => {
                const found = FAMILIES.filter((f) => (familyCodes[f.key] ?? "").trim());
                const missing = FAMILIES.filter((f) => !(familyCodes[f.key] ?? "").trim());
                return (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                    <span className="font-semibold">Course codes found: {found.length}/4</span>
                    {missing.length > 0 ? (
                      <span className="text-muted-foreground">
                        Missing: {missing.map((m) => m.shortLabel).join(", ")}
                      </span>
                    ) : (
                      <span className="text-emerald-700">All four families have a code.</span>
                    )}
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center gap-2">
                <div className="grid gap-1 min-w-[280px] flex-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Accounting program / department name <span className="font-normal">(optional — used in emails as {"{program}"})</span>
                  </span>
                  <Input
                    value={programName}
                    onChange={(e) => {
                      const v = e.target.value;
                      markTouched("program");
                      setProgramName(v);
                      if (programTimer.current) window.clearTimeout(programTimer.current);
                      programTimer.current = window.setTimeout(() => {
                        writePatch({ accounting_department_name: v.trim() || null });
                      }, 700);
                    }}
                    placeholder="e.g. Patterson School of Accountancy"
                    className="h-8"
                  />
                  {aiResult?.program.value ? (
                    <ConfidenceMeter
                      confidence={aiResult.program.confidence}
                      source={aiResult.program.source}
                      touched={aiTouched.has("program")}
                    />
                  ) : (
                    <NotFoundHint
                      show={!!aiResult && !programName.trim() && !aiTouched.has("program")}
                      message="AI couldn't find this — try the 'Find it' button →"
                    />
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs self-end"
                  onClick={() => openExternal(googleUrl(`${campus.school_name} accounting department name`))}
                >
                  🔍 Find it
                </Button>
              </div>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left font-medium px-3 py-2 w-[26%]">Course Family</th>
                      <th className="text-left font-medium px-3 py-2 w-[18%]">Course Code</th>
                      <th className="text-left font-medium px-3 py-2">Course Title</th>
                      <th className="text-left font-medium px-3 py-2 w-[22%]">Offered Terms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {FAMILIES.map((f) => (
                      <tr key={f.key}>
                        <td className="px-3 py-2">{f.label}</td>
                        <td className="px-3 py-2">
                          <Input
                            value={familyCodes[f.key] ?? ""}
                            onChange={(e) => updateFamilyCode(f.key, e.target.value)}
                            placeholder={`e.g. ${f.sampleCode}`}
                            className="h-8"
                          />
                          {aiResult?.families[f.key]?.code.value ? (
                            <ConfidenceMeter
                              confidence={aiResult.families[f.key].code.confidence}
                              source={aiResult.families[f.key].code.source}
                              touched={aiTouched.has(`code:${f.key}`)}
                            />
                          ) : (
                            <NotFoundHint
                              show={!!aiResult && !(familyCodes[f.key] ?? "").trim() && !aiTouched.has(`code:${f.key}`)}
                              message="AI couldn't find this — use the search buttons"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={familyTitles[f.key] ?? ""}
                            onChange={(e) => updateFamilyTitle(f.key, e.target.value)}
                            placeholder={`e.g. ${f.sampleTitle}`}
                            className="h-8"
                          />
                          {aiResult?.families[f.key]?.title.value ? (
                            <ConfidenceMeter
                              confidence={aiResult.families[f.key].title.confidence}
                              source={aiResult.families[f.key].title.source}
                              touched={aiTouched.has(`title:${f.key}`)}
                            />
                          ) : (
                            <NotFoundHint
                              show={!!aiResult && !(familyTitles[f.key] ?? "").trim() && !aiTouched.has(`title:${f.key}`)}
                              message="AI couldn't find this — use the search buttons"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            const t = familyTerms[f.key] ?? {};
                            const aiTerms = aiResult?.families[f.key]?.terms;
                            const touched = aiTouched.has(`terms:${f.key}`);
                            const showAiBadge = !!aiTerms?.terms_text?.value && !touched;
                            const toggle = (k: "fall" | "spring" | "summer") => {
                              const cur = t[k];
                              updateFamilyTerms(f.key, { [k]: cur === true ? false : true });
                            };
                            const chip = (k: "fall" | "spring" | "summer", label: string) => {
                              const on = t[k] === true;
                              return (
                                <button
                                  type="button"
                                  onClick={() => toggle(k)}
                                  className={`h-6 rounded border px-2 text-[10px] font-medium transition ${
                                    on
                                      ? "border-emerald-600 bg-emerald-600 text-white"
                                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            };
                            return (
                              <div className="space-y-1.5">
                                <Input
                                  value={t.terms_text ?? ""}
                                  onChange={(e) => updateFamilyTerms(f.key, { terms_text: e.target.value || null })}
                                  placeholder="e.g. Fall or Spring"
                                  className="h-8 text-xs"
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                  {chip("fall", "Fall")}
                                  {chip("spring", "Spring")}
                                  {chip("summer", "Summer")}
                                  {showAiBadge && (
                                    <Badge variant="outline" className="ml-1 gap-1 border-blue-500/40 text-[9px] text-blue-700 dark:text-blue-300">
                                      <Sparkles className="h-2.5 w-2.5" /> AI Suggested
                                    </Badge>
                                  )}
                                </div>
                                {aiTerms?.terms_text?.value ? (
                                  <ConfidenceMeter
                                    confidence={aiTerms.terms_text.confidence}
                                    source={aiTerms.terms_text.source}
                                    touched={touched}
                                  />
                                ) : (
                                  <NotFoundHint
                                    show={!!aiResult && !t.terms_text && !touched}
                                    message="AI couldn't determine — fill in manually"
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {autoSaving ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                  ) : lastSavedAt ? (
                    <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Saved</>
                  ) : (
                    <>Auto-saves as you type</>
                  )}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" disabled>Previous</Button>
                  <Button onClick={() => setStep("2")}>Next Step</Button>
                </div>
              </div>
            </TabsContent>

            {/* STEP 2 — Textbook Research */}
            <TabsContent value="2" className="space-y-2 pt-3">
              <p className="text-xs text-muted-foreground">
                Research each course's textbook. Use the quick-search buttons, then set status.
              </p>
              <div className="space-y-2">
                {FAMILIES.map((f) => {
                  const v = (familyStatus[f.key] ?? "not_checked") as FamilyStatus;
                  const code = (familyCodes[f.key] ?? "").trim();
                  const searchTerm = code || f.shortLabel;
                  return (
                    <div key={f.key} className="rounded-md border p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium truncate">{f.label}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs font-semibold mb-0.5">Our supported textbook:</p>
                              <p className="text-xs">{f.textbook}</p>
                            </TooltipContent>
                          </Tooltip>
                          {code && <Badge variant="outline" className="font-mono text-[10px]">{code}</Badge>}
                        </div>
                        <Select value={v} onValueChange={(val) => updateFamilyStatus(f.key, val as FamilyStatus)}>
                          <SelectTrigger className={`h-8 w-[200px] text-xs ${v !== "not_checked" ? STATUS_BADGE[v] + " border-0" : ""}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(FAMILY_STATUS_LABELS) as FamilyStatus[]).map((k) => (
                              <SelectItem key={k} value={k} className="text-xs">
                                {FAMILY_STATUS_LABELS[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {aiResult?.families[f.key]?.textbook_status.value ? (
                        <ConfidenceMeter
                          confidence={aiResult.families[f.key].textbook_status.confidence}
                          source={aiResult.families[f.key].textbook_status.source}
                          touched={aiTouched.has(`status:${f.key}`)}
                        />
                      ) : (
                        <NotFoundHint
                          show={!!aiResult && (familyStatus[f.key] ?? "not_checked") === "not_checked" && !aiTouched.has(`status:${f.key}`)}
                          message="AI couldn't determine — use the search buttons"
                        />
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} ${searchTerm} textbook`))}>
                          <BookOpen className="h-3 w-3" /> Textbook Search
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} ${searchTerm} syllabus`))}>
                          <FileText className="h-3 w-3" /> Syllabus Search
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} bookstore ${searchTerm}`))}>
                          <Store className="h-3 w-3" /> Bookstore Search
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openExternal(googleUrl(`${campus.school_name} ${searchTerm}`))}>
                          🔍 Google
                        </Button>
                      </div>
                      {v === "different" && (() => {
                        const b = familyBooks[f.key] ?? EMPTY_BOOK();
                        const lk = isbnLookup[f.key] ?? "idle";
                        return (
                          <div className="rounded-md border border-red-200/70 bg-red-50/40 p-2.5 space-y-2 dark:border-red-900/40 dark:bg-red-950/10">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                What are they using instead? <span className="font-normal normal-case">(optional)</span>
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={b.isbn13}
                                onChange={(e) => updateBook(f.key, "isbn13", e.target.value)}
                                placeholder="ISBN-13 — e.g. 9781264229734"
                                className="h-8 w-[220px] font-mono text-xs"
                              />
                              {lk === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                              {lk === "found" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                              {lk === "notfound" && (
                                <span className="text-[11px] text-muted-foreground">No match — fill in manually</span>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                Paste the ISBN from the bookstore listing — details fill automatically.
                              </span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3">
                              <Input
                                value={b.title}
                                onChange={(e) => updateBook(f.key, "title", e.target.value)}
                                placeholder="Title"
                                className="h-8 text-xs sm:col-span-3"
                              />
                              <Input
                                value={b.authors}
                                onChange={(e) => updateBook(f.key, "authors", e.target.value)}
                                placeholder="Author(s)"
                                className="h-8 text-xs sm:col-span-2"
                              />
                              <Input
                                value={b.publisher}
                                onChange={(e) => updateBook(f.key, "publisher", e.target.value)}
                                placeholder="Publisher"
                                className="h-8 text-xs"
                              />
                            </div>
                            {aiResult?.families[f.key]?.book &&
                              (aiResult.families[f.key].book.isbn13 ||
                                aiResult.families[f.key].book.title ||
                                aiResult.families[f.key].book.authors ||
                                aiResult.families[f.key].book.publisher) && (
                                <ConfidenceMeter
                                  confidence={aiResult.families[f.key].book.confidence}
                                  source={aiResult.families[f.key].book.source}
                                  touched={aiTouched.has(`book:${f.key}`)}
                                />
                              )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              {aggregateTextbookStatus(familyStatus) === "different_textbook" && (
                <div className="flex items-start gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-2 text-xs text-blue-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Courses marked "Different Textbook" will show a "Join Waitlist" email capture instead of a booking link. Campus will still be approved.
                  </span>
                </div>
              )}
            </TabsContent>

            {/* STEP 3 — Lead Review (Phase 4) */}
            <TabsContent value="3" className="space-y-2 pt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Run AI research, then accept the leads you want in the outreach queue.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Accepting a lead does <strong>not</strong> email them. <strong>Import Accepted Leads</strong> moves them into the outreach lead list.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setStep("2")}>Previous</Button>
                  <Button size="sm" onClick={() => setStep("4")}>Next Step</Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge variant="outline" className="font-normal">Pending: {leadSummary.pending}</Badge>
                <Badge variant="outline" className="font-normal border-emerald-500/40 text-emerald-700">Accepted: {leadSummary.accepted}</Badge>
                <Badge variant="outline" className="font-normal border-amber-500/40 text-amber-700">Needs Lee: {leadSummary.needs_lee}</Badge>
                <Badge variant="outline" className="font-normal border-red-500/30 text-red-700">Rejected: {leadSummary.rejected}</Badge>
              </div>


              <LeadSuggestionsPanel
                key={`${campus.id}-${leadsRefreshKey}`}
                campusId={campus.id}
                compact
                showManualImportHelp={false}
                onSummaryChange={setLeadSummary}
              />

              <ClassScheduleIntelligencePanel
                campusId={campus.id}
                onLeadsChanged={() => setLeadsRefreshKey((k) => k + 1)}
              />

              <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5"
                  checked={skipLeadImport}
                  onChange={(e) => setSkipLeadImport(e.target.checked)}
                />
                <span>
                  <strong>No usable leads found / skip lead import for now.</strong>{" "}
                  Approve the campus without importing AI-suggested leads — Lee or a VA can add leads manually later.
                </span>
              </label>
            </TabsContent>

            {/* STEP 4 — Approval Summary */}
            <TabsContent value="4" className="space-y-2 pt-3">
              <p className="text-xs text-muted-foreground">Review your decisions, then approve.</p>

              <div className="rounded-lg border divide-y">
                {FAMILIES.map((f) => {
                  const v = (familyStatus[f.key] ?? "not_checked") as FamilyStatus;
                  const code = (familyCodes[f.key] ?? "").trim();
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-3 p-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium">{f.shortLabel}</span>
                        {code ? (
                          <Badge variant="outline" className="font-mono text-[10px]">{code}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">no code</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {v === "different" && (familyBooks[f.key]?.title || familyBooks[f.key]?.isbn13) && (
                          <span className="max-w-[260px] truncate text-[11px] text-muted-foreground">
                            {familyBooks[f.key]?.title || familyBooks[f.key]?.isbn13}
                            {familyBooks[f.key]?.publisher ? ` · ${familyBooks[f.key]?.publisher}` : ""}
                          </span>
                        )}
                        <Badge className={`text-[11px] ${STATUS_BADGE[v]}`}>
                          {FAMILY_STATUS_LABELS[v]}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Phase 4 — Course Availability */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Course Availability</div>
                    <div className="text-[11px] text-muted-foreground">
                      Drives Book / Waitlist / Hide buttons on the landing page. Leave on
                      <strong> Inherit</strong> to use the global default. Saving will auto-set any
                      family with a non-matching textbook to <strong>Waitlist</strong> — you can flip back later.
                    </div>
                  </div>
                </div>
                <div className="overflow-hidden rounded-md border bg-background">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Family</th>
                        <th className="px-2 py-1.5 text-left font-medium">Availability</th>
                        <th className="px-2 py-1.5 text-left font-medium">Needs syllabus review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {FAMILY_KEYS.map((fam) => {
                        const meta = FAMILIES.find((f) => f.key === fam)!;
                        const inheritLabel = globalDefaults ? globalDefaults[fam] : "—";
                        return (
                          <tr key={fam}>
                            <td className="px-2 py-1.5">{meta.shortLabel}</td>
                            <td className="px-2 py-1.5">
                              <Select
                                value={familyAvail[fam]}
                                onValueChange={(v) =>
                                  setFamilyAvail((p) => ({ ...p, [fam]: v as "inherit" | TutoringAvailability }))
                                }
                              >
                                <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit" className="text-xs">Inherit ({inheritLabel})</SelectItem>
                                  <SelectItem value="available" className="text-xs">Available — Book Tutoring</SelectItem>
                                  <SelectItem value="waitlist" className="text-xs">Waitlist</SelectItem>
                                  <SelectItem value="unavailable" className="text-xs">Unavailable — hide</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={familyReqSyllabus[fam]}
                                onChange={(e) =>
                                  setFamilyReqSyllabus((p) => ({ ...p, [fam]: e.target.checked }))
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Phase 5 — Final checklist + missing reasons */}
              {(() => {
                const textbooksReviewed = step2Done;
                const leadsReviewed = step3Done;
                const landingPageReady = !!campus.landing_page_reviewed;
                const readyForOutreach = step1Done && textbooksReviewed && leadsReviewed;
                const checklist: Array<{ label: string; done: boolean; tone: "ok" | "todo" | "info" }> = [
                  { label: "Course codes reviewed", done: step1Done, tone: step1Done ? "ok" : "todo" },
                  { label: "Textbooks reviewed", done: textbooksReviewed, tone: textbooksReviewed ? "ok" : "todo" },
                  { label: "Leads reviewed", done: leadsReviewed, tone: leadsReviewed ? "ok" : "todo" },
                  { label: "Landing page ready", done: landingPageReady, tone: landingPageReady ? "ok" : "info" },
                  { label: "Ready for outreach", done: readyForOutreach, tone: readyForOutreach ? "ok" : "todo" },
                ];

                const missing: string[] = [];
                if (!step1Done) missing.push("At least one course code is required.");
                for (const f of FAMILIES) {
                  const s = (familyStatus[f.key] ?? "not_checked") as FamilyStatus;
                  if (s === "not_checked") missing.push(`${f.shortLabel} textbook status is still Not Checked.`);
                }
                if (!step3Done) missing.push("Lead review not finished — accept at least one lead or tick the “skip lead import” box on Lead Review.");

                return (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
                    <div className="text-sm font-semibold">Final Checklist</div>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {checklist.map((c) => (
                        <li key={c.label} className="flex items-center gap-1.5">
                          {c.done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          ) : c.tone === "info" ? (
                            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          )}
                          <span className={c.done ? "" : c.tone === "info" ? "text-muted-foreground" : "text-amber-800"}>
                            {c.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {missing.length > 0 && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800">
                        <div className="font-semibold mb-0.5">Cannot approve yet:</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {missing.map((m) => <li key={m}>{m}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </TabsContent>

          </Tabs>

          {/* ============ Research Debug (admin-only — modal is already AdminGate'd) ============ */}
          <Collapsible className="mt-3 rounded-md border border-dashed bg-muted/20">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-muted/40"
              >
                <span className="flex items-center gap-2">
                  <Bug className="h-3.5 w-3.5 text-muted-foreground" />
                  Research Debug
                  {debugBlob.last_run_at && (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      · last run {new Date(debugBlob.last_run_at).toLocaleString()}
                    </span>
                  )}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 border-t px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={rerunCourseOnly} disabled={courseRunning}>
                  {courseRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Re-run Course Research
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={rerunLeadsOnly} disabled={leadsRunning}>
                  {leadsRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Re-run Lead Research
                </Button>
                <Button
                  type="button" size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                  onClick={() => {
                    const payload = JSON.stringify(debugBlob, null, 2);
                    navigator.clipboard?.writeText(payload).then(
                      () => toast.success("Debug data copied"),
                      () => toast.error("Couldn't copy"),
                    );
                  }}
                >
                  <Clipboard className="h-3 w-3" /> Copy Debug Data
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  Internal troubleshooting only. API keys are never exposed.
                </span>
              </div>

              {(["course", "leads"] as const).map((kind) => {
                const run = debugBlob[kind];
                const title = kind === "course" ? "Course Research" : "Lead Research";
                if (!run) {
                  return (
                    <div key={kind} className="rounded-md border bg-background p-2.5 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{title}</span> — no runs recorded.
                    </div>
                  );
                }
                return (
                  <div key={kind} className="rounded-md border bg-background p-2.5 space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{title}</span>
                      <Badge className={run.status === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}>
                        {run.status === "success" ? <Check className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                        {run.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground sm:grid-cols-4">
                      <div><span className="text-foreground/70">Last run:</span> {new Date(run.started_at).toLocaleString()}</div>
                      <div><span className="text-foreground/70">Duration:</span> {run.duration_ms} ms</div>
                      <div><span className="text-foreground/70">Model:</span> {run.model ?? "—"}</div>
                      <div><span className="text-foreground/70">Raw chars:</span> {run.raw_text_chars}</div>
                      {Object.entries(run.counts).map(([k, v]) => (
                        <div key={k}><span className="text-foreground/70">{k}:</span> {v as number}</div>
                      ))}
                    </div>
                    {run.error && (
                      <div className="rounded border border-red-500/40 bg-red-500/5 px-2 py-1 text-red-700 dark:text-red-300">
                        <span className="font-semibold">Error:</span> {run.error}
                      </div>
                    )}
                    {run.sources.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-foreground/80 hover:text-foreground">
                          Source URLs ({run.sources.length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {run.sources.map((s) => (
                            <li key={s}>
                              <a href={s} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                                {s}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {run.raw_text && (
                      <details>
                        <summary className="cursor-pointer text-foreground/80 hover:text-foreground">
                          Raw AI response
                        </summary>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-[10px] leading-snug">
                          {run.raw_text}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!campus) return;
                onPatch(campus.id, { approval_status: "needs_fix" });
                toast.success("Flagged for Lee's review");
                onClose();
              }}
              className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
            >
              <AlertTriangle className="h-4 w-4" />
              Mark Needs Lee
            </Button>
            <Button
              disabled={!canApprove}
              onClick={approve}
              title={!canApprove ? "Complete all steps to approve" : ""}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve Campus
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
