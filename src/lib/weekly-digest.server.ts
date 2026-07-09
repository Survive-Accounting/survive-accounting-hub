// Weekly digest email. SERVER-ONLY (uses the service-role Supabase client +
// Resend). Import DYNAMICALLY inside a server handler — never at the top of a
// route file or *.functions.ts.
//
// Covers a rolling 7-day window and emails a small summary table (no charts) to
// lee@surviveaccounting.com every Sunday at 08:00 CT (scheduling handled by the
// cron route). Sections: orders, reddit mentions engaged, greek orgs enriched,
// new firms, professor sends + replies, suppression events.

const DIGEST_TO = process.env.DIGEST_RECIPIENT || "lee@surviveaccounting.com";
const WINDOW_DAYS = 7;

export interface DigestSection {
  label: string;
  count: number;
  details: string;
}

export interface DigestData {
  windowStart: string; // ISO
  windowEnd: string; // ISO
  rangeLabel: string; // human "Jul 2 – Jul 9"
  sections: DigestSection[];
}

export interface DigestResult {
  ok: boolean;
  sent: boolean;
  skipped?: string;
  emailId?: string;
  error?: string;
  data?: DigestData;
}

type AnyRow = Record<string, unknown>;

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

function truncList(items: string[], max = 12): string {
  if (items.length === 0) return "—";
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return shown.join(", ") + (extra > 0 ? `, +${extra} more` : "");
}

// ── data gathering ───────────────────────────────────────────────────────────

export async function gatherDigest(now: Date = new Date()): Promise<DigestData> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Loose client: several of these tables post-date the generated Database types.
  const sb = supabaseAdmin as unknown as {
    from: (t: string) => any;
  };

  const start = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const sections: DigestSection[] = [];

  // 1) Orders this week — count + shortRefs.
  {
    const { data } = await sb
      .from("orders")
      .select("short_ref,status,created_at")
      .gte("created_at", startIso)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as AnyRow[];
    sections.push({
      label: "Orders",
      count: rows.length,
      details: truncList(rows.map((r) => String(r.short_ref ?? "?"))),
    });
  }

  // 2) Reddit mentions engaged — found this week AND acted on
  //    (status advanced past open/new, starred, or a DM sent).
  {
    const { data } = await sb
      .from("reddit_mentions")
      .select("subreddit,title,status,starred,sent_via,found_at")
      .gte("found_at", startIso);
    const rows = (data ?? []) as AnyRow[];
    const engaged = rows.filter((r) => {
      const status = String(r.status ?? "").toLowerCase();
      const sentVia = Array.isArray(r.sent_via) ? r.sent_via : [];
      return (
        r.starred === true ||
        sentVia.length > 0 ||
        (status !== "" && !["open", "new", "dismissed", "skipped", "ignored"].includes(status))
      );
    });
    const labels = engaged.map((r) => (r.subreddit ? `r/${r.subreddit}` : String(r.title ?? "mention")));
    const details =
      engaged.length > 0
        ? `${truncList(labels)}${rows.length > engaged.length ? ` · ${rows.length} new found` : ""}`
        : rows.length > 0
          ? `${rows.length} new found, none engaged`
          : "—";
    sections.push({ label: "Reddit mentions engaged", count: engaged.length, details });
  }

  // 3) Greek orgs enriched this week — enrichment_status advanced past pending.
  {
    const { data } = await sb
      .from("greek_orgs")
      .select("name,letters,enrichment_status,updated_at")
      .neq("enrichment_status", "pending")
      .gte("updated_at", startIso);
    const rows = (data ?? []) as AnyRow[];
    sections.push({
      label: "Greek orgs enriched",
      count: rows.length,
      details: truncList(rows.map((r) => String(r.letters || r.name || "?"))),
    });
  }

  // 4) New firms in the Firms tab — greek_firm_leads created this week.
  {
    const { data } = await sb
      .from("greek_firm_leads")
      .select("firm_name,category,created_at")
      .gte("created_at", startIso)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as AnyRow[];
    sections.push({
      label: "New firms (Firms tab)",
      count: rows.length,
      details: truncList(rows.map((r) => String(r.firm_name ?? "?"))),
    });
  }

  // 5) Professor emails sent this week.
  {
    const { data } = await sb.from("profintel_sends").select("to_name,school,sent_at").gte("sent_at", startIso);
    const rows = (data ?? []) as AnyRow[];
    sections.push({
      label: "Professor emails sent",
      count: rows.length,
      details: rows.length ? truncList(Array.from(new Set(rows.map((r) => String(r.school ?? "?")))), 8) : "—",
    });
  }

  // 6) Professor replies this week.
  {
    const { data } = await sb
      .from("profintel_sends")
      .select("to_name,school,replied_at")
      .not("replied_at", "is", null)
      .gte("replied_at", startIso);
    const rows = (data ?? []) as AnyRow[];
    sections.push({
      label: "Professor replies",
      count: rows.length,
      details: truncList(rows.map((r) => String(r.to_name || r.school || "?"))),
    });
  }

  // 7) Suppression events — bounce/complaint/unsubscribe webhook events + send errors.
  {
    const { data: events } = await sb
      .from("outreach_email_events")
      .select("event_type,created_at")
      .gte("created_at", startIso);
    const evRows = (events ?? []) as AnyRow[];
    const suppress = evRows.filter((r) => /bounce|complain|suppress|unsubscrib|spam/i.test(String(r.event_type ?? "")));

    const { data: errs } = await sb
      .from("profintel_sends")
      .select("to_email,send_error,updated_at")
      .not("send_error", "is", null)
      .gte("updated_at", startIso);
    const errRows = (errs ?? []) as AnyRow[];

    const total = suppress.length + errRows.length;
    const types = Array.from(new Set(suppress.map((r) => String(r.event_type ?? "event"))));
    const detail =
      total === 0
        ? "—"
        : [
            types.length ? truncList(types, 6) : null,
            errRows.length ? `${errRows.length} send error${errRows.length === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join("; ");
    sections.push({ label: "Suppression events", count: total, details: detail });
  }

  return {
    windowStart: startIso,
    windowEnd: now.toISOString(),
    rangeLabel: `${fmtDay(start)} – ${fmtDay(now)}`,
    sections,
  };
}

// ── rendering ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDigestHtml(d: DigestData): string {
  const rows = d.sections
    .map((s, i) => {
      const bg = i % 2 ? "#f7f7f8" : "#ffffff";
      const strong = s.count > 0 ? "font-weight:600;" : "color:#888;";
      return `<tr style="background:${bg};">
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(s.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;${strong}">${s.count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;font-size:13px;">${esc(s.details)}</td>
      </tr>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;">
    <h2 style="margin:0 0 2px;font-size:18px;">Weekly digest</h2>
    <p style="margin:0 0 16px;color:#666;font-size:13px;">${esc(d.rangeLabel)} · Survive Accounting</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;font-size:14px;">
      <thead>
        <tr style="background:#0b1f3a;color:#fff;">
          <th style="padding:9px 12px;text-align:left;font-weight:600;">Section</th>
          <th style="padding:9px 12px;text-align:right;font-weight:600;">Count</th>
          <th style="padding:9px 12px;text-align:left;font-weight:600;">Details</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:16px 0 0;color:#999;font-size:12px;">Rolling 7-day window. Sent Sundays 8am CT.</p>
  </div>`;
}

export function renderDigestText(d: DigestData): string {
  const lines = d.sections.map((s) => `- ${s.label}: ${s.count}${s.details && s.details !== "—" ? `  (${s.details})` : ""}`);
  return `Weekly digest — ${d.rangeLabel}\n\n${lines.join("\n")}\n\nRolling 7-day window. Sent Sundays 8am CT.`;
}

// ── send ─────────────────────────────────────────────────────────────────────

export async function sendWeeklyDigest(opts: { now?: Date; dryRun?: boolean } = {}): Promise<DigestResult> {
  const now = opts.now ?? new Date();
  const data = await gatherDigest(now);
  if (opts.dryRun) return { ok: true, sent: false, skipped: "dryRun", data };

  const { sendResendEmail } = await import("@/lib/email.server");
  const res = await sendResendEmail({
    to: DIGEST_TO,
    subject: `Weekly digest — ${data.rangeLabel}`,
    text: renderDigestText(data),
    html: renderDigestHtml(data),
  });
  return { ok: res.ok, sent: res.ok, emailId: res.id, error: res.error, data };
}
