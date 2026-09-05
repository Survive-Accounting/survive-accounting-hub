// FAST TRACK — the lane for small, safe changes (Lee, 2026-09-05: "small scoped features. It
// won't impact data … light guardrails, I really trust him"). A request is an idea row with
// context.lane = "fast_track" and status SUBMITTED, so the existing build-queue runner picks
// it up; the runner prepends FAST_TRACK_RULES, builds on a queue/* branch (never main),
// and emails Lee the preview and the checklist. Lee merges after a look.
//
// Pure. The server fn, the sheet, the queue page and the runner all read from here.

export const FAST_TRACK_LANE = "fast_track";
/** Requests per person per Chicago day, for everyone who is not Lee. */
export const FAST_TRACK_DAILY_LIMIT = 10;

/** What counts as fast-track scope — shown to the requester, in plain words. */
export const FAST_TRACK_GUIDELINES: readonly string[] = [
  "One small change you can describe in a sentence or two — copy, a label, a colour, a layout tweak, a new column in a table, a small tool on a page.",
  "Say WHERE (the page) and WHAT (what should change and what it should look like after). The page you press Ctrl+F on is captured automatically.",
  "Nothing that touches data: no deleting, no moving records, no changing what students see on the public site.",
  "Nothing that touches sign-in, passwords, payments, or texting/emailing students.",
  "Nothing the build would need a new database table or migration for.",
  "If the build finds the change is bigger than it looks, it stops and says so — nothing half-done ships.",
  "What you get back: a preview link and a checklist, by email to Lee. Lee merges it live after a look.",
];

/** The rules the runner prepends to a fast-track build. The enforceable half of the above. */
export const FAST_TRACK_RULES: readonly string[] = [
  "FAST TRACK — this is a SMALL, SAFE change requested by a teammate (not Lee). Extra rules on top of the hard rules, and they win on any conflict:",
  "- Scope: touch at most 6 files. If the change genuinely needs more, STOP, make no change, and explain in the REPORT what it would take.",
  "- No migrations, no new tables, no data writes or deletes of any kind, no scripts that touch Supabase rows.",
  "- No changes under auth, sessions, payments, comms/, cron routes, or anything under src/lib/*.server.ts.",
  "- Nothing a STUDENT sees changes: only /admin, /growth, /v3 and other internal surfaces, unless the request names a public page and the change is copy only.",
  "- Never delete, skip or weaken a test. Run the tests that cover what you touched, then the full suite once at the end; a red suite means STOP and report.",
  "- Keep the change exactly as asked. Do not add features, refactor neighbours, or 'improve' nearby code.",
];

export interface FastTrackable {
  status: string;
  createdBy: string;
  createdAt: string;
  context: Record<string, string>;
}

export function isFastTrack(i: { context?: Record<string, string> | null }): boolean {
  return (i.context?.lane ?? "") === FAST_TRACK_LANE;
}

/** "YYYY-MM-DD" in Chicago for an instant — the allowance resets at Lee's midnight, not UTC's. */
export function chicagoDayKey(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Lee is unlimited; everyone else has FAST_TRACK_DAILY_LIMIT per Chicago day. */
export function fastTrackAllowance(ideas: readonly FastTrackable[], who: string, now: Date): { used: number; limit: number | null; left: number | null } {
  if (who === "lee") return { used: ideas.filter((i) => isFastTrack(i) && i.createdBy === who && chicagoDayKey(new Date(i.createdAt)) === chicagoDayKey(now)).length, limit: null, left: null };
  const today = chicagoDayKey(now);
  const used = ideas.filter((i) => isFastTrack(i) && i.createdBy === who && chicagoDayKey(new Date(i.createdAt)) === today).length;
  return { used, limit: FAST_TRACK_DAILY_LIMIT, left: Math.max(0, FAST_TRACK_DAILY_LIMIT - used) };
}

/** The prompt the runner receives: the request, the page, who asked. The rules ride separately. */
export function fastTrackPrompt(req: { text: string; path: string; pageTitle: string; who: string }): string {
  return [
    `## Fast track request from ${req.who}`,
    "",
    req.text.trim(),
    "",
    `Page it was requested from: ${req.path || "(unknown)"}${req.pageTitle ? ` — "${req.pageTitle}"` : ""}`,
  ].join("\n");
}

export type QueueState = "queued" | "building" | "built" | "failed" | "done";

/** One word for where a request is, from the runner's own context marks. */
export function queueStateOf(i: { status: string; context: Record<string, string> }): QueueState {
  if (i.status === "APPROVED") return "done";
  if (i.context.runFailed === "1") return "failed";
  if (i.context.built === "1") return "built";
  if (i.context.runStartedAt) return "building";
  return "queued";
}

// ---------------------------------------------------------------- v2 (2026-09-05)
// Lee: which model King builds on; emails on queued and on built with CANCEL / REVERT;
// King's changes land on a playground route; the sheet knows whether the build machine is
// up; a log of what was sent; and no new prompt until the last one is checked out.

/** The fast-track lane builds on Sonnet: the best value for small UI/UX changes, and in the
 *  Max subscription. QUEUE_MODEL on the runner still governs Lee's own queue. */
export const FAST_TRACK_MODEL = "claude-sonnet-5";
export const FAST_TRACK_MODEL_LABEL = "Claude Sonnet 5";

/** "9/5/26 at 2:31PM" — Chicago time, the way Lee writes it. */
export function fmtStamp(iso: string | Date, timeZone = "America/Chicago"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("month")}/${g("day")}/${g("year")} at ${g("hour")}:${g("minute")}${g("dayPeriod").toUpperCase()}`;
}

/** KING'S PLAYGROUND (Lee, 2026-09-05: "any changes he pushes can go to a route /growth/v3?
 *  So he can stay in /v2 without fear of breaking it"). His fast-track builds edit the v3 copy
 *  only; Lee has no playground — his requests build where they point. */
export const KING_PLAYGROUND = "/admin/growth/v3";
export const KING_PLAYGROUND_FILE = "src/routes/admin.growth.v3.tsx";
export function playgroundFor(who: string): string | null { return who === "king" ? KING_PLAYGROUND : null; }

/** The extra rules when a request builds on a playground. */
export function playgroundRules(playground: string): readonly string[] {
  return [
    `PLAYGROUND: this teammate's changes go to ${playground} ONLY — the file ${KING_PLAYGROUND_FILE} (and new files under src/components/growth/v3/ if a piece is big enough to split out).`,
    "- Never edit admin.growth.v2.tsx or any shared growth component or server function. If the request names /admin/growth/v2 or 'all growth pages', build it on the v3 copy and say so in the REPORT.",
    "- If the change cannot be made on the playground alone, STOP, make no change, and explain in the REPORT.",
  ];
}

/** Is the build machine up? It writes a heartbeat every pass (3 min); silence past 8 min = down. */
export const RUNNER_STALE_MS = 8 * 60_000;
export function runnerOnline(seenAt: string | null | undefined, now: Date): boolean {
  if (!seenAt) return false;
  const t = new Date(seenAt).getTime();
  return Number.isFinite(t) && now.getTime() - t < RUNNER_STALE_MS;
}

export interface CheckoutRow { id: string; title: string; status: string; createdBy: string; createdAt: string; context: Record<string, string> }
export type Checkout = { kind: "wait" | "rate"; id: string; title: string; state: QueueState } | null;

/** NO NEW PROMPT UNTIL THE LAST ONE IS CHECKED OUT (Lee, 2026-09-05: "If he hasn't checked
 *  out the previous one, he can't continue"). For everyone but Lee: the newest fast-track
 *  request of theirs that is still queued/building blocks with "wait"; one that is built or
 *  failed and unrated blocks with "rate". Cancelled and reverted ones never block. */
export function needsCheckout(rows: readonly CheckoutRow[], who: string): Checkout {
  if (who === "lee") return null;
  const mine = rows.filter((r) => isFastTrack(r) && r.createdBy === who && r.context.cancelled !== "1" && r.context.reverted !== "1")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = mine[0];
  if (!last) return null;
  const state = queueStateOf(last);
  if (state === "queued" || state === "building") return { kind: "wait", id: last.id, title: last.title, state };
  if ((state === "built" || state === "failed") && !last.context.rating) return { kind: "rate", id: last.id, title: last.title, state };
  return null;
}

/** "$0.42" / "12 min" — the log's two numbers, from the runner's marks. */
export function fmtCost(usd: string | number | null | undefined): string {
  const n = typeof usd === "string" ? Number(usd) : usd;
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}
export function fmtBuildTime(seconds: string | number | null | undefined): string {
  const n = typeof seconds === "string" ? Number(seconds) : seconds;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n < 90 ? `${Math.round(n)} s` : `${Math.round(n / 60)} min`;
}
