// COUNCIL PAGES — private leaderboard + forward kit for IFC / Panhellenic / NPHC / MGC execs.
//
// The strategic point, which drives every decision here: a council academics chair ALREADY has a
// mailing list of every chapter president. The leaderboard supplies the motivation; the forward kit
// supplies the signups. So the kit is the product and the leaderboard is the argument for using it.
//
// ── WHERE THE TOKENS LIVE, AND WHY NOT A TABLE ────────────────────────────────────────────────
//
// This needs mutable per-council state: a token, a rotation stamp, a last-opened stamp, and an
// alert stamp for rate limiting. That is a table's job — but DDL cannot be run from this machine
// (the Vercel CLI is unauthenticated, so the Supabase Management PAT cannot be pulled; migration
// 0118, a one-line constraint change, is still waiting on a human).
//
// Rather than ship a feature that needs a migration nobody can apply, state lives in the EXISTING
// `site_settings` single row, under `councilPages`. The ceiling is 16 schools x 4 councils = 64
// entries, which is nothing for a JSON column. The honest cost: writes are read-modify-write on one
// row, so two admins rotating tokens in the same second could clobber each other. With one admin
// that is theoretical; if it ever stops being theoretical, this wants a real table.
//
// ── COUNCILS ARE SEPARATE ENTITIES ────────────────────────────────────────────────────────────
//
// A council page shows ONLY its own chapters. IFC and Panhellenic at the same school are different
// pages with different tokens and different leaderboards. Merging them would produce a ranking
// where a 40-man fraternity and a 200-woman sorority sit in one list, which is meaningless to both.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sendSms } from "@/lib/greek-chapters.functions";
import { ADMIN_EMAILS } from "@/lib/admin-emails";

type DB = { from: (t: string) => any };
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** The councils we generate pages for. `other` is deliberately excluded — 4 chapters carry it and
 *  it is not a real governing body anyone chairs. */
export const COUNCILS = [
  { slug: "ifc", name: "IFC", full: "Interfraternity Council" },
  { slug: "panhellenic", name: "Panhellenic", full: "Panhellenic Council" },
  { slug: "nphc", name: "NPHC", full: "National Pan-Hellenic Council" },
  { slug: "mgc", name: "MGC", full: "Multicultural Greek Council" },
] as const;
export type CouncilSlug = (typeof COUNCILS)[number]["slug"];
export const councilBySlug = (s: string) => COUNCILS.find((c) => c.slug === s) ?? null;

/** THE ONE COUNCIL MATCHER. `campus_greek_chapters.council` is free text with no constraint, and it
 *  holds every casing at once — "IFC" 899 times and "ifc" 140, "Panhellenic" 554 and "panhellenic"
 *  73, "MGC" 231 and "mgc" 8. Any `.eq()` or `===` against it is a silent undercount, which is how a
 *  Panhellenic page once got built from 1 of 12 chapters.
 *
 *  Compares a normalised form against the council's slug, short name AND full name, so a row saying
 *  "IFC", "ifc" or "Interfraternity Council" all land on the same council. Exported because three
 *  call sites had grown their own copy of this and one of them was missed. */
const normCouncilValue = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z]/g, "");
export function councilMatches(council: { slug: string; name: string; full: string }, value: string | null | undefined): boolean {
  const v = normCouncilValue(value);
  if (!v) return false;
  return v === normCouncilValue(council.slug) || v === normCouncilValue(council.name) || v === normCouncilValue(council.full);
}


type CouncilState = { token: string; rotatedAt: string; lastOpenedAt?: string | null; lastAlertAt?: string | null };
type CouncilMap = Record<string, CouncilState>;
const keyOf = (school: string, council: string) => `${school}/${council}`;

/** 22 chars of URL-safe randomness. Not auth — the spec is explicit that a chair must be able to
 *  forward this to their VP with no friction — but long enough that it cannot be guessed, and
 *  rotatable when a link travels further than intended. */
function newToken(): string {
  const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(22);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (n) => A[n % A.length]).join("");
}

async function readMap(db: DB): Promise<CouncilMap> {
  try {
    const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const s = (data?.settings ?? {}) as Record<string, unknown>;
    return (s.councilPages ?? {}) as CouncilMap;
  } catch { return {}; }
}

/** Read-modify-write on the single settings row. Merges into whatever else lives there so an
 *  unrelated setting (the flyer URL, the intro video) is never dropped by a council write. */
async function writeMap(db: DB, next: CouncilMap): Promise<boolean> {
  try {
    const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const s = { ...((data?.settings ?? {}) as Record<string, unknown>), councilPages: next };
    const { error } = await db.from("site_settings").upsert({ id: 1, settings: s }, { onConflict: "id" });
    return !error;
  } catch { return false; }
}

async function isAdmin(db: DB, accessToken: string): Promise<boolean> {
  try {
    const { data } = await (db as unknown as { auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string | null } | null } }> } }).auth.getUser(accessToken);
    const e = (data?.user?.email ?? "").toLowerCase();
    return !!e && ADMIN_EMAILS.includes(e);
  } catch { return false; }
}

// ── the page's data ───────────────────────────────────────────────────────────────────────────

export type CouncilChapterRow = {
  chapterSlug: string; chapterName: string; goPath: string;
  members: number; joinedThisWeek: number;
};
export type CouncilPage = {
  schoolSlug: string; schoolName: string;
  councilSlug: string; councilName: string; councilFull: string;
  courseCode: string | null;
  chapters: CouncilChapterRow[];
  totalMembers: number; totalChapters: number;
};

/** Resolve a council page. Returns null for a bad token, an unknown school/council, or a council
 *  with no chapters at that school — the route renders its friendly fallback for all three rather
 *  than distinguishing them, because telling a stranger WHICH part was wrong is a free hint. */
export const getCouncilPage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schoolSlug: z.string().trim().min(1).max(80),
    councilSlug: z.string().trim().min(1).max(20),
    token: z.string().trim().max(64).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<CouncilPage | null> => {
    const council = councilBySlug(data.councilSlug);
    if (!council) return null;
    const db = await admin();

    const map = await readMap(db);
    const st = map[keyOf(data.schoolSlug, data.councilSlug)];
    if (!st || !data.token || data.token !== st.token) return null;

    const { data: campus } = await db.from("campuses")
      .select("id,name,course_family_codes_json").eq("slug", data.schoolSlug).maybeSingle();
    if (!campus?.id) return null;

    // COUNCIL IS NOT STORED AS A SLUG. One campus carries "IFC", "Panhellenic", "panhellenic" and
    // "NPHC" in the same column, so .eq("council", "ifc") matched only the rows that happened to
    // be lowercase — a Panhellenic page built from 1 of 12 chapters, and an IFC page from none.
    // Matched on a normalised form against the council's slug, name and full name instead.
    const { data: rows } = await db.from("campus_greek_chapters")
      .select("id,slug,greek_org_id,council").eq("campus_id", campus.id)
      .not("slug", "is", null).limit(500);
    const chs = ((rows ?? []) as Array<{ id: string; slug: string; greek_org_id: string | null; council: string | null }>)
      .filter((c) => councilMatches(council, c.council));
    if (!chs.length) return null;

    const orgIds = [...new Set(chs.map((c) => c.greek_org_id).filter(Boolean))] as string[];
    const { data: orgs } = orgIds.length ? await db.from("greek_orgs").select("id,name").in("id", orgIds) : { data: [] };
    const orgName = new Map<string, string>(((orgs ?? []) as Array<{ id: string; name: string | null }>).map((o) => [o.id, (o.name ?? "").trim()]));

    // MEMBERS HANG OFF THE SHELL ROW. greek_chapter_members.chapter_id points at greek_chapters,
    // which is created on demand and carries campus_greek_chapter_id back to the roster row —
    // counting straight off campus_greek_chapters.id would have returned zero for every chapter.
    const { data: shells } = await db.from("greek_chapters")
      .select("id,campus_greek_chapter_id").in("campus_greek_chapter_id", chs.map((c) => c.id)).limit(2000);
    const rosterByShell = new Map<string, string>(((shells ?? []) as Array<{ id: string; campus_greek_chapter_id: string }>).map((s) => [s.id, s.campus_greek_chapter_id]));

    const { data: mem } = rosterByShell.size
      ? await db.from("greek_chapter_members").select("chapter_id,joined_at").in("chapter_id", [...rosterByShell.keys()]).limit(5000)
      : { data: [] };
    const weekAgo = Date.now() - 7 * 864e5;
    const total = new Map<string, number>(), week = new Map<string, number>();
    for (const m of (mem ?? []) as Array<{ chapter_id: string; joined_at: string }>) {
      const roster = rosterByShell.get(m.chapter_id);
      if (!roster) continue;
      total.set(roster, (total.get(roster) ?? 0) + 1);
      if (new Date(m.joined_at).getTime() >= weekAgo) week.set(roster, (week.get(roster) ?? 0) + 1);
    }

    const codes = (() => { const j = campus.course_family_codes_json; const o = typeof j === "string" ? JSON.parse(j || "{}") : (j ?? {}); return (o?.intro_1 ?? "").toString().trim() || null; })();

    const chapters: CouncilChapterRow[] = chs
      .map((c) => ({
        chapterSlug: c.slug,
        chapterName: c.greek_org_id ? (orgName.get(c.greek_org_id) ?? c.slug) : c.slug,
        goPath: `/go/${data.schoolSlug}/${c.slug}`,
        members: total.get(c.id) ?? 0,
        joinedThisWeek: week.get(c.id) ?? 0,
      }))
      // Ranked by members. Zero-signup chapters sort to the BOTTOM but are never hidden — their
      // presence on the list is exactly what motivates a chair to forward the link.
      .sort((a, b) => b.members - a.members || a.chapterName.localeCompare(b.chapterName));

    // Fire-and-forget: first open of the day is worth a text, and the stamp is what rate-limits it.
    void touchAndAlert(db, map, data.schoolSlug, data.councilSlug, council.name, campus.name as string, chapters.reduce((a, c) => a + c.members, 0), "opened").catch(() => {});

    return {
      schoolSlug: data.schoolSlug, schoolName: campus.name as string,
      councilSlug: council.slug, councilName: council.name, councilFull: council.full,
      courseCode: codes,
      chapters,
      totalMembers: chapters.reduce((a, c) => a + c.members, 0),
      totalChapters: chapters.length,
    };
  });

/** ONE ALERT PER COUNCIL PER HOUR. A chair opening the page, copying the email, then copying the
 *  group-chat message is three events in ninety seconds — three texts would train Lee to ignore
 *  them, which costs more than the information is worth. */
async function touchAndAlert(db: DB, map: CouncilMap, school: string, council: string, councilName: string, schoolName: string, members: number, what: string) {
  const k = keyOf(school, council);
  const st = map[k];
  if (!st) return;
  const now = Date.now();
  const last = st.lastAlertAt ? new Date(st.lastAlertAt).getTime() : 0;
  const due = now - last > 3600_000;
  await writeMap(db, { ...map, [k]: { ...st, lastOpenedAt: new Date().toISOString(), lastAlertAt: due ? new Date().toISOString() : (st.lastAlertAt ?? null) } });
  if (!due) return;
  const to = process.env.FOUNDER_ALERT_PHONE ?? "";
  if (!to) return;
  await sendSms(to, `⚡ COUNCIL ${what.toUpperCase()}\n${councilName} · ${schoolName}\n${members} member${members === 1 ? "" : "s"} signed up so far`);
}

export const COUNCIL_ACTIONS = ["copy_email", "copy_groupchat", "copy_chapter_link", "download_qr", "download_flyer"] as const;

/** Log a forward-kit action and (rate-limited) alert on it. Best-effort: a failed log must never
 *  break a copy, which is the one thing this page exists to make easy. */
export const logCouncilAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    schoolSlug: z.string().trim().min(1).max(80),
    councilSlug: z.string().trim().min(1).max(20),
    token: z.string().trim().max(64),
    action: z.enum(COUNCIL_ACTIONS),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const db = await admin();
      const map = await readMap(db);
      const st = map[keyOf(data.schoolSlug, data.councilSlug)];
      if (!st || st.token !== data.token) return { ok: false };
      const { error } = await db.from("expand_events")
        .insert({ event: `council_${data.action}:${data.schoolSlug}/${data.councilSlug}` });
      if (error) console.warn("logCouncilAction insert failed:", error.message);
      const c = councilBySlug(data.councilSlug);
      const { data: campus } = await db.from("campuses").select("name").eq("slug", data.schoolSlug).maybeSingle();
      void touchAndAlert(db, map, data.schoolSlug, data.councilSlug, c?.name ?? data.councilSlug, (campus?.name as string) ?? data.schoolSlug, 0, data.action.replace("_", " ")).catch(() => {});
      return { ok: !error };
    } catch { return { ok: false }; }
  });

// ── admin ─────────────────────────────────────────────────────────────────────────────────────

export type CouncilAdminRow = {
  schoolSlug: string; schoolName: string; councilSlug: string; councilName: string;
  chapters: number; members: number; token: string; shareUrl: string;
  lastOpenedAt: string | null; rotatedAt: string;
};

/** Every council page that COULD exist (>=1 chapter at that school), minting a token for any that
 *  has none yet — so Lee never has to "create" a page before he can send it. */
export const listCouncilPagesAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<CouncilAdminRow[] | null> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return null;

    // EVERY campus WITH A ROSTER, not just the SEC. This was .eq("is_sec", true), which meant 50 of
    // the 66 supported campuses could never appear here — and because this function is what MINTS a
    // council's access token, a campus absent from this list has no council page at all. SEC-only
    // was right when the SEC 16 were the whole product; the roster is on 66 campuses now.
    //
    // Driven FROM the roster rather than from the campus table: there are 946 campus rows and only a
    // few dozen carry chapters, so listing campuses first would mean a 900-id `.in()` filter. Paged,
    // because PostgREST caps a response at 1,000 and the roster is past 2,200.
    const chs: Array<{ id: string; campus_id: string; council: string | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("campus_greek_chapters")
        .select("id,campus_id,council").not("slug", "is", null).range(from, from + 999);
      const page = (data ?? []) as Array<{ id: string; campus_id: string; council: string | null }>;
      chs.push(...page);
      if (page.length < 1000) break;
    }
    const campusIds = [...new Set(chs.map((c) => c.campus_id))];
    if (!campusIds.length) return [];
    const { data: camps } = await db.from("campuses")
      .select("id,slug,name").in("id", campusIds).is("archived_at", null).not("slug", "is", null).limit(1000);
    const schools = (camps ?? []) as Array<{ id: string; slug: string; name: string }>;
    const byId = new Map(schools.map((s) => [s.id, s]));

    // Same shell indirection as the page query.
    const { data: shells } = await db.from("greek_chapters").select("id,campus_greek_chapter_id").limit(2000);
    const rosterByShell = new Map<string, string>(((shells ?? []) as Array<{ id: string; campus_greek_chapter_id: string }>).map((s) => [s.id, s.campus_greek_chapter_id]));
    const { data: mem } = await db.from("greek_chapter_members").select("chapter_id").limit(5000);
    const memByChapter = new Map<string, number>();
    for (const m of (mem ?? []) as Array<{ chapter_id: string }>) {
      const roster = rosterByShell.get(m.chapter_id);
      if (roster) memByChapter.set(roster, (memByChapter.get(roster) ?? 0) + 1);
    }

    const map = await readMap(db);
    let dirty = false;
    const out: CouncilAdminRow[] = [];
    for (const s of schools) {
      for (const c of COUNCILS) {
        // NORMALISED, like every other council match in this file. `x.council === c.slug` compared a
        // free-text column against a lowercase slug, and the column holds "IFC" 899 times against
        // "ifc" 140 — so this saw about a seventh of the real rows. Worse than an undercount: the
        // `continue` below skips a council it believes is empty, and skipping means no token is ever
        // minted, so that campus's council page could not be generated at all.
        const mine = chs.filter((x) => x.campus_id === s.id && councilMatches(c, x.council));
        if (!mine.length) continue;                       // only councils that actually exist here
        const k = keyOf(s.slug, c.slug);
        if (!map[k]) { map[k] = { token: newToken(), rotatedAt: new Date().toISOString() }; dirty = true; }
        out.push({
          schoolSlug: s.slug, schoolName: s.name, councilSlug: c.slug, councilName: c.name,
          chapters: mine.length,
          members: mine.reduce((a, x) => a + (memByChapter.get(x.id) ?? 0), 0),
          token: map[k].token,
          shareUrl: `https://surviveaccounting.com/go/${s.slug}/council/${c.slug}?k=${map[k].token}`,
          lastOpenedAt: map[k].lastOpenedAt ?? null,
          rotatedAt: map[k].rotatedAt,
        });
      }
    }
    if (dirty) await writeMap(db, map);
    return out.sort((a, b) => b.members - a.members || a.schoolName.localeCompare(b.schoolName) || a.councilName.localeCompare(b.councilName));
  });

/** Rotate one council's token — the revoke path when a link has travelled too far. */
export const rotateCouncilToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    schoolSlug: z.string().trim().min(1).max(80),
    councilSlug: z.string().trim().min(1).max(20),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; token?: string }> => {
    const db = await admin();
    if (!(await isAdmin(db, data.accessToken))) return { ok: false };
    const map = await readMap(db);
    const k = keyOf(data.schoolSlug, data.councilSlug);
    const token = newToken();
    const ok = await writeMap(db, { ...map, [k]: { ...(map[k] ?? {}), token, rotatedAt: new Date().toISOString() } });
    return ok ? { ok: true, token } : { ok: false };
  });
