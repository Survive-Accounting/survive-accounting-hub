// /v3/values — THE CREED. Lee, 2026-09-07, after the page-turner principle: "Add that to our
// list of core values, teaching philosophies, etc. And create a route for where I can review
// these."
//
// A quiet, readable page — no gate (it's Lee's own creed, not data), no fetch, nothing to
// click but the sources. Three sections, the lines in the words Lee said them, each dated,
// the source named. When Lee says a new one, it goes here the same day, in his words; the
// paraphrase (the short name at the top of each card) is ours and says so by being the
// heading, not the quote.
//
// Sources: docs/SURVIVE_STRATEGY_CULTURE_2026-09.md (Use Your Words / Feed the Machine /
// Human First — the September brainstorm capture), docs/V3-NOTES-2026-09-07.md (his notes the
// night before the first Blast Off film, verbatim), docs/STYLE-GUIDE-2026-09-06.md (the
// illustration rules). Linked from Step 5 (Iterate) — "the creed →" — and the foot of /v3.
import { createFileRoute, Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";

import { V3Shell, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/values")({
  component: V3Values,
  head: () => ({ meta: [{ title: "⚡ The creed — Survive" }, { name: "robots", content: "noindex" }] }),
});

interface Line {
  /** The short name — ours. */
  name: string;
  /** Lee's words, verbatim, or the doc's. */
  quote: string;
  /** Where and when it was said. */
  source: string;
  /** What it means in practice — one line, ours. */
  gloss?: string;
  /** A proposed sharper wording, shown muted beside the original — never in its place. */
  proposed?: string;
}

const CORE_VALUES: Line[] = [
  {
    name: "Use your words",
    quote: "\"Use your words\" is the fundamental value we are building into survive accounting and survive studios.",
    source: "Lee, 2026-09-07 — v3 notes",
    gloss: "Talk, don't type. Brainstorming aloud is the mechanism, not a supplement to it — wherever there's a box, there should be a way to click, talk, and get suggestions.",
  },
  {
    name: "Every second matters",
    quote: "It sucks, but every second matters with short form content.",
    source: "Lee, 2026-09-07 — v3 notes (\"or something more catchy/strategic sounding\")",
    gloss: "Short form is the format, not a channel. Everything gets cut to what earns its second.",
    proposed: "Every second is a decision to keep watching.",
  },
  {
    name: "Human first",
    quote: "The AI assistant catches Lee's ideas — it does not generate them. Its only license to suggest is a better phrasing of Lee's idea for short-form delivery.",
    source: "Strategy & Culture, September 2026",
    gloss: "The wisdom comes from ten years of tutoring; the AI is a transcriber, editor, and producer.",
  },
  {
    name: "Feed the machine",
    quote: "No strategy short gets made until accounting shorts have shipped.",
    source: "Strategy & Culture, September 2026",
    gloss: "Strategy content is energizing. Accounting content is the business. Dreaming is allowed; it just doesn't come first.",
  },
];

const TEACHING: Line[] = [
  {
    name: "Cram, not teach",
    quote: "Only leaving what's essential to getting the \"blast off\" point across. CRAMMING this, not teaching it. What's the quick trick I can share?",
    source: "Lee, 2026-09-07 — v3 notes, on the Editor's shorten button",
  },
  {
    name: "The one word to highlight",
    quote: "What's the 1 or 2 words (ideally only one) word I can highlight in this example that gets the point across for how to get this correct.",
    source: "Lee, 2026-09-07 — v3 notes",
    gloss: "Every card has a word that IS the answer. Find it, light it, and the rest of the card is scaffolding.",
  },
  {
    name: "Cheat code, answer, move on",
    quote: "We want sometimes to just cut straight to the chase. Not really teaching. Just \"here's how you know the answer. Move on.\" … Sometimes though, it's just: cheat code, answer, move on.",
    source: "Lee, 2026-09-07 — v3 notes, on rehearsal review",
  },
  {
    name: "Sometimes teach a beat",
    quote: "SOMETIMES, a cram answer is still teaching a bit.",
    source: "Lee, 2026-09-07 — v3 notes",
    gloss: "The line that teaches nothing is the wrong line — if Lee writes his own, that's the signal the suggestion missed the teaching.",
  },
];

const PRODUCTION: Line[] = [
  {
    name: "The page-turner",
    quote: "This is another production principle we can add to our shorts. It's like being a page turner book. The end of each slide is pulling you into the next one, whenever possible.",
    source: "Lee, 2026-09-07 — v3 notes",
    gloss: "Lines carry transitions: the last beat of a slide belongs to the next one.",
  },
  {
    name: "Time the slide change on the emphasis word",
    quote: "A big part of my teaching style that hits so hard is my TIMING for moving a slide at the perfect emphasis moment. I want to build this pipeline to support that.",
    source: "Lee, 2026-09-07 — v3 notes",
    gloss: "The teleprompter marks the transition phrase and, inside it, the word the slide turns on — the next slide is already in view so the turn can land.",
  },
  {
    name: "Readable in two seconds on a phone",
    quote: "Phone scannability. The picture is on screen for as little as two seconds.",
    source: "Illustration style guide, 2026-09-06",
    gloss: "Warp the colour, never the shape. If it doesn't read at phone size in two seconds, it isn't on the slide.",
  },
  {
    name: "One clear subject per picture",
    quote: "One clear subject, two or three shapes, minimal secondary objects.",
    source: "Illustration style guide, 2026-09-06",
  },
];

function V3Values() {
  return (
    <V3Shell crumbs={[{ label: "V3", to: "/v3" }, { label: "The creed" }]}>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px" }}>The creed</h1>
      <div style={{ color: V3_MUTED, fontSize: 13.5, lineHeight: 1.6, maxWidth: 640, marginBottom: 28 }}>
        Core values, teaching philosophy, production principles — in the words they were said, dated. The short names are ours; the quotes are Lee's. When a new one is said, it lands here the same day.
      </div>

      <Section title="Core values" lines={CORE_VALUES} />
      <Section title="Teaching philosophy" lines={TEACHING} />
      <Section title="Production principles" lines={PRODUCTION} />

      <div style={{ color: V3_MUTED, fontSize: 12, lineHeight: 1.6, marginTop: 28, paddingTop: 14, borderTop: `1px solid ${V3_EDGE}` }}>
        Sources in the repo: docs/SURVIVE_STRATEGY_CULTURE_2026-09.md · docs/V3-NOTES-2026-09-07.md · docs/STYLE-GUIDE-2026-09-06.md · docs/SURVIVE_METHOD_v1.md (the twelve teaching laws).
        <span style={{ marginLeft: 10 }}><Link to="/v3" style={{ color: V3_GOLD, textDecoration: "none" }}>← the queue</Link></span>
      </div>
    </V3Shell>
  );
}

function Section({ title, lines }: { title: string; lines: Line[] }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_GOLD, margin: "0 0 12px" }}>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {lines.map((l) => (
          <article key={l.name} style={cardStyle}>
            <div style={{ fontFamily: V3_DISPLAY, fontSize: 18, fontWeight: 800, color: V3_CREAM, lineHeight: 1.25, marginBottom: 8 }}>{l.name}</div>
            <Quote>{l.quote}</Quote>
            {l.proposed && <div style={{ color: V3_MUTED, fontSize: 12.5, fontStyle: "italic", marginTop: 6 }}>proposed: "{l.proposed}"</div>}
            {l.gloss && <div style={{ color: V3_MUTED, fontSize: 13, lineHeight: 1.55, marginTop: 10 }}>{l.gloss}</div>}
            <div style={{ color: V3_MUTED, fontSize: 11, marginTop: 10, letterSpacing: "0.04em" }}>{l.source}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <blockquote style={{ margin: 0, paddingLeft: 12, borderLeft: `2px solid ${V3_GOLD}`, color: V3_CREAM, fontSize: 14, lineHeight: 1.6 }}>{children}</blockquote>;
}

const cardStyle: CSSProperties = { border: `1px solid ${V3_EDGE}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column" };
