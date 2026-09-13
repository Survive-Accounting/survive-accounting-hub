// THE CHAPTER DASHBOARD (rebuilt 2026-09-13) — server half.
//
// Lee: "make the Greek dashboard really minimal … just show them the stats on dashboard at day 0,
// like nothing yet, but give them action steps to get the number growing (send groupme, show slide
// at chapter meeting, print flyer for the house) maybe with checklists for 'Mark done'? Email me
// and King if any of these get done. Dashboard is just for tracking usage … No pulse email to
// chapters yet." And a basic "Buy seats" that is a REQUEST: pick how many (10 minimum, batches of
// 10), ping Lee, tell the chair Lee will reach out. Checkout comes later.
//
// NO MIGRATION. The checklist and the seat requests are rows in expand_events (the event log the
// chair pages already write), keyed by the chapter shell id:
//   chapter_step:<chapterId>#groupme | #slide | #flyer          (":undo" suffix un-ticks)
//   chapter_seat_request:<chapterId>#<seats>
// Usage comes from learn_events (the /learn pulse) for this chapter's slug on its campus.
//
// AUTH: the caller's Supabase JWT, matched to greek_chapters.admin_email — the same rule as the
// existing dashboard (greek-chapters.functions chapterForToken). Handler bodies only; imports of
// server modules are dynamic so none of this reaches the client bundle.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const CHAPTER_STEPS = ["groupme", "slide", "flyer"] as const;
export type ChapterStep = (typeof CHAPTER_STEPS)[number];
export const SEAT_REQUEST_MIN = 10;
export const SEAT_REQUEST_STEP = 10;

const STEP_EMAIL: Record<ChapterStep, string> = {
  groupme: "posted in the chapter GroupMe",
  slide: "showed the slide at chapter meeting",
  flyer: "printed a flyer for the house",
};

type DB = { from: (t: string) => any; auth: { getUser: (jwt: string) => Promise<{ data: { user: { email?: string | null } | null }; error: unknown }> } };

async function chapterFor(accessToken: string): Promise<{ db: DB; ch: Record<string, any> } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as DB;
  const { data } = await db.auth.getUser(accessToken);
  const email = (data.user?.email ?? "").trim().toLowerCase();
  if (!email) return null;
  const { data: row } = await db.from("greek_chapters").select("*").ilike("admin_email", email).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return row ? { db, ch: row } : null;
}

export interface ChapterHome {
  chapterId: string;
  chapterName: string;
  schoolName: string;
  /** campuses.slug — /go and /api namespace. */
  schoolSlug: string | null;
  /** roster slug — null when the shell has no roster row (then there is no link to share yet). */
  chapterSlug: string | null;
  letters: string | null;
  courseCode: string | null;
  membersJoined: number;
  joinedThisWeek: number;
  /** Newest first. `label` is the member's name, else their email, else "Member". */
  roster: Array<{ id: string; label: string; joinedAt: string }>;
  /** Last 7 days, from the /learn pulse. null when the pulse table can't be read. */
  usage: { watchers: number; minutesWatched: number; videosStarted: number } | null;
  steps: Record<ChapterStep, string | null>;
  seatRequest: { seats: number; at: string } | null;
  isTest: boolean;
}

export const getChapterHome = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<ChapterHome | null> => {
    const found = await chapterFor(data.accessToken);
    if (!found) return null;
    const { db, ch } = found;

    let schoolSlug: string | null = null;
    let courseCode: string | null = null;
    if (ch.campus_id) {
      const { data: camp } = await db.from("campuses").select("slug,course_family_codes_json").eq("id", ch.campus_id).maybeSingle();
      schoolSlug = (camp?.slug as string) ?? null;
      try {
        const j = camp?.course_family_codes_json;
        const o = typeof j === "string" ? JSON.parse(j || "{}") : (j ?? {});
        courseCode = ((o?.intro_1 ?? "") as string).toString().trim() || null;
      } catch { courseCode = null; }
    }
    let chapterSlug: string | null = null;
    let letters: string | null = null;
    if (ch.campus_greek_chapter_id) {
      const { data: roster } = await db.from("campus_greek_chapters").select("slug,letters").eq("id", ch.campus_greek_chapter_id).maybeSingle();
      chapterSlug = (roster?.slug as string) ?? null;
      letters = ((roster?.letters as string) ?? "").trim() || null;
    }
    const { TEST_CAMPUS_SLUG } = await import("@/lib/test-mode");
    const isTest = schoolSlug === TEST_CAMPUS_SLUG;

    const { data: mem } = await db.from("greek_chapter_members").select("id,name,phone,joined_at").eq("chapter_id", ch.id).order("joined_at", { ascending: false }).limit(1000);
    const rows = (mem ?? []) as Array<{ id: string; name: string | null; phone: string | null; joined_at: string }>;
    const weekAgo = Date.now() - 7 * 864e5;
    const roster = rows.map((r) => {
      const email = (r.phone ?? "").startsWith("email:") ? (r.phone as string).slice(6) : null;
      return { id: r.id, label: (r.name ?? "").trim() || email || "Member", joinedAt: r.joined_at };
    });

    // USAGE — the last seven days of this chapter's /learn pulse. Real rows only on a real campus.
    let usage: ChapterHome["usage"] = null;
    if (chapterSlug && schoolSlug) {
      try {
        let q = db.from("learn_events").select("kind,anon_id,seconds").eq("chapter_slug", chapterSlug).eq("campus_slug", schoolSlug)
          .gte("created_at", new Date(weekAgo).toISOString()).in("kind", ["video_start", "watch_time"]).limit(20000);
        if (!isTest) q = q.eq("is_test", false);
        const { data: ev, error } = await q;
        if (!error) {
          const list = (ev ?? []) as Array<{ kind: string; anon_id: string | null; seconds: number | null }>;
          const watchers = new Set(list.map((e) => e.anon_id).filter(Boolean)).size;
          const seconds = list.filter((e) => e.kind === "watch_time").reduce((a, e) => a + (e.seconds ?? 0), 0);
          usage = { watchers, minutesWatched: Math.round(seconds / 60), videosStarted: list.filter((e) => e.kind === "video_start").length };
        }
      } catch { usage = null; }
    }

    const steps: ChapterHome["steps"] = { groupme: null, slide: null, flyer: null };
    let seatRequest: ChapterHome["seatRequest"] = null;
    {
      const { data: ev } = await db.from("expand_events").select("event,created_at")
        .or(`event.like.chapter_step:${ch.id}#%,event.like.chapter_seat_request:${ch.id}#%`)
        .order("created_at", { ascending: true }).limit(500);
      for (const e of (ev ?? []) as Array<{ event: string; created_at: string }>) {
        const tail = e.event.slice(e.event.indexOf("#") + 1);
        if (e.event.startsWith("chapter_step:")) {
          const [step, undo] = tail.split(":");
          if ((CHAPTER_STEPS as readonly string[]).includes(step)) steps[step as ChapterStep] = undo === "undo" ? null : e.created_at;
        } else {
          const n = Number(tail);
          if (Number.isFinite(n)) seatRequest = { seats: n, at: e.created_at };
        }
      }
    }

    return {
      chapterId: ch.id as string,
      chapterName: (ch.chapter_name as string) ?? "Your chapter",
      schoolName: (ch.school_name as string) ?? "",
      schoolSlug, chapterSlug, letters, courseCode,
      membersJoined: rows.length,
      joinedThisWeek: rows.filter((r) => new Date(r.joined_at).getTime() >= weekAgo).length,
      roster, usage, steps, seatRequest, isTest,
    };
  });

/** Tick (or un-tick) one action step. The FIRST tick of a step emails Lee and King. */
export const markChapterStep = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(10), step: z.enum(CHAPTER_STEPS), done: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; at: string | null }> => {
    const found = await chapterFor(data.accessToken);
    if (!found) return { ok: false, at: null };
    const { db, ch } = found;
    const key = `chapter_step:${ch.id}#${data.step}`;
    const { count } = data.done
      ? await db.from("expand_events").select("id", { count: "exact", head: true }).eq("event", key)
      : { count: 1 };
    const at = new Date().toISOString();
    await db.from("expand_events").insert({ event: data.done ? key : `${key}:undo` });
    if (data.done && (count ?? 0) === 0) {
      const { emailTeam, escHtml } = await import("@/lib/team-alerts.server");
      const who = String(ch.admin_name_role ?? "The scholarship chair");
      const line = `${ch.chapter_name} at ${ch.school_name} ${STEP_EMAIL[data.step]}.`;
      await emailTeam({
        subject: `${ch.chapter_name} · ${ch.school_name}: ${STEP_EMAIL[data.step]}`,
        text: `${line}\nMarked done on the chapter dashboard by ${who}.`,
        html: `<p style="font-size:15px;"><b>${escHtml(String(ch.chapter_name))}</b> at ${escHtml(String(ch.school_name))} ${escHtml(STEP_EMAIL[data.step])}.</p><p style="color:#666;">Marked done on the chapter dashboard by ${escHtml(who)}.</p>`,
      });
    }
    return { ok: true, at: data.done ? at : null };
  });

/** "Request seats" — a request, not a purchase. Pings Lee (email to Lee + King, and a text to Lee). */
export const requestChapterSeats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    accessToken: z.string().min(10),
    seats: z.number().int().min(SEAT_REQUEST_MIN).max(500).refine((n) => n % SEAT_REQUEST_STEP === 0, { message: "Seats come in tens." }),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; at?: string; error?: string }> => {
    const found = await chapterFor(data.accessToken);
    if (!found) return { ok: false, error: "Sign in again to request seats." };
    const { db, ch } = found;
    await db.from("expand_events").insert({ event: `chapter_seat_request:${ch.id}#${data.seats}` });
    // From lib/terms, NOT components/site/ChapterAccess: a component file imported from a server
    // handler drags its whole UI tree into the nitro bundle (that is what timed out a deploy).
    const { SEAT_PRICE_CENTS } = await import("@/lib/terms");
    const SEAT_PRICE = SEAT_PRICE_CENTS / 100;
    const { emailTeam, escHtml, isTestRun } = await import("@/lib/team-alerts.server");
    const who = String(ch.admin_name_role ?? "The scholarship chair");
    const contact = [ch.admin_phone, ch.admin_email].filter(Boolean).join(" · ");
    const line = `SEAT REQUEST — ${ch.chapter_name} at ${ch.school_name} wants ${data.seats} seats (about $${(data.seats * SEAT_PRICE).toLocaleString("en-US")}). ${who}${contact ? ` · ${contact}` : ""}. They were told you'll reach out.`;
    await emailTeam({
      subject: `Seat request: ${ch.chapter_name} · ${ch.school_name} · ${data.seats} seats`,
      text: line,
      html: `<p style="font-size:15px;"><b>${escHtml(String(ch.chapter_name))}</b> at ${escHtml(String(ch.school_name))} requested <b>${data.seats} seats</b> (about $${(data.seats * SEAT_PRICE).toLocaleString("en-US")}).</p><p>${escHtml(who)}<br>${escHtml(contact)}</p><p><b>They were told you will reach out.</b></p>`,
    });
    if (!(await isTestRun())) {
      try {
        const { FOUNDER_PHONE } = await import("@/lib/comms/send.server");
        const { sendSms } = await import("@/lib/greek-chapters.functions");
        if (FOUNDER_PHONE) await sendSms(FOUNDER_PHONE, line);
      } catch { /* the request row and the email already happened */ }
    }
    return { ok: true, at: new Date().toISOString() };
  });
