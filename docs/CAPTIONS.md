# Captions — bake Shorts captions onto a take

Our own caption tool (2026-09-05), instead of the Descript round trip: the same words every time, in the house style, in one command.

## One-time setup (this PC)

1. ffmpeg: in PowerShell run `winget install Gyan.FFmpeg`, then open a new terminal. (Or set `FFMPEG=<path to ffmpeg.exe>`.)
2. The Whisper key: `OPENAI_WHISPER=sk-…` in the repo's `.env` (the same key the studio's transcription uses; `OPENAI_API_KEY` also works). The script reads the repo's `.env` and, failing that, `sa-growth-dashboard/.env`.
3. Rubik Black downloads itself into `scripts/captions-fonts/` on the first burn.

## Use

```bash
bun run captions "C:\path\to\take.mp4"
```

Writes, next to the take: `take.words.json` (Whisper's word timings), `take.ass` (what gets burned), `take.srt` (a sidecar for the upload), and `take.captioned.mp4` (video re-encoded, audio copied untouched).

- `--dry` — build the cards and print them, no burn.
- `--words take.words.json` — reuse the timings (no Whisper call) after editing them.
- `--cam none` (or `--wide`) — no camera on the slide: captions use the whole width.
- `--out other.mp4` — a different output name.

## The style (src/lib/captions.ts)

One or two lines, at most five words on a card, a new card every ~0.7–1.2 s (a sentence end, a comma after three words, a pause over 0.45 s, or the time cap all close a card). Rubik 900 at 4.6 % of the height, white with a navy stroke, no box, the spoken word in gold as it is said (ASS karaoke). Placed on THE FIXED CAPTION RAIL — `CAPTION_RAIL` in `src/components/blastoff/layout.ts`: 35 %–84 % of the width (right of the pass-2 home camera, inside the like/share rail; 7 %–84 % with `--wide` / `--cam none`), the text's bottom edge at 73.5 % of the height — under the hero wordmark, above the campus banner and the Shorts caption zone. The same block draws the dashed reservation on the Review stage and the "captions clear / on the card / under the camera" readout in the /film chrome, so what you see before the take is where the burn lands. Change a number there and all three follow.

## Lip sync

OBS records the mic straight; the in-app webcam adds ~60–120 ms of video delay. Clap once on camera, read the offset, and set it on the mic source in OBS (Advanced Audio Properties → Sync Offset). One-time.
