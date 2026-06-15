// Static mock data for the Outreach dashboard — Supabase wiring not yet enabled.

export type AssignmentStatus =
  | "not_assigned"
  | "assigned"
  | "in_progress"
  | "approved"
  | "blocked";
export type ApprovalStatus = "not_reviewed" | "needs_review" | "approved" | "needs_fix";
export type CampusStatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "ready_for_outreach"
  | "emails_sent";
export type AssignmentFilter = "all" | "assigned" | "unassigned" | "king";

export interface Campus {
  id: string;
  school_name: string;
  slug: string;
  state: string;
  region: string;
  is_sec: boolean;
  archived: boolean;
  tam_total: number | null;
  tam_confidence: "low" | "med" | "high" | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  tuition_source: "ipeds" | "ai_estimate" | null;
  total_enrollment: number | null;
  approval_status: ApprovalStatus;
  ready_for_outreach: boolean;
  emails_sent: boolean;
  assignment_status: AssignmentStatus;
  assigned_to: string | null;
  assignment_batch: string | null;
  due_date: string | null;
  landing_views: number;
  landing_clicks: number;
  course_codes: string[];
  // Course-family research (Approve Campus modal)
  course_family_codes_json?: Record<string, string>;
  course_family_titles_json?: Record<string, string>;
  course_family_status_json?: Record<string, string>;
  course_family_textbooks_json?: Record<string, { isbn13?: string; title?: string; authors?: string; publisher?: string }>;
  course_family_terms_json?: Record<string, CourseFamilyTerms>;
  ai_research_debug_json?: Record<string, unknown> | null;
  accounting_department_name?: string | null;
  use_school_colors?: boolean;
  landing_page_reviewed?: boolean;
  use_personal_phone?: boolean;
  tuition_notes?: string | null;
}

export interface CourseFamilyTerms {
  terms_text?: string | null;
  fall?: boolean | null;
  spring?: boolean | null;
  summer?: boolean | null;
}

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_assigned: "Not Assigned",
  assigned: "Assigned",
  in_progress: "In Progress",
  approved: "Approved",
  blocked: "Blocked",
};

export const ASSIGNMENT_STATUS_BADGE: Record<AssignmentStatus, string> = {
  not_assigned: "bg-muted text-muted-foreground border-border",
  assigned: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-amber-100 text-amber-900 border-amber-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  blocked: "bg-red-100 text-red-900 border-red-200",
};

export const MOCK_CAMPUSES: Campus[] = [
  {
    id: "c1",
    school_name: "University of Mississippi",
    slug: "ole-miss",
    state: "MS",
    region: "Southeast",
    is_sec: true,
    archived: false,
    tam_total: 1850,
    tam_confidence: "high",
    tuition_in_state: 9444,
    tuition_out_state: 27052,
    tuition_source: "ipeds",
    total_enrollment: 23258,
    approval_status: "approved",
    ready_for_outreach: true,
    emails_sent: true,
    assignment_status: "approved",
    assigned_to: "lee",
    assignment_batch: "wave-1",
    due_date: "2026-06-15",
    landing_views: 124,
    landing_clicks: 38,
    course_codes: ["ACCY 201", "ACCY 202", "ACCY 303", "ACCY 304"],
  },
  {
    id: "c2",
    school_name: "Auburn University",
    slug: "auburn",
    state: "AL",
    region: "Southeast",
    is_sec: true,
    archived: false,
    tam_total: 1620,
    tam_confidence: "high",
    tuition_in_state: 12176,
    tuition_out_state: 33424,
    tuition_source: "ipeds",
    total_enrollment: 33015,
    approval_status: "approved",
    ready_for_outreach: true,
    emails_sent: false,
    assignment_status: "in_progress",
    assigned_to: "king",
    assignment_batch: "wave-1",
    due_date: "2026-06-18",
    landing_views: 0,
    landing_clicks: 0,
    course_codes: ["ACCT 2110", "ACCT 2210", "ACCT 3110", "ACCT 3210"],
  },
  {
    id: "c3",
    school_name: "University of Alabama",
    slug: "alabama",
    state: "AL",
    region: "Southeast",
    is_sec: true,
    archived: false,
    tam_total: 2100,
    tam_confidence: "high",
    tuition_in_state: 11100,
    tuition_out_state: 32400,
    tuition_source: "ipeds",
    total_enrollment: 38644,
    approval_status: "needs_review",
    ready_for_outreach: false,
    emails_sent: false,
    assignment_status: "assigned",
    assigned_to: "king",
    assignment_batch: "wave-1",
    due_date: "2026-06-20",
    landing_views: 0,
    landing_clicks: 0,
    course_codes: ["AC 210", "AC 211"],
  },
  {
    id: "c4",
    school_name: "Texas A&M University",
    slug: "tamu",
    state: "TX",
    region: "Southwest",
    is_sec: true,
    archived: false,
    tam_total: 3200,
    tam_confidence: "med",
    tuition_in_state: 13239,
    tuition_out_state: 40139,
    tuition_source: "ipeds",
    total_enrollment: 74014,
    approval_status: "needs_review",
    ready_for_outreach: false,
    emails_sent: false,
    assignment_status: "assigned",
    assigned_to: "lee",
    assignment_batch: "wave-2",
    due_date: "2026-06-22",
    landing_views: 0,
    landing_clicks: 0,
    course_codes: ["ACCT 209", "ACCT 210"],
  },
  {
    id: "c5",
    school_name: "University of Georgia",
    slug: "uga",
    state: "GA",
    region: "Southeast",
    is_sec: true,
    archived: false,
    tam_total: 1980,
    tam_confidence: "high",
    tuition_in_state: 12080,
    tuition_out_state: 31120,
    tuition_source: "ipeds",
    total_enrollment: 40118,
    approval_status: "not_reviewed",
    ready_for_outreach: false,
    emails_sent: false,
    assignment_status: "not_assigned",
    assigned_to: null,
    assignment_batch: null,
    due_date: null,
    landing_views: 0,
    landing_clicks: 0,
    course_codes: [],
  },
  {
    id: "c6",
    school_name: "Vanderbilt University",
    slug: "vanderbilt",
    state: "TN",
    region: "Southeast",
    is_sec: false,
    archived: false,
    tam_total: 640,
    tam_confidence: "med",
    tuition_in_state: null,
    tuition_out_state: 63946,
    tuition_source: "ipeds",
    total_enrollment: 13796,
    approval_status: "not_reviewed",
    ready_for_outreach: false,
    emails_sent: false,
    assignment_status: "not_assigned",
    assigned_to: null,
    assignment_batch: null,
    due_date: null,
    landing_views: 0,
    landing_clicks: 0,
    course_codes: [],
  },
  {
    id: "c7",
    school_name: "Ohio State University",
    slug: "osu",
    state: "OH",
    region: "Midwest",
    is_sec: false,
    archived: false,
    tam_total: 2800,
    tam_confidence: "med",
    tuition_in_state: 12485,
    tuition_out_state: 36722,
    tuition_source: "ipeds",
    total_enrollment: 60540,
    approval_status: "needs_fix",
    ready_for_outreach: false,
    emails_sent: false,
    assignment_status: "blocked",
    assigned_to: "king",
    assignment_batch: "wave-2",
    due_date: "2026-06-12",
    landing_views: 0,
    landing_clicks: 0,
    course_codes: ["ACCTMIS 2200"],
  },
  {
    id: "c8",
    school_name: "Penn State University",
    slug: "penn-state",
    state: "PA",
    region: "Northeast",
    is_sec: false,
    archived: true,
    tam_total: null,
    tam_confidence: null,
    tuition_in_state: 19672,
    tuition_out_state: 38651,
    tuition_source: "ai_estimate",
    total_enrollment: 88914,
    approval_status: "not_reviewed",
    ready_for_outreach: false,
    emails_sent: false,
    assignment_status: "not_assigned",
    assigned_to: null,
    assignment_batch: null,
    due_date: null,
    landing_views: 0,
    landing_clicks: 0,
    course_codes: [],
  },
];

export type CampusFilters = {
  search: string;
  minTuition: number | null;
  maxTuition: number | null;
  campusStatus: CampusStatusFilter;
  assignment: AssignmentFilter;
  assignmentBatch: string;
  state: string;
  secOnly: boolean;
  highTuitionOnly: boolean;
  includeArchived: boolean;
};

export const DEFAULT_CAMPUS_FILTERS: CampusFilters = {
  search: "",
  minTuition: null,
  maxTuition: null,
  campusStatus: "all",
  assignment: "all",
  assignmentBatch: "",
  state: "",
  secOnly: false,
  highTuitionOnly: false,
  includeArchived: false,
};

export function applyFilters(campuses: Campus[], f: CampusFilters): Campus[] {
  const q = f.search.trim().toLowerCase();
  const tuitionOf = (c: Campus) => c.tuition_out_state ?? c.tuition_in_state;
  return campuses.filter((c) => {
    if (!f.includeArchived && c.archived) return false;
    if (q) {
      const hit =
        c.school_name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.course_codes.some((cc) => cc.toLowerCase().includes(q));
      if (!hit) return false;
    }
    switch (f.campusStatus) {
      case "pending":
        if (c.approval_status === "approved") return false;
        break;
      case "approved":
        if (c.approval_status !== "approved") return false;
        break;
      case "ready_for_outreach":
        if (!c.ready_for_outreach) return false;
        break;
      case "emails_sent":
        if (!c.emails_sent) return false;
        break;
    }
    switch (f.assignment) {
      case "assigned":
        if (c.assignment_status === "not_assigned") return false;
        break;
      case "unassigned":
        if (c.assignment_status !== "not_assigned") return false;
        break;
      case "king":
        if ((c.assigned_to ?? "").toLowerCase() !== "king") return false;
        break;
    }
    if (f.assignmentBatch && c.assignment_batch !== f.assignmentBatch) return false;
    if (f.state && c.state !== f.state) return false;
    if (f.secOnly && !c.is_sec) return false;
    const t = tuitionOf(c);
    if (f.highTuitionOnly && (t == null || t < 40000)) return false;
    if (f.minTuition != null && (t == null || t < f.minTuition)) return false;
    if (f.maxTuition != null && (t == null || t > f.maxTuition)) return false;
    return true;
  });
}

export function exportCampusesCsv(campuses: Campus[]): void {
  const headers = [
    "school_name",
    "slug",
    "state",
    "course_codes",
    "approval_status",
    "assignment_status",
    "assigned_to",
    "due_date",
    "tam_total",
    "tuition_out_state",
    "tuition_in_state",
    "tuition_source",
    "ready_for_outreach",
    "emails_sent",
    "is_sec",
  ];
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join("|") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = campuses.map((c) =>
    [
      c.school_name,
      c.slug,
      c.state,
      c.course_codes,
      c.approval_status,
      c.assignment_status,
      c.assigned_to,
      c.due_date,
      c.tam_total,
      c.tuition_out_state,
      c.tuition_in_state,
      c.tuition_source,
      c.ready_for_outreach,
      c.emails_sent,
      c.is_sec,
    ]
      .map(esc)
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campuses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================
// Additions ported from the original app (ProfessorOutreach.tsx)
// so the faithful UI components have everything they need.
// ============================================================

// ----- Date helpers (Manila-anchored work week) -----
export function manilaTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function localDateToISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDaysISO(iso: string, n: number): string {
  const d = isoToLocalDate(iso);
  d.setDate(d.getDate() + n);
  return localDateToISO(d);
}
export function formatPretty(iso: string): { weekday: string; full: string; short: string; dayNum: string } {
  const d = isoToLocalDate(iso);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
    full: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    short: d.toLocaleDateString("en-US", { weekday: "short" }),
    dayNum: String(d.getDate()),
  };
}
export function mondayOfISO(iso: string): string {
  const d = isoToLocalDate(iso);
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(iso, offset);
}

// ----- Mock weekly assignment counts (Tue–Sat get 5 campuses) -----
export function mockWeekCounts(weekDays: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  weekDays.forEach((iso, idx) => {
    if (idx === 0 || idx === 6) return; // Mon = Discord, Sun = off
    counts[iso] = idx === 1 ? 0 : 5;
  });
  return counts;
}

// ----- Mock "due today" campuses (links to the Campuses tab) -----
export function mockCampusesForDate(dateISO: string, all: Campus[]): Campus[] {
  void dateISO;
  return all.filter((c) => (c.assigned_to ?? "").toLowerCase() === "king" && !c.archived).slice(0, 5);
}

// ----- Email templates (in-memory until Supabase is wired) -----
export type TemplateKind = "initial" | "follow_up_1" | "follow_up_2" | "follow_up_3";
export type LeadType = "professors" | "bap_advisors" | "accounting_departments" | "cpa_alumni";
export const LEAD_TYPES: { id: LeadType; label: string; coming_soon: boolean }[] = [
  { id: "professors",            label: "Professors",             coming_soon: false },
  { id: "bap_advisors",         label: "BAP Advisors",           coming_soon: true  },
  { id: "accounting_departments",label: "Accounting Departments", coming_soon: true  },
  { id: "cpa_alumni",           label: "CPA Alumni",             coming_soon: true  },
];
export type TemplateVariant =
  | "default" | "phd" | "intro1_only" | "intro2_only" | "intermediate1_only" | "intermediate2_only";
export interface EmailTemplate {
  id: string;
  lead_type?: string;
  name: string;
  subject: string;
  body: string;
  is_locked: boolean;
  is_active: boolean;
  kind: TemplateKind;
  variant: TemplateVariant;
}
export const TEMPLATE_KIND_META: Record<TemplateKind, { label: string; helper: string }> = {
  initial: { label: "Initial Email", helper: "First touch — sent manually from this tab." },
  follow_up_1: { label: "Follow-up 1 (+7 days)", helper: "Sends automatically 7 days after the initial — only once an Active template exists here." },
  follow_up_2: { label: "Follow-up 2 (+14 days)", helper: "Sends automatically 14 days after the initial — only once an Active template exists here." },
  follow_up_3: { label: "Follow-up 3 (+21 days)", helper: "Sends automatically 21 days after the initial — only once an Active template exists here." },
};
export const TEMPLATE_KIND_ORDER: TemplateKind[] = ["initial", "follow_up_1", "follow_up_2", "follow_up_3"];
export const TEMPLATE_VARIANT_ORDER: TemplateVariant[] = [
  "default", "phd", "intro1_only", "intro2_only", "intermediate1_only", "intermediate2_only",
];
export const TEMPLATE_VARIANT_LABEL: Record<TemplateVariant, string> = {
  default: "Default",
  phd: "If PhD",
  intro1_only: "If only Intro 1 textbook match",
  intro2_only: "If only Intro 2 textbook match",
  intermediate1_only: "If only Intermediate textbook match",
  intermediate2_only: "If only Intermediate 2 textbook match",
};
export const MOCK_TEMPLATES: EmailTemplate[] = [
  {
    id: "t1",
    name: "Initial Email — Default",
    kind: "initial",
    variant: "default",
    is_active: true,
    is_locked: true,
    subject: "Tutor recommendation for accounting students",
    body: `Hi [First Name],

I provide virtual tutoring and exam-prep support for Introductory and Intermediate Accounting students.

If a student ever asks you for a tutor recommendation this summer, I'd appreciate you sharing my booking page:

[SurviveAccounting.com]

Thanks,
Lee Ingram`,
  },
];
