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
