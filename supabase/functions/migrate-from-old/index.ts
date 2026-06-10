// migrate-from-old — copies starting data from the OLD Survive Accounting
// Supabase project into THIS project's database.
//
// Designed for Lovable Cloud: this project's service-role key is auto-injected
// into the Edge Function environment (SUPABASE_SERVICE_ROLE_KEY), and the old
// project is read by signing in as Lee's old admin user (password auth).
//
// Secrets to set in Lovable (Project → Secrets):
//   OLD_ADMIN_EMAIL     — Lee's old-app admin email
//   OLD_ADMIN_PASSWORD  — Lee's old-app admin password
//   MIGRATION_SECRET    — any random string; required in the x-migration-secret header
//
// Invoke (repeat-safe; upserts):
//   POST {functions-url}/migrate-from-old
//   headers: { "x-migration-secret": "<MIGRATION_SECRET>", "Content-Type": "application/json" }
//   body: { "tables": ["campuses", ...] }   // optional — defaults to all
//         { "skipStorage": true }            // optional

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OLD_URL = "https://hdylxvyvateaephkbccy.supabase.co";
const OLD_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkeWx4dnl2YXRlYWVwaGtiY2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MjUzMzQsImV4cCI6MjA4NjUwMTMzNH0.P6wV2vCv5GWdKushDuxs4QgzzzRnEXKf-_yAKB0WRUA";

const TEACHING_ASSET_COLUMNS = [
  "id","chapter_id","course_id","topic_id","asset_name","problem_title","problem_type",
  "asset_type","difficulty","tags","concept_notes","core_rank","source_ref","source_number",
  "source_type","instruction_1","instruction_2","instruction_3","instruction_4","instruction_5",
  "instruction_list","problem_context","survive_problem_text","survive_solution_text",
  "survive_solution_explanation_cache","survive_solution_json","worked_steps","exam_traps",
  "important_formulas","journal_entry_block","journal_entry_template_json",
  "journal_entry_completed_json","supplementary_je_json","t_accounts_json","tables_json",
  "financial_statements_json","uses_t_accounts","uses_tables","uses_financial_statements",
  "asset_approved_at","admin_notes","created_at","updated_at",
];

const TABLES: { name: string; columns?: string[]; conflict?: string }[] = [
  { name: "va_accounts" },
  { name: "courses" },
  { name: "campuses" },
  { name: "campus_courses" },
  { name: "outreach_schools" },
  { name: "campus_landing_pages" },
  { name: "outreach_leads" },
  { name: "outreach_email_templates" },
  { name: "outreach_email_events" },
  { name: "outreach_send_log" },
  { name: "outreach_va_campus_assignments" },
  { name: "outreach_saved_views" },
  { name: "outreach_student_leads" },
  { name: "outreach_waitlist_signups" },
  { name: "campus_tam_estimates" },
  { name: "campus_intelligence" },
  { name: "textbooks" },
  { name: "course_textbooks" },
  { name: "chapters" },
  { name: "chapter_topics" },
  { name: "teaching_assets", columns: TEACHING_ASSET_COLUMNS },
  { name: "chapter_je_categories" },
  { name: "chapter_formulas" },
  { name: "chapter_journal_entries" },
  { name: "chapter_accounts" },
  { name: "chapter_key_terms" },
  { name: "chapter_exam_mistakes" },
  { name: "chapter_purpose" },
  { name: "banked_questions" },
  { name: "flashcard_decks" },
  { name: "flashcards" },
  { name: "formula_sets" },
  { name: "formula_items" },
  { name: "entry_builder_sets" },
  { name: "entry_builder_items" },
  { name: "entry_builder_accounts" },
  { name: "dissector_problems" },
  { name: "chart_of_accounts" },
  { name: "company_names" },
  { name: "account_aliases" },
  { name: "ceq_tutoring_notes" },
  { name: "ceq_teaching_blocks" },
  { name: "ceqs" },
  { name: "teaching_asset_ceq_flags", conflict: "teaching_asset_id" },
  { name: "teaching_asset_ceq_part_focus" },
  { name: "contact_messages" },
  { name: "newsletter_subscribers" },
  { name: "landing_page_leads" },
  { name: "session_prep_submissions" },
  { name: "student_emails" },
];

const PAGE = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migration-secret",
      },
    });
  }

  const secret = Deno.env.get("MIGRATION_SECRET");
  if (!secret || req.headers.get("x-migration-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const email = Deno.env.get("OLD_ADMIN_EMAIL");
  const password = Deno.env.get("OLD_ADMIN_PASSWORD");
  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Set OLD_ADMIN_EMAIL and OLD_ADMIN_PASSWORD secrets" }), { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const only: string[] | null = Array.isArray(body?.tables) ? body.tables : null;
  const skipStorage = !!body?.skipStorage;

  // Old project: authenticate as Lee's admin user so authenticated-RLS tables are readable.
  const oldDb = createClient(OLD_URL, OLD_ANON_KEY);
  const { error: authErr } = await oldDb.auth.signInWithPassword({ email, password });
  if (authErr) {
    return new Response(JSON.stringify({ error: `Old-project sign-in failed: ${authErr.message}` }), { status: 500 });
  }

  // This project: service role (auto-injected by Lovable Cloud).
  const newDb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const report: Record<string, string> = {};

  for (const t of TABLES) {
    if (only && !only.includes(t.name)) continue;
    const select = t.columns ? t.columns.join(",") : "*";
    let from = 0, total = 0, failed = 0, readError: string | null = null;
    for (;;) {
      const { data, error } = await oldDb.from(t.name).select(select).range(from, from + PAGE - 1);
      if (error) { readError = error.message; break; }
      if (!data?.length) break;
      const { error: werr } = await newDb.from(t.name).upsert(data, { onConflict: t.conflict ?? "id" });
      if (werr) {
        for (const row of data) {
          const { error: e2 } = await newDb.from(t.name).upsert(row, { onConflict: t.conflict ?? "id" });
          if (e2) failed++;
          else total++;
        }
      } else total += data.length;
      from += PAGE;
      if (data.length < PAGE) break;
    }
    report[t.name] = readError
      ? `read error: ${readError}`
      : `${total} rows${failed ? `, ${failed} failed` : ""}`;
  }

  if (!skipStorage && (!only || only.includes("storage"))) {
    let copied = 0, failed = 0;
    const bucket = "ceq-tutoring-notes";
    const walk = async (prefix = "") => {
      const { data, error } = await oldDb.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error) { report[`storage:${bucket}`] = `list error: ${error.message}`; return; }
      for (const item of data ?? []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) { await walk(path); continue; }
        const { data: blob, error: derr } = await oldDb.storage.from(bucket).download(path);
        if (derr) { failed++; continue; }
        const { error: uerr } = await newDb.storage.from(bucket).upload(path, blob!, { upsert: true });
        if (uerr) failed++; else copied++;
      }
    };
    await walk();
    report[`storage:${bucket}`] ??= `${copied} files${failed ? `, ${failed} failed` : ""}`;
  }

  return new Response(JSON.stringify({ ok: true, report }, null, 2), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
