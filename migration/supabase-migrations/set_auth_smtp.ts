// Point Supabase AUTH EMAIL (magic links) at Resend so they come from Lee on the Survive
// Accounting domain instead of Supabase's default sender (spec §2). This is PROJECT CONFIG, not
// SQL — it goes through the Management API with the same PAT run_sql.ts uses.
//
//   bun run migration/supabase-migrations/set_auth_smtp.ts            # dry run: prints the payload
//   bun run migration/supabase-migrations/set_auth_smtp.ts --apply    # applies
//
// NEEDS in .env: SUPABASE_PROJECT_ID, SUPABASE_ACCESS_TOKEN (PAT), RESEND_API_KEY.
// SENDER: lee@mail.surviveaccounting.com is the Resend-verified domain today. To send from
// lee@surviveaccounting.com (root) first verify the root domain in Resend, then pass
// --from=lee@surviveaccounting.com. Reply-To is set so replies land in Lee's inbox either way.
const APPLY = process.argv.includes("--apply");
const fromArg = process.argv.find((a) => a.startsWith("--from="))?.slice(7);
const PROJECT = process.env.SUPABASE_PROJECT_ID;
const PAT = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASETOKEN || process.env.SUPABASE_TOKEN_1;
const RESEND = process.env.RESEND_API_KEY;
if (!PROJECT || !PAT || !RESEND) { console.error("Missing SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN / RESEND_API_KEY in .env"); process.exit(1); }

const payload = {
  smtp_admin_email: fromArg ?? "lee@mail.surviveaccounting.com",
  smtp_sender_name: "Lee Ingram",
  smtp_host: "smtp.resend.com",
  // 587 = STARTTLS. Port 465 (implicit TLS) makes GoTrue's SMTP client fail with a
  // generic "Error sending confirmation email" 500 even though the Resend key is
  // valid (verified 2026-08-24: 465 → 500, 587 → 200). Keep this on 587.
  smtp_port: "587",
  smtp_user: "resend",
  smtp_pass: RESEND,
  smtp_max_frequency: 1, // seconds between emails to the same address (Supabase default is 60 with the built-in mailer)
  rate_limit_email_sent: 30, // per hour; the built-in default of 2 throttled admin sign-ins
  mailer_subjects_magic_link: "Your sign-in link — Survive Accounting",
};
console.log("PATCH /v1/projects/%s/config/auth", PROJECT);
console.log(JSON.stringify({ ...payload, smtp_pass: "<RESEND_API_KEY>" }, null, 2));
if (!APPLY) { console.log("\nDry run. Re-run with --apply to execute."); process.exit(0); }

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const text = await res.text();
if (!res.ok) { console.error("FAILED", res.status, text.slice(0, 400)); process.exit(1); }
console.log("OK — magic links now send via Resend as", payload.smtp_admin_email);
console.log("Next: Supabase dashboard → Auth → Email Templates → Magic Link: replace the default body with plain first-person copy (see CHANGES.md).");
