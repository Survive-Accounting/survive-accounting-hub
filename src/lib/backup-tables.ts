// Backup table manifest — the single source of truth for WHAT the nightly job dumps.
//
// This is plain, client-safe data (no secrets). Edit the arrays below to add or
// remove tables from a nightly group. Every name here MUST be a real public
// table — the job validates existence at start and fails loud if one is missing
// (so a typo is caught immediately, not silently skipped).
//
// ── Requested → resolved ────────────────────────────────────────────────────
// The original spec used a few logical names that are NOT real tables. Mapping:
//   active_roster ............ not a table. It's a flag column on `campuses`
//                              plus a filtered view of `campus_lead_suggestions`.
//                              Covered by: campuses + campus_lead_suggestions.
//   professors ............... not a table. Professor data lives across
//                              campus_lead_suggestions (roster + scoring),
//                              rmp_ratings (ratings), hasselback_faculty (source),
//                              faculty_moves (mobility graph). All included.
//   greek_org_contractors .... not a table → using greek_firm_leads (nearest).
//   parent_group_mentions .... not a table (feature not built) → OMITTED.
//   email_link_hits .......... not a table → using outreach_email_events.
//   outreach suppressions .... no dedicated table → outreach_settings holds them
//                              (plus lead status on outreach_leads).
//   order feedback ........... no `order_feedback` table → using preview_feedback.
//                              (Confirm this is the intended feedback source.)
//   account/entitlement ...... no entitlements table exists yet → included the
//                              account rows that DO exist: va_accounts,
//                              account_aliases, student_emails.
// Satellites added so a restore is complete (backing up `orders` without its
// line items / stage log would be a lossy backup): order_chapters,
// order_stage_events, sms_messages, greek_chapter_contacts, faculty_moves.

export type BackupGroup = "content" | "intel" | "commerce";

export interface GroupSpec {
  group: BackupGroup;
  label: string;
  /** One-line human description shown in the admin view. */
  description: string;
  tables: string[];
}

export const BACKUP_GROUP_ORDER: BackupGroup[] = ["content", "intel", "commerce"];

export const BACKUP_GROUPS: Record<BackupGroup, GroupSpec> = {
  content: {
    group: "content",
    label: "Content",
    description: "The platform's brain — courses, chapters, JE scenarios, teaching assets.",
    tables: ["courses", "chapters", "je_scenarios", "teaching_assets"],
  },
  intel: {
    group: "intel",
    label: "Intel",
    description: "Campus + funnel treasure trove — roster, professors, Greek, outreach.",
    tables: [
      "campuses",
      "campus_lead_suggestions", // active-roster + professor scoring source
      "rmp_ratings", // professor ratings
      "hasselback_faculty", // professor source records
      "faculty_moves", // ProfIntel career-mobility graph
      "greek_orgs",
      "greek_org_filings",
      "greek_org_people",
      "greek_firm_leads", // requested "greek_org_contractors"
      "greek_chapter_contacts",
      "vendor_lists",
      "campus_context",
      "parent_groups",
      "reddit_mentions",
      "outreach_email_events", // requested "email_link_hits"
      "outreach_leads", // outreach queue
      "outreach_send_log",
      "outreach_settings", // suppression config lives here
    ],
  },
  commerce: {
    group: "commerce",
    label: "Commerce",
    description: "Highest-sensitivity student-facing data — orders, SMS, accounts.",
    tables: [
      "orders",
      "order_chapters",
      "order_stage_events",
      "sms_conversations",
      "sms_messages",
      "preview_feedback", // requested "order feedback"
      "va_accounts",
      "account_aliases",
      "student_emails",
    ],
  },
};

/** Flat, de-duplicated list of every table the job touches. */
export const ALL_BACKUP_TABLES: string[] = Array.from(
  new Set(BACKUP_GROUP_ORDER.flatMap((g) => BACKUP_GROUPS[g].tables)),
);

/** For transparency in the admin view / docs: requested names that aren't real tables. */
export const UNRESOLVED_REQUESTS: { requested: string; resolution: string }[] = [
  { requested: "active_roster", resolution: "column on campuses + filtered campus_lead_suggestions (both backed up)" },
  { requested: "professors", resolution: "campus_lead_suggestions + rmp_ratings + hasselback_faculty + faculty_moves" },
  { requested: "greek_org_contractors", resolution: "greek_firm_leads (nearest real table)" },
  { requested: "parent_group_mentions", resolution: "no such table (feature not built) — omitted" },
  { requested: "email_link_hits", resolution: "outreach_email_events" },
  { requested: "outreach suppressions", resolution: "outreach_settings (+ lead status on outreach_leads)" },
  { requested: "order feedback", resolution: "preview_feedback (confirm intended source)" },
  { requested: "account/entitlement", resolution: "va_accounts + account_aliases + student_emails (no entitlements table yet)" },
];

export const RETENTION = {
  dailyKeep: 30, // keep the last 30 daily snapshots
  monthlyKeep: 12, // keep 12 promoted monthly snapshots
  annualKeep: Infinity, // annual snapshots kept forever
} as const;

export const BACKUP_BUCKET_DEFAULT = "surviveaccounting-backups";
export const BACKUP_ROOT = "backups"; // top-level prefix in the bucket
