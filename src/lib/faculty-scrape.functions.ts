// Per-campus faculty page scraper.
// Strategy: deterministic HTTP fetch (no JS rendering) -> strip to text ->
// single narrow LLM extraction per page that is told NOT to invent rows.
// Results land in campus_lead_suggestions with research_mode='faculty_scrape'
// and status='pending_triage' for human review.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  campusId: z.string().uuid(),
  urls: z.array(z.string().url()).min(1).max(10),
});

type Extracted = {
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  profile_url: string | null;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function callLovableAi(apiKey: string, sourceUrl: string, pageText: string): Promise<Extracted[]> {
  const truncated = pageText.length > 50000 ? pageText.slice(0, 50000) : pageText;
  const system =
    "You extract faculty/instructor/lecturer/adjunct directory entries from accounting department web pages. " +
    "RULES: " +
    "1. ONLY emit a person if their full name appears verbatim in the provided text. " +
    "2. NEVER invent or pattern-guess an email. If no email appears in the text for that person, set email to null. " +
    "3. Capture every teaching role: Professor, Associate/Assistant Professor, Instructor, Lecturer, Adjunct, Clinical, Teaching Professor, Professor of Practice, Visiting. " +
    "4. Exclude clearly non-accounting faculty (finance, economics, marketing, IS, etc.) unless the page explicitly lists them under accounting. " +
    "5. Exclude purely administrative staff with no teaching title (e.g. Department Coordinator, Office Manager) unless their title contains an instructional keyword. " +
    "6. Return strict JSON with shape { people: [{ first_name, last_name, title, email, profile_url }] }. " +
    "7. profile_url should be an absolute URL when the source links to a personal profile page; otherwise null.";

  const user = `Source URL: ${sourceUrl}\n\nPage text:\n${truncated}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`AI returned non-JSON: ${content.slice(0, 200)}`);
  }
  const people = (parsed as { people?: unknown }).people;
  if (!Array.isArray(people)) return [];

  const out: Extracted[] = [];
  for (const p of people) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const fn = typeof r.first_name === "string" ? r.first_name.trim() : "";
    const ln = typeof r.last_name === "string" ? r.last_name.trim() : "";
    if (!fn && !ln) continue;
    out.push({
      first_name: fn,
      last_name: ln,
      title: typeof r.title === "string" ? r.title.trim() || null : null,
      email: typeof r.email === "string" && r.email.includes("@") ? r.email.trim().toLowerCase() : null,
      profile_url: typeof r.profile_url === "string" && /^https?:\/\//i.test(r.profile_url) ? r.profile_url.trim() : null,
    });
  }
  return out;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SurviveAccounting-FacultyBot/1.0; +https://surviveaccounting.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return await res.text();
}

export const scrapeCampusFaculty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY is not configured on the server");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const perPage: Array<{ url: string; found: number; error: string | null }> = [];
    const rowsToInsert: Array<Record<string, unknown>> = [];

    for (const url of data.urls) {
      try {
        const html = await fetchPage(url);
        const text = stripHtml(html);
        const people = await callLovableAi(apiKey, url, text);
        perPage.push({ url, found: people.length, error: null });
        for (const p of people) {
          if (!p.email && !p.profile_url) continue; // require a real anchor
          rowsToInsert.push({
            campus_id: data.campusId,
            first_name: p.first_name,
            last_name: p.last_name,
            title: p.title,
            email: p.email,
            source_url: p.profile_url ?? url,
            research_mode: "faculty_scrape",
            research_label: "faculty_scrape_v1",
            status: "pending_triage",
            lead_type: "professors",
            notes: `Scraped from ${url}`,
            raw_payload: { source_page: url, title: p.title, profile_url: p.profile_url },
          });
        }
      } catch (e) {
        perPage.push({ url, found: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }

    let inserted = 0;
    let skippedDuplicates = 0;
    if (rowsToInsert.length > 0) {
      // De-dupe within this run by email or (name+source_url)
      const seen = new Set<string>();
      const unique = rowsToInsert.filter((r) => {
        const key = (r.email as string | null) ?? `${r.first_name}|${r.last_name}|${r.source_url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Skip rows whose email already exists for this campus
      const emails = unique.map((r) => r.email).filter((e): e is string => !!e);
      let existingEmails = new Set<string>();
      if (emails.length > 0) {
        const { data: existing } = await supabaseAdmin
          .from("campus_lead_suggestions")
          .select("email")
          .eq("campus_id", data.campusId)
          .in("email", emails);
        existingEmails = new Set((existing ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e));
      }
      const toInsert = unique.filter((r) => {
        const e = r.email as string | null;
        if (e && existingEmails.has(e)) {
          skippedDuplicates++;
          return false;
        }
        return true;
      });

      if (toInsert.length > 0) {
        const { error } = await supabaseAdmin.from("campus_lead_suggestions").insert(toInsert as never);
        if (error) throw new Error(`insert failed: ${error.message}`);
        inserted = toInsert.length;
      }
    }

    // Remember the URLs used so the next run is one-click
    await supabaseAdmin
      .from("campuses")
      .update({ faculty_page_url: data.urls.join("\n") })
      .eq("id", data.campusId);

    return {
      ok: true,
      perPage,
      inserted,
      skippedDuplicates,
    };
  });
