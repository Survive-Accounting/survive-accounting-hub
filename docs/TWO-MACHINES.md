# Two machines, two jobs

Lee, 2026-09-02: *"This PC is for queueing builds. New faster laptop is for
filming and posting only. … It's about filming/posting content and marketing.
That's it."*

The app is arranged so each machine has its own front door and never needs
the other's.

## The laptop — film, post, market

| Go to | For |
| --- | --- |
| `/v3` | **The Queue.** Every set, its status, three icons: 🎙 talk · ✨ results · 🎬 film. This is home; every breadcrumb comes back here. |
| `/v3/…/blast-off/talkthrough` | Talk through a set (CEQ mode) or an exhibit (Exhibit mode). Space starts/stops. Segments are press-to-press. |
| `/v3/…/blast-off/results` | The board the AI built from what you said. Approve, "→ queue", film picks. |
| `/v3/…/blast-off/arrange` | Running order, dark detour cards, **Send to film →**. |
| `Ctrl + I` on any page | **Save for Later** — the centred modal. Say it or type it, categorise if you like, Ctrl+Enter, gone. It lands in the vault for the build machine. |

Rules for the laptop: no Claude Code, no `/admin/ideas`, no exhibit builds.
If something is wrong or missing, **Ctrl+I it** and keep filming. The idea is
now the build machine's problem.

## King — ideas from anywhere, updates by email

Ctrl+I works on **every page of the site** for anyone who knows the password.
The first time on a device the modal asks for it (and whether you are Lee or
King); after that the device is remembered and it never asks again. Students
never see a pill — it only appears once a device is unlocked. King's ideas
land in the same vault, tagged `by: king`, captured from the page he was on.

**Don't make me think.** Say it, Save, done — "Nice! Thanks for helping
improve Survive." AI then titles it, writes the TLDR and summary, files it in a
category (unless you picked one), names the Claude Code session it belongs to,
and drafts the prompt — all in the background, about three cents an idea.
**Save draft** keeps unfinished words; Ctrl+I shows your drafts to continue.
**Preview →** (optional) shows the drafted prompt as folded sections — TLDR,
Summary, Prompt (editable; paste one back if you fixed it elsewhere), Testing
checklist — with **↻ Regenerate** that keeps your edits. Sending a summary to
King/Lee lives on `/admin/ideas`, not in the modal.

**The Idea Bank (`/admin/ideas`).** Pills with counts — All, each category,
🔥 Urgent, ✎ Drafts, ☐ To-dos. Urgent is pinned to the top whatever the sort;
**mark urgent** on any idea texts Lee. A row shows the AI title and TLDR; open
it for the summary, the transcript folded under "in their words", and the
**Prompt** in an editable box with Copy — that box is what goes into Claude
Code. **↑ Upload a prompt** saves the file at once and AI names and files it.
**Prioritize →** suggests an order for the week you describe; drag the rows,
**Save this order**, and the bank and Obsidian's index both follow it.

- In his modal the checkbox says **Send summary to Lee**. Ticked, Lee gets the
  TLDR · summary · prompt · testing checklist by email (the prompt is drafted
  first if there is none).
- In Lee's modal it says **Send summary to King** — that is how King gets
  updates on what is being built, without the scattered email thread.
- On `/admin/ideas` every idea has **✉ Send summary to …** for the same thing
  after the fact, and shows who it was last sent to.

## This PC — Obsidian is the build queue

The wall between the machines is Obsidian. Ideas accumulate in the app;
this PC mirrors them into the vault and works them there.

| Where | For |
| --- | --- |
| `scripts\obsidian-watch.cmd` (double-click, or a shortcut in Startup) | **Keeps it all in step**, every 5 minutes, and names/files anything AI missed. Close the window to stop. |
| `bun run obsidian:sync` (repo root) | One pass by hand. Mirrors every idea into `Obsidian Vault/Survive/Ideas/` — one note each, plus `_Queue.md`, the index. Two-way on `status:`. |
| `bun run obsidian:sync -- --import=<file.txt>` | Notes dictated elsewhere → one idea in the bank (add `--organize --draft` to name, file and draft it in the same run). |
| Every note's frontmatter | `project:` (the plain name of the Claude Code session to use — Filming & talkthrough, Growth & outreach, Exhibits, Idea Bank & Obsidian, Learn & share links, Homepage), `page:` (the screen it is about, in words), `worktree:` for when git matters, and `tags:` so Obsidian's tag pane filters by `#project/…`, `#page/…`, `#cat/…`, `#urgent`. |
| `_Queue.md` | 🔥 Urgent, then open ideas in order, then the same ideas **by project**, **by page**, **by category**; Submitted / Approved / Parked at the bottom. |
| `bun run obsidian:sync -- --draft` | Same, and drafts a prompt for every idea that has none (AI; costs money, so it is a flag). |
| Each note | Frontmatter (`status`, `reviewed`, categories, source), the idea verbatim, then **Summary**, **Prompt**, **Testing checklist**. |
| `_Queue.md` | The board: Ideas → Drafted → Submitted → Approved → Parked. Rewritten every sync; edit the notes, not this. |
| `/admin/ideas` (either machine) | Still works: the same vault, **✨ Draft prompt with AI**, **Copy prompt**. Use it when Obsidian is not to hand. |
| Claude Code (this repo) | Builds from the prompts. Pushes go to main → Vercel → the laptop sees it on the next reload. |

Working an idea, in Obsidian: open the note → read **Prompt** → paste into
Claude Code → after the deploy, tick the **Testing checklist** on the laptop →
set `status: SUBMITTED` (in flight) / `APPROVED` (shipped) / `PARKED` (shelved)
and `reviewed: true` → next sync carries the status to the app.

The sync never overwrites a note you edited. The one rewrite is when a note
was waiting for its prompt and the prompt lands, and even then your
frontmatter is kept. Nothing is deleted anywhere; PARKED is the archive.

Later, the same vault is where the accounting automations, reports and the
important business documents go — `Survive/` is the first folder, not the
only one.

## The build queue — the laptop in a closet

Bank → review in the Idea Bank → tick the ones to build → **⚙ Add to build
queue** with a priority (urgent · high · medium · low). Nothing else to do;
this PC does the rest, unattended, one at a time in priority order:

1. `scripts\build-queue-watch.cmd` (double-click, or a Startup shortcut)
   polls the bank every 3 minutes for armed ideas.
2. Each one gets a fresh worktree on a fresh branch `queue/<name>` off main,
   `bun install`, and Claude Code headless (`claude -p`) builds it under the
   house rules — additive only, never main, no migrations run, no weakened
   tests, protected zones off limits, fail loud.
3. It commits, the runner pushes the **branch** (never main), Vercel builds a
   preview, and the runner reads the preview URL back from GitHub.
4. The builder's closing **TESTING CHECKLIST** — plain-English checks, each
   with the route it happens on — is written back with full preview links,
   onto the idea (Idea Bank → "✅ Built — test these") and into Obsidian
   (`_Queue.md`, and the idea's note under "Built — test it").
5. You test from the checklist at the end of the day (or a VA does), tick
   **reviewed** in Obsidian or the bank, and merge the branch when it's good.
   Merging is still a person's call.

Setup once on this PC: `npm i -g @anthropic-ai/claude-code`, then run
`claude` in a terminal and `/login`. A failed build marks the idea BUILD
FAILED with the reason and moves on; fix the prompt and re-queue.

## Terry — the to-do count

A Ctrl+I note that is a **to-do**, not a build idea: click **Work to-do** or
**Personal to-do**, or just say "put this on my to-do list" (and "personal" if
it is). It never enters the build queue. The sync collects them in
`Obsidian Vault/Terry/Todos.md`: each one summarised once by AI into a single
checkbox line, grouped by category, then again by date.

- Tick a box → next sync marks it done in the app (and it moves to **Done**).
- Move a line under another heading, or add a heading (a new category) →
  next sync learns it.
- Ask a Claude Code session on this PC to "organise my to-dos" or "add a
  category X and move these there": it edits `Terry/Todos.md` directly and
  the sync carries the result back. The vault is local files; nothing stops it.

Terry the character (the SMS line for Lee and his wife, money, dates, the
dashboard) is saved for later as a prompt: `Terry/Terry — the prompt (later).md`.

## The loop

```
laptop: film ─▶ notice something ─▶ Ctrl+I ─▶ keep filming
                                        │  (app vault, Supabase)
this PC: bun run obsidian:sync ─▶ Obsidian note (summary · prompt · checklist)
                                        │
this PC: Claude Code ─▶ push main ─▶ Vercel
                                        │
laptop: reload ─▶ tick the checklist ─▶ film
                                        │
this PC: set status in the note ─▶ next sync ─▶ app agrees
```
