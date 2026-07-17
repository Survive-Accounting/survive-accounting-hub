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
