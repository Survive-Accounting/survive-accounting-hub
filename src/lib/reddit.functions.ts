// Reddit listener — server-side fetch path (Reddit official OAuth API).
//
// FEATURE-FLAGGED OFF for v1: Reddit now gates API access behind manual approval
// (pending). Until then the admin page uses the manual link-grid + quick-add. This
// module keeps the REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET env seam and the full
// fetch/upsert code path intact so that, once approved, we flip REDDIT_LISTENER_ENABLED
// (or set the keys) and it works with no rework. Read-only: search only, never posts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Flip to true (and set the keys) once Reddit approves API access.
const REDDIT_LISTENER_ENABLED = process.env.REDDIT_LISTENER_ENABLED === "true";
const CLIENT_ID = process.env.REDDIT_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET ?? "";
const USER_AGENT = "web:surviveaccounting-listener:v1 (by /u/surviveaccounting)";

// Hard rate-limit guardrails.
const REQUEST_DELAY_MS = 1200; // sequential spacing between Reddit calls
const MAX_TERMS_PER_RUN = 8; // cap searches per refresh
const PER_TERM_LIMIT = 25; // posts per search page

const refreshSchema = z.object({ campusId: z.string().uuid() });

type RefreshResult =
  | { disabled: true; reason: string }
  | {
      ok: true;
      campus: string;
      terms_searched: number;
      posts_seen: number;
      upserted: number;
      backoffs: number;
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseCodes(v: unknown): Record<string, string> {
  let val = v;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return {};
    }
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const out: Record<string, string> = {};
    for (const [k, code] of Object.entries(val as Record<string, unknown>)) {
      if (typeof code === "string" && code.trim()) out[k] = code.trim();
    }
    return out;
  }
  return {};
}
function searchTerms(codesJson: unknown): string[] {
  const codes = Object.values(parseCodes(codesJson));
  const quoted = codes.map((c) => `"${c}"`);
  const prefixes = [
    ...new Set(
      codes.map((c) => (c.match(/^([A-Za-z&]+)/)?.[1] ?? "").toUpperCase()).filter(Boolean),
    ),
  ];
  return [...new Set([...quoted, ...prefixes, "accounting"])];
}

async function getToken(): Promise<string> {
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Reddit token: no access_token in response");
  return j.access_token;
}

// Read-only listener refresh for ONE campus. Sequential + delayed + capped; backs
// off on 429. No-ops (returns {disabled}) while the flag/keys are absent.
export const refreshRedditMentions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshSchema.parse(d))
  .handler(async ({ data }): Promise<RefreshResult> => {
    if (!REDDIT_LISTENER_ENABLED) {
      return {
        disabled: true,
        reason: "REDDIT_LISTENER_ENABLED is off (Reddit API approval pending).",
      };
    }
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return {
        disabled: true,
        reason:
          "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set. Create a 'script' app at reddit.com/prefs/apps and add the keys to the environment.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campus, error: cErr } = await supabaseAdmin
      .from("campuses")
      .select("id, name, subreddit, course_family_codes_json")
      .eq("id", data.campusId)
      .single();
    if (cErr || !campus) throw new Error("Campus not found");
    const sub = (campus.subreddit as string | null)?.trim();
    if (!sub) throw new Error(`No subreddit set for ${campus.name}`);

    const terms = searchTerms(campus.course_family_codes_json).slice(0, MAX_TERMS_PER_RUN);
    const token = await getToken();
    const since = Date.now() / 1000 - 30 * 24 * 3600; // last 30 days

    let postsSeen = 0;
    let upserted = 0;
    let backoffs = 0;

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      const url = `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/search?q=${encodeURIComponent(
        term,
      )}&restrict_sr=1&sort=new&t=month&limit=${PER_TERM_LIMIT}`;
      let res = await fetch(url, {
        headers: { Authorization: `bearer ${token}`, "User-Agent": USER_AGENT },
      });
      if (res.status === 429) {
        backoffs++;
        await sleep(5000);
        res = await fetch(url, {
          headers: { Authorization: `bearer ${token}`, "User-Agent": USER_AGENT },
        });
        if (res.status === 429) break; // still throttled — stop and report
      }
      if (!res.ok) continue;
      const body = (await res.json()) as { data?: { children?: Array<{ data: any }> } };
      const children = body.data?.children ?? [];
      for (const c of children) {
        const p = c.data;
        if (typeof p?.created_utc === "number" && p.created_utc < since) continue;
        postsSeen++;
        const post_id: string = p.id;
        // reddit_mentions isn't in the generated Supabase types yet — cast like
        // the client data layer does (as never / as any).
        const mentions = () => supabaseAdmin.from("reddit_mentions" as never) as any;
        const { data: existing } = await mentions()
          .select("id, matched_terms")
          .eq("post_id", post_id)
          .maybeSingle();
        const merged = [...new Set([...(existing?.matched_terms ?? []), term])];
        if (existing) {
          await mentions().update({ matched_terms: merged }).eq("id", existing.id);
        } else {
          await mentions().insert({
            campus_id: campus.id,
            subreddit: sub,
            post_id,
            url: `https://www.reddit.com${p.permalink}`,
            title: p.title ?? null,
            snippet: (p.selftext ?? "").slice(0, 300) || null,
            author: p.author ?? null,
            posted_at: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
            matched_terms: merged,
            status: "new",
          });
          upserted++;
        }
      }
      if (i < terms.length - 1) await sleep(REQUEST_DELAY_MS);
    }

    return {
      ok: true,
      campus: campus.name as string,
      terms_searched: terms.length,
      posts_seen: postsSeen,
      upserted,
      backoffs,
    };
  });

// --- Quick-add prefill: fetch a single Reddit post's public .json --------------
// Distinct from the bulk listener above: ONE request, 5s timeout, no retries, no
// bulk. Triggered when Lee pastes a post URL in quick-add. Fails silently (returns
// {ok:false}) so entry always falls back to manual.
const TRIAGE_UA = `surviveaccounting-triage/1.0 by /u/${process.env.REDDIT_USERNAME ?? "surviveaccounting"}`;
const fetchPostSchema = z.object({ url: z.string().min(1) });

type FetchPostResult =
  | { ok: false }
  | {
      ok: true;
      title: string | null;
      author: string | null;
      snippet: string | null;
      posted_at: string | null;
      subreddit: string | null;
      campus_id: string | null;
    };

export const fetchRedditPost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => fetchPostSchema.parse(d))
  .handler(async ({ data }): Promise<FetchPostResult> => {
    try {
      const raw = data.url.trim();
      if (!/reddit\.com\/r\/[^/]+\/comments\//i.test(raw) && !/redd\.it\//i.test(raw)) {
        return { ok: false };
      }
      const jsonUrl = raw.split("?")[0].replace(/\/+$/, "") + ".json";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      let res: Response;
      try {
        res = await fetch(jsonUrl, {
          headers: { "User-Agent": TRIAGE_UA, Accept: "application/json" },
          signal: ctrl.signal,
          redirect: "follow",
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) return { ok: false };
      const j = (await res.json()) as any;
      const post = Array.isArray(j)
        ? j[0]?.data?.children?.[0]?.data
        : j?.data?.children?.[0]?.data;
      if (!post) return { ok: false };

      const subreddit: string = String(post.subreddit ?? "");
      let campus_id: string | null = null;
      if (subreddit) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // active_roster/subreddit aren't in the generated types yet — cast like the
        // client data layer does.
        const { data: c } = await (supabaseAdmin.from("campuses" as never) as any)
          .select("id")
          .eq("active_roster", "sec")
          .ilike("subreddit", subreddit)
          .limit(1);
        campus_id = (c?.[0]?.id as string | undefined) ?? null;
      }
      return {
        ok: true,
        title: post.title ?? null,
        author: post.author ?? null,
        snippet: (post.selftext ?? "").slice(0, 300) || null,
        posted_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
        subreddit: subreddit || null,
        campus_id,
      };
    } catch {
      return { ok: false };
    }
  });
