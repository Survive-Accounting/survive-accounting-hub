// THE BUILD QUEUE RUNNER — "laptop in a closet" (Lee, 2026-09-03).
//
// Ideas get banked (Ctrl+I), organised by AI, reviewed in /admin/ideas, and
// the ones Lee wants built get ADDED TO THE BUILD QUEUE with a priority.
// This runner, on the build machine, works through that queue unattended:
//
//   pick the next armed idea (urgent → high → medium → low, then oldest)
//   → fresh worktree on a fresh branch  queue/<slug>  off origin/main
//   → bun install, copy .env
//   → claude -p  (Claude Code, headless) builds it under the house rules
//   → commit what it did, push the BRANCH (never main)
//   → wait for Vercel's preview deployment (reported to GitHub)
//   → write back: preview URL, the TESTING CHECKLIST with full URLs, the
//     REPORT — onto the idea, so /admin/ideas and Obsidian show "Built —
//     test these" with links a non-developer can click
//   → next
//
// RULES (the same ones every session here works under, made explicit to the
// headless build): additive only; never push to main; never run migrations
// (write the file, list it under SQL LEE MUST RUN); never weaken a test;
// protected zones are off limits — stop and report instead. A failed build
// marks the idea FAILED and moves on; it never blocks the queue.
//
// USAGE (repo root; .env supplies Supabase + ANTHROPIC_API_KEY):
//   bun scripts/build-queue.ts            # one pass: build the next armed idea
//   bun scripts/build-queue.ts --watch    # keep going, every 3 min (--every=N)
//   bun scripts/build-queue.ts --dry      # say what it would pick, build nothing
//   bun scripts/build-queue.ts --only=<idea id>
//   QUEUE_DIR=D:/build-queue …            # where worktrees live (default ../build-queue)
//   CLAUDE_BIN=…                          # path to the claude CLI if not on PATH
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.cwd());
const QUEUE_DIR = process.env.QUEUE_DIR ?? path.resolve(REPO, "..", "build-queue");
const LOG_DIR = path.join(QUEUE_DIR, "logs");
const GH_REPO = "Survive-Accounting/survive-accounting-hub";
/** THE CLI, called through node on its JavaScript entry rather than the npm
 *  `.cmd` wrapper: launched from a double-clicked .cmd, bun's shell could
 *  not run the wrapper ("not recognized as an internal or external
 *  command") even though it ran fine from Git Bash. node + cli.js works from
 *  anywhere. CLAUDE_BIN overrides both. */
function resolveClaude(): { cmd: string; args: string[] } {
  if (process.env.CLAUDE_BIN) return { cmd: process.env.CLAUDE_BIN, args: [] };
  const pkgDir = path.join(process.env.APPDATA ?? "", "npm", "node_modules", "@anthropic-ai", "claude-code");
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as { bin?: string | Record<string, string> };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.claude;
    if (bin) {
      const binPath = path.join(pkgDir, bin);
      // A native exe (bin/claude.exe) runs as-is; a JS entry runs under node.
      return /\.(c|m)?js$/i.test(bin) ? { cmd: "node", args: [binPath] } : { cmd: binPath, args: [] };
    }
  } catch { /* not installed globally under APPDATA — fall through to PATH */ }
  return { cmd: "claude", args: [] };
}
const CLAUDE = resolveClaude();
const CLAUDE_BIN = `${CLAUDE.cmd} ${CLAUDE.args.join(" ")}`.trim();
// Turns are cheap to allow; the wall clock (QUEUE_BUILD_MINUTES) is the real
// cap. 80 was too few — the first build hit it mid-work with nothing shipped.
const MAX_TURNS = Number(process.env.QUEUE_MAX_TURNS ?? 400);
/** The model each build runs on. Lee (2026-09-03): Opus 5. Override with
 *  QUEUE_MODEL (an id like claude-opus-4-8, or an alias like opus/sonnet). */
const MODEL = process.env.QUEUE_MODEL ?? "claude-opus-5";
const BUILD_TIMEOUT_MS = Number(process.env.QUEUE_BUILD_MINUTES ?? 45) * 60_000;
const DEPLOY_WAIT_MS = Number(process.env.QUEUE_DEPLOY_MINUTES ?? 15) * 60_000;
const STALE_RUN_MS = 3 * 60 * 60_000;

const args = new Set(process.argv.slice(2));
const WATCH = args.has("--watch");
const DRY = args.has("--dry");
const ONLY = [...args].find((a) => a.startsWith("--only="))?.slice(7) ?? null;
const EVERY_MS = Number([...args].find((a) => a.startsWith("--every="))?.slice(8) ?? 3) * 60_000;

const PRIORITY: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

interface Row {
  id: string; title: string; body: string; status: string; prompt_md: string | null; source_path: string | null;
  context: Record<string, string> | null; created_by: string | null; updated_at: string;
}

const log = (s: string) => console.log(`[queue ${new Date().toISOString().slice(11, 19)}] ${s}`);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "idea";

function sh(cmd: string, cmdArgs: string[], cwd: string, opts: { env?: NodeJS.ProcessEnv; quiet?: boolean; shell?: boolean } = {}): { ok: boolean; out: string } {
  const r = spawnSync(cmd, cmdArgs, { cwd, env: { ...process.env, ...(opts.env ?? {}) }, encoding: "utf8", shell: opts.shell ?? process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (!opts.quiet && r.status !== 0) log(`  ! ${cmd} ${cmdArgs.join(" ")} → exit ${r.status}\n${out.slice(-1500)}`);
  return { ok: r.status === 0, out };
}

/** Run the CLI (no shell — node + cli.js takes its arguments straight). */
const claude = (cmdArgs: string[], cwd: string, quiet = true) => sh(CLAUDE.cmd, [...CLAUDE.args, ...cmdArgs], cwd, { quiet, shell: false });

/** The prompt sent to Claude Code, with the house rules and the required
 *  closing sections. The checklist is written AFTER the build, from what was
 *  actually shipped, and names the route for every line. */
function buildPrompt(r: Row, branch: string): string {
  const ideaPrompt = (r.prompt_md ?? "").trim() || `${r.title}\n\n${r.body}`;
  return [
    `You are building ONE change, unattended, in this worktree of the Survive Accounting repo (survive-accounting-hub — TanStack Start, React 19, TypeScript, Supabase, Bun). You are on branch ${branch}, cut from origin/main. Nobody is watching; the owner (Lee) will test the result later from a checklist you write. Read CLAUDE.md and docs/SESSION-CONTEXT.md first.`,
    "",
    "HARD RULES",
    "- Additive only. New files, new routes, new fields, new tables via a numbered additive migration FILE under migration/supabase-migrations/ — never run it; list it under SQL LEE MUST RUN.",
    "- Never push. Never touch main. Commit your finished work to THIS branch with a clear message (the runner pushes the branch).",
    "- Never delete or weaken a passing test. Run `bunx tsc --noEmit` (the known error in partner-kit.server.ts is pre-existing — ignore it) and `bun test` before you finish; fix what you broke.",
    "- Protected zones (element/frame parent membership, scene serialization internals, command bus, space walk) are off limits. If the task needs them, STOP: make no change there and say so in the REPORT.",
    "- Nothing a student sees changes unless the task says so. No data rewriting.",
    "- Fail loud: no silent fallbacks, no stubs that pretend to work. Two failed attempts on an item → stub it LOUDLY, log it, move on.",
    "- Make it testable by a non-developer: if testing needs data or a mock (a test chapter, a test checkout, a sample student), build a safe test path behind an is_test flag or a clearly-named test route, and put the exact clicks in the checklist.",
    "",
    "- COMMIT AS YOU GO. After each working step, `git add -A && git commit` on this branch. If you run out of time or turns, committed work survives; uncommitted work does not.",
    "- SCOPE: if the task reads as a research project or a list of many features, build the SMALLEST complete, testable slice first, commit it, and say in the REPORT what you left for a later pass. A finished small thing beats an unfinished big one.",
    "",
    "END YOUR FINAL MESSAGE WITH EXACTLY THESE TWO SECTIONS, nothing after them:",
    "## REPORT",
    "Per item: pass / fail / stubbed. SQL LEE MUST RUN (file names, or 'none'). Anything ambiguous you decided and how. What you could not verify.",
    "## TESTING CHECKLIST",
    "5 to 10 lines. Each line: `- [ ] <one plain-English check a non-developer can do, naming what to click and what they should see> — /the/route/path`. EVERY line ends with ` — /route` (the path on the site where the check happens; the runner turns it into a full preview URL). No jargon, no dev tools, no terminal. If a check needs a test login or a mock, say exactly what to use.",
    "",
    "THE TASK",
    ideaPrompt,
  ].join("\n");
}

function parseSections(text: string): { report: string; checklist: string[] } {
  const rep = text.match(/## REPORT\s*\n([\s\S]*?)(?=\n## TESTING CHECKLIST|$)/i);
  const chk = text.match(/## TESTING CHECKLIST\s*\n([\s\S]*)$/i);
  const lines = (chk?.[1] ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^- \[[ xX]\]/.test(l)).map((l) => l.replace(/^- \[[ xX]\]\s*/, ""));
  return { report: (rep?.[1] ?? "").trim().slice(0, 6000), checklist: lines.slice(0, 12) };
}

/** Vercel tells GitHub about every deployment (with its URL). Poll by commit. */
async function waitForPreview(sha: string): Promise<{ url: string | null; state: string }> {
  const started = Date.now();
  let last = "none";
  while (Date.now() - started < DEPLOY_WAIT_MS) {
    // List recent deployments and match the commit ourselves — the API's
    // `sha=` filter came back empty for the teleprompter build even though
    // the deployment (ref = the same sha) was right there.
    const dep = sh("gh", ["api", `repos/${GH_REPO}/deployments?per_page=30`, "--jq", `.[] | select(.environment=="Preview" and (.ref | startswith("${sha.slice(0, 12)}"))) | .id`], REPO, { quiet: true });
    const id = dep.out.trim().split(/\s+/)[0];
    if (id) {
      const st = sh("gh", ["api", `repos/${GH_REPO}/deployments/${id}/statuses?per_page=1`, "--jq", ".[0] | \"\\(.state) \\(.environment_url // \"\")\""], REPO, { quiet: true });
      const [state, url] = st.out.trim().split(/\s+/);
      last = state ?? "none";
      if (state === "success" && url) return { url, state };
      if (state === "failure" || state === "error") return { url: url || null, state };
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  return { url: null, state: `timeout (${last})` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runOne(db: { from: (t: string) => any }, r: Row): Promise<void> {
  const ctx = { ...(r.context ?? {}) };
  const s = slug(r.title);
  const branch = `queue/${s}-${r.id.slice(-5)}`;
  const dir = path.join(QUEUE_DIR, `${s}-${r.id.slice(-5)}`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${s}-${r.id.slice(-5)}.log`);
  const note = (t: string) => { log(t); fs.appendFileSync(logFile, `${new Date().toISOString()} ${t}\n`); };
  note(`▶ ${r.title}  (${ctx.queuePriority ?? "medium"}) → ${branch}`);
  if (DRY) return;

  const mark = async (patch: Record<string, string | undefined>, status?: string) => {
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete ctx[k]; else ctx[k] = v; }
    const upd: Record<string, unknown> = { context: ctx, updated_at: new Date().toISOString() };
    if (status) upd.status = status;
    const { error } = await db.from("ideas").update(upd).eq("id", r.id);
    if (error) throw new Error(`mark ${r.id}: ${error.message}`);
  };
  await mark({ runStartedAt: new Date().toISOString(), runError: undefined, runFailed: undefined, branch });

  try {
    // 1. A fresh worktree on a fresh branch off origin/main.
    if (fs.existsSync(dir)) sh("git", ["worktree", "remove", "--force", dir], REPO, { quiet: true });
    sh("git", ["branch", "-D", branch], REPO, { quiet: true });
    if (!sh("git", ["fetch", "-q", "origin", "main"], REPO).ok) throw new Error("git fetch failed");
    if (!sh("git", ["worktree", "add", dir, "-b", branch, "origin/main"], REPO).ok) throw new Error("worktree add failed");
    fs.copyFileSync(path.join(REPO, ".env"), path.join(dir, ".env"));
    note("  bun install…");
    if (!sh("bun", ["install", "--frozen-lockfile"], dir).ok && !sh("bun", ["install"], dir).ok) throw new Error("bun install failed");

    // 2. Claude Code, headless, in that worktree. STREAMED: every assistant
    // message and tool call goes to the log as it happens (the first run
    // died at the turn limit with a blank log — text mode prints only at the
    // end). The raw event stream is kept beside it as .jsonl.
    note(`  claude -p on ${MODEL} … (this is the long part; transcript streams below)`);
    const prompt = buildPrompt(r, branch);
    fs.writeFileSync(path.join(dir, ".build-queue-prompt.md"), prompt, "utf8");
    const jsonlFile = logFile.replace(/\.log$/, ".jsonl");
    const out = await new Promise<{ code: number | null; text: string; turns: number }>((resolve) => {
      const child = spawn(CLAUDE.cmd, [...CLAUDE.args, "-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--model", MODEL, "--max-turns", String(MAX_TURNS)], {
        cwd: dir, env: { ...process.env, CI: "1" }, shell: false,
      });
      let buf = "", finalText = "", lastAssistant = "", turns = 0;
      const timer = setTimeout(() => { note("  ! build timed out — killing"); child.kill(); }, BUILD_TIMEOUT_MS);
      const handle = (line: string) => {
        if (!line.trim()) return;
        fs.appendFileSync(jsonlFile, line + "\n");
        let ev: { type?: string; subtype?: string; result?: string; num_turns?: number; message?: { content?: unknown } } = {};
        try { ev = JSON.parse(line); } catch { fs.appendFileSync(logFile, line + "\n"); return; }
        if (ev.type === "assistant") {
          turns++;
          const blocks = Array.isArray(ev.message?.content) ? (ev.message!.content as { type: string; text?: string; name?: string; input?: Record<string, unknown> }[]) : [];
          for (const b of blocks) {
            if (b.type === "text" && b.text?.trim()) { lastAssistant = b.text; note(`  💬 ${b.text.trim().replace(/\s+/g, " ").slice(0, 300)}`); }
            else if (b.type === "tool_use") {
              const inp = b.input ?? {};
              const what = String(inp.command ?? inp.file_path ?? inp.pattern ?? inp.description ?? "").replace(/\s+/g, " ").slice(0, 160);
              note(`  🔧 ${b.name}${what ? ` · ${what}` : ""}`);
            }
          }
        } else if (ev.type === "result") {
          if (typeof ev.result === "string") finalText = ev.result;
          if (typeof ev.num_turns === "number") turns = ev.num_turns;
          note(`  ⏹ result: ${ev.subtype ?? "?"} after ${turns} turns`);
        }
      };
      child.stdout.on("data", (d) => { buf += String(d); const parts = buf.split("\n"); buf = parts.pop() ?? ""; for (const p of parts) handle(p); });
      child.stderr.on("data", (d) => { fs.appendFileSync(logFile, String(d)); });
      child.on("close", (code) => { clearTimeout(timer); if (buf.trim()) handle(buf); resolve({ code, text: finalText || lastAssistant, turns }); });
      child.stdin.write(prompt);
      child.stdin.end();
    });
    fs.rmSync(path.join(dir, ".build-queue-prompt.md"), { force: true });

    // 3. SALVAGE FIRST, JUDGE SECOND. Commit whatever is in the worktree and
    // push the branch (never main) even when the build stopped early — a
    // half-built branch can be resumed; a deleted worktree cannot.
    sh("git", ["add", "-A"], dir, { quiet: true });
    const finished = out.code === 0 && out.text.includes("## REPORT");
    sh("git", ["-c", "core.safecrlf=false", "commit", "-q", "-m", `${finished ? "build queue" : "build queue (stopped early)"}: ${r.title}\n\n${finished ? "Built" : "Partial work — the build stopped before it finished"} unattended from the Idea Bank (${r.id}).\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`], dir, { quiet: true });
    const ahead = sh("git", ["rev-list", "--count", "origin/main..HEAD"], dir, { quiet: true }).out.trim();
    let sha = "";
    if (ahead !== "0") {
      if (!sh("git", ["push", "-u", "origin", branch], dir).ok) throw new Error("git push of the branch failed");
      sha = sh("git", ["rev-parse", "HEAD"], dir, { quiet: true }).out.trim();
      note(`  pushed ${branch} @ ${sha.slice(0, 8)} (${ahead} commit${ahead === "1" ? "" : "s"})`);
    }
    if (!finished) {
      const why = out.code !== 0 ? `claude exited ${out.code} after ${out.turns} turns` : "no REPORT section in the final message";
      await mark({ runFailed: "1", runError: `${why}${ahead !== "0" ? ` — partial work is on ${branch}` : " — nothing to salvage"}`, sha: sha || undefined, runStartedAt: undefined });
      note(`✗ stopped early: ${why}${ahead !== "0" ? ` (partial work pushed to ${branch})` : ""}`);
      return;
    }
    if (ahead === "0") throw new Error("the build finished but made no commits — see the REPORT in the log");
    const { report, checklist } = parseSections(out.text);
    note("  waiting for the Vercel preview…");

    // 4. The preview URL, from GitHub's deployment record.
    const prev = await waitForPreview(sha);
    const base = prev.url ?? process.env.QUEUE_PREVIEW_TEMPLATE?.replace("{branch}", branch.replace(/[^a-z0-9-]/gi, "-")) ?? null;
    const withUrls = checklist.map((l) => {
      const m = l.match(/^(.*?)\s+—\s+(\/\S*)\s*$/);
      if (!m) return l;
      return base ? `${m[1]} — ${base}${m[2]}` : `${m[1]} — ${m[2]} (on the ${branch} preview)`;
    });
    note(`  preview: ${prev.url ?? `not found (${prev.state})`}`);

    await mark({
      built: "1", builtAt: new Date().toISOString(), branch, sha, previewUrl: base ?? "", previewState: prev.state,
      report, testChecklist: JSON.stringify(withUrls), runStartedAt: undefined,
    });
    note(`✓ built — ${withUrls.length} checks`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    note(`✗ failed: ${msg}`);
    await mark({ runFailed: "1", runError: msg.slice(0, 500), runStartedAt: undefined });
  } finally {
    // The worktree goes; the branch stays on origin for the preview and the review.
    sh("git", ["worktree", "remove", "--force", dir], REPO, { quiet: true });
  }
}

async function pass(): Promise<boolean> {
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const { data, error } = await db.from("ideas").select("id,title,body,status,prompt_md,source_path,context,created_by,updated_at").eq("status", "SUBMITTED");
  if (error) throw new Error(error.message);
  const armed = ((data ?? []) as Row[]).filter((r) => r.context?.armed === "1" && r.context?.built !== "1" && r.context?.runFailed !== "1" && (!ONLY || ONLY === r.id));
  // One at a time. A run that started over three hours ago is a crash, not a build.
  const running = armed.filter((r) => r.context?.runStartedAt && Date.now() - new Date(r.context.runStartedAt).getTime() < STALE_RUN_MS);
  if (running.length) { log(`building: ${running[0].title} — waiting`); return false; }
  const next = armed
    .filter((r) => !r.context?.runStartedAt || Date.now() - new Date(r.context.runStartedAt).getTime() >= STALE_RUN_MS)
    .sort((a, b) => (PRIORITY[b.context?.queuePriority ?? "medium"] ?? 2) - (PRIORITY[a.context?.queuePriority ?? "medium"] ?? 2) || (a.context?.armedAt ?? a.updated_at).localeCompare(b.context?.armedAt ?? b.updated_at))[0];
  if (!next) { log(`queue empty (${armed.length} armed, 0 ready)`); return false; }
  await runOne(db, next);
  return true;
}

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(REPO, ".env"))) throw new Error("run from the repo root (no .env here)");
  if (!DRY) {
    const v = claude(["--version"], REPO);
    if (!v.ok || !/\d+\.\d+/.test(v.out)) throw new Error(`claude CLI not found (${CLAUDE_BIN}) — double-click scripts\\claude-login.cmd once, or npm i -g @anthropic-ai/claude-code. Output: ${v.out.slice(0, 200)}`);
    // Unattended means logged in. One tiny call proves it before any build
    // starts; "Not logged in" here is the one-time claude-login.cmd on this PC.
    const probe = claude(["-p", "Reply with exactly: OK", "--output-format", "text", "--max-turns", "1"], REPO);
    if (!probe.ok || /not logged in|please run \/login/i.test(probe.out)) throw new Error("claude CLI is not logged in on this machine — double-click scripts\\claude-login.cmd, type /login, finish in the browser, then start this again");
    log(`claude CLI ready (${v.out.trim()}) · builds run on ${MODEL}`);
  }
  for (;;) {
    try { await pass(); }
    catch (e) { log(`! ${e instanceof Error ? e.message : e}`); if (!WATCH) process.exit(1); }
    if (!WATCH) return;
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
}
void main();
