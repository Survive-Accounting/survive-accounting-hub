# Loop builder — seamless vertical-short loops

Engineers a vertical short so it **autoplay-loops seamlessly** on TikTok / Reels / Shorts,
where a single play never reveals a bad seam. Two front ends over one pure planner
(`src/loop-builder.ts`): the render-worker **`loop_builder` stage** and a standalone **CLI**.

## The technique

**The music dictates runtime.** The output is exactly one whole number of bars long:

```
bar_length = (60 / BPM) * beats_per_bar
X          = bar_length * bars          # the loop period; the video + audio are exactly X
```

A **fractional bar is the entire failure mode** — it's asserted loudly (bad `bars`/`BPM`/rotation
throw in the planner; the worker/CLI also refuse if the bed or short can't cover X, and verify the
output == X within one frame).

**Audio.** The bed is *rotated* to start at the warp point so the song's own loop point lands at
the video seam: `music[rotation → X] ++ music[0 → rotation]`. Their junction **is** the song's
X→0 loop point → **butt-splice, no crossfade** (a crossfade there smears the groove). The voice
gets an equal-power (qsin) fade-in on its head + fade-out on its tail (≤15 ms) so it loops without
a click — never at the music junction. **Loudness-normalize AFTER assembly** so junction levels
match.

**Video.** Fill 1080×1920 (cover + crop, **no letterbox**), trim to X, **no fade anywhere** (a
tail fade kills the loop). `match_cut` = the loop wrap is a hard cut (first & last shots are the
same framing — author them mid-motion, never resolving to a static frame). Optional `bolt_flash`
composites a 3-frame white blowout straddling the seam (last frame + first two), single encode.

## CLI (local test + `--verify-loop`)

```bash
bun run src/loop-cli.ts \
  --short in.mp4 --bed music.mp3 --out loop.mp4 \
  --bpm 120 --bars 8 --rotation 4.25 \
  [--beats-per-bar 4] [--fps 30] [--bolt-flash] [--bed-db -12] \
  [--voice-seam-ms 15] [--verify-loop]
```

Writes `loop.mp4`, a debug sidecar `loop.loop.json`
(`{bpm, bars, bar_length, X, rotation_point, actual_duration, seam_frame}`), and — with
`--verify-loop` — `loop.verifyloop.mp4`, the output concatenated to itself (bit-exact, `-c copy`)
so you can actually **watch and hear the seam**. Needs `ffmpeg` + `ffprobe` on PATH.

## Render-worker stage

```jsonc
{ "kind": "loop_builder", "input": "<short id>", "bed": "<music id>",
  "bpm": 120, "bars": 8, "rotationPointSec": 4.25,
  "beatsPerBar": 4, "fps": 30, "boltFlash": false, "bedDb": -12, "voiceSeamMs": 15 }
```

The server resolves `[short, bed]`, refuses if either is shorter than X, renders via the shared
planner, and asserts the output == X (±1 frame). Defaults live in `src/config.ts` (`LOOP`).
