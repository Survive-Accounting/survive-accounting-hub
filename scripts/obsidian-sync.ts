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
//   bun run obsidian:sync -- --draft      # also draft missing prompts
//   bun run obsidian:sync -- --redraft --only=<idea id>   # replace one prompt (old one kept)
//   bun run obsidian:sync -- --dry        # say what would happen, write nothing
//   OBSIDIAN_VAULT="D:/Vault" bun run obsidian:sync   # a different vault
import fs from "node:fs";
import path from "node:path";

import { STATUSES, type Status } from "../src/components/ideas/model";
import { buildIdeaPromptMessages, hasPromptSections } from "../src/lib/ideas-prompt";

const VAULT = process.env.OBSIDIAN_VAULT ?? "C:/Users/lee/Documents/Obsidian Vault";
const DIR = path.join(VAULT, "Survive", "Ideas");
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

const slug = (s: string): string => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 70) || "untitled";
const day = (iso: string): string => iso.slice(0, 10);

function noteFront(r: Row, keep: Front): Front {
  return {
    id: r.id,
    title: r.title || "(untitled)",
    status: typeof keep.status === "string" && (STATUSES as readonly string[]).includes(keep.status) ? keep.status : r.status,
    reviewed: typeof keep.reviewed === "boolean" ? keep.reviewed : false,
    categories: r.categories ?? [],
    subcategory: r.subcategory ?? "",
    source: r.source_path ?? "",
    captured: r.created_at,
    by: r.created_by ?? "",
    kind: r.source_kind ?? "web",
    app: APP,
  };
}

function noteBody(r: Row): string {
  const out: string[] = [];
  out.push(`# ${r.title || "(untitled)"}`, "");
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

// ------------------------------------------------------------------- main

async function main(): Promise<void> {
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };

  const { data, error } = await db.from("ideas").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

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

  let created = 0, refreshed = 0, pushed = 0, drafted = 0, kept = 0;
  const log = (s: string) => console.log(`${DRY ? "[dry] " : ""}${s}`);

  for (const r of rows) {
    // --draft: a missing prompt gets one, saved to the app first.
    // --redraft: an existing one is replaced, the old one kept.
    const eligible = (r.status === "IDEA" || r.status === "DRAFTED") && (!ONLY || ONLY === r.id);
    const wantDraft = eligible && ((DRAFT && !r.prompt_md?.trim()) || REDRAFT);
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

    // Lee changed the status in Obsidian → push it to the app.
    const fileStatus = typeof front.status === "string" ? front.status : "";
    if ((STATUSES as readonly string[]).includes(fileStatus) && fileStatus !== r.status) {
      log(`status ${r.title}: ${r.status} → ${fileStatus} (from Obsidian)`);
      if (!DRY) {
        const { error: e } = await db.from("ideas").update({ status: fileStatus as Status, updated_at: new Date().toISOString() }).eq("id", r.id);
        if (e) throw new Error(`push status for ${r.id}: ${e.message}`);
      }
      r.status = fileStatus;
      pushed++;
    }

    // The note was waiting for a prompt and the app now has one — or this run
    // redrafted it: refresh the body, keep the frontmatter Lee may have touched.
    if ((body.includes(PENDING) && r.prompt_md?.trim()) || redrawn) {
      log(`prompt ${path.basename(existing)} — ${redrawn ? "redrafted (previous kept below)" : "prompt landed"}`);
      if (!DRY) fs.writeFileSync(existing, renderFront(noteFront(r, front)) + "\n" + noteBody(r), "utf8");
      refreshed++;
      continue;
    }
    kept++;
  }

  // THE INDEX — always rewritten; it is a view, not a place Lee writes.
  const groups: Record<string, Row[]> = { IDEA: [], DRAFTED: [], SUBMITTED: [], APPROVED: [], PARKED: [] };
  for (const r of rows) (groups[r.status] ?? groups.IDEA).push(r);
  const link = (r: Row) => {
    const f = byId.get(r.id) ?? path.join(DIR, `${day(r.created_at)} ${slug(r.title)}.md`);
    return `[[${path.basename(f, ".md")}]]`;
  };
  const table = (list: Row[]) => list.length
    ? ["| idea | categories | captured | prompt |", "|---|---|---|---|", ...list.slice().reverse().map((r) => `| ${link(r)} | ${(r.categories ?? []).join(", ")} | ${day(r.created_at)} | ${r.prompt_md?.trim() ? "✓" : "—"} |`)].join("\n")
    : "_none_";
  const index = [
    "# Survive — the build queue",
    "",
    `Synced ${new Date().toISOString()} from the app (${rows.length} ideas). This file is rewritten on every sync — edit the notes, not this table.`,
    "",
    "Work an idea: open its note → read **Prompt** → paste into Claude Code on the build machine → after the deploy, tick **Testing checklist** on the laptop → set `status:` (SUBMITTED / APPROVED / PARKED) and `reviewed: true` in the note. The next sync pushes the status to the app.",
    "",
    "## Ideas (no prompt yet)", "", table(groups.IDEA), "",
    "## Drafted (prompt ready)", "", table(groups.DRAFTED), "",
    "## Submitted (in Claude Code)", "", table(groups.SUBMITTED), "",
    "## Approved (shipped)", "", table(groups.APPROVED), "",
    "## Parked", "", table(groups.PARKED), "",
  ].join("\n");
  if (!DRY) fs.writeFileSync(path.join(DIR, "_Queue.md"), index, "utf8");

  console.log(`\n${DRY ? "[dry] " : ""}${rows.length} ideas → ${DIR}\n  created ${created} · prompt landed ${refreshed} · untouched ${kept} · status pushed to app ${pushed}${DRAFT ? ` · drafted ${drafted}` : ""}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
