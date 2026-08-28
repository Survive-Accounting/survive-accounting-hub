# THE TALKTHROUGH BOOTH — talk through a set, get the starting points
### SESSION 2 (STUDIO). Standing rules apply. Two phases in this prompt:
### Phase 1 (capture) then Phase 2 (AI pass). Phase 3 (phrase wall) is
### optional-after-core. Log plans/decisions to BUILD-NOTES.md and
### proceed — don't stall waiting for approval.

`git commit -m "checkpoint: before talkthrough-booth"`

```
Build the production tool Lee has been running by hand: open a set,
talk freely about it, and let the system capture everything, tie it to
context, and draft the starting points in the background. The prime
directive comes from a hard lesson: RAW TRANSCRIPTS ARE FIRST-CLASS
ARTIFACTS. Verbatim, forever, tied to context. Summaries are derived
views that never replace them.

RESEARCH FIRST (log to BUILD-NOTES.md, then proceed): inspect and reuse
— the Whisper transcription pipeline (takes), the Idea Bank's
local-first/never-lose persistence pattern, the coverage-hint pattern
from the film loop (tracking which CEQ is in focus), set/CEQ data
access, the exhibit conveyor + Production Bible, and whatever LLM API
credentials already exist in the environment (Whisper implies OpenAI;
abstract generation behind one small module using whatever key is
already configured — add no new providers).

## PHASE 1 — CAPTURE (the part that must be bulletproof)

1. NEW VIEW: "Talkthrough" — enter from a set. Layout:
   - LEFT: the set's CEQ list in teaching order (from current data).
     Clicking a CEQ focuses it (spotlight styling). Lee will click
     through as he talks.
   - CENTER: the focused CEQ (stem + choices + feedback text), large.
   - RIGHT: the PROMPTER CARD + session controls.
2. DICTATION: one press to start talking.
   - LIVE display: use the browser SpeechRecognition API for instant
     Speechnotes-style feedback if available.
   - CANONICAL transcript: record audio and run the existing Whisper
     pipeline on it in the background (chunked on natural pauses so
     text lands within seconds). The Whisper text is the stored truth;
     the live display is just feedback. If SpeechRecognition is
     unavailable, chunked Whisper alone is acceptable.
3. CONTEXT ANCHORING: every transcript segment is stamped with
   {set, focusedCeqId (nullable — "general set talk"), timestamp}.
   Reuse the coverage-hint mental model: what was focused while Lee
   spoke is what the words are about. Clicking through CEQs while
   talking must never interrupt recording.
4. MOMENT TAGS: six large tap-targets on the prompter card that stamp
   the timeline at the moment tapped:
     SHORT · NERD OUT · EXHIBIT IDEA · PHRASE · TALK MOMENT · KEY
   (Also: the Phase-2 AI pass should detect spoken cues like "this
   would be a good short" and propose tags Lee didn't tap.)
5. PROMPTER CARD (rotating nudges, subtle, never blocking):
     What's tricky here? · What's interesting? · Real-world example? ·
     How does this connect to NOW? · What's funny about it? · Why is
     this on the exam? · What's the pattern? · What's the trick/cheat
     code? · Where should a student TALK back? · Short? Nerd Out? ·
     What order should these really go in?
   A shuffle control; keyboard-free operation while dictating.
6. PERSISTENCE: identical guarantees to the Idea Bank fix — local-first
   write, background Supabase sync, visible unsynced indicator, retry
   on reconnect, soft-delete only, survives hard refresh mid-session.
   Test exactly like the Idea Bank: write → hard refresh → still there;
   offline → queue → reconnect → synced.
7. SESSIONS: a talkthrough session per set per sitting; sessions list
   with date/duration/segment count; reopenable; transcript readable
   in full (verbatim view is the default view).

## PHASE 2 — THE AI PASS ("push the button")

1. A "Draft the starting points" button on a session (and auto-offer
   when a session ends). Runs in the BACKGROUND — Lee keeps working.
2. Inputs to the generation call: the verbatim transcript with segment
   anchors + the set's current CEQs in order + THE SURVIVE METHOD doc +
   the Production Manual's Blast Off structure + the Exhibit Bible's
   interaction vocabulary. (Store these reference docs where the
   backend can read them; they ship in the repo /docs or Supabase —
   your call, log it.)
3. OUTPUT — a structured DRAFT BOARD stored per session:
   - CEQ ORDER: proposed resequencing + wording flags, each tied to
     the transcript segment that motivated it
   - BLAST OFF OUTLINE: grouped beats (never question-by-question),
     with which CEQs each beat covers and the exhibit moment
   - EXHIBIT: a draft Claude Code prompt in the conveyor format
     (bible-compliant), with a one-paragraph summary + COPY button
     (no direct orchestration — copy/paste is the V1 integration)
   - VIBE BEATS: the deeper-pass list (gray areas, why-questions,
     TALK moment candidates with suggested prompt copy)
   - SHORTS / NERD OUTS: candidates, each quoting the verbatim moment
     that earned it and naming which format it fits
   - PHRASE CANDIDATES: new phrase-bank entries detected
   - ACCURACY FLAGS: anything Lee said that needs verification before
     it reaches students
4. TWO VIEWS of the board: per-CEQ (click a question → everything
   about it) and the INDEX (one summary page per session — the prep
   sheet Lee films from).
5. THE CONVERSATION LOOP: every board item accepts a comment; item-
   level "Regenerate with my notes" re-runs just that item including
   Lee's comments + the original transcript context. Board items carry
   status: SUGGESTED → ACCEPTED / EDITED / REJECTED, plus BUILT (for
   exhibits) and FILMED (for outlines). Nothing auto-applies to the
   real CEQ bank — the board is a staging area; Lee's hands make the
   actual edits (AI is a starting point, not the teacher of record).
6. Failure handling: generation errors surface visibly and are
   retryable; a failed pass never touches the transcript.

## PHASE 3 (OPTIONAL — only if Phases 1-2 are solid): THE DOODLE WALL

Ambient background surface for the Booth: near-black canvas, gold
handwritten-style rendering of phrase-bank entries (seed list lives in
SURVIVE_METHOD_v1.md; new PHRASE-tagged captures flow in). Shuffle
button; bigger = more important (Lee marks favorites); click a phrase
→ pop-out with its meaning/first use. A simple A-Z glossary index
view. Keep it decorative-calm — it hypes Lee, it must not distract
from the CEQ center stage. If time is short, ship Phases 1-2 and log
Phase 3 as next.

## GUARDRAILS

Studio scope only; no student-facing changes; no edits to the live CEQ
bank from this tool in V1; transcripts never auto-summarized in place;
no new heavyweight dependencies without logging why; film-mode and
existing studio surfaces untouched. Commit by explicit path; never
git add -A.

## ACCEPTANCE

Open a set → talk for 3+ minutes while clicking through 5 CEQs and
tapping 3 moment tags → hard-refresh mid-session (nothing lost) → end
session → run the AI pass → board renders with all seven output types,
each traceable to a verbatim quote → comment on one item and
regenerate it → copy the exhibit prompt → mark one item ACCEPTED and
one REJECTED → reopen the session tomorrow-equivalent (new browser
session) and confirm transcript + board are intact and verbatim.
```
