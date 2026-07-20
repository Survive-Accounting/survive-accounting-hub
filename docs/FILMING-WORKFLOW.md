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
