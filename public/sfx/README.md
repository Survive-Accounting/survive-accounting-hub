# Canvas SFX (CC0)

Three short cues the filming canvas plays in **film mode only**:

| file | event | when |
| --- | --- | --- |
| `keypad.wav` | keypad | a text/heading element with the keypad toggle reveals |
| `swoosh.wav` | advance swoosh | every normal frame advance |
| `cram-launch.wav` | cram launch | entering the lesson's first Cram frame (per-lesson override) |

**Provenance:** these are **self-authored, public-domain (CC0)** — synthesized
from plain oscillator + noise math by `scripts/gen-sfx.mjs`, not sampled or
copied from anything. Safe to bundle. Never drop copyrighted or game audio here.

**Re-skin:** replace any file with your own (keep the filename), or edit the
synth in `scripts/gen-sfx.mjs` and run `node scripts/gen-sfx.mjs`. The canvas
reads them by filename via `src/components/canvas/sfx.ts` (the filenames are also
swappable in the scene's saved SFX config). Volumes + global mute live in the
canvas Settings → Sounds.

See `docs/FILMING-WORKFLOW.md` → "FILM-AUDIO SAFETY" before filming with sound.
