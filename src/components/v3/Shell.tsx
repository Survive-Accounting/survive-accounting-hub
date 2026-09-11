// V3 SHELL — the chrome every V3 screen shares, and nothing else.
//
// WHY V3 EXISTS (Lee, 2026-09-01). The study canvas grew an Obsidian-sized
// outline down the left, a Pipeline, an Exhibit Lab, publishing, takes and a
// videos tab — all reachable from every screen, all competing for the same
// attention. The job right now is one thing: get Blast Off videos filmed. So V3
// is a MENU, not a workspace. You pick a topic, pick a set, pick what you are
// making, and the surface for that is all you see.
//
// THE RULE THIS FILE ENFORCES: the only global navigation is the Map and Exhibit
// Lab. No Pipeline, no outline, no publishing. Everything else is reached by
// going somewhere, and the navbar is how you come back — which is why each
// screen is a real URL rather than a mode flag, so browser back works and a
// screen can be linked to.
//
// ONE NAVBAR (Lee, 2026-09-10: "Make the Map > account classification > brainstorm,
// etc. the top navbar. The breadcrumbs aren't needed anymore. Settings icon can be
// the top right of navbar."). The header (Home · Lab · breadcrumb · ⚙ · ▴hide) and
// the step strip under it were two rows saying the same thing; they are one slim
// row now: 🏠 Home › the set › its steps, and on a page that belongs to no set,
// 🏠 Home › the page's name. The `crumbs` prop every screen passes is kept so no
// caller changes; only its last label is read. The collapse toggle went with the
// second row — a ~40px bar has nothing worth hiding.
//
// Nothing here is deleted from the old canvas; /study/canvas is untouched and
// stays the fallback until V3 has actually filmed something.
import { Link, useLocation, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import { GenerationDock } from "@/components/talkthrough/GenerationDock";
// THE ⚙ (Lee, 2026-09-09: "every click I can remove, remove") — the production-timing pref, this
// run's controls and the Iterate / Post queue links, in one popover at the navbar's right edge.
// It lives with the run widget, not here: the popover needs that widget's handlers.
import { SettingsGear } from "@/components/v3/ProductionTimer";
import { useCeqQueueDrain } from "@/components/v3/ceq-queue-client";
import { findSet, findTopic, useBank } from "./use-bank";
// THE EXAM TOPICS MENU (2026-09-11): the topic's name in the crumb opens the exam's topics.
import { ExamTopicsMenu, stepSegOf } from "./ExamTopicsMenu";

export const V3_NAVY = "#14213D";
export const V3_CREAM = "#F5EFE6";
export const V3_GOLD = "#FCA311";
export const V3_MUTED = "rgba(245,239,230,0.62)";
export const V3_EDGE = "rgba(245,239,230,0.16)";
export const V3_DISPLAY = "'League Spartan', 'Rubik', system-ui, sans-serif";
export const V3_BODY = "'Rubik', system-ui, sans-serif";

export interface Crumb {
  label: string;
  /** Absent = the current screen (rendered plain, not a link). */
  to?: string;
}

/** THE QUEUE CHIP (docs/DESIGN-CEQ-QUEUE.md): the browser drains ceq_jobs from any /v3 page; the
 *  chip says how many are queued or generating. Nothing to show when the queue is idle. */
function QueueChip() {
  const { live } = useCeqQueueDrain();
  if (!live) return null;
  return (
    <span title="Card generation running in the background — the Editor shows the results" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", color: "#7DD3FC", border: "1px solid #7DD3FC66", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
      ⚙ {live} generating
    </span>
  );
}

const SEP = <span aria-hidden style={{ color: V3_MUTED, fontSize: 11, margin: "0 2px" }}>›</span>;

/** WHERE YOU ARE — the middle of the navbar. On a page that belongs to one set (the URL has
 *  $topic and $set), the set's name linking to its screen, then the six steps for THAT set, the
 *  one you are on lit — so no step needs the map just to reach the next (Lee, 2026-09-10: "I'm
 *  kinda tired of having to load different pages"). Paths are spelled the way blastOffPath spells
 *  them, straight from the URL's own slugs, so the strip never lags the page; the set's NAME comes
 *  from the bank (the same shared request every V3 screen already makes) and reads as the slug
 *  with spaces until it lands. Anywhere else: the page's name, from the last crumb. */
function Where({ crumbs }: { crumbs: Crumb[] }) {
  const params = useParams({ strict: false }) as { topic?: string; set?: string };
  const { pathname } = useLocation();
  const { topics } = useBank();
  if (!params.topic || !params.set) {
    const here = crumbs[crumbs.length - 1];
    if (!here) return null;
    return (
      <>
        {SEP}
        <span style={{ color: V3_CREAM, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{here.label}</span>
      </>
    );
  }
  const topic = topics ? findTopic(topics, params.topic) : undefined;
  const set = topic ? findSet(topic, params.set) : undefined;
  const setLabel = set?.name ?? params.set.replace(/-/g, " ");
  const base = `/v3/${params.topic}/${params.set}/blast-off`;
  const steps: { label: string; to: string; on: boolean; title: string }[] = [
    { label: "🎙 Brainstorm", to: `${base}/talkthrough`, on: pathname.endsWith("/talkthrough"), title: "Talk it through in the Booth" },
    { label: "💡 Suggestions", to: `${base}/suggestions`, on: pathname.endsWith("/suggestions"), title: "Everything the brainstorm suggested — add the ones worth filming" },
    { label: "✨ Editor", to: `${base}/results`, on: /\/(results|arrange)$/.test(pathname), title: "The cards and slides" },
    { label: "🎬 Film", to: `${base}/film`, on: pathname.endsWith("/film"), title: "Rehearse & Film — the pop-out" },
    { label: "📮 Post", to: "/v3/post", on: false, title: "Cross-post — every set's videos" },
    { label: "🔁 Iterate", to: `${base}/improve`, on: pathname.endsWith("/improve"), title: "Time to beat, cost per short, what to change" },
  ];
  return (
    <>
      {SEP}
      {/* THE TOPIC'S NAME, clickable (Lee, 2026-09-11: "If we click [topic name] at top left, let's
          let it open the topics for this exam. Break it up by toggles by exam"). Keeps the step. */}
      <ExamTopicsMenu label={topic?.name ?? params.topic.replace(/-/g, " ")} setId={set?.id} step={stepSegOf(pathname)} />
      {SEP}
      <Link to="/v3/$topic/$set" params={{ topic: params.topic, set: params.set }} title="This set"
        style={{ color: V3_CREAM, fontSize: 12.5, fontWeight: 700, textDecoration: "none", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: set ? undefined : "capitalize" }}>
        {setLabel}
      </Link>
      <nav aria-label="Steps" className="flex items-center gap-1.5" style={{ marginLeft: 6, flexWrap: "wrap" }}>
        {steps.map((st) => (
          <Link key={st.label} to={st.to} title={st.title} aria-current={st.on ? "page" : undefined}
            style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999, textDecoration: "none", whiteSpace: "nowrap",
              border: `1px solid ${st.on ? V3_GOLD : V3_EDGE}`, background: st.on ? "rgba(252,163,17,0.14)" : "transparent", color: st.on ? V3_GOLD : V3_MUTED }}>
            {st.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** The one chrome. Screens supply their crumbs (only the last label is read now — see the file
 *  comment) and their body. `wide` is for a working surface (the Review deck's three columns —
 *  originally the Blast Off editor's list + frame preview side by side) rather than a menu column. */
export function V3Shell({ crumbs, children, wide = false }: { crumbs: Crumb[]; children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ minHeight: "100vh", background: V3_NAVY, color: V3_CREAM, fontFamily: V3_BODY }}>
      {/* position: relative — the ⚙ popover is absolute against the navbar's right edge.
          BLACK, to separate the chrome from the work below (Lee, 2026-09-09: "make the nav bar
          black to kind of separate it"). */}
      <header
        className="flex items-center gap-2"
        style={{ minHeight: 40, padding: "5px 20px", borderBottom: `1px solid ${V3_EDGE}`, background: "#05070D", flexWrap: "wrap", position: "relative" }}
      >
        <Link to="/v3" title="Home — the map"
          style={{ color: V3_GOLD, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none", whiteSpace: "nowrap" }}>
          🏠 Home
        </Link>
        <Where crumbs={crumbs} />

        <div className="ml-auto flex items-center gap-2">
          <QueueChip />
          {/* A NEW TAB, not a navigation: Exhibit Lab is its own surface, and leaving V3 for it
              lost the way back (Lee got stuck). The booth's Exhibit Mode is where exhibits get
              talked about. */}
          <Link to="/exhibit-lab" target="_blank" rel="noopener" title="Exhibit Lab — opens in a new tab"
            className="flex items-center gap-1"
            style={{ color: V3_MUTED, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textDecoration: "none", whiteSpace: "nowrap" }}>
            <FlaskConical style={{ width: 12, height: 12 }} /> Lab ↗
          </Link>
          <SettingsGear />
        </div>
      </header>

      <main style={{ padding: "22px 20px 90px", maxWidth: wide ? 1440 : 1080, margin: "0 auto" }}>{children}</main>
      {/* THE GENERATION DOCK — bottom right on every V3 screen (Lee, 2026-09-03). */}
      <GenerationDock />
    </div>
  );
}

/** Shared empty / loading / error copy, so three screens don't invent three. */
export function V3Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "bad" }) {
  return (
    <div style={{ color: tone === "bad" ? "#FF8B7E" : V3_MUTED, fontSize: 14, marginTop: 18 }}>{children}</div>
  );
}
