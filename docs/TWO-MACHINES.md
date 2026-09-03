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

**Preview before saving.** Type or dictate, then **Preview →**: the prompt is
drafted (nothing saved yet) and shown as folded sections — TLDR, Summary,
Prompt (editable; paste one back if you fixed it elsewhere), Testing
checklist, and the email exactly as the other person will see it. Then
**↻ Regenerate** (it keeps your edits), **Save**, or **Save & send to …**.
Plain **Save** without previewing still works and is still ten seconds.

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
| `bun run obsidian:sync` (repo root) | Mirrors every idea into `Obsidian Vault/Survive/Ideas/` — one note each, plus `_Queue.md`, the index. Pushes a `status:` you changed in a note back to the app. |
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
