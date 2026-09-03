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
