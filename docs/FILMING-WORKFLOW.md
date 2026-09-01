# Filming Workflow — OBS → Canvas → Mux

The frame-by-frame filming loop for the Present Canvas (`/study/canvas`).
Phase-1/2 tooling: Script Editor (modal), Teleprompter (`p`), Take Board
(film-status chips + per-frame upload + inline playback).

## The convention

**One clip per frame.** OBS records everything; each frame's take is its own
recording (stop/start between frames — that's the whole point of the
frame-by-frame method: short takes, instant review, no editing marathon).

**OBS filename:** `SH-L01-F03-T2.mp4`
- `SH` — course initials (Start Here → SH, Intro 1 → I1, IA1 → IA1)
- `L01` — lesson / chapter number, zero-padded
- `F03` — frame number within the lesson (walk order, the F# shown in the
  Script editor)
- `T2` — take number

The filename is for YOUR disk hygiene — the platform does not parse it. On
upload, the canvas stamps Mux `passthrough` itself from the frame's real
position (`SH-L01-hook-f2-t1` style), so the Mux library stays organized even
if a file is misnamed. You never touch asset IDs.

## The loop (drop → upload → review → roll)

1. **Script it.** Toolbar → Script editor. Write entry / beats / exit for the
   lesson's frames in one sitting. Export the course script if you want it on
   a second screen or on paper.
2. **Roll it.** Enter the frame. `p` for the teleprompter (top corner picker
   puts it under the webcam). `v` for film mode. OBS: record. Perform the
   frame with the spacebar. OBS: stop.
3. **Drop it.** Exit film (`Esc`). Drag the OBS file onto the frame (or use
   the upload button on its row in the Script editor). The frame's chip flips
   to **FILMED**; Mux processes in the background.
4. **Review it.** The clapperboard button on the frame opens the Takes panel —
   the latest take plays inline as soon as Mux is ready. Match the energy,
   check the framing, then roll the next frame.
5. **Judge it.** Bad take? Drop another file — takes stack (t1, t2, …), latest
   plays by default. Mark the one that ships with the ⭐ **KEEPER**. Not sure?
   Click the chip to flag **RETAKE** and keep moving; the Script editor is the
   shot list — retakes glow amber there.

## The camera in the capture window (2026-09-01)

The capture window used to have no camera at all: pan and zoom were switched
off so the shot stayed welded to the fitted frame and OBS framing could never
drift. That kept framing exact and made the frame a **cage** — an exhibit had
to be shrunk until it fit a 1080×1920 box, which is unreadable on a phone.

The framing guarantee is still there. It is just **recoverable** instead of
absolute, which means a frame rect is now a *shot the camera returns to*, not
a box the content must fit inside. Content may live outside it.

| | |
| --- | --- |
| **wheel** | zoom |
| **drag** (left or middle) | pan — right stays the context menu |
| **O** | pull back far enough to see everything, including whatever spills outside the frame |
| **`** | re-frame: cuts back to the exact fitted shot (and still sweeps marks) |
| **space / next question** | also cuts back to the fitted shot |
| **L** | pin the question on/off |

**A take can still only ever start from the framed shot**, because ` and every
question change return to it. While you are holding the camera, nothing else
may move it — not a window resize, not focus, not the settle timers.

### The pin

The active question is held still in screen space while the camera flies over
the exhibit underneath it. It is the same card as always — highlighting, the
choice menu, spotlight, text selection and chain arrows all work; only its
painted position changes.

The pin anchors on the **set template** (the Q0 layout), *not* on the
question's own saved geometry. That is deliberate, and it is the fix for "I set
the layout and it doesn't apply to every card": `ceq-geom` resolves
`instance ?? template`, so any question ever nudged by hand outranks the
template forever, and `ignoreLayout` frames opt out permanently. Both are right
for authoring and wrong on camera, where all that matters is the question's top
edge landing in the same place every time. **Pinned, the template governs.**

Nothing is written. The authored geometry is untouched and comes straight back
when the pin is off (`L`) or the popout closes.

The pin **releases when you pull back** past the framed shot — zoomed out you
are reading the map, and a card held at full size would cover it. The editor's
camera HUD says which state you are in.

### The editor mirrors the capture window

While you are flying, the editor previewer follows as a monitor so you can see
where you are without touching it. Capture leads; one writer, so the two panes
can't fight. What crosses over is the canvas *rect* being looked at, not the
viewport numbers — the panes are different sizes, so copying x/y/zoom would
show two different shots.

## Where things live

- **Scripts** — on the frame (scene payload). No DB table.
- **Film status** — on the frame (`unfilmed | filmed | retake`).
- **Takes** — `frame_takes` table (migration 0094): frame id, take number,
  Mux asset/playback ids, passthrough, KEEPER flag. Server-only access.
- **Keepers** — the KEEPER take per frame is the clip the platform will use
  when lessons get assembled; everything else is archive.
- **Mux env** — `MUX_TOKEN_ID` + `MUX_TOKEN_SECRET` (API access token) for
  uploads; `MUX_SIGNING_KEY_ID` + `MUX_SIGNING_PRIVATE_KEY` remain for signed
  playback. Missing upload creds → a red banner names the vars; nothing
  breaks silently.

## Progress at a glance

The Script editor doubles as the take board: per-lesson `scripted N/M` and
`filmed N/M` counters, a status chip + take count + upload button per frame
row. When every row is green, the lesson is in the can.

## Audio + assembly pipeline

The path from per-frame keeper takes to a published lesson. **Decided.**

**1. Record — EQ at the source.** OBS records each frame with the radio-voice EQ
chain baked in *at record time*. This is deliberate: Auphonic can't do
section-based EQ — it's whole-file adaptive processing — so the voice tone has
to be right on the way in, not fixed later.

**2. Stitch the lesson — ffmpeg concat (BUILD THIS).** The Take Board holds the
per-frame clips; "Stitch lesson" concatenates the KEEPER takes **in frame order**
into one lesson file. Because every clip is same-source (same camera, same OBS
settings, one sitting), this is a plain `ffmpeg` concat — instant, no
re-encode, no editor. This is the assembly step to build; there is no editing
marathon.

**3. Loudness — Auphonic.** Run the stitched lesson through Auphonic for loudness
targeting and **cross-location consistency**. This is the real reason to use it:
Lee films at home AND at the office — two different rooms that must sound like
one show. (Not for EQ — see step 1.)

**4. Publish — Mux + manual YouTube.** Push to Mux for the platform. Upload to
YouTube **manually** — keep hands-on control of titles / descriptions /
thumbnails per the searchable-title strategy. **Skip Auphonic auto-publishing.**

### Descript — NOT NEEDED

Descript's core value is extracting clips from footage. Our shorts are
**re-filmed** vertical from the scene, not cut from the horizontal take, so
there's nothing to extract. The rest doesn't move the needle for us:

- **Transcripts** come from Mux.
- **Captions** are free on every platform.
- **Filler-word removal** contradicts the one-unedited-take principle.

Revisit only if the re-film approach for shorts ever fails.

---

## Reveal & transition sounds — FILM-AUDIO SAFETY (must read)

The canvas plays three optional cues during a take (film mode only): a per-element
**keypad** on reveal, an **advance swoosh** on every frame advance, and a
**cram-launch** on entering the first Cram frame. They are synthesized CC0 assets
in `public/sfx/` (`keypad.wav`, `swoosh.wav`, `cram-launch.wav`) — regenerate or
swap them with `node scripts/gen-sfx.mjs`. Volumes + a global mute live under the
canvas Settings → **Sounds** (film only; authoring is always silent unless you
drag a volume slider to preview).

**These sounds must NEVER reach the RE20 through room speakers** — they'd bleed
into the voice track and defeat the one-clean-take principle. Route app audio so
the mic never hears it:

- **Headphones only.** Monitor the browser on closed-back headphones. The app
  audio is captured digitally by OBS, not acoustically by the mic.
- **OR a separate OBS track / virtual cable.** Send Chrome/app audio to its own
  OBS audio track (or a virtual cable like VB-Cable) so it's a discrete stem you
  can mix or drop in post — never summed into the mic track, never on speakers.
- Sanity check before a real take: play a frame advance with the mic live and
  confirm the swoosh does **not** appear on the mic track.

Respect accessibility: with `prefers-reduced-motion` set (or Mute all on), every
cue is suppressed.
