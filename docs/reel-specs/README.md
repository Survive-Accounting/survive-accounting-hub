# Reel specs

One file per Reel. Lee talks a Reel out; this is what that becomes before any slide exists.

Lee, 2026-09-12: "I'd love the idea more of being able to spec this short out in a brainstorm chat
IN THE APP. Then have it build … the brainstorm tool we have right now is too detailed. It needs to
just be one brainstorm, no stamping, no per ceq, that should all occur in the background. Just talk
about it as best as you can, what slides I'll need, what are the main ideas."

So a spec is deliberately small: what the Reel is about, and the slides in order. Everything else —
which callout kind, what the card skin does, how the counter numbers it — is the app's job.

## The shape

Front matter, then one block per slide, in filming order.

```yaml
reel: start-here          # a slug, unique per spec file
title: This is a cram video
about: found              # the callout the Reel is ABOUT (its ★ lead) — reel.ts ranks from this
target: 35s               # 30–45s is the house target (reel.ts REEL_BUDGET)
set: <deck id>            # where it lands, once Lee says. Absent = he picks on import
```

```yaml
- kind: phrase            # any BLAST_FRAME_KIND (plan.ts)
  display: big            # optional — the whole 9:16, bolt behind (callout kinds only)
  text: |                 # the heading. A blank line is a line break on screen
    This is a cram video.
    Not a teaching video.
  bullets:                # optional, the lines under it. ==word== highlights on camera
    - → Numbers
  note: 2s. Says the deal before anything else.   # for Lee, never rendered
```

## The rules a spec obeys

- **One micro topic, one callout.** If a spec has three callouts it is three Reels; split it here,
  not later.
- **30–45 seconds.** The Editor's Reels mode adds up the estimate and says "split it" past 45.
- **Never reference the chain.** No "in the next video", no "as we saw" — a Reel stands alone.
  Teasing lives in the end-of-topic ad only.
- **Highlights are marked, not spoken.** `==like this==` so the word can be spotlit on camera.

## How a spec becomes slides

Today: by hand, or Claude Code writes the frames into the set's plan.
Next: "Build it" in the app — the same path `blastOffStrategyShort` already uses to mint a deck
from an idea's slides, pointed at an existing set so it lands as a new Reel between two cuts.
