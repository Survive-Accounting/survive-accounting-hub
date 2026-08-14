# Frames Rename — Start Here split plan (report a)

*Written from live-DB recon, 2026-08-13 overnight run.*

## What the DB actually holds

**Exactly one scene**: `Start Here Course` (`f103b5cd-8425-4405-baba-31be031bd223`) —
444 nodes, 30 decks. There are no single-set scenes to convert "directly"; the whole
migration is this one split.

| content | count | disposition |
|---|---|---|
| decks (sets) | 30 | each becomes its own set file |
| CEQ cards with `data.deckId` (the 5 ch1–ch5 sets) | 102 | move into their set's file |
| CEQ cards with **no** deckId (legacy tucked orphans: old "Free" sets, "New question" stubs) | 154 | stay in the archive only |
| frames / headings / lists / lessons / ceqtease / text / images | 158 | archive (the old canvas world) |
| memo nodes | 30 | copied into every set file whose card chains reference them (deduped by id on load) |

## ⚠️ Finding: the Exam-1 master seed did NOT persist

A fresh dry-run tonight reports the exact pre-apply diff again: **154 cards to create,
102 to update, 5 set renames pending**. The 24 new deck *definitions* survived, but the
card writes and renames were overwritten afterward — almost certainly an open canvas tab
autosaving stale `nodes_json` over the whole single-row scene. This is precisely the
clobber hazard the per-set split removes.

The overnight permission gate (correctly) blocks unattended service-role writes, so the
re-apply is now a **one-click in-app action**: File ▾ → *Exam 1 master seed…* runs the
dry-run, shows the counts, and applies on confirm. Run it once in the morning, **after**
the split (the seed writes per-set rows fine — it maps deckId → owning row).

## The split (runs in-app, one click, idempotent)

1. New `canvas_scenes` row per deck: `nodes_json = { setFile: true, decks: [deck], nodes: [member cards + chain-referenced memos], edges: [internal edges] }`, `name` = set name.
2. Card/choice/deck/memo **ids are copied verbatim** — clip stacks (`data.takes`), stitch manifests (`ceqManifest` keyed by ceqId), and choice chains all still resolve. `parentId` (old canvas frame membership) is stripped from extracted cards; `deckPos` governs Studio placement and is kept.
3. The legacy row is **renamed** to `Start Here — canvas archive` and marked `archived: true` in its JSON. Nothing in it is deleted; it opens via File ▾ → *Open canvas view — experimental*.
4. Idempotent: decks that already own a set file are skipped; re-running is safe.

## Rollback

The archive row still contains 100% of the pre-split scene. Deleting the set-file rows
and renaming the archive back restores the exact prior state.

## Why cards may appear twice (archive + set file)

The archive keeps its stale copies as part of the snapshot; set files are the live
copies. The archive is labeled and never loaded into the set pool.
