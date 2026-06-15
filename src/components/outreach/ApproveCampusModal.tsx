// Ported from the original app (components/outreach/ApproveCampusModal.tsx).
// Autosave patches go to the parent via onPatch; Supabase wiring lands later.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BookOpen, Check, CheckCircle2, ExternalLink, FileText, Loader2, Save, Sparkles, Store, Wand2,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Info } from "lucide-react";
import type { Campus } from "@/lib/outreach-mock";
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
} from "@/lib/outreach-api";
import LeadSuggestionsPanel, { type LeadSuggestionsSummary } from "./LeadSuggestionsPanel";
import { supabase } from "@/integrations/supabase/client";

type FamilyStatus = "matches" | "different" | "not_found" | "not_checked";

/** Legacy values from the old app collapse into the simplified set. */
function normalizeStatus(v: string | undefined): FamilyStatus {
  if (v === "matches" || v === "different" || v === "not_found") return v;
  if (v === "not_viewable" || v === "not_offered") return "not_found";
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
  matches: "Matches Our Textbook",
  different: "Different Textbook",
  not_found: "Textbook Not Found",
  not_checked: "Not Checked",
};

const STATUS_BADGE: Record<FamilyStatus, string> = {
  matches: "bg-emerald-600 text-white",
  different: "bg-red-600 text-white",
  not_found: "bg-amber-500 text-white",
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
  campus, onClose, onPatch, onApprove,
}: {
  campus: Campus | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Campus>) => void;
  onApprove: (id: string, patch: Partial<Campus>) => void;
}) {
  const [step, setStep] = useState("1");
  const [familyCodes, setFamilyCodes] = useState<Record<string, string>>({});
  const [familyTitles, setFamilyTitles] = useState<Record<string, string>>({});
  const [familyStatus, setFamilyStatus] = useState<Record<string, FamilyStatus>>({});
  const [familyBooks, setFamilyBooks] = useState<Record<string, FamilyBook>>({});
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
    const init: Record<string, FamilyStatus> = {};
    FAMILIES.forEach((f) => {
      init[f.key] = normalizeStatus(existing[f.key]);
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
    }
    setFamilyCodes(nextCodes);
    setFamilyTitles(nextTitles);
    setFamilyStatus(nextStatus);
    setFamilyBooks(nextBooks);
    const codesArr = Object.values(nextCodes).map((s) => s.trim()).filter(Boolean);
    writePatch({
      course_family_codes_json: nextCodes,
      course_family_titles_json: nextTitles,
      course_codes: codesArr,
      course_family_status_json: nextStatus,
      course_family_textbooks_json: booksToJson(nextBooks),
    });
  };

  const runAiResearch = async () => {
    if (!campus || aiResearching) return;
    setAiResearching(true);
    const t = toast.loading("Researching the web — this can take up to a minute…");
    try {
      const r = await researchCampusAI({
        school_name: campus.school_name,
        state: campus.state,
        course_codes: campus.course_codes,
      });
      if (!r.ok || !r.result) {
        toast.error(r.error ?? "Research failed", { id: t });
        return;
      }
      setAiResult(r.result);
      setAiTouched(new Set());
      applySuggestions(r.result);
      toast.success("AI suggestions added — review every field before approving.", { id: t });

      // Best-effort: also kick off lead research. The LeadSuggestionsPanel on Step 3
      // re-reads from the staging table when the user navigates there.
      try {
        const { data, error } = await supabase.functions.invoke("research-campus-leads", {
          body: { campus_id: campus.id },
        });
        if (error) throw error;
        const d = data as any;
        if (d?.inserted_count != null) {
          toast.success(`Added ${d.inserted_count} suggested lead${d.inserted_count === 1 ? "" : "s"} for review on Step 3.`);
        }
      } catch (e: any) {
        toast.message("Lead research couldn't run automatically — open Step 3 to run it manually.");
      }
    } finally {
      setAiResearching(false);
    }
  };

  // Map the existing per-family textbook status to the Phase 4 textbook_match_status enum.
  const mapTextbookMatch = (s: FamilyStatus): TextbookMatchStatus => {
    if (s === "matches") return "matched";
    if (s === "different") return "not_matched";
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
            <TabsContent value="1" className="space-y-4 pt-4">
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
                      <th className="text-left font-medium px-3 py-2 w-[34%]">Course Family</th>
                      <th className="text-left font-medium px-3 py-2 w-[22%]">Course Code</th>
                      <th className="text-left font-medium px-3 py-2">Course Title</th>
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
            <TabsContent value="2" className="space-y-3 pt-4">
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
            <TabsContent value="3" className="space-y-3 pt-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Run AI research, then accept the leads you want to import into the outreach queue.
                  AI suggestions never become real leads until you import them.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep("2")}>Previous</Button>
                  <Button size="sm" onClick={() => setStep("4")}>Next Step</Button>
                </div>
              </div>

              <LeadSuggestionsPanel
                campusId={campus.id}
                compact
                showManualImportHelp={false}
                onSummaryChange={setLeadSummary}
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
            <TabsContent value="4" className="space-y-3 pt-4">
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

              {/* Phase 4 — Approval summary checklist */}
              {(() => {
                const textbooksReviewed = step2Done;
                const recommendation =
                  step1Done && textbooksReviewed && leadSummary.accepted > 0
                    ? { label: "Ready for outreach", cls: "bg-emerald-600 text-white" }
                    : leadSummary.needs_lee > 0
                    ? { label: "Needs Lee", cls: "bg-amber-500 text-white" }
                    : { label: "Needs more research", cls: "bg-muted text-muted-foreground" };
                return (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Approval Summary</div>
                      <Badge className={`text-[11px] ${recommendation.cls}`}>{recommendation.label}</Badge>
                    </div>
                    <ul className="space-y-1">
                      <li>
                        <span className="font-medium">Course Details:</span>{" "}
                        {step1Done ? <span className="text-emerald-700">reviewed</span> : <span className="text-amber-700">missing</span>}
                        {" — "}{codesArray.length} course code{codesArray.length === 1 ? "" : "s"}
                      </li>
                      <li>
                        <span className="font-medium">Textbooks:</span>{" "}
                        {textbooksReviewed ? <span className="text-emerald-700">reviewed</span> : <span className="text-amber-700">missing</span>}
                      </li>
                      <li>
                        <span className="font-medium">Leads:</span>{" "}
                        {leadSummary.total} suggested · {leadSummary.accepted} accepted · {leadSummary.needs_lee} needs Lee
                        {skipLeadImport && <span className="ml-1 text-muted-foreground">(skipped for now)</span>}
                      </li>
                    </ul>
                  </div>
                );
              })()}

              {!canApprove && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Complete all steps before approving: at least one course code, a status set for every textbook family,
                    and either accept at least one AI-suggested lead or check the “skip lead import” box on Lead Review.
                  </span>
                </div>
              )}
            </TabsContent>

          </Tabs>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
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
