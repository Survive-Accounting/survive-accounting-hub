// Campus Backfill — Greek council contact discovery.
// Finds PUBLIC council contacts (IFC / Panhellenic / NPHC / MGC): role inboxes
// first, then current officers with published emails, then FSL staff advisors as
// a fallback. Reuses SerpAPI + Firecrawl + AI. Writes campus_council_contacts +
// campus_council_status. NEVER invents an email — every stored email must appear
// verbatim in the fetched public page (AI output is intersected with a regex
// scan of the page). Does NOT send any outreach.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { classifyCouncilContact } from "@/lib/campus-classify";
import { cached, SERP_TTL_HOURS, FIRECRAWL_TTL_HOURS } from "@/lib/scrape-cache";

const SERP_BASE = "https://serpapi.com/search.json";
const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

const COUNCILS: Array<{ key: string; names: string[]; abbr: string }> = [
  { key: "ifc", names: ["Interfraternity Council"], abbr: "IFC" },
  { key: "panhellenic", names: ["Panhellenic Council", "Panhellenic Association", "College Panhellenic"], abbr: "Panhellenic" },
  { key: "nphc", names: ["National Pan-Hellenic Council"], abbr: "NPHC" },
  { key: "mgc", names: ["Multicultural Greek Council"], abbr: "MGC" },
];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const IG_RE = /(?:instagram\.com|instagr\.am)\/([a-z0-9._]+)/gi;

async function serp(key: string, q: string, num = 6): Promise<Array<{ title: string; link: string }>> {
  return cached("serp", `council|${num}|${q}`, SERP_TTL_HOURS, async () => {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(`${SERP_BASE}?engine=google&num=${num}&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
      if (!r.ok) return [];
      const j = (await r.json()) as { organic_results?: Array<{ title?: string; link?: string }> };
      return (j.organic_results ?? []).filter((x) => x.link).map((x) => ({ title: x.title ?? "", link: x.link as string }));
    } catch { return []; } finally { clearTimeout(timer); }
  });
}
async function firecrawl(key: string, url: string): Promise<string | null> {
  return cached("firecrawl", url, FIRECRAWL_TTL_HOURS, async () => {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", { method: "POST", signal: ctrl.signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2000 }) });
      if (!r.ok) return null;
      const j = (await r.json()) as { data?: { markdown?: string } };
      return j.data?.markdown ?? null;
    } catch { return null; } finally { clearTimeout(timer); }
  });
}
async function aiClassify(aiKey: string, text: string, emails: string[]): Promise<Array<{ council: string; contact_type: string; name?: string; role?: string; email?: string; instagram?: string }>> {
  const prompt = `From this public Fraternity & Sorority Life / Greek council page, extract council CONTACTS. Councils: IFC (Interfraternity), Panhellenic, NPHC (National Pan-Hellenic), MGC (Multicultural Greek). Return ONLY JSON array:
[{"council":"ifc|panhellenic|nphc|mgc","contact_type":"role_inbox|student_officer|staff_advisor","name":"","role":"","email":"","instagram":""}]
RULES: email MUST be one of these exact addresses found on the page: ${emails.join(", ") || "(none)"}. Never output an email not in that list. role_inbox = a general council email not tied to a person (e.g. ifc@school.edu). staff_advisor = FSL office staff/advisor. student_officer = a named student officer with a published email. Omit contacts with no email. Page:\n\n${text.slice(0, 22000)}`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(AI_URL, { method: "POST", signal: ctrl.signal, headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
    if (!r.ok) return [];
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const m = (j.choices?.[0]?.message?.content ?? "").match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch { return []; } finally { clearTimeout(timer); }
}
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const firstDomain = (d: unknown) => Array.isArray(d) ? String(d[0] ?? "") : String(d ?? "").replace(/[{}"]/g, "").split(",")[0].trim().toLowerCase();

export const discoverCouncilContacts = createServerFn({ method: "POST" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const serpKey = process.env.SERPAPI_API_KEY, fcKey = process.env.FIRECRAWL_API_KEY, aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!serpKey || !fcKey || !aiKey) throw new Error("SERPAPI/FIRECRAWL/AI_GATEWAY keys not configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campus } = await (supabaseAdmin.from("campuses") as any).select("id,name,domains,email_domain,website_url").eq("id", data.campusId).maybeSingle();
    if (!campus) throw new Error("Campus not found");
    const name = (campus.name as string) ?? "";
    const domain = firstDomain(campus.domains) || (campus.email_domain as string) || hostOf(campus.website_url || "");

    // Which councils to target: the 3 primary + MGC if evidenced on chapters.
    const { data: chRows } = await (supabaseAdmin.from("campus_greek_chapters") as any).select("council").eq("campus_id", data.campusId).limit(2000);
    const councilVals = new Set(((chRows ?? []) as Array<{ council: string | null }>).map((c) => (c.council || "").toLowerCase()));
    const wanted = COUNCILS.filter((c) => ["ifc", "panhellenic", "nphc"].includes(c.key) || councilVals.has(c.key) || councilVals.has(c.abbr.toLowerCase()));

    const markStatus = async (council: string, patch: Record<string, unknown>) => {
      await (supabaseAdmin.from("campus_council_status") as any).upsert({ campus_id: data.campusId, council_type: council, updated_at: new Date().toISOString(), ...patch }, { onConflict: "campus_id,council_type" });
    };

    // Gather candidate pages: the campus FSL page + a per-council page. Dedupe.
    const pages = new Map<string, string>(); // url -> council hint (or "fsl")
    const fslHits = await serp(serpKey, domain ? `site:${domain} fraternity sorority life council contact` : `${name} fraternity and sorority life contact`, 6);
    for (const h of fslHits.slice(0, 2)) if (hostOf(h.link).endsWith(domain || "edu")) pages.set(h.link, "fsl");
    for (const c of wanted) {
      const hits = await serp(serpKey, domain ? `site:${domain} "${c.names[0]}" contact email` : `${name} "${c.names[0]}" contact`, 5);
      const hit = hits.find((h) => domain ? hostOf(h.link).endsWith(domain) : true);
      if (hit && !pages.has(hit.link)) pages.set(hit.link, c.key);
      await markStatus(c.key, { status: "running", last_attempted_at: new Date().toISOString() });
    }

    // Fetch pages, collect verbatim emails, AI-classify (intersected with real emails).
    const contacts: Array<{ council: string; contact_type: string; name: string | null; role: string | null; email: string; instagram: string | null; source_url: string; source_type: string }> = [];
    for (const [url, hint] of [...pages].slice(0, 5)) {
      const md = await firecrawl(fcKey, url);
      if (!md) continue;
      const realEmails = new Set(Array.from(md.matchAll(EMAIL_RE)).map((m) => m[0].toLowerCase().replace(/\.$/, "")).filter((e) => !/\.(png|jpg|gif|svg|webp)$/i.test(e)));
      const igByLine = Array.from(md.matchAll(IG_RE)).map((m) => `https://instagram.com/${m[1]}`);
      if (realEmails.size === 0) continue;
      const ai = await aiClassify(aiKey, md, [...realEmails]);
      const sourceType = hint === "fsl" ? "official_fsl" : "official_council";
      for (const c of ai) {
        const email = (c.email || "").toLowerCase().trim().replace(/^mailto:/, "");
        if (!email || !realEmails.has(email)) continue; // hallucination guard: must be verbatim
        const council = ["ifc", "panhellenic", "nphc", "mgc"].includes((c.council || "").toLowerCase()) ? c.council.toLowerCase() : (hint === "fsl" ? "other" : hint);
        // Classify by local-part evidence (shared helper). Role inboxes (ifc@,
        // panhellenic@, greeklife@, fsl@ …) win even when an officer name is
        // attached — the durable inbox is the best outreach target.
        const ctype = classifyCouncilContact(email, { name: c.name, role: c.role, aiType: c.contact_type });
        contacts.push({ council, contact_type: ctype, name: c.name || null, role: c.role || null, email, instagram: c.instagram || igByLine[0] || null, source_url: url, source_type: sourceType });
      }
    }

    // Dedupe + upsert (email is the identity; re-seen email = more provenance, not a new row).
    const seen = new Set<string>();
    let inserted = 0; const perCouncil: Record<string, { contacts: number; roleInbox: boolean }> = {};
    for (const c of contacts) {
      const key = `${c.council}|${c.email}`;
      if (seen.has(key)) continue; seen.add(key);
      const conf = c.source_type === "official_fsl" || c.source_type === "official_council" ? "high" : "medium";
      const { error } = await (supabaseAdmin.from("campus_council_contacts") as any).upsert({
        campus_id: data.campusId, council_type: c.council, contact_type: c.contact_type, name: c.name, role: c.role,
        email: c.email, instagram_url: c.instagram, source_url: c.source_url, source_type: c.source_type,
        confidence: conf, is_current: true, retrieved_at: new Date().toISOString(),
      }, { onConflict: "campus_id,council_type,email", ignoreDuplicates: false });
      if (!error) {
        inserted++;
        const p = perCouncil[c.council] ??= { contacts: 0, roleInbox: false };
        p.contacts++; if (c.contact_type === "role_inbox") p.roleInbox = true;
      }
    }
    // Finalize per-council status.
    for (const c of wanted) {
      const p = perCouncil[c.key];
      await markStatus(c.key, { status: p ? "complete" : "no_result", last_success_at: p ? new Date().toISOString() : null, contacts_found: p?.contacts ?? 0, role_inbox_found: p?.roleInbox ?? false, error: null });
    }
    return { ok: true, councils: wanted.map((w) => w.key), pagesFetched: pages.size, contactsInserted: inserted, perCouncil };
  });

export const getCampusCouncilContacts = createServerFn({ method: "GET" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: contacts } = await (supabaseAdmin.from("campus_council_contacts") as any)
      .select("id,council_type,contact_type,name,role,email,instagram_url,source_url,source_type,confidence,is_current,retrieved_at")
      .eq("campus_id", data.campusId).order("council_type").limit(200);
    const { data: status } = await (supabaseAdmin.from("campus_council_status") as any)
      .select("council_type,status,contacts_found,role_inbox_found,last_attempted_at").eq("campus_id", data.campusId);
    return { contacts: contacts ?? [], status: status ?? [] };
  });
