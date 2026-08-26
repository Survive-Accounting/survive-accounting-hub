// ✨ ENRICHMENT — per-campus research status + targeted single-campus runners.
//
// Status is DERIVED from the live intel tables per the Course-Intel/Structural
// handoff contracts. Runners wrap the existing targeted server functions (the
// same ones /api/backfill chains) — no new crawler, no orchestrator token needed.
// Every action: assertAdmin() + a per-campus lease in backfill_lock so a
// double-click can't start two runs.
//
// LAW: this file ships to the client bundle; service-role client + admin session
// are imported dynamically inside handlers only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { estimateCost } from "@/lib/growth-enrichment-cost";

export type EnrichState = "COMPLETE" | "PARTIAL" | "MISSING" | "NEEDS_REVIEW";

export interface EnrichmentRow {
  key: EnrichCategory;
  label: string;
  state: EnrichState;
  detail: string; // provenance: counts, last attempted, source
  runnable: boolean; // has a safe targeted runner
  costNote: string | null; // shown before triggering a paid provider
  /** Estimated provider usage + dollars, off published list prices (always rendered with a ~). */
  cost: { usd: number; summary: string } | null;
  quarantined: boolean;
}

export type EnrichCategory =
  | "course_code"
  | "greek_chapters"
  | "councils"
  | "council_contacts"
  | "professors"
  | "rmp_qualify"
  | "syllabi_docs"
  | "textbook"
  | "exam_ranges"
  | "exam_dates";

export interface EnrichmentStatus {
  campusId: string;
  rows: EnrichmentRow[];
  running: string | null; // category currently holding the lease, if any
}

type DB = { from: (t: string) => any; rpc?: any };

const fmtWhen = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : "never";

async function computeStatus(db: DB, campusId: string): Promise<EnrichmentRow[]> {
  const [campusR, statusR, councilR, chaptersR, leadsR, quarR, evidenceR] = await Promise.all([
    db
      .from("campuses")
      .select("course_family_codes_json,greek_eligibility")
      .eq("id", campusId)
      .maybeSingle(),
    db.from("course_intel_campus_status").select("*").eq("campus_id", campusId).maybeSingle(),
    db
      .from("campus_council_status")
      .select("council_type,status,contacts_found,role_inbox_found,last_attempted_at")
      .eq("campus_id", campusId),
    db
      .from("campus_greek_chapters")
      .select("id", { count: "exact", head: true })
      .eq("campus_id", campusId)
      .is("archived_at", null),
    db
      .from("campus_lead_suggestions")
      .select("id,rmp_target_course_counts_json")
      .eq("campus_id", campusId)
      .is("archived_at", null),
    db.from("growth_scoring_exclusions").select("metric,status").eq("campus_id", campusId),
    db
      .from("course_evidence")
      .select("evidence_type,exam_label,confidence,effective_term")
      .eq("campus_id", campusId)
      .is("superseded_by", null),
  ]);
  const campus = campusR.data ?? {};
  const s = statusR.data ?? {};
  const councils = councilR.data ?? [];
  const chapterCount = chaptersR.count ?? 0;
  const leads: any[] = leadsR.data ?? [];
  const quarantines = new Set((quarR.data ?? []).map((q: any) => q.metric));
  const evidence: any[] = evidenceR.data ?? [];

  const code: string | null =
    s.course_code ??
    (campus.course_family_codes_json && typeof campus.course_family_codes_json === "object"
      ? ((campus.course_family_codes_json as any).intro_1 ?? null)
      : null);
  const intro1Qualified = leads.filter(
    (l) => Number((l.rmp_target_course_counts_json as any)?.intro_1 ?? 0) >= 1,
  ).length;
  const confirmedProfs = s.confirmed_intro1_professors ?? 0;
  const candidates = s.professor_candidates ?? leads.length;
  const councilComplete = councils.filter((c: any) => c.status === "complete");
  const councilContacts = councils.reduce((n: number, c: any) => n + (c.contacts_found ?? 0), 0);
  const roleInbox = councils.some((c: any) => c.role_inbox_found);
  const lastCouncilAttempt =
    councils
      .map((c: any) => c.last_attempted_at)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  const examRanges = evidence.filter((e) => e.evidence_type === "exam_chapter_range");
  const exam1Range = examRanges.some((e) => /exam\s*_?1/i.test(String(e.exam_label ?? "")));
  const examDates = evidence.filter((e) => e.evidence_type === "exam_date");
  const textbookDocs = s.textbook_docs_found ?? 0;
  const docsFound = s.documents_found ?? 0;
  const syllabiFound = s.syllabi_found ?? 0;
  const exam1DateTerm = s.exam_1_date_term ?? null;
  const currentTermDate =
    s.exam_1_date != null && Number(String(exam1DateTerm ?? "").match(/\d{4}/)?.[0] ?? 0) >= 2026;

  const rows: EnrichmentRow[] = [
    {
      key: "course_code",
      label: "Course code",
      state: code ? "COMPLETE" : "MISSING",
      detail: code ? `${code}` : "no Intro-1 code on file",
      runnable: !code,
      costNote: "Uses SerpAPI + Firecrawl + AI · ~$0.05–0.10", cost: estimateCost("course_code"),
      quarantined: false,
    },
    {
      key: "greek_chapters",
      label: "Greek chapters",
      state: quarantines.has("greek_chapter_count")
        ? "NEEDS_REVIEW"
        : chapterCount > 0
          ? "COMPLETE"
          : "MISSING",
      detail: quarantines.has("greek_chapter_count")
        ? `${chapterCount} chapters — count quarantined (suspected wrong-campus data)`
        : chapterCount > 0
          ? `${chapterCount} chapters on roster`
          : "no chapters found",
      runnable: chapterCount === 0,
      costNote: "Uses SerpAPI + Firecrawl + AI", cost: estimateCost("greek_chapters"),
      quarantined: quarantines.has("greek_chapter_count"),
    },
    {
      key: "councils",
      label: "IFC / Panhellenic / councils",
      state:
        councilComplete.length > 0
          ? councilComplete.some((c: any) => (c.contacts_found ?? 0) === 0)
            ? "NEEDS_REVIEW"
            : "COMPLETE"
          : councils.length > 0
            ? "PARTIAL"
            : "MISSING",
      detail: councils.length
        ? `${councilComplete.length}/${councils.length} councils researched · last ${fmtWhen(lastCouncilAttempt)}`
        : "councils not researched",
      runnable: false,
      costNote: null, cost: null,
      quarantined: false,
    },
    {
      key: "council_contacts",
      label: "Council contacts",
      state: councilContacts > 0 ? (roleInbox ? "COMPLETE" : "PARTIAL") : "MISSING",
      detail:
        councilContacts > 0
          ? `${councilContacts} contacts${roleInbox ? " incl. role inbox" : " — no role inbox yet"}`
          : "no council contacts",
      runnable: councilContacts === 0 || !roleInbox,
      costNote: "SerpAPI-heavy (~10–20 searches) · the expensive one", cost: estimateCost("council_contacts"),
      quarantined: false,
    },
    {
      key: "professors",
      label: "Professors",
      state: quarantines.has("professor_count")
        ? "NEEDS_REVIEW"
        : confirmedProfs > 0
          ? "COMPLETE"
          : candidates > 0
            ? "PARTIAL"
            : "MISSING",
      detail: quarantines.has("professor_count")
        ? `${candidates} scraped — over-collection quarantined; needs cleanup review`
        : confirmedProfs > 0
          ? `${confirmedProfs} confirmed Intro-1 · ${candidates} candidates`
          : candidates > 0
            ? `${candidates} candidates, none doc-confirmed Intro-1`
            : "no professors researched",
      runnable: candidates === 0,
      costNote: "Uses Firecrawl (heavy) · potentially higher cost", cost: estimateCost("professors"),
      quarantined: quarantines.has("professor_count"),
    },
    {
      key: "rmp_qualify",
      label: "RMP Intro-1 qualify",
      state: intro1Qualified > 0 ? "COMPLETE" : candidates > 0 ? "PARTIAL" : "MISSING",
      detail:
        candidates > 0
          ? `${intro1Qualified}/${candidates} RMP-qualified for Intro-1`
          : "needs professors first",
      runnable: candidates > 0,
      costNote: null /* free */, cost: estimateCost("rmp_qualify"),
      quarantined: false,
    },
    {
      key: "syllabi_docs",
      label: "Syllabi / course docs",
      state: syllabiFound > 0 ? "COMPLETE" : docsFound > 0 ? "PARTIAL" : "MISSING",
      detail:
        docsFound > 0 ? `${docsFound} documents · ${syllabiFound} syllabi` : "no documents found",
      runnable: true,
      costNote: "SerpAPI only · ~$0.05–0.15", cost: estimateCost("syllabi_docs"),
      quarantined: false,
    },
    {
      key: "textbook",
      label: "Textbook",
      state: textbookDocs > 0 ? "COMPLETE" : docsFound > 0 ? "PARTIAL" : "MISSING",
      detail: textbookDocs > 0 ? `${textbookDocs} textbook doc(s)` : "no textbook evidence",
      runnable: false,
      costNote: null, cost: null,
      quarantined: false,
    },
    {
      key: "exam_ranges",
      label: "Exam ranges",
      state: examRanges.some((e) => Array.isArray(e.exam_chapters) && e.exam_chapters.length > 6)
        ? "NEEDS_REVIEW"
        : exam1Range
          ? "COMPLETE"
          : examRanges.length > 0
            ? "PARTIAL"
            : "MISSING",
      detail: examRanges.length
        ? `${examRanges.length} exam-range evidence rows`
        : "no exam-range evidence",
      runnable: false,
      costNote: null, cost: null,
      quarantined: false,
    },
    {
      key: "exam_dates",
      label: "Exam dates",
      state: currentTermDate
        ? "COMPLETE"
        : examDates.length > 0 || s.exam_1_date
          ? "PARTIAL"
          : "MISSING",
      detail: currentTermDate
        ? `current-term Exam 1 date on file (${s.exam_1_date})`
        : s.exam_1_date
          ? `historical only (${s.exam_1_date} · ${exam1DateTerm ?? "term unknown"})`
          : "no dates",
      runnable: false,
      costNote: null, cost: null,
      quarantined: false,
    },
  ];
  return rows;
}

const LEASE_MS = 10 * 60_000;

async function acquireCampusLease(
  db: DB,
  campusId: string,
  category: string,
): Promise<{ ok: boolean; heldBy?: string }> {
  const id = `campus:${campusId}`;
  const now = Date.now();
  try {
    const { data: cur } = await db
      .from("backfill_lock")
      .select("owner,expires_at")
      .eq("id", id)
      .maybeSingle();
    if (cur && cur.expires_at && new Date(cur.expires_at).getTime() > now)
      return { ok: false, heldBy: cur.owner };
    await db.from("backfill_lock").upsert(
      {
        id,
        owner: category,
        expires_at: new Date(now + LEASE_MS).toISOString(),
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "id" },
    );
    return { ok: true };
  } catch {
    return { ok: true };
  } // fail open like the orchestrator
}

async function releaseCampusLease(db: DB, campusId: string): Promise<void> {
  try {
    await db.from("backfill_lock").delete().eq("id", `campus:${campusId}`);
  } catch {
    /* lease expires anyway */
  }
}

export const growthEnrichmentStatus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<EnrichmentStatus> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as DB;
    const rows = await computeStatus(db, data.campusId);
    let running: string | null = null;
    try {
      const { data: lock } = await db
        .from("backfill_lock")
        .select("owner,expires_at")
        .eq("id", `campus:${data.campusId}`)
        .maybeSingle();
      if (lock && new Date(lock.expires_at).getTime() > Date.now()) running = lock.owner;
    } catch {
      /* no lock table = nothing running */
    }
    return { campusId: data.campusId, rows, running };
  });

const RUNNABLE = z.enum([
  "course_code",
  "greek_chapters",
  "council_contacts",
  "professors",
  "rmp_qualify",
  "syllabi_docs",
]);

export const growthRunEnrichment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ campusId: z.string().uuid(), category: RUNNABLE }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; summary: string; rows?: EnrichmentRow[] }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as DB;
    const { campusId, category } = data;

    const lease = await acquireCampusLease(db, campusId, category);
    if (!lease.ok)
      return { ok: false, summary: `Already running (${lease.heldBy}) — wait for it to finish.` };

    try {
      let summary = "";
      if (category === "course_code") {
        const { researchProgramCourses } = await import("@/lib/program-courses.functions");
        const r = (await researchProgramCourses({ data: { campusId, force: true } })) as {
          course_family_codes_json?: Record<string, string>;
        };
        summary = r?.course_family_codes_json?.intro_1
          ? `Found ${r.course_family_codes_json.intro_1}`
          : "No Intro-1 code found";
      } else if (category === "greek_chapters") {
        const { scrapeCampusGreek } = await import("@/lib/greekrank-scrape.functions");
        const r = (await scrapeCampusGreek({ data: { campusId } })) as { inserted?: number };
        summary = `+${r?.inserted ?? 0} chapters`;
      } else if (category === "council_contacts") {
        const { discoverCouncilContacts } = await import("@/lib/council-contacts.functions");
        const r = (await discoverCouncilContacts({ data: { campusId } })) as {
          contactsInserted?: number;
        };
        summary = `+${r?.contactsInserted ?? 0} council contacts`;
      } else if (category === "professors") {
        const { autoDiscoverCampusUrls } = await import("@/lib/auto-scrape.functions");
        const { scrapeCampusFaculty } = await import("@/lib/faculty-scrape.functions");
        const d = (await autoDiscoverCampusUrls({ data: { campusId } })) as {
          facultyUrls?: string[];
          noAccountingDept?: boolean;
        };
        if (d?.facultyUrls?.length && !d.noAccountingDept) {
          const r = (await scrapeCampusFaculty({
            data: { campusId, urls: d.facultyUrls, allowNoContact: true, maxPages: 3 },
          })) as { inserted?: number };
          summary = `+${r?.inserted ?? 0} professors`;
        } else summary = "No accounting department page found";
      } else if (category === "rmp_qualify") {
        const { enrichProfintelCampus } = await import("@/lib/rmp-scrape.functions");
        const r = (await enrichProfintelCampus({ data: { campusId, limit: 150 } })) as {
          withTargetMatch?: number;
        };
        summary = `${r?.withTargetMatch ?? 0} professors matched to Intro-1 on RMP`;
      } else if (category === "syllabi_docs") {
        const { discoverCourseDocuments } = await import("@/lib/syllabus-intel.functions");
        const r = (await discoverCourseDocuments({ data: { campusId } })) as { inserted?: number };
        summary = `+${r?.inserted ?? 0} course documents`;
      }
      const rows = await computeStatus(db, campusId);
      return { ok: true, summary, rows };
    } catch (e) {
      return { ok: false, summary: e instanceof Error ? e.message : "Enrichment failed" };
    } finally {
      await releaseCampusLease(db, campusId);
    }
  });
