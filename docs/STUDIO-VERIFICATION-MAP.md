# CEQ Studio — Verification Map (7-prompt batch, 2026-07-29)

**Scope:** commits `239e0e0` (topics spine) → `6934360` (unified tabs) → `4abbae7` (memo
speed) → `40b8d81` (Question 0) → `febf626` (bulk ops) → `f213694` (batch ingest) →
`57b17fc` (publish combo). The whole batch touched exactly five files: `CeqStudio.tsx`,
`CeqPreviewer.tsx`, `CeqVideoLibrary.tsx`, `ceq-takes.ts`, `types.ts` — and **zero test
files**.

**How this was produced:** overnight READ-ONLY audit — 10 agents traced each commit's
diff against HEAD, grepped for leftovers, and verified protected zones with git
evidence. Nothing was fixed; every risk below is written as a finding with the exact
click-path to confirm or clear it. The three highest-stakes claims (checks 1, 2, 9)
were independently re-verified against the code at HEAD before this file was written.

**Blast radius legend:**
- 🔴 **DATA** — breakage writes bad deck/scene/take metadata (may be silent, may lack undo)
- 🟠 **PUBLISH** — breakage yields a wrong published video or wrong lesson attachment
- 🟡 **UI-STATE** — wrong but recoverable UI; no data harm
- ⚪ **COSMETIC** — looks off

---

## §1 Morning checklist — ordered by blast radius

Do these in order. Each check: **DO** (the clicks) → **PASS** → **FAIL** (what breakage
looks like). Full mechanics for every check are in §2.

### 🔴 Data-touching — do these first

**☐ 1. Q0 slot wipe on ordinary drags** *(Question 0 — the likeliest real data loss; verified in code)*
DO: Open a set → `0 · Layout` → `+ slot` twice (badge reads 4 slots) → open a question with NO ⛓ chain badge → drag its CEQ card a few px → look at the `0 · Layout` badge.
PASS: Badge still `4 slots`; reopening Q0 shows all four Slot placeholders where you sculpted them.
FAIL: Badge drops to `0 slots` (or the question's chain count) — the auto-persist rebuilt `memoSlots` from the active question's chain (`saveBaseline`, CeqPreviewer.tsx:507-512) and **wiped your sculpting with no undo** (deck writes bypass the command bus). Until fixed: sculpt Q0 LAST, or only after every question has full chains.

**☐ 2. Stale bulk selection across set tabs** *(bulk ops; verified in code — `qSel` is only cleared by Esc/✕)*
DO: In set A check 2 question rows (bar shows "2 sel") → click set B's tab → look at the bar. If it still says "2 sel", click ★ and read the note, then go back to set A.
PASS: Switching sets clears the selection; bulk buttons in B only ever touch B's checked rows.
FAIL: Bar still armed in B with no visible checked rows; ★ says "Starred 2" while nothing on screen changes — it starred set A's questions. Same invisible path lets **F silently change set A's Free cut** and **✂ strip set A's clip stacks**. One Ctrl+Z recovers each action — if you notice. Habit until fixed: press **Esc before switching tabs**.

**☐ 3. Batch ingest — duplicate/cross-topic filename reroute**
DO: Drop `q2.mp4` AND `q2 retake.mp4` together on the ⬇ batch-takes zone; read both dropdowns in the confirm table BEFORE confirming. Then cancel and drop one file named `9.03.mp4` into a set that is not topic 9.
PASS: Both q2 files point at Q2 (or the loser shows "— skip (no match) —"); the cross-topic file is skipped or obviously wrong.
FAIL: `q2 retake.mp4` claims Q2 (it sorts first) and `q2.mp4` silently falls back **by deck order** onto some unrelated clip-less question, looking like a normal match; `9.03.mp4` confidently targets Q3 of the wrong topic (the topic digit is discarded). Confirming attaches real clips to wrong questions. **Read every dropdown before confirming.**

**☐ 4. Batch ingest — default is base-REPLACE (opposite of single-drop), and refs are lost**
DO: Pick a question with base + 1 lookback (and refs set on the base if you have one). Batch-drop one matching clip, leave the chip on "base", upload, then open the clip stack + the base's 📎 refs picker.
PASS: Stack still 2 clips — new base first (old base is its prev), lookback untouched in slot 2.
FAIL: Lookback gone/reordered = surgery broke. **Known silent loss even on PASS: the new base's refs picker is empty** — the replaced base's 📎 refs don't survive (only immediate Ctrl+Z restores them). And remember: a lookback-session batch left on default "base" **replaces every base clip** instead of appending — toggle LB per row.

**☐ 5. Batch ingest — late duration-fill re-arms the upload button**
DO: Drop 2-3 short clips and click "upload N" IMMEDIATELY while any duration still shows "…". Let the ✓s appear, keep the table open, watch ~8 more seconds.
PASS: ✓s stay green, durations fill beside them, button stays disabled.
FAIL: Around the 8s mark the ✓s revert to pending and the button re-arms "upload N" — clicking again **duplicates every clip** (lookbacks get the clip twice; bases re-stage with the minutes-old base shoved into prev). Until fixed: after ✓s appear, close the table and don't re-click.

**☐ 6. Single-click rename can overwrite a long memo's title with its clipped label**
DO: Quick-add a >40-char memo → click its label ONCE in the library (input opens prefilled with the "…" version) → click anywhere else to blur → find the memo node on canvas.
PASS: Click-in/click-out leaves the title untouched.
FAIL: The canvas memo now shows the truncated "…" text — blur committed the clipped prefill over the full title (commitEditMemo has no changed-value check). Ctrl+Z restores. Until fixed: don't click labels of quick-added long memos except to actually rename.

**☐ 7. Q0 layout card accepts memo drops → scene debris**
DO: In `0 · Layout`, drag a library memo onto "Answer choice A" of the dashed LAYOUT card → read the toast → check the memo's ×N count → Ctrl+Z once.
PASS: Drop rejected (no toast / explicit refusal); Ctrl+Z undoes your previous real action.
FAIL: Toast claims "Attached … to choice" but no chain appears anywhere and ×N is unchanged — a **dangling edge targeting `__layout0__`** just entered scene JSON (autosave pollution) and Ctrl+Z's first step is a phantom "chain arrow".

**☐ 8. Template stamp is choice-INDEX-keyed**
DO: Capture a template from a question whose chain rides its correct choice → select 2-3 chainless questions whose correct answers are DIFFERENT letters → stamp via the bar's template dropdown → then, same selection, click 💿 last → Ctrl+Z once.
PASS: Chains land on each target's own correct choice; 💿 reports 0 skipped; memos carry a category icon; ONE Ctrl+Z removes everything (chains + minted memos + arrows).
FAIL: Chains sit on the template's source letter regardless of the target's correct answer — 💿 immediately betrays it with "N skipped (no correct-choice chain)". Also expected: stamped memos are **category-less** (no icon, unfiled in the library) — the bulk path skips the category the single-memo path sets.

### 🟠 Publish-affecting

**☐ 9. Publish attach targeting — seeded sets attach to the WRONG lesson** *(verified in code)*
DO: Pick a seeded set (they have no linked lessonId) → Publish Free → read the header note (it names the lesson it attached to + the passthrough) → check the Videos tab.
PASS: Attached to the intended topic's FREE CEQ lesson; passthrough starts with a real course name; video files under its topic.
FAIL: The note names a **different lesson — typically the first FREE CEQ lesson in the scene** (targetLesson's `(!topic || …)` clause matches scene-wide when the deck has no lessonId, CeqStudio.tsx:551-556), **superseding that lesson's existing video**; and/or passthrough starts with `Foundations/` so the video lands under "Unfiled" in the Videos tab (the migration maps the SET to Start Here/Ch N but deliberately never rewrites `deck.course`). Assigning a set's topic in the outline does **not** fix targeting — publish never reads `deck.topicId` for the attach.

**☐ 10. Combo preflight never checks the attach target (and Full has NO fallback)**
DO: On a set whose topic has no PAID CEQ lesson (or no linked lesson at all) → Publish → ⚡ Publish Free + Full → just read the checklist.
PASS: A ✗ row blocks confirm when there's nothing to attach to.
FAIL: All six rows green and confirm enabled even though the Full leg will publish a Mux asset that attaches to **no lesson** — publishStitch returns `true` with only a note ("no PAID CEQ lesson found to attach to"), so the combo row still shows ✓. Also: the Full leg's first status note **overwrites** the Free leg's terminal note (single `note` string), destroying Free's "old Mux asset — delete manually" reminder.

**☐ 11. Lookback drop zone sits directly above Wrap — a low drop publishes the vertical into BOTH cuts**
DO: Publish panel → note the Wrap count and the ~runtime chips → drag the vertical onto LOOKBACK → re-check both, then open the stitch preview list.
PASS: File under Lookback (name/duration/download), "Attached lookback", Wrap count and runtimes unchanged, no new "Wrap N" item in the preview.
FAIL: Wrap count bumps, runtime grows, preview shows an extra Wrap item — the 9:16 file will play before the outro in **both** Free and Full, and the combo preflight has **no wrap check** to catch it.

**☐ 12. Quick-add memos film with a 40-char clipped label**
DO: Quick-add a >40-char tip → drag it from the Recent strip onto a choice → Enter-walk to reveal.
PASS: The revealed memo card shows the full sentence.
FAIL: Card cuts off at 40 chars with a literal "…" — identically in film (drag-to-chain snapshots the clipped `label`, not the full `title`). The +💡 modal path does NOT clip — the two create paths diverge at 41 chars. Renaming in the library does not fix an already-chained label; only the chain-editor rename does.

**☐ 13. ⇄ swap-prev round-trip (this array IS what publish stitches)**
DO: Select one question with a prev-bearing clip and one dropped only once → ⇄ prev → check filename/duration/📎 refs + the runtime chips → ⇄ prev again.
PASS: Swap 1: old filename/duration show, chips shift, once-dropped question untouched ("Swapped … on 1 question"). Swap 2: filename, duration AND refs all back, chips restored. Ctrl+Z after one swap does the same — including on a legacy single-`take` question (keeps exactly one clip).
FAIL: Refs gone after the round-trip, values don't return, the untouched question changed, or a legacy-take question shows zero clips — the takes[] the stitch concatenates is corrupted.

### 🟡 UI-state (recoverable)

**☐ 14. Migration latch: seeding while the Studio is open lands sets in Library, publish-locked**
DO: With the Studio open, delete one seeded set → "seed Ch 1-5" → watch where it reappears → close + reopen the Studio.
PASS: Recreated set files under Start Here/Ch N immediately (or after reopen, with the migration note firing exactly once).
FAIL: Set sits in "Library (unassigned)" with the publish explainer despite valid tags, until a Studio close/reopen re-runs the one-shot migration (`migratedRef` latches for the mount). Fails CLOSED — annoying, not corrupting. **Worse variant to watch:** the migration note firing on EVERY reopen or remapping already-assigned sets = broken undefined-guard = real churn.

**☐ 15. Course-fetch failure hides exactly the Library/unmigrated sets**
DO: Put one set in Library → DevTools Network → block the `courses?select=` request → hard reload → open Sets tab (unblock after).
PASS: The red flat-list fallback shows ALL sets, Library ones included.
FAIL: The banner shows but Library/unmigrated sets are missing entirely (fallback filters `!!d.topicId`) — header count disagrees with rendered rows. Data intact; do NOT recreate "missing" sets — that mints real duplicates.

**☐ 16. I/O/W readiness chip opens the FIRST set of the topic, not the gappy one**
DO: Topics tab → a two-set topic showing I✗ or O✗ → click the chip → read the panel title + Intro/Outro rows.
PASS: Panel opens on the set actually missing the clip.
FAIL: Panel titled with the topic's first set showing Intro ✓ while the gap is in the sibling — dropping a clip here edits the wrong DeckDef and the chip stays ✗. (The ✂ chip picks its target correctly; only I/O/W is hardcoded to `tDecks[0]`.)

**☐ 17. ▶ published chip / Videos filing — string round-trip**
DO: Topics tab → a topic you KNOW has a live published video → check its ▶ chip, then find the video in the Videos tab.
PASS: ▶ N green, video under its Course → Topic group.
FAIL: ▶ 0 on a published topic and the video under "Unfiled" — the lesson's free-text `topic` string wins over the spine tag at publish time and pre-batch videos carry pre-spine strings neither matcher parses. Display only.

**☐ 18. Quick-add can be created-but-invisible under filters**
DO: Toggle the OTHER TIPS category chip OFF → quick-add "test tip" → Enter.
PASS: New memo appears at the top of the main list AND the Recent strip.
FAIL: Toast + count + Recent strip only; main list omits it (justCreated bypasses only the SCOPE filter, not category/search/course filters) — pressing Enter again mints a duplicate. Same with leftover search text.

**☐ 19. Overview right-click "Add memo here" — coordinate math**
DO: Set with 3+ questions → select the LAST → Overview → fit all → right-click beside the FIRST question's frame → add "coord test" → close Studio, look for the node on canvas.
PASS: Node sits near where you clicked.
FAIL: Node stranded thousands of px above origin (negative y) — the click had the ACTIVE frame's stack offset subtracted regardless of which frame you clicked near. Recoverable via the library.

**☐ 20. Combo status resurrects under the wrong set tab**
DO: Confirm a combo on set A → within ~5s click set B's tab (overlay stays open) → wait for the Free leg to finish.
PASS: Status stays bound to set A, or the switch visibly cancels; B never displays A's progress.
FAIL: The box vanishes on switch (state cleared) then **reappears under set B** claiming "Free ✓ / Full publishing…" — the run itself still writes set A's data (closures), only the attribution lies. Don't switch tabs mid-combo.

**☐ 21. Combo blocked where the single buttons work (preset-provided intro/outro)**
DO: Set with clips but no local AND no global intro → ⚡ combo.
PASS: Gates match publishStitch (intro/outro informational, or single buttons enforce the same).
FAIL: "Intro resolved ✗" greys out confirm while "Publish Free" directly above runs fine (publishStitch has no intro/outro guard and even strips them when the Auphonic preset owns those slots) — a false BLOCK, not a false green.

---

## §2 Seam traces per build

Full mechanics with file:line refs (all verified against HEAD `57b17fc`). Checks in §1
reference these.

### P1 — Topics spine (`239e0e0`)
1. **Attach targeting ignores the spine** → check 9. `targetLesson` (CeqStudio.tsx:551-556) resolves via `deck.lessonId` → that lesson's free-text `topic`, then `(!topic || ld.topic === topic)` — undefined topic matches the first CEQ lesson of the access scene-wide; publish overwrites its mux fields (:603). Passthrough strings come from legacy `deck.course` (:574), which the migration deliberately never rewrites (:174-184), so seed sets publish `Foundations/...` → Unfiled.
2. **One-shot migration latch** → check 14. `migratedRef` latches on first eligible run (:167-172); decks seeded later in the same mount stay `courseId: undefined` = Library everywhere (`!d.topicId` at :202, panel gate :1589, publish guard :564). Self-heals on Studio reopen. Fails closed — no publish path bypasses the gate (combo runs through publishStitch, confirm gated at :1611).
3. **Fetch-failure fallback drops Library sets** → check 15. Error branch renders `cardDecks.filter(d => !!d.topicId)` (:1362) and the Library section is gated `!isError` (:1401) — both null and undefined topicId vanish.

### P2 — Unified tabs + Publish panel (`6934360`)
1. **Lookback↔Wrap adjacency** → check 11. `dropSlot("lookback")` writes only `DeckDef.lookback` (:439, never stitched — buildStitch has no lookback input), but the Wrap zone 40px below APPENDS silently (:438) into `deck.wrap`, which feeds BOTH cuts (:274-275); comboChecks (:612-619) never inspects wrap.
2. **I/O/W chip target** → check 16. Chip aggregates AND across all topic decks (:1317-1319) but onClick is hardcoded `openSetTab(tDecks[0].id)` (:1332). Seeds create two sets per topic, so ~half the time it's the wrong one.
3. **Published-video round-trip** → check 17. `videoChapter = ld?.topic || deck.chapter` (:575) — lesson free-text wins; vidTopicMatch needs "Ch N" or exact chapter name (CeqVideoLibrary.tsx:27-31).
   *Relocation itself checked out: every SET CLIPS helper (dropSlot/toggleGlobal/clearSlotLocal/removeWrapClip/dragProps) is live in the panel (:1638-1688) — nothing was lost in the move.*

### P3 — Memo speed pass (`4abbae7`)
1. **40-char clip baked into chains** → check 12. `quickAddMemo` sets `label = clip(text, 40)` (:1190); `attachMemoToChoice` snapshots `md.label` into the chain item (:1215); previewer renders the chain label (CeqPreviewer.tsx:260). The +💡 modal path uses the unclipped text — paths diverge.
2. **Blur-commit rename** → check 6. Single-click opens edit prefilled with the clipped `m.label` (:1820); blur commits unconditionally (:1818 → :1178) patching `{title: label, label}` — no changed-value check.
3. **Filter-invisible quick-adds** → check 18. `justCreated` is consulted only by `inScope` (:819); catFilter/courseFilter/search (:824-826) have no bypass.
   *The "/" handler guard checked out — it does not steal focus from inputs/selects.*

### P3.5 — Question 0 (`40b8d81`)
1. **Slot wipe** → check 1 (the batch's worst). `saveBaseline` does `const memoSlots = []` then fills one entry per `walk` item (CeqPreviewer.tsx:507-512); `commitGeom` fires on EVERY drag-stop/resize-end in both RFs (:672, :687, :825); CeqStudio replaces `layout` wholesale (:1700). Chain-less question + any nudge = sculpted slots gone; new sets ship with a 2-slot default (:304) so it fires day one. No undo (setDecks bypasses the bus).
2. **Layout-card drop debris** → check 7. Choice drop targets aren't layout-gated (CeqPreviewer.tsx:203; fake ids `__l-a..e` at :63-66); `onAttachMemo` guards only `if (qId)` while `onAddMemoAtChoice` correctly checks `qId !== LAYOUT_Q0` (CeqStudio.tsx:1700). Result: `addNodesAndEdgesCmd` appends an edge targeting nonexistent `__layout0__` (commands.ts:150-166 has no validation); chain patch no-ops silently; toast lies.
3. **Overview coordinate math** → check 19. `onPaneContextMenu` (CeqPreviewer.tsx:706) always subtracts `activeYOff` — only correct inside the ACTIVE frame.
   *Confirmed safe: Q0 can't enter qSel (no checkbox; `questions` holds only real ceq nodes), can't stitch/deal, and Ctrl+D/Ctrl+V are guarded.*

### P4 — Bulk ops (`febf626`)
1. **Stale qSel across sets** → check 2. Cleared only by Esc (:1095) and ✕ (:1497); set switches call `setQId(null)` but never `setQSel`; bar renders on `qSel.size > 0` (:1480); `bulkPatchQ` resolves ids scene-wide via `rf.getNode` (:678) — all sets share one scene.
2. **⇄ swap-prev integrity** → check 13. The transform (:695-703) looks correct (refs preserved slot-level, prev round-trips, patchDataCmd snapshots for undo) — but it rewrites the exact array publish stitches, and force-migrates legacy `take`→`takes[]`, so it earns a firsthand round-trip.
3. **Template stamping** → check 8. `tpl.slots[ci]` is positional (:731-732) — chains land on the captured LETTER, not the target's correct choice; minted memos omit `category` (:737) unlike `createMemoChained` (:1124); the "skipped" count also absorbs stale cross-set ids from finding 1.
   *Undo grouping VERIFIED at the code level: every action is one `compositeCmd` → one `bus.dispatch` — but see §5: `compositeCmd` itself has zero tests.*

### P5 — Batch ingest (`f213694`)
1. **Matching reroutes** → check 3. `(\d+)\.(\d{1,2})` returns group 2, topic digit discarded (:463); `q2 retake.mp4` natural-sorts before `q2.mp4` (:476) and the loser falls back by deck order (:484-486) looking like a normal match; `final v1.2.mp4` → Q2. Date-prefixed OBS names are safe; 2-digit prefixes match if the deck has that many questions.
2. **Duration-fill race** → check 5. The reconciling `setIngest` (:489) rebuilds rows from a snapshot captured with status "pending", copying only qId/lookback/include — statuses/errors reset if the fill (up to 8s, ceq-takes.ts:23) resolves after uploads. Retry-skips-done is correct in isolation (:500); this race erases the "done" marks it depends on.
3. **Base-replace semantics** → check 4. `[withPrev(fresh, clips[0]), ...clips.slice(1)]` (:506) preserves lookbacks + one prev, but the old base's `refs` survive nowhere (withPrev spreads only `fresh`); and default `lookback:false` = REPLACE, opposite of single-drop `dropTake` which APPENDS (:417).

### P6 — Publish combo (`57b17fc`)
1. **No attach-target preflight + false green** → check 10. comboChecks (:612-618) never calls `targetLesson`; publishStitch reaches `return true` (:606) with `lessonId === null` (note-only at :605); PAID has no fallback (:555). Plus: single `note` string means the Full leg's first status (:581) destroys the Free leg's terminal note.
2. **No run token** → check 20. combo cleared on close/setId switch (:74-75) but `runCombo`'s setCombo calls (:623-628) are unconditional after each await — a finished Free leg resurrects the status box under whichever set is now open. Data writes stay correct (closures over the original deck); only attribution lies.
3. **Preflight stricter than publish** → check 21. Rows 5-6 hard-require intro/outro (:617-618) but publishStitch has no such guard and even strips preset-owned intro/outro (:584-587, detectAuphonicSlots) — combo dead-blocks a workflow the single buttons handle.

---

## §3 Leftovers (list only — nothing deleted)

| # | Item | Where | Verdict |
|---|------|-------|---------|
| 1 | `reorderQ(id, dir)` — old arrow-reorder, zero call sites (superseded by drag-reorder) | CeqStudio.tsx:667-673 | Trivially safe to delete |
| 2 | `CeqStudioPrefs.videoLibOpen` — old collapsible pane-0 toggle; sole consumer deleted in `6934360` | ceq-takes.ts:105 | Trivially safe |
| 3 | `CeqStudioPrefs.transition/globalIntro/globalOutro` — write-dead; clips live in scene `GlobalClips`; only reader is the one-time localStorage migration seed (study_.canvas.tsx:1315, which uses its own inline type) | ceq-takes.ts:105 | **Needs care**: keys can go, but keep the migration + localStorage values until all machines have re-saved scenes carrying `sceneSettings.globalClips` |
| 4 | Stale header comment claiming prefs still hold transition + global intro/outro | ceq-takes.ts:101-104 | Comment rewrite |
| 5 | Stale DeckDef doc comment ("shared TRANSITION lives in panel prefs") | types.ts:1104-1105 | Comment rewrite |
| 6 | Tombstone comment at old SET CLIPS rail location — the only relocation residue; all helpers live in the panel | CeqStudio.tsx:1579 | Keep one release as signpost, then delete |
| 7 | `Vid.short` hard-coded `false` → "Short Promo" group unreachable | CeqVideoLibrary.tsx:59, :81 | **Deliberate scaffolding** for the shorts pipeline — confirm before stripping |

No dead WRAP-button references (it was only ever the wrapStems toggle, correctly
relabeled), no orphaned dropdown state from the removed course/chapter selects, no
dead CSS from the SET CLIPS move.

## §4 Protected zones — all four untouched

| Zone | Evidence |
|------|----------|
| Frame membership / onNodeDragStop parenting | `git diff --stat 239e0e0^..57b17fc -- src/routes/study_.canvas.tsx` → empty; the one new `parentId` usage in the batch is a read (deriving lessonId), never an assignment; CeqPreviewer's own `onNodeDragStop={commitGeom}` predates the batch (275db74) and is preview-local geometry, not membership |
| Scene serialization internals | scene-io.ts / study_.canvas.tsx / canvas.functions.ts / export.ts all absent from the range; types.ts changes are purely additive optional DeckDef fields — zero schema_version handling touched |
| Command-bus core | commands.ts + commands.test.ts absent from the range; all six new call sites go THROUGH `bus.dispatch` (composite/addNodes/patchData); zero direct `rf.setNodes`/`setEdges` added anywhere in the batch |
| Space-walk core | Same-file evidence as membership (empty diff); no new deal/stackStep/ceqStep call sites (all "deal" hits are UI copy or the pure `dealCentre`/`defaultMemoPos` coordinate helpers); zero `node.hidden` writes added (all diff matches are Tailwind classnames) — hiddenOf ownership intact |

`git diff --name-only 239e0e0^..57b17fc` confirmed: only the five files listed at top.

## §5 Test coverage gaps

**The batch changed zero test files.** The 620-test suite passed throughout because it
never exercises the new code. Per feature:

| Feature | Coverage | The gap |
|---------|----------|---------|
| Topics spine | indirect | updateDeck/addDeck plumbing is tested (deck-defs.test.ts); the **migration matcher, its undefined-guard idempotence, and the Library publish gate have zero tests** — a one-shot data migration with no safety net. **HIGH** |
| Unified tabs | indirect | buildStitch/stitchRuntime are tested; per-deck readiness aggregation, `vidCourseMatch`/`vidTopicMatch` (already exported, trivially table-testable), set-tab restore untested. MODERATE |
| Memo speed | none | All inline UI; failures visible + undoable. LOW-MODERATE |
| Question 0 | none | **`baselineSpot`, `saveBaseline`/`snapshotSlots` (deck.layout = the set's canonical geometry) fully untested** — check 1 shows exactly why that matters. **HIGH** |
| Bulk ops | indirect | patchDataCmd/patchDataFnCmd tested, but **`compositeCmd` itself has ZERO tests** — the entire "one action = one undo" promise rests on an untested primitive; swap/clear transforms untested. **HIGH** |
| Batch ingest | none | **`ingestNumOf`/`matchIngest`/`withPrev`-surgery all untested** — pure functions doing bulk take-array surgery from regex matching; the checklist's checks 3-5 are all consequences. **HIGHEST** |
| Publish combo | indirect | buildStitch missing-detection is tested (the hardest gate's input); comboChecks, run sequencing, and the boolean return untested. MODERATE-HIGH |

**Cheapest high-value tests, if a test pass is commissioned:** `ingestNumOf` +
`matchIngest` table tests · `compositeCmd` do/undo-ordering in commands.test.ts ·
`baselineSpot` · the extracted migration matcher · `comboChecks` asserted against
publishStitch's own gates · `withPrev`/`videosFromDrop` one-liners ·
`vidCourseMatch`/`vidTopicMatch` tables · swap-twice-is-identity for the ⇄ transform.
