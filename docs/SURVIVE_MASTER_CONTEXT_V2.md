# SURVIVE — MASTER CONTEXT V2
### Aug 28, 2026 · THE canonical handoff. A new AI session reads THIS FIRST.
### Supersedes: SURVIVE_CONTENT_FACTORY_CONTEXT_V1 (ChatGPT era) and the
### Aug-13 weekend context. Those remain as history; this reconciles them
### with the built system.

## 1. THE DOCUMENT MAP (read in this order)

1. **This file** — state of the world + vocabulary.
2. **SURVIVE_METHOD_v1.md** — Lee's voice, teaching laws, phrase bank,
   franchise recipe. The essence doc; quotes in it are authoritative.
3. **SURVIVE_FRANCHISE_VISION_v1.md** — the long game, roles, phases.
4. **Survive_Content_Production_Manual_v0.2.docx** — production science:
   Blast Off timeline, CEQ authoring SOP, TALK interaction, research
   questions, review checklist.
5. **SURVIVE EXHIBIT PRODUCTION BIBLE v1** — the exhibit laws (rule
   sandwich, ten laws, interaction vocabulary, conveyor).
6. **Survive_Exam1_Master_CEQ_Editorial_Pass_v1.xlsx** — the CEQ bank:
   sheets = Claude Import (machine import; headers: Topic Order, Topic,
   Subtopic Order, Subtopic, Question Text, Choices 1-5, Correct #,
   Question Key, Feedback, Source, Original CEQ ID, Include in Starter
   Map?) · Review (readable) · Production Map (per-set plan) · Original
   Live Bank (pre-edit 280-question snapshot). 25 sets / 274 active CEQs.

## 2. LOCKED VOCABULARY (reconciled Aug 2026 — do not re-litigate)

- **BLAST OFF** — the fast video (formerly "cram blast"/"blast"; Lee's
  final call: "we're calling them blast offs"). **JAM** — practice.
  **VIBE** — the deep review pass (replaces "lookback" as production
  language). **NERD OUT** — 30-90s idea-driven social format.
- Student-facing mode labels during beta stay **Cram / Practice / Full
  Review**; never show students internal names or database scale.
- Codebase note: publication-kind enums may still read `blast|short|
  lookback` — keep enum values, change DISPLAY labels (Blast Off /
  Short / Vibe). Display-layer rename only, like memos→Playbook.
- Still true from the original canon: sets are filmed · topics are sold
  · units are mapped · chapters are displayed; a SET is a strip of
  FRAMES; a RUN is one continuous take; takes are captured · stitches
  are cut · publications are shipped; student-facing counting language
  is topics · questions · video time.
- **Survive Co** is the canonical company in all CEQs (national bank
  stays generic; Oxford businesses are filmed flavor only — list in the
  Method doc).
- **"Meet the panic with a path"** replaces "pandering to the panic."
- Production laws: **QUESTION ORDER IS TEACHING ORDER**; in-set
  sequence Definition → Core → Application → Contrast/trap → Gray
  area/B→A; exhibit is a map, not decoration; AI is a starting point,
  not the teacher of record.
- **FLAVOR PACKS** — local color is a display-layer token system
  ({{LOCAL.RESTAURANT}} etc.) resolved per campus from a campus
  pack (JSON); fallback is always the generic noun. National bank
  stays campus-neutral forever; Survive Co is never flavored; real
  businesses only in neutral/positive scenes; no real people; banks
  stay generic; verified spellings only. Spec:
  SURVIVE_FLAVOR_PACKS_v1.md. Build trigger: campus #2. Pack
  research: King, per the new-campus playbook.

## 3. STATE OF THE BUILD (canvas-v2 · TanStack Start + Supabase +
##    Vercel + Mux + Twilio + Resend + OpenAI Whisper)

THREE Claude Code sessions share one working folder, NO branches, with
standing scope rules (each session has a SESSION-*.md ruleset):
- **Session 1 LANDING**: home page (two-portal "Start Cramming"/"Greek
  Portal" redesign at /preview/home), Greek chapter pages (hero + 3-step
  setup + demo page with DEMO↔ADMIN toggle), shared exam-tab player,
  design tokens. Stripe is in test-mode wiring (checkout deliberately
  not live).
- **Session 2 STUDIO**: film mode (F9/F8/F10 takes loop, capture window
  16:9 + 9:16, slate countdown, coverage auto-attach), Pipeline
  timeline editor (waveform trim, transcript editing via Whisper,
  scratch lane, Recycle), stitch/publication data model, smart stitcher
  (slate trims, room-tone gaps, micro-crossfades), OBS websocket
  bridge, Idea Bank (F7, 7 categories, local-first + Supabase), exhibit
  conveyor. Owns types.ts + migrations + dependencies.
- **Session 3 STUDENT**: /student route (YouTube-grammar watch page,
  feed, Ask Lee with email gate, subscribe capture). Read-only against
  studio data.
- Exhibit conveyor SHIPPED/queued: Accounting Cycle (3 modes: source
  docs/definitions/order-orbit) · Rubric v2 (zoomable A=L+E, T-account
  signs) · Users/Branches ("wall" compare) · Standards & Regulation
  (FASB→GAAP←SEC chain + A+ layer) · Careers (branch map) · Account
  Classification (5 tiles + traps + shared ACCOUNT REGISTRY) ·
  Equation Effects (scenario whiteboard + config validator) · Cash vs
  Accrual (compare+timeline, ships with Adjusting topic).
- Filming rig: A7III → OBS (CQP 16, Hybrid MP4, dual profiles 16:9 +
  9:16 "Survive Vertical"), custom LUTs, film-safe zero-chrome
  Recording Mode. Boss reveal = Ctrl+Alt+Click, 808 + BOSS/FINAL BOSS.
- The business context: Exam 1 free (no account) · Exams 2/3/Final $50
  · Semester Pass $150 · Greek $100/seat 10-seat min · launch cohort
  Ole Miss Fall 2026 (landing page promises Mon Aug 24 content date —
  live) · north star = free→paid conversion, first real read ~Oct 2026
  · leading indicator = practice-attempt rate.

## 4. THE PRODUCTION WORKFLOW (proved by hand, being tooled)

HUMAN BRAINSTORM → AI STARTER → HUMAN FINAL. Lee talks through a set
(dictation is the creative engine); the transcript is captured VERBATIM
and tied to the CEQs he was viewing; AI drafts CEQ-order edits, Blast
Off outline (grouped beats), exhibit prompt, Vibe beats, TALK moments,
Short/Nerd Out candidates with the quoted moment, phrase-bank adds,
accuracy flags; Lee approves/edits/rejects/films. The in-app tool for
this is the TALKTHROUGH BOOTH (build prompt exists; Session 2).

**TRANSCRIPT LAW (non-negotiable, learned the hard way):** raw
dictation transcripts are first-class artifacts, stored verbatim,
forever, tied to their context. Summaries are derived views and never
replace the raw text. No tool that cannot preserve the transcript gets
used for brainstorming again.

## 5. NEAR-TERM EXECUTION ORDER (from the editorial pass; still current)

1. Dry-run `Claude Import` through the existing Exam 1 importer;
   inspect the diff before apply; never deletes.
2. Build the Talkthrough Booth (capture first, AI pass second).
3. Pick ONE topic; produce the full prototype rhythm: exhibit → Blast
   Off → Jam → one Vibe segment → optional TALK. Film it.
4. Beta-test the rhythm before building more tooling; update the
   manual from behavior, not guesses.
5. Keep the landing-page date promise honest; content completeness
   gates campus expansion.

## 6. GUARDRAILS THAT NEVER MOVE

Recording Mode stays zero-chrome · watermark is overlay, never burned ·
local originals never deleted (Recycle only) · no fake numbers anywhere
· accuracy audit before anything student-facing (FASB≠government, state
boards license CPAs, Securities Act 1933 vs Exchange Act 1934, "GAAP-G"
isn't a term) · config, not code · one exhibit per conveyor prompt ·
excellent-and-shipped beats perfect · film > build when in doubt.
