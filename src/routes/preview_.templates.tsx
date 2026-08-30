// /preview/templates — THE TEST HARNESS.
//
// Every reusable template on the site, each with a fixed sample so the URL is stable and you
// never have to remember which campus slug had chapters. Desktop and mobile links side by side,
// with a checklist per template.
//
// ── WHY THESE ARE LINKS AND NOT COPIES ────────────────────────────────────────────────────────
// The ask was "a test version of each template on its own preview route so I can make changes
// there and move them over when they're ready." Copies cannot do the second half. A forked
// /preview/home would be a second homepage that drifts from the real one the first time anyone
// edits either — and the copy is the one nobody remembers to update, so it slowly becomes a
// confident lie about what the site looks like. That is the exact failure the V1 player route
// documents.
//
// So this page points at THE REAL TEMPLATES. What it adds is what was actually missing: one
// place that knows every template, a known-good sample for each, and the thing to check.
//
// TO MAKE CHANGES AND MOVE THEM OVER, use a branch: every branch gets its own full deployment
// with every template at its real path and real data, and "moving it over" is the merge. That is
// a staging site, which is what the ask describes; a forked route is not.
import { createFileRoute } from "@tanstack/react-router";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { useNavyDocument } from "@/components/site/SiteHeader";

export const Route = createFileRoute("/preview_/templates")({
  head: () => ({
    meta: [{ title: "Templates to test — Survive" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: TemplatesPage,
});

/** THE SAMPLES. Alabama because it has a full roster (71 chapters, Panhellenic with 18) and a
 *  verified course code, so every template renders in its populated state rather than its empty
 *  one. Change these two and every link below follows. */
const CAMPUS = "university-of-alabama";
const CHAPTER = "alpha-chi-omega";

type Template = {
  name: string;
  path: string;
  /** What this template is reused for — why testing it once covers many pages. */
  covers: string;
  /** The things most likely to be wrong, in the order worth checking them. */
  check: string[];
};

const TEMPLATES: Template[] = [
  {
    name: "Homepage",
    path: "/",
    covers: "One page, but it is the layout every other template copies.",
    check: [
      "Course code and campus line match the resolved school",
      "Swap icon beside the campus line opens the school picker",
      "Both doors: solo button is the course-code amber, chapter is the blue",
      "Value chips sit under the scope line, testimonials below them",
    ],
  },
  {
    name: "Campus landing",
    path: `/${CAMPUS}`,
    covers: "Every campus — one template, ~970 in the system.",
    check: ["Player loads", "Exam tabs", "Change school works", "Professor picker"],
  },
  {
    name: "Chapter page",
    path: `/go/${CAMPUS}/${CHAPTER}`,
    covers: "Every chapter — thousands of pages on this one template.",
    check: [
      "Hero mirrors the homepage (eyebrow, headline, campus line, chips)",
      "Two doors, no player",
      "Share kit: three tier doors, all copy buttons confirm",
      "Claim modal: four fields in two rows, one close button",
    ],
  },
  {
    name: "Council page",
    path: `/partners/council/${CAMPUS}/panhellenic`,
    covers: "Every council on every campus. Goes out in cold email.",
    check: [
      "Centred hero, three doors in one row",
      "Share tabs: group chat / individually / email",
      "Tab 1 message contains every chapter link",
      "Tab 3 import fills the table",
      "Anchors: #share, #materials, #chapters",
    ],
  },
  {
    name: "Share — campus (DM)",
    path: `/s/${CAMPUS}`,
    covers: "The DM destination for every campus.",
    check: ["Fits one phone screen, no scrolling", "Chapter search matches nicknames", "All three buttons work"],
  },
  {
    name: "Share — chapter (DM)",
    path: `/s/${CAMPUS}/${CHAPTER}`,
    covers: "The DM destination for every chapter.",
    check: ["One screen", "Copy link and Copy message both confirm", "Copied link carries ?ref= when present"],
  },
  {
    name: "Share — council (DM)",
    path: `/s/${CAMPUS}/council?c=panhellenic`,
    covers: "The DM destination for every council.",
    check: ["One screen", "Says PANHELLENIC · ALABAMA", "Copies 18 links, not all 71", "Without ?c= it falls back to every chapter"],
  },
  {
    name: "Chapters portal",
    path: "/chapters",
    covers: "The Greek front door — school then chapter.",
    check: ["Both pickers searchable", "Picking a chapter navigates", "\"Don't see your school\" works"],
  },
  {
    name: "The campaign (private)",
    path: "/the-campaign",
    covers: "One page, shared by email only.",
    check: [
      "noindex + nofollow",
      "Counts are live, not hardcoded",
      "Deck: 15 slides, arrows and swipe",
      "Every number's ? opens its assumption",
      "Form submits with only a name",
    ],
  },
  {
    name: "Student player V1",
    path: "/preview/studentplayerv1",
    covers: "The player as it stood on 2026-08-29 — the comparison baseline.",
    check: ["Exam tabs", "Topic list with timings", "School and professor pickers"],
  },
];

function TemplatesPage() {
  useNavyDocument();
  return (
    <div
      style={{
        ...frameThemeVars(DEFAULT_FRAME_THEME),
        background: "var(--bg-page)", color: "var(--brand-cream)",
        minHeight: "100vh", fontFamily: BRAND_SANS,
      }}
    >
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px" }}>
        <h1 className="text-[28px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>Templates to test</h1>
        <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          The reusable templates, each with a sample that renders in its populated state. These
          link to the REAL pages — testing a copy would only tell you the copy works.
        </p>
        <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          To change something and move it over when it&apos;s ready, work on a branch: every branch
          gets its own deployment with every template at its real path, and shipping it is the merge.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {TEMPLATES.map((t) => (
            <div key={t.name} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-black" style={{ fontFamily: BRAND_DISPLAY }}>{t.name}</h2>
                <a href={t.path} className="text-[13px] font-black underline underline-offset-4" style={{ color: "var(--accent)" }}>
                  Open →
                </a>
              </div>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{t.covers}</p>
              <code className="mt-1.5 block break-all text-[11.5px]" style={{ color: "var(--text-muted)" }}>{t.path}</code>
              <ul className="mt-2 flex flex-col gap-0.5" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {t.check.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--brand-cream)", opacity: 0.85 }}>
                    <span aria-hidden style={{ color: "var(--accent)" }}>☐</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
