// /v3/learn — THE CRAM PATH AS A STUDENT WILL SEE IT, with "Take me to an A" branching off it.
//
// Lee, 2026-09-10: "a mock-up… let's just build the easy points. Easy points would be the cram
// path, the offshoots before they're built (the schema/design, the path can be built beforehand)
// and the scrambled practice review comes at the end. Similar format to what /learn already is:
// the horizontal view of each topic starting with Easy Points, and Easy Points is the free one
// for every exam… A toggle 'Take me to an A' — when you click it it shows these offshoots based
// off each split, expands kind of slowly… If the video doesn't exist it's obvious it's not made
// yet — grayed out — but they can request it… Keep the campus branding. And /v3/learn in the
// admin sense too."
//
// One row per topic; one portrait card per CRAM VIDEO (each split of a set is a video —
// components/v3/learn-cards.ts); Practice at the end of every row. The toggle opens a column of
// small cards under each cram card: the offshoots hung off that split, in Lee's map order
// (lane-map.ts layoutLanes — the same layout /v3/map draws). Not made = greyed and requestable.
//
// "MADE" IS NEVER GUESSED. Student mode: a set the student tree serves with a playback id — and
// only for a set that is ONE video (a set with splits has one publication for several cards, and
// which card it belongs to is not recorded, so those stay "coming soon" until the admin data says
// otherwise). Admin mode (?admin=1, behind the passcode gate): the publish status per video key —
// filmed or site-posted — plus the site/YT/IG/TT ticks and a door into /v3/post.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { INK, LEARN_CSS, themeFor, themeStyle } from "@/components/learn/learn-theme";
import { layoutLanes, type LaneTake } from "@/components/v3/lane-map";
import { cramCardsOf, offshootsUnderCard, type CramCard } from "@/components/v3/learn-cards";
import { CramVideoCard, LEARN_V3_CSS, OffshootCard, PracticeCard, RequestSheet, type AdminInfo, type OffshootView, type RequestTarget } from "@/components/v3/LearnCards";
import { slugOf, useBank } from "@/components/v3/use-bank";
import { laneOf, OFFSHOOT_STUDENT_LABEL } from "@/lib/deck-lane";
import { listCramTakes } from "@/lib/learn-takes.functions";
import { listPublishStatuses, type SetPublishStatus } from "@/lib/publish-queue.functions";
import { schoolByAny, schoolByCampusId } from "@/lib/schools";
import { fetchStudentTree } from "@/lib/student.functions";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";
import { orderedSets } from "@/lib/v3-topic-groups";

type LearnV3Search = { admin?: boolean; want?: string; campus?: string };

export const Route = createFileRoute("/v3/learn")({
  validateSearch: (s: Record<string, unknown>): LearnV3Search => ({
    admin: s.admin === true || s.admin === 1 || s.admin === "1" || s.admin === "true" ? true : undefined,
    // ?want=<deckId> is the share link: open that video's request sheet on load.
    want: typeof s.want === "string" && s.want ? s.want : undefined,
    campus: typeof s.campus === "string" && s.campus ? s.campus : undefined,
  }),
  component: LearnRouteComponent,
  head: () => ({ meta: [{ title: "Learn — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
});

/** The passcode gate wraps ONLY the admin branch. A student never meets it. */
function LearnRouteComponent() {
  const { admin } = Route.useSearch();
  return admin ? <AdminGate><LearnPage admin /></AdminGate> : <LearnPage admin={false} />;
}

/** The campus /learn last used on this device — the same key learn.tsx writes. */
function storedCampusId(): string | null {
  try { return localStorage.getItem("sa-learn-campus"); } catch { return null; }
}

/** Topics in exam order; strategy shorts are not exam content. */
function examTopics(topics: readonly BoothTopic[]): BoothTopic[] {
  return topics.filter((t) => t.kind !== "strategy").slice().sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
}

type Column = { set: BoothSetInfo; card: CramCard; single: boolean; offshoots: { set: BoothSetInfo; whole: boolean }[] };

/** One topic's row: a column per cram video, each with the offshoots hung under it. */
function columnsOf(topic: BoothTopic, takesOf: (id: string) => readonly LaneTake[]): { columns: Column[]; orphans: number } {
  const layout = layoutLanes(orderedSets(slugOf(topic.name), topic.sets), takesOf);
  const byId = new Map(topic.sets.map((s) => [s.id, s]));
  const columns: Column[] = [];
  for (const node of layout.nodes.filter((n) => n.lane === "cram" && !n.orphan).sort((a, b) => a.row - b.row)) {
    const set = byId.get(node.id);
    if (!set) continue;
    const cards = cramCardsOf(set, takesOf(set.id));
    const refs = layout.nodes
      .filter((n) => n.col === 2 && n.row === node.row && !n.orphan)
      .sort((a, b) => a.sub - b.sub)
      .map((n) => ({ id: n.id, headId: n.take?.headId ?? null }));
    const hung = offshootsUnderCard(cards, refs);
    for (const card of cards) {
      const offshoots = (hung.get(card.key) ?? []).flatMap((h) => { const s = byId.get(h.item.id); return s ? [{ set: s, whole: h.whole }] : []; });
      columns.push({ set, card, single: cards.length === 1, offshoots });
    }
  }
  return { columns, orphans: layout.orphans };
}

function LearnPage({ admin }: { admin: boolean }) {
  const search = Route.useSearch();
  const { topics, error: bankError } = useBank();
  const [takes, setTakes] = useState<Map<string, LaneTake[]> | null>(null);
  const [takesError, setTakesError] = useState<string | null>(null);
  const [publish, setPublish] = useState<Record<string, SetPublishStatus>>({});
  const [publishError, setPublishError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Map<string, string | null>>(() => new Map());
  const [treeError, setTreeError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<RequestTarget | null>(null);
  const [wantMissing, setWantMissing] = useState(false);
  // Read after mount, never in the initializer: the server has no localStorage, and a theme
  // that differs between the server HTML and the first client render fails hydration.
  const [campusFallback, setCampusFallback] = useState<string | null>(null);
  useEffect(() => { setCampusFallback(storedCampusId()); }, []);

  const school = useMemo(() => schoolByAny(search.campus) ?? schoolByCampusId(search.campus) ?? schoolByCampusId(campusFallback), [search.campus, campusFallback]);
  const theme = useMemo(() => themeFor(school), [school]);

  useEffect(() => {
    listCramTakes()
      .then((rows) => setTakes(new Map(rows.map((r) => [r.setId, r.takes.map((t) => ({ headId: t.headId, name: t.name }))]))))
      .catch((e) => { setTakes(new Map()); setTakesError(e instanceof Error ? e.message : String(e)); });
    fetchStudentTree({ data: {} })
      .then((courses) => setPlayback(new Map(courses.flatMap((c) => c.topics.flatMap((t) => t.sets.map((s) => [s.id, s.playbackId] as const))))))
      .catch((e) => setTreeError(e instanceof Error ? e.message : String(e)));
    if (admin) listPublishStatuses().then(setPublish).catch((e) => setPublishError(e instanceof Error ? e.message : String(e)));
  }, [admin]);

  const takesOf = useCallback((id: string): readonly LaneTake[] => takes?.get(id) ?? [], [takes]);
  const exam = useMemo(() => examTopics(topics ?? []), [topics]);
  const rows = useMemo(() => exam.map((t) => ({ topic: t, ...columnsOf(t, takesOf) })), [exam, takesOf]);

  /** Made, never guessed — see the header. */
  const madeOf = (key: string, setId: string, single: boolean): { made: boolean; playbackId: string | null } => {
    const p = admin ? publish[key] ?? null : null;
    const pid = single ? playback.get(setId) ?? null : null;
    return { made: !!(p?.filmedAt || p?.site.postedAt || pid), playbackId: pid };
  };
  const adminInfo = (key: string): AdminInfo | null => (admin ? { status: publish[key] ?? null, postKey: key } : null);
  const isOpen = (topicId: string) => open[topicId] ?? admin;

  const shareUrl = (deckId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/v3/learn?want=${encodeURIComponent(deckId)}${search.campus ? `&campus=${encodeURIComponent(search.campus)}` : ""}`;
  };
  const request = (topic: BoothTopic, o: OffshootView) => setTarget({ id: o.id, name: o.name, blurb: o.blurb, topic: topic.name });

  // THE SHARE LINK LANDS HERE: open that video's sheet once the bank is in hand, and open its row.
  useEffect(() => {
    if (!search.want || !topics) return;
    for (const t of examTopics(topics)) {
      const s = t.sets.find((x) => x.id === search.want);
      if (s && laneOf(s) === "offshoot") {
        setOpen((o) => ({ ...o, [t.id]: true }));
        setTarget({ id: s.id, name: s.name, blurb: s.blurb ?? null, topic: t.name });
        return;
      }
    }
    setWantMissing(true);
  }, [search.want, topics]);

  const notes = [
    bankError && `Could not load the videos: ${bankError}`,
    takesError && `Could not load the splits, so each set shows as one card: ${takesError}`,
    treeError && `Could not check which videos are posted: ${treeError}`,
    publishError && `Admin: could not load publish statuses: ${publishError}`,
    wantMissing && "That video isn't in the bank any more — pick another below.",
  ].filter((n): n is string => !!n);

  return (
    <div className="lk-root" style={{ ...themeStyle(theme), minHeight: "100vh" }}>
      <style>{LEARN_CSS + LEARN_V3_CSS}</style>

      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px 10px", flexWrap: "wrap" }}>
        <svg width="18" height="22" viewBox="0 0 54 70" fill="none" stroke={INK.text} strokeWidth="3" strokeLinejoin="round" aria-hidden="true"><path d="M34 4 L10 40 L26 40 L18 66 L46 28 L30 28 Z" fill={theme.accent} /></svg>
        <span className="lk-disp" style={{ fontSize: 17 }}>Survive Accounting</span>
        <span style={{ fontSize: 13, color: INK.muted }}>Learn{school ? ` · ${school.name}` : ""}</span>
        <span style={{ flex: 1 }} />
        {admin && (
          <>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: INK.muted }}>Admin view</span>
            <Link to="/v3/map" style={{ fontSize: 12.5, fontWeight: 700, color: theme.accent, textDecoration: "none" }}>← the map</Link>
          </>
        )}
      </header>

      <div style={{ padding: "0 24px 10px", fontSize: 13, color: INK.muted, maxWidth: 680, lineHeight: 1.5 }}>
        The cram path, one short per video. Turn on <b style={{ color: INK.text }}>{OFFSHOOT_STUDENT_LABEL}</b> to see the deeper videos under each one — and ask for any that aren't made yet.
      </div>

      {notes.map((n) => <div key={n} style={{ margin: "6px 24px", padding: "8px 12px", borderRadius: 8, border: `1px solid ${INK.red}66`, color: INK.red, fontSize: 12.5 }}>{n}</div>)}
      {!topics && !bankError && <div style={{ padding: "20px 24px", color: INK.muted, fontSize: 13 }}>Loading…</div>}
      {topics && exam.length === 0 && <div style={{ padding: "20px 24px", color: INK.muted, fontSize: 13 }}>No exam topics yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 34, padding: "10px 0 60px" }}>
        {rows.map(({ topic, columns, orphans }, ti) => {
          const on = isOpen(topic.id);
          const nOff = columns.reduce((n, c) => n + c.offshoots.length, 0);
          return (
            <section key={topic.id} id={slugOf(topic.name)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "0 24px" }}>
                <span className="lk-disp" style={{ fontSize: 20 }}>{topic.name}</span>
                {ti === 0 && <span className="lk-free">Free for every exam</span>}
                <span style={{ fontSize: 12.5, color: INK.muted }}>{columns.length} cram video{columns.length === 1 ? "" : "s"}{nOff ? ` · ${nOff} to take it to an A` : ""}</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="lk-toggle" data-on={on} aria-pressed={on} onClick={() => setOpen((o) => ({ ...o, [topic.id]: !on }))}>
                  Take me to an A <span aria-hidden="true">{on ? "−" : "+"}</span>
                </button>
              </div>
              <div className="lk-scroll-x" style={{ gap: 12, padding: "0 24px 6px", alignItems: "flex-start" }}>
                {columns.map((c) => {
                  const m = madeOf(c.card.key, c.set.id, c.single);
                  return (
                    <div key={c.card.key} className="lk-col">
                      <CramVideoCard title={c.card.title} made={m.made} playbackId={m.playbackId} setId={c.set.id} admin={adminInfo(c.card.key)} />
                      {on && c.offshoots.map((o, i) => {
                        const om = madeOf(o.set.id, o.set.id, true);
                        const view: OffshootView = { id: o.set.id, name: o.set.name, blurb: o.set.blurb ?? null, made: om.made, whole: o.whole };
                        return <OffshootCard key={o.set.id} o={view} parentName={c.set.name} index={i} admin={adminInfo(o.set.id)} onRequest={(v) => request(topic, v)} />;
                      })}
                      {on && c.offshoots.length === 0 && c.card.takeIndex === 0 && columns.filter((x) => x.set.id === c.set.id).every((x) => x.offshoots.length === 0) && (
                        <div className="lk-branch" style={{ fontSize: 10.5, color: INK.dim, textAlign: "center", padding: "10px 4px 0" }}>Nothing deeper here yet</div>
                      )}
                    </div>
                  );
                })}
                <PracticeCard topic={topic.name} />
              </div>
              {admin && orphans > 0 && <div style={{ padding: "0 24px", fontSize: 11.5, color: INK.red }}>{orphans} set{orphans === 1 ? "" : "s"} in this topic hang off nothing on the cram path — fix on the map.</div>}
            </section>
          );
        })}
      </div>

      {target && <RequestSheet target={target} shareUrl={shareUrl(target.id)} onClose={() => setTarget(null)} />}
    </div>
  );
}
