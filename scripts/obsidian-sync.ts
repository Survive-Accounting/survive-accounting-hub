// OBSIDIAN SYNC — the wall between the two machines (Lee, 2026-09-02).
//
// The filming laptop captures ideas with Ctrl+I; they accumulate in the app's
// vault (Supabase `ideas`). This script runs on the BUILD machine and mirrors
// them into the Obsidian vault as one note per idea:
//
//   <vault>/Survive/Ideas/<captured date> <title>.md
//   <vault>/Survive/Ideas/_Queue.md          (the index, always rewritten)
//
// Each note carries the idea verbatim, and — once a prompt exists — its
// ## Summary, ## Prompt and ## Testing checklist. Lee works the queue in
// Obsidian: reads the prompt, pastes it into Claude Code, ticks the
// checklist on the laptop, sets `reviewed: true` and `status:` in the
// frontmatter. The next run pushes a changed `status` back to the app, so
// both sides agree without either needing the other open.
//
// RULES
//   · A note Lee has edited is never overwritten. The only rewrite is when a
//     note is still waiting for its prompt (the pending marker is present)
//     and the app now has one — and even then the frontmatter he touched
//     (status, reviewed) is kept.
//   · Nothing is deleted, here or in the app. PARKED is the archive; parked
//     ideas still get a note, filed under "Parked" in the index.
//   · --draft asks the AI for a prompt for every idea that has none
//     (IDEA/DRAFTED only), saves it to the app (status DRAFTED) and writes
//     the note. Costs money; explicit flag, never the default.
//
// USAGE (from the repo root, .env supplies Supabase + AI keys):
//   bun run obsidian:sync                 # mirror + push status changes back
//   bun run obsidian:sync -- --organize   # backfill AI title/TLDR/summary/categories where missing
//   bun run obsidian:sync -- --draft      # also draft missing prompts
//   bun run obsidian:sync -- --redraft --only=<idea id>   # replace one prompt (old one kept)
//   bun run obsidian:sync -- --dry        # say what would happen, write nothing
//   bun run obsidian:sync -- --watch      # keep syncing every 5 min (--every=N for N min)
//   OBSIDIAN_VAULT="D:/Vault" bun run obsidian:sync   # a different vault
import fs from "node:fs";
import path from "node:path";

import { CATEGORIES, STATUSES, type Status } from "../src/components/ideas/model";
import { buildIdeaPromptMessages, buildOrganizeMessages, hasPromptSections, pageLabel, suggestProject } from "../src/lib/ideas-prompt";

const VAULT = process.env.OBSIDIAN_VAULT ?? "C:/Users/lee/Documents/Obsidian Vault";
const DIR = path.join(VAULT, "Survive", "Ideas");
// TERRY keeps the count of what Lee has to do. To-dos (context.todo set in the
// Ctrl+I modal, or said out loud) never enter the build queue; they collect in
// ONE note as checkboxes, summarised by AI once each, grouped by category and
// again by date. Tick a box → next sync marks it done in the app. Move a line
// under another heading (or add a heading) → next sync learns the category.
// That is how a Claude Code session can "organise my to-dos": it edits this
// file; the sync carries the result back.
const TERRY_DIR = path.join(VAULT, "Terry");
const TODOS_FILE = path.join(TERRY_DIR, "Todos.md");
const BY_DATE_MARK = "## By date";
const APP = "https://surviveaccounting.com/admin/ideas";
const PENDING = "<!-- survive:prompt pending — run `bun run obsidian:sync -- --draft` on the build machine, or draft it in the app -->";

const args = new Set(process.argv.slice(2));
const DRAFT = args.has("--draft");
// --redraft: draft even where a prompt exists (a hand-written spec, an old
// three-section draft). The previous prompt is kept on the idea
// (context.previousPromptMd) and in the note under "Previous prompt".
const REDRAFT = args.has("--redraft");
// --only=<idea id>: limit --draft/--redraft to one idea.
const ONLY = [...args].find((a) => a.startsWith("--only="))?.slice(7) ?? null;
const DRY = args.has("--dry");
// --watch: keep running, syncing every few minutes — Lee (2026-09-03) was not
// seeing new ideas in Obsidian because nothing ran the sync. Leave this going
// in a terminal on the build machine and the vault is never stale.
// --organize: backfill the AI title / TLDR / summary / categories / session
// for ideas saved before the app did this on save (or where it failed).
// The same micro call the app makes; cheap; skips anything already done.
const ORGANIZE = args.has("--organize");
// --import=<file>: notes dictated elsewhere on the build machine become ONE
// idea in the bank (then --organize / --draft treat it like any other).
const IMPORT = [...args].find((a) => a.startsWith("--import="))?.slice(9) ?? null;
// Git Bash rewrites a value that starts with "/" into a Windows path
// (MSYS path conversion) — so `--page=v3/...` without the slash is safest;
// either form is accepted, and a mangled "C:/Program Files/Git/..." is undone.
const IMPORT_PAGE = (() => {
  const raw = [...args].find((a) => a.startsWith("--page="))?.slice(7) ?? "v3";
  const fixed = raw.replace(/^[A-Za-z]:[\\/]Program Files[\\/]Git[\\/]/i, "").replace(/\\/g, "/");
  return fixed.startsWith("/") ? fixed : `/${fixed}`;
})();
const WATCH = args.has("--watch");
const WATCH_MS = Number([...args].find((a) => a.startsWith("--every="))?.slice(8) ?? 5) * 60_000;

interface Row {
  id: string; title: string; body: string; categories: string[] | null; subcategory: string | null;
  status: string; source_path: string | null; prompt_md: string | null; prompt_filename: string | null;
  created_by: string | null; source_kind: string | null; context: Record<string, string> | null;
  attachments: { name: string; url: string }[] | null; audio_path: string | null; transcript_status: string | null;
  created_at: string; updated_at: string;
}

// ------------------------------------------------------------- frontmatter

type Front = Record<string, string | boolean | string[]>;

function parseFront(md: string): { front: Front; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { front: {}, body: md };
  const front: Front = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, k, raw] = kv;
    const v = raw.trim();
    if (v === "true" || v === "false") front[k] = v === "true";
    else if (v.startsWith("[") && v.endsWith("]")) front[k] = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    else front[k] = v.replace(/^"|"$/g, "");
  }
  return { front, body: md.slice(m[0].length) };
}

const yamlStr = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function renderFront(f: Front): string {
  const lines = Object.entries(f).map(([k, v]) =>
    Array.isArray(v) ? `${k}: [${v.join(", ")}]` : typeof v === "boolean" ? `${k}: ${v}` : `${k}: ${yamlStr(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

// ------------------------------------------------------------------ notes

const FORBIDDEN = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
const slug = (s: string): string =>
  [...s].filter((ch) => !FORBIDDEN.has(ch) && ch.charCodeAt(0) >= 32).join("").replace(/\s+/g, " ").trim().slice(0, 70) || "untitled";
const day = (iso: string): string => iso.slice(0, 10);

function noteFront(r: Row, keep: Front): Front {
  return {
    id: r.id,
    title: r.title || "(untitled)",
    status: typeof keep.status === "string" && (STATUSES as readonly string[]).includes(keep.status) ? keep.status : r.status,
    // What the app said at the last sync. `status` above is what the note
    // says; when they differ the NOTE was edited and wins; when they agree
    // and the app moved on, the app wins. Two-way without ping-pong.
    synced: r.status,
    reviewed: typeof keep.reviewed === "boolean" ? keep.reviewed : false,
    urgent: r.context?.urgent === "1",
    priority: String(Number(r.context?.priority ?? 0) || 0),
    draft: r.context?.draft === "1",
    tldr: r.context?.tldr ?? "",
    // Plain names: the project (= the Claude Code session Lee pins), the page
    // it is about, and the worktree behind the project for when it matters.
    // Only trust a stored session name once it was written as a project;
    // older rows carried the git-flavoured label and get the plain one.
    project: r.context?.project ? (r.context.session ?? "") : suggestProject(r.source_path ?? "", r.categories ?? []).label,
    page: r.context?.page ?? pageLabel(r.source_path ?? ""),
    worktree: r.context?.worktree ?? suggestProject(r.source_path ?? "", r.categories ?? []).worktree,
    // Obsidian's own tag pane filters on these.
    tags: [
      `project/${(r.context?.project ?? suggestProject(r.source_path ?? "", r.categories ?? []).key)}`,
      `page/${(r.context?.page ?? pageLabel(r.source_path ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      ...(r.categories ?? []).map((c) => `cat/${c.toLowerCase()}`),
      ...(r.context?.urgent === "1" ? ["urgent"] : []),
    ],
    categories: r.categories ?? [],
    subcategory: r.subcategory ?? "",
    source: r.source_path ?? "",
    captured: r.created_at,
    by: r.created_by ?? "",
    kind: r.source_kind ?? "web",
    app: APP,
  };
}

/** Urgent first, then Prioritize's order, then newest — the bank's own order. */
const rank = (a: Row, b: Row): number =>
  Number(b.context?.urgent === "1") - Number(a.context?.urgent === "1")
  || (Number(b.context?.priority ?? 0) || 0) - (Number(a.context?.priority ?? 0) || 0)
  || b.created_at.localeCompare(a.created_at);

function noteBody(r: Row): string {
  const out: string[] = [];
  out.push(`# ${r.context?.urgent === "1" ? "🔥 " : ""}${r.title || "(untitled)"}`, "");
  if (r.context?.tldr && !r.prompt_md?.trim()) out.push(`> ${r.context.tldr}`, "");
  if (r.context?.summary && !r.prompt_md?.trim()) out.push(r.context.summary, "");
  const proj = (r.context?.project ? r.context.session ?? "" : "") || suggestProject(r.source_path ?? "", r.categories ?? []).label;
  const page = r.context?.page ?? pageLabel(r.source_path ?? "");
  out.push(`_Project: **${proj}** · Page: **${page}**${r.context?.worktree ? ` · worktree \`${r.context.worktree}\`` : ""}_`, "");
  out.push("## Idea (verbatim)", "");
  out.push(r.body?.trim() ? r.body.trim() : "_(no text — see the voice note)_", "");
  const extras: string[] = [];
  if (r.audio_path) extras.push(`- 🎙 voice note in the app${r.transcript_status && r.transcript_status !== "ok" ? ` (transcript ${r.transcript_status})` : ""}`);
  for (const a of r.attachments ?? []) extras.push(`- 📎 [${a.name}](${a.url})`);
  if (r.source_path) extras.push(`- captured from \`${r.source_path}\`${r.context?.title ? ` — “${r.context.title}”` : ""}`);
  if (extras.length) out.push(...extras, "");
  if (r.prompt_md?.trim()) {
    const md = r.prompt_md.trim();
    if (hasPromptSections(md)) out.push(md, "");
    else {
      out.push("## Summary", "", "_(hand-written prompt — no summary drafted)_", "");
      out.push("## Prompt", "", md, "");
      out.push("## Testing checklist", "", "- [ ] _(none drafted — add what to check on the laptop)_", "");
    }
  } else {
    out.push("## Summary", "", "_not drafted yet_", "");
    out.push("## Prompt", "", PENDING, "");
    out.push("## Testing checklist", "", "- [ ] _(drafted with the prompt)_", "");
  }
  if (r.context?.lastSentTo) out.push(`_Summary last sent to ${r.context.lastSentTo}${r.context.lastSentAt ? ` on ${day(r.context.lastSentAt)}` : ""}._`, "");
  if (r.context?.previousPromptMd) out.push("## Previous prompt (kept)", "", r.context.previousPromptMd, "");
  return out.join("\n");
}

// ------------------------------------------------------------------ to-dos

const isTodo = (r: Row): boolean => !!r.context?.todo;
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** What the note says now: per id, ticked or not, and the heading it sits
 *  under (categories section only — the by-date section is a view). */
function readTodosNote(md: string): Map<string, { done: boolean; category: string | null }> {
  const out = new Map<string, { done: boolean; category: string | null }>();
  const cut = md.indexOf(BY_DATE_MARK);
  const cats = cut < 0 ? md : md.slice(0, cut);
  let heading: string | null = null;
  for (const line of cats.split(/\r?\n/)) {
    const h = line.match(/^## (.+?)\s*$/);
    if (h) { heading = h[1].trim(); continue; }
    const m = line.match(/^- \[([ xX])\] .*<!--\s*(\S+)\s*-->/);
    if (m) out.set(m[2], { done: m[1] !== " ", category: heading && heading.toLowerCase() !== "done" ? heading.toLowerCase() : null });
  }
  // The by-date section can be ticked too.
  if (cut >= 0) {
    for (const line of md.slice(cut).split(/\r?\n/)) {
      const m = line.match(/^- \[([xX])\] .*<!--\s*(\S+)\s*-->/);
      if (m && out.has(m[2])) out.get(m[2])!.done = true;
    }
  }
  return out;
}

/** One AI call for every to-do that has no summary yet: each becomes one
 *  imperative checkbox line. Cached on the idea (context.todoSummary). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function summariseTodos(db: { from: (t: string) => any }, todos: Row[], log: (s: string) => void): Promise<void> {
  const need = todos.filter((r) => !r.context?.todoSummary && (r.body?.trim() || r.title?.trim()));
  if (!need.length) return;
  log(`summarise ${need.length} to-do${need.length === 1 ? "" : "s"}`);
  if (DRY) return;
  const { runAiTask } = await import("../src/lib/ai.server");
  const system = "Lee dictates to-dos in a hurry. Rewrite EACH one as ONE checkbox line: imperative, at most 12 words, keep every name, date, amount and place, drop filler (\"put this on my to-do list\", \"remind me to\"). Return ONLY a JSON object mapping id to line.";
  const user = need.map((r) => `${r.id}: ${(r.body?.trim() || r.title).replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
  const res = await runAiTask("micro", { system, user, maxOutput: 2000 });
  const m = res.text.match(/\{[\s\S]*\}/);
  const map = m ? (JSON.parse(m[0]) as Record<string, string>) : {};
  for (const r of need) {
    const line = String(map[r.id] ?? "").trim() || (r.body?.trim() || r.title).split(/[.\n]/)[0].slice(0, 90);
    r.context = { ...(r.context ?? {}), todoSummary: line };
    const { error } = await db.from("ideas").update({ context: r.context, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) throw new Error(`save summary for ${r.id}: ${error.message}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTodos(db: { from: (t: string) => any }, todos: Row[], log: (s: string) => void): Promise<{ done: number; moved: number }> {
  let done = 0, moved = 0;
  // Read back what Lee (or a Claude Code session) changed in the note first.
  const seen = fs.existsSync(TODOS_FILE) ? readTodosNote(fs.readFileSync(TODOS_FILE, "utf8")) : new Map();
  for (const r of todos) {
    const s = seen.get(r.id);
    if (!s) continue;
    const patch: Record<string, unknown> = {};
    if (s.done && r.status !== "APPROVED") { r.status = "APPROVED"; patch.status = "APPROVED"; done++; log(`done   ${r.context?.todoSummary ?? r.title}`); }
    if (!s.done && r.status === "APPROVED") { r.status = "DRAFTED"; patch.status = "DRAFTED"; log(`reopen ${r.context?.todoSummary ?? r.title}`); }
    if (s.category && s.category !== (r.context?.todo ?? "").toLowerCase()) {
      r.context = { ...(r.context ?? {}), todo: s.category };
      patch.context = r.context; moved++;
      log(`move   ${r.context?.todoSummary ?? r.title} → ${s.category}`);
    }
    if (Object.keys(patch).length && !DRY) {
      const { error } = await db.from("ideas").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id);
      if (error) throw new Error(`push to-do ${r.id}: ${error.message}`);
    }
  }

  await summariseTodos(db, todos, log);

  const line = (r: Row) => `- [${r.status === "APPROVED" ? "x" : " "}] ${r.context?.todoSummary ?? r.title} <!-- ${r.id} --> · ${day(r.created_at)}${(r.created_by ?? "").toLowerCase() === "king" ? " · King" : ""}`;
  const open = todos.filter((r) => r.status !== "APPROVED" && r.status !== "PARKED");
  const finished = todos.filter((r) => r.status === "APPROVED");
  const categories = [...new Set(["work", "personal", ...open.map((r) => (r.context?.todo ?? "work").toLowerCase())])];
  const out: string[] = [
    "# To-dos — Terry keeps the count",
    "",
    `_Synced ${new Date().toISOString()} · ${open.length} open · ${finished.length} done._ Tick a box to finish one. Move a line under another heading — or add a heading — to recategorise; the next sync learns it. The **By date** list is a view of the same items.`,
    "",
  ];
  for (const c of categories) {
    const list = open.filter((r) => (r.context?.todo ?? "work").toLowerCase() === c);
    out.push(`## ${cap(c)}`, "", ...(list.length ? list.slice().reverse().map(line) : ["_nothing open_"]), "");
  }
  out.push("## Done", "", ...(finished.length ? finished.slice().reverse().slice(0, 40).map(line) : ["_none yet_"]), "");
  out.push("---", "", BY_DATE_MARK, "");
  const byDay = new Map<string, Row[]>();
  for (const r of open.slice().reverse()) byDay.set(day(r.created_at), [...(byDay.get(day(r.created_at)) ?? []), r]);
  for (const [d, list] of byDay) out.push(`### ${d}`, "", ...list.map((r) => `- [ ] (${cap((r.context?.todo ?? "work").toLowerCase())}) ${r.context?.todoSummary ?? r.title} <!-- ${r.id} -->`), "");
  if (!byDay.size) out.push("_nothing open_", "");
  if (!DRY) { fs.mkdirSync(TERRY_DIR, { recursive: true }); fs.writeFileSync(TODOS_FILE, out.join("\n"), "utf8"); }
  return { done, moved };
}

// ------------------------------------------------------------------- main

async function main(): Promise<void> {
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as unknown as { from: (t: string) => any };

  const log = (s: string) => console.log(`${DRY ? "[dry] " : ""}${s}`);

  // --import: a text file → one idea, saved before anything else runs.
  if (IMPORT) {
    const text = fs.readFileSync(IMPORT, "utf8").replace(/\r\n/g, "\n").trim();
    if (!text) throw new Error(`--import: ${IMPORT} is empty`);
    const id = `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const title = text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 100);
    log(`import ${path.basename(IMPORT)} → "${title}"`);
    if (!DRY) {
      const { error: e } = await db.from("ideas").insert({
        id, title, body: text, categories: [], subcategory: "", status: "IDEA", source_path: IMPORT_PAGE,
        context: { title: `Imported from ${path.basename(IMPORT)}`, importedFrom: path.basename(IMPORT) },
        prompt_md: null, prompt_filename: null, created_by: "lee", source_kind: "web", attachments: [], audio_path: null, transcript_status: null,
      });
      if (e) throw new Error(`import: ${e.message}`);
    }
  }

  const { data, error } = await db.from("ideas").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const all = (data ?? []) as Row[];
  // To-dos are Terry's; everything else is the build queue.
  const todos = all.filter(isTodo);
  const rows = all.filter((r) => !isTodo(r));

  if (!DRY) fs.mkdirSync(DIR, { recursive: true });
  // Existing notes, by the id in their frontmatter — a retitled idea keeps its file.
  const byId = new Map<string, string>();
  if (fs.existsSync(DIR)) {
    for (const f of fs.readdirSync(DIR)) {
      if (!f.endsWith(".md") || f.startsWith("_")) continue;
      const { front } = parseFront(fs.readFileSync(path.join(DIR, f), "utf8"));
      if (typeof front.id === "string") byId.set(front.id, path.join(DIR, f));
    }
  }

  // SENT / REVIEWED, read back from _Queue.md before anything is rewritten.
  // A tick that disagrees with the app's status changes the app: reviewed →
  // APPROVED, sent → SUBMITTED, both cleared → DRAFTED (reopened).
  const queueFile = path.join(DIR, "_Queue.md");
  if (fs.existsSync(queueFile)) {
    const ticks = new Map<string, { sent: boolean; reviewed: boolean }>();
    for (const l of fs.readFileSync(queueFile, "utf8").split(/\r?\n/)) {
      const m = l.match(/^- \[([ xX])\] sent \[([ xX])\] reviewed .*<!--\s*(\S+)\s*-->/);
      if (m) ticks.set(m[3], { sent: m[1] !== " ", reviewed: m[2] !== " " });
    }
    for (const r of rows) {
      const t = ticks.get(r.id);
      if (!t) continue;
      const want = t.reviewed ? "APPROVED" : t.sent ? "SUBMITTED" : (r.status === "SUBMITTED" || r.status === "APPROVED") ? "DRAFTED" : r.status;
      if (want !== r.status) {
        log(`queue  ${r.title}: ${r.status} → ${want} (from the checklist)`);
        if (!DRY) {
          const { error: e } = await db.from("ideas").update({ status: want, updated_at: new Date().toISOString() }).eq("id", r.id);
          if (e) throw new Error(`queue tick for ${r.id}: ${e.message}`);
        }
        r.status = want;
      }
    }
  }

  let created = 0, refreshed = 0, pushed = 0, drafted = 0, kept = 0;

  for (const r of rows) {
    // --organize: title · TLDR · summary · categories · session, once.
    if (ORGANIZE && !r.context?.organizedAt && (r.body?.trim() || r.title?.trim()) && (!ONLY || ONLY === r.id)) {
      log(`organize ${r.title}`);
      if (!DRY) {
        const { runAiTask } = await import("../src/lib/ai.server");
        const org = buildOrganizeMessages({
          title: r.title || (r.body ?? "").slice(0, 80), body: r.body, categories: r.categories ?? [], subcategory: r.subcategory ?? "",
          sourcePath: r.source_path ?? "", pageTitle: r.context?.title ?? "", existingPrompt: r.prompt_md,
        });
        const res = await runAiTask("micro", { system: org.system, user: org.user, maxOutput: 700 });
        const m = res.text.match(/\{[\s\S]*\}/);
        const ctx: Record<string, string> = { ...(r.context ?? {}) };
        if (m) {
          const j = JSON.parse(m[0]) as { title?: unknown; tldr?: unknown; summary?: unknown; categories?: unknown; urgent?: unknown };
          if (typeof j.title === "string" && j.title.trim()) r.title = j.title.trim().slice(0, 120);
          if (typeof j.tldr === "string") ctx.tldr = j.tldr.trim();
          if (typeof j.summary === "string") ctx.summary = j.summary.trim();
          if (!(r.categories ?? []).length && Array.isArray(j.categories)) {
            r.categories = j.categories.filter((c): c is string => typeof c === "string" && (CATEGORIES as readonly string[]).includes(c)).slice(0, 2);
          }
          if (j.urgent === true && !ctx.urgent) ctx.urgentSuggested = "1";
        }
        const proj = suggestProject(r.source_path ?? "", r.categories ?? []);
        ctx.session = proj.label; ctx.project = proj.key; ctx.worktree = proj.worktree;
        ctx.page = pageLabel(r.source_path ?? "");
        ctx.organizedAt = new Date().toISOString();
        r.context = ctx;
        const { error: e } = await db.from("ideas").update({ title: r.title, categories: r.categories ?? [], context: ctx, updated_at: ctx.organizedAt }).eq("id", r.id);
        if (e) throw new Error(`organize ${r.id}: ${e.message}`);
      }
    }

    // --draft: a missing prompt gets one, saved to the app first.
    // --redraft: an existing one is replaced, the old one kept.
    const eligible = (r.status === "IDEA" || r.status === "DRAFTED") && (!ONLY || ONLY === r.id);
    // A stale prompt (another capture was merged in) redrafts on --draft too.
    const promptStale = r.context?.stalePrompt === "1";
    const wantDraft = eligible && ((DRAFT && (!r.prompt_md?.trim() || promptStale)) || REDRAFT);
    let redrawn = false;
    if (wantDraft) {
      log(`${r.prompt_md?.trim() ? "redraft" : "draft  "} ${r.title}`);
      if (!DRY) {
        const { runAiTask } = await import("../src/lib/ai.server");
        const { system, user } = buildIdeaPromptMessages({
          title: r.title, body: r.body, categories: r.categories ?? [], subcategory: r.subcategory ?? "", sourcePath: r.source_path ?? "",
          pageTitle: r.context?.title ?? "",
          // A hand-written prompt is Lee's spec — the redraft is grounded in it.
          notes: r.prompt_md?.trim() ? `LEE'S EXISTING NOTES / SPEC FOR THIS (keep every decision in it):\n${r.prompt_md.trim().slice(0, 8000)}` : undefined,
        });
        const res = await runAiTask("synthesis", { system, user, maxOutput: 3500 });
        const previous = r.prompt_md?.trim() ?? "";
        r.prompt_md = res.text.trim();
        r.prompt_filename = r.prompt_filename || `${slug(r.title).toLowerCase().replace(/\s+/g, "-")}.md`;
        if (r.status === "IDEA") r.status = "DRAFTED";
        if (previous) r.context = { ...(r.context ?? {}), previousPromptMd: previous };
        if (r.context?.stalePrompt) { const c = { ...r.context }; delete c.stalePrompt; r.context = c; }
        const { error: e } = await db.from("ideas").update({ prompt_md: r.prompt_md, prompt_filename: r.prompt_filename, status: r.status, context: r.context, updated_at: new Date().toISOString() }).eq("id", r.id);
        if (e) throw new Error(`save prompt for ${r.id}: ${e.message}`);
        redrawn = !!previous;
      }
      drafted++;
    }

    const existing = byId.get(r.id);
    if (!existing) {
      const file = path.join(DIR, `${day(r.created_at)} ${slug(r.title)}.md`);
      log(`create ${path.basename(file)}`);
      if (!DRY) fs.writeFileSync(file, renderFront(noteFront(r, {})) + "\n" + noteBody(r), "utf8");
      created++;
      continue;
    }

    const raw = fs.readFileSync(existing, "utf8");
    const { front, body } = parseFront(raw);

    // TWO-WAY STATUS. The note remembers the app's status at the last sync
    // (`synced`). If the note's status moved away from that, Lee edited the
    // note → push to the app. If the note still agrees with `synced` but the
    // app moved on (he parked it in the bank), the app wins and the note's
    // frontmatter is refreshed — never the body.
    const fileStatus = typeof front.status === "string" ? front.status : "";
    const syncedStatus = typeof front.synced === "string" ? front.synced : fileStatus;
    const noteEdited = (STATUSES as readonly string[]).includes(fileStatus) && fileStatus !== syncedStatus;
    if (noteEdited && fileStatus !== r.status) {
      log(`status ${r.title}: ${r.status} → ${fileStatus} (from Obsidian)`);
      if (!DRY) {
        const { error: e } = await db.from("ideas").update({ status: fileStatus as Status, updated_at: new Date().toISOString() }).eq("id", r.id);
        if (e) throw new Error(`push status for ${r.id}: ${e.message}`);
      }
      r.status = fileStatus;
      pushed++;
    }
    const front2 = { ...front, status: r.status };
    // GENERATED FRONTMATTER FOLLOWS THE APP. Everything except `status` and
    // `reviewed` is the app's (AI title, TLDR, session, categories, urgent,
    // priority) — when any of it changed, refresh the frontmatter and leave
    // the body alone. The one status case: the app moved on and the note
    // did not (see above).
    const fresh = noteFront(r, front2);
    const stale = (!noteEdited && fileStatus !== r.status)
      || Object.entries(fresh).some(([k, v]) => k !== "status" && k !== "reviewed" && k !== "synced" && JSON.stringify(front[k] ?? (Array.isArray(v) ? [] : typeof v === "boolean" ? false : "")) !== JSON.stringify(v));
    if (stale) {
      log(`front  ${r.title}${!noteEdited && fileStatus !== r.status ? ` — status ${fileStatus || "?"} → ${r.status} (from the app)` : " — refreshed from the app"}`);
      if (!DRY) fs.writeFileSync(existing, renderFront(fresh) + "\n" + body.replace(/^\n/, ""), "utf8");
    }

    // The note was waiting for a prompt and the app now has one — or this run
    // redrafted it: refresh the body, keep the frontmatter Lee may have touched.
    if ((body.includes(PENDING) && r.prompt_md?.trim()) || redrawn) {
      log(`prompt ${path.basename(existing)} — ${redrawn ? "redrafted (previous kept below)" : "prompt landed"}`);
      if (!DRY) fs.writeFileSync(existing, renderFront(noteFront(r, front2)) + "\n" + noteBody(r), "utf8");
      refreshed++;
      continue;
    }
    kept++;
  }

  // THE INDEX — always rewritten; it is a view, not a place Lee writes.
  // THE QUEUE, Lee's way (2026-09-03): "List of prompts in order, urgent in a
  // separate list up top. Only need download prompt link/icon … sent,
  // reviewed (checkboxes)". Each line: two ticks, the note, the prompt file.
  // Reviewed lines are struck through. The ticks flow to the app (SUBMITTED /
  // APPROVED) on the next sync — read-back happens at the top of main().
  const PROMPTS = path.join(VAULT, "Survive", "Prompts");
  if (!DRY) fs.mkdirSync(PROMPTS, { recursive: true });
  const noteName = (r: Row) => path.basename(byId.get(r.id) ?? path.join(DIR, `${day(r.created_at)} ${slug(r.title)}.md`), ".md");
  const promptName = (r: Row) => `${slug(r.title).toLowerCase().replace(/\s+/g, "-").slice(0, 60) || "prompt"}.prompt`;
  // THE PROMPT FILE — just what gets pasted into Claude Code. Generated on
  // every sync from the app; edit the prompt in the app or in the note.
  for (const r of rows) {
    if (!r.prompt_md?.trim()) continue;
    const md = r.prompt_md.trim();
    const body = hasPromptSections(md)
      ? (() => { const i = md.indexOf("## Prompt"); const rest = md.slice(i + 9); const n = rest.search(/\n## /); return (n < 0 ? rest : rest.slice(0, n)).trim(); })()
      : md;
    if (!DRY) fs.writeFileSync(path.join(PROMPTS, `${promptName(r)}.md`), `${body}\n`, "utf8");
  }
  const projKey = (r: Row) => r.context?.project ?? suggestProject(r.source_path ?? "", r.categories ?? []).key;
  const line = (r: Row) => {
    const sent = r.status === "SUBMITTED" || r.status === "APPROVED";
    const reviewed = r.status === "APPROVED";
    const title = `[[${noteName(r)}|${r.title.replace(/[[\]|]/g, " ")}]]`;
    const prompt = r.prompt_md?.trim() ? ` · [[${promptName(r)}|⬇ prompt]]` : " · _no prompt yet_";
    return `- [${sent ? "x" : " "}] sent [${reviewed ? "x" : " "}] reviewed — ${reviewed ? `~~${title}~~` : title}${prompt} · #project/${projKey(r)} <!-- ${r.id} -->`;
  };
  const urgentRows = rows.filter((r) => r.context?.urgent === "1" && r.status !== "PARKED" && r.status !== "APPROVED").sort(rank);
  const openRows = rows.filter((r) => r.context?.urgent !== "1" && r.status !== "PARKED" && r.status !== "APPROVED" && r.context?.draft !== "1").sort(rank);
  const draftRows = rows.filter((r) => r.context?.draft === "1" && r.status !== "PARKED").sort(rank);
  const doneRows = rows.filter((r) => r.status === "APPROVED").sort(rank);
  const parkedRows = rows.filter((r) => r.status === "PARKED").sort(rank);
  const list = (l: Row[]) => (l.length ? l.map(line).join("\n") : "_none_");
  const index = [
    "# Survive — prompts",
    "",
    `_Synced ${new Date().toISOString()}. Tick **sent** when it is in Claude Code, **reviewed** when it shipped and you checked it — both flow to the app on the next sync. Reviewed lines strike through and can be archived from the Idea Bank. Rewritten every sync; edit the notes, not this list._`,
    "",
    "## 🔥 Urgent", "", list(urgentRows), "",
    "## Prompts, in order", "", list(openRows), "",
    ...(draftRows.length ? ["## Drafts (words not finished)", "", list(draftRows), ""] : []),
    ...(doneRows.length ? ["## Reviewed", "", list(doneRows), ""] : []),
    ...(parkedRows.length ? ["## Archived", "", parkedRows.map((r) => `- ~~${r.title}~~`).join("\n"), ""] : []),
  ].join("\n");
  if (!DRY) fs.writeFileSync(path.join(DIR, "_Queue.md"), index, "utf8");

  const t = await syncTodos(db, todos, log);

  console.log(`\n${DRY ? "[dry] " : ""}${rows.length} ideas → ${DIR}\n  created ${created} · prompt landed ${refreshed} · untouched ${kept} · status pushed to app ${pushed}${DRAFT || REDRAFT ? ` · drafted ${drafted}` : ""}\n${todos.length} to-dos → ${TODOS_FILE}\n  marked done ${t.done} · recategorised ${t.moved}`);
}

async function loop(): Promise<void> {
  for (;;) {
    try { await main(); }
    catch (e) { console.error(`[sync] ${e instanceof Error ? e.message : e}`); if (!WATCH) process.exit(1); }
    if (!WATCH) return;
    console.log(`[sync] next in ${Math.round(WATCH_MS / 60_000)} min — Ctrl+C to stop`);
    await new Promise((r) => setTimeout(r, WATCH_MS));
  }
}
void loop();
