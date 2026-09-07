// /v3/post — THE QUEUE. Lee, 2026-09-06: "build out a basic dashboard for publishing, just the
// essentials and what will save time." StepBar's own Post blurb already named the job: "Queue up
// what's filmed across every topic and set, process it, publish it." So this is cross-cutting —
// not nested under one topic/set like the other three steps (blastOffPath special-cases "post"
// to always land here) — every set from the whole bank, one row each, four destinations.
//
// Nothing here uploads anything. No automated YouTube/Instagram/TikTok/site publish exists in
// this app today, and building that is real, separate scope — Lee's own words: "we will still
// need to optimize the publishing some, so it's an afterthought." What saves time RIGHT NOW is
// not re-deriving, in his head or a spreadsheet, what's already gone out and what hasn't: one
// click marks a destination posted, an optional link can be pasted in after the fact.
//
// STAGE-AWARE since the 2026-09-06 audit: "Post has no idea what's actually finished. Post is
// purely a publishing checklist, with zero awareness of where a set is in Talkthrough → Review →
// Film." Every row now carries the same stage chip the queue shows (components/v3/set-stage.ts,
// fed by the talkthrough store, the saved blast plans, the film timer and this table's own
// posted/filmed flags), the list filters and sorts so what is READY TO POST — filmed, not fully
// posted — is what you see first, and "Open set →" became "→ {next step}": the row sends you
// where the set actually stands, not to its front door.
//
// 2026-09-07: named CROSS-POST (Lee: "#4 Cross-post") — the title, crumb and h1 below; the URL
// stays /v3/post and the step id stays "post".
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { blastOffPath, useBank } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_MUTED, V3_GOLD, V3_EDGE, V3_DISPLAY } from "@/components/v3/Shell";
import { StageChip, stepLabel } from "@/components/v3/StageChip";
import { isFilmedUnconfirmed, matchesFilter, stageOf, stageRank, talkStageOf, STAGE_SKY, type StageFilter, type StageInfo } from "@/components/v3/set-stage";
import { listBlastPlanSetIds } from "@/lib/blastoff.functions";
import { productionBottleneckReport } from "@/lib/production-time.functions";
import {
  listPublishStatuses, togglePublishDestination, setPublishUrl, setFilmed,
  PUBLISH_DESTINATIONS, type PublishDestination, type SetPublishStatus,
} from "@/lib/publish-queue.functions";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/post")({
  component: () => <AdminGate><PostQueue /></AdminGate>,
  head: () => ({ meta: [{ title: "📮 Cross-post — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

const DEST_LABEL: Record<PublishDestination, string> = {
  site: "SurviveAccounting.com", youtube: "YouTube Shorts", instagram: "Instagram Reels", tiktok: "TikTok",
};
const MINT = "#3BF5A0";

const EMPTY: SetPublishStatus = {
  site: { postedAt: null, url: null }, youtube: { postedAt: null, url: null },
  instagram: { postedAt: null, url: null }, tiktok: { postedAt: null, url: null },
  filmedAt: null,
};

const FILTERS: { id: StageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready to post" },
  { id: "progress", label: "In progress" },
  { id: "done", label: "Done" },
];

function PostQueue() {
  const { topics, error } = useBank();
  const [status, setStatus] = useState<Record<string, SetPublishStatus> | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // null = "not chosen yet": defaults to Ready to post if anything is, else All — decided once
  // the statuses land, and only until Lee clicks a chip.
  const [filterChoice, setFilterChoice] = useState<StageFilter | null>(null);

  // THE OTHER STAGE SIGNALS — best-effort, one round trip each, fetched together. Plans and the
  // film timer are evidence, not the checklist: if either fails (a table not migrated yet, a
  // transient error) the row still renders from what the other sources know, and the chip is
  // just less informed. Only the publish statuses themselves are load-bearing here.
  const [plans, setPlans] = useState<Set<string>>(() => new Set());
  const [filmSeconds, setFilmSeconds] = useState<Map<string, number>>(() => new Map());
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, forceReview] = useState(0);
  useEffect(() => {
    listPublishStatuses()
      .then(setStatus)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
    listBlastPlanSetIds().then((rows) => setPlans(new Set(rows.map((r) => r.setId)))).catch(() => { /* no plan signal — chip falls back */ });
    productionBottleneckReport()
      .then((r) => setFilmSeconds(new Map(r.sets.map((s) => [s.setId, s.bySteps.film ?? 0]))))
      .catch(() => { /* no timer signal — chip falls back */ });
    startTT();
    sweepStrandedReviews();
    const unReview = subscribeReview(() => forceReview((n) => n + 1));
    const unTT = subscribeTT(setTT);
    return () => { unReview(); unTT(); };
  }, []);

  const flat = useMemo(() => topics?.flatMap((t) => t.sets.map((s) => ({ topic: t, set: s }))) ?? [], [topics]);
  const statusFor = (setId: string): SetPublishStatus => status?.[setId] ?? EMPTY;
  const stageFor = (set: BoothSetInfo): StageInfo => {
    const publish = status?.[set.id] ?? null;
    return stageOf({ talk: talkStageOf(tt, set), hasPlan: plans.has(set.id), filmSeconds: filmSeconds.get(set.id) ?? 0, filmedAt: publish?.filmedAt ?? null, publish });
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return flat.filter(({ topic, set }) => !needle || set.name.toLowerCase().includes(needle) || topic.name.toLowerCase().includes(needle));
  }, [flat, q]);

  // Stage once per row per render — the three lookups are cheap, the sort below reads it twice.
  const staged = status ? rows.map((r) => ({ ...r, info: stageFor(r.set) })) : [];
  const filterCounts = FILTERS.reduce((acc, f) => { acc[f.id] = staged.filter((r) => matchesFilter(r.info.stage, f.id)).length; return acc; }, {} as Record<StageFilter, number>);
  const filter: StageFilter = filterChoice ?? (filterCounts.ready > 0 ? "ready" : "all");
  // READY FIRST. Fully posted sinks to the bottom whatever the filter; above it, the furthest
  // along wins (filmed before reviewed before talked), and a tie reads in name order so the
  // list doesn't reshuffle between renders.
  const visible = staged
    .filter((r) => matchesFilter(r.info.stage, filter))
    .sort((a, b) => {
      const doneA = a.info.stage === "posted" ? 1 : 0, doneB = b.info.stage === "posted" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      const rank = stageRank(b.info.stage) - stageRank(a.info.stage);
      return rank !== 0 ? rank : a.set.name.localeCompare(b.set.name);
    });

  // Optimistic, but this dashboard's whole point is accurate state — a save that silently fails
  // and reverts on next load is worse than no feature at all, so a failure rolls the click back
  // and says why, rather than leaving a checkmark that was never actually persisted.
  const onToggle = (setId: string, destination: PublishDestination, posted: boolean) => {
    setSaveErr(null);
    const before = statusFor(setId);
    setStatus((prev) => {
      const base = prev ?? {};
      const cur = base[setId] ?? EMPTY;
      return { ...base, [setId]: { ...cur, [destination]: { ...cur[destination], postedAt: posted ? new Date().toISOString() : null } } };
    });
    void togglePublishDestination({ data: { setId, destination, posted } }).then((r) => {
      if (r.ok && r.status) setStatus((prev) => ({ ...(prev ?? {}), [setId]: r.status! }));
      else { setStatus((prev) => ({ ...(prev ?? {}), [setId]: before })); setSaveErr(r.error ?? "Could not save — try again."); }
    }).catch((e) => { setStatus((prev) => ({ ...(prev ?? {}), [setId]: before })); setSaveErr(e instanceof Error ? e.message : String(e)); });
  };

  // Same optimistic + revert shape for the filmed flag.
  const onFilmed = (setId: string, filmed: boolean) => {
    setSaveErr(null);
    const before = statusFor(setId);
    setStatus((prev) => ({ ...(prev ?? {}), [setId]: { ...((prev ?? {})[setId] ?? EMPTY), filmedAt: filmed ? new Date().toISOString() : null } }));
    void setFilmed({ data: { setId, filmed } }).then((r) => {
      if (r.ok && r.status) setStatus((prev) => ({ ...(prev ?? {}), [setId]: r.status! }));
      else { setStatus((prev) => ({ ...(prev ?? {}), [setId]: before })); setSaveErr(r.error ?? "Could not save — try again."); }
    }).catch((e) => { setStatus((prev) => ({ ...(prev ?? {}), [setId]: before })); setSaveErr(e instanceof Error ? e.message : String(e)); });
  };

  const onSaveUrl = (setId: string, destination: PublishDestination, url: string) => {
    setSaveErr(null);
    void setPublishUrl({ data: { setId, destination, url } }).then((r) => {
      if (r.ok && r.status) setStatus((prev) => ({ ...(prev ?? {}), [setId]: r.status! }));
      else setSaveErr(r.error ?? "Could not save the link — try again.");
    }).catch((e) => setSaveErr(e instanceof Error ? e.message : String(e)));
  };

  const counts = PUBLISH_DESTINATIONS.reduce((acc, d) => {
    acc[d] = rows.filter(({ set }) => statusFor(set.id)[d].postedAt).length;
    return acc;
  }, {} as Record<PublishDestination, number>);

  const emptyCopy: Record<StageFilter, string> = {
    all: "Nothing matches.",
    ready: "Nothing is filmed and waiting — everything filmed is fully posted, or nothing is filmed yet.",
    progress: "Nothing is in progress — every set is filmed or posted.",
    done: "Nothing is fully posted yet.",
  };

  return (
    <V3Shell crumbs={[{ label: "V3", to: "/v3" }, { label: "Cross-post" }]} wide>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px" }}>📮 Cross-post</h1>
      <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 20, maxWidth: 640, lineHeight: 1.5 }}>
        Every set, one queue — what's filmed and waiting comes first. Click a destination once it's actually posted — nothing here uploads for you, YouTube, Instagram and TikTok all stay a human act for now — this just tracks what's left.
      </div>

      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {loadErr && <V3Note tone="bad">{loadErr}</V3Note>}
      {saveErr && <V3Note tone="bad">{saveErr}</V3Note>}
      {(!topics || !status) && !error && <V3Note>Loading…</V3Note>}

      {topics && status && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a topic or set…"
              style={{ background: "transparent", border: `1px solid ${V3_EDGE}`, borderRadius: 10, padding: "8px 12px", color: V3_CREAM, fontSize: 13, minWidth: 220 }}
            />
            {/* The filters replace the old "Hide fully posted" checkbox — "Done" is that set of
                rows, and everything else is the complement, sliced by stage. */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FILTERS.map((f) => {
                const on = f.id === filter;
                return (
                  <button
                    key={f.id} type="button" onClick={() => setFilterChoice(f.id)}
                    style={{
                      border: `1px solid ${on ? V3_GOLD : V3_EDGE}`, background: on ? "rgba(252,163,17,0.12)" : "transparent",
                      color: on ? V3_CREAM : V3_MUTED, borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {f.label} <span style={{ color: on ? V3_GOLD : V3_MUTED, fontVariantNumeric: "tabular-nums" }}>{filterCounts[f.id]}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
              {PUBLISH_DESTINATIONS.map((d) => (
                <span key={d} style={{ color: V3_MUTED }}>
                  <b style={{ color: V3_CREAM, fontVariantNumeric: "tabular-nums" }}>{counts[d]}</b>/{rows.length} {DEST_LABEL[d]}
                </span>
              ))}
            </div>
          </div>

          {rows.length === 0 && <V3Note>Nothing in the bank yet.</V3Note>}
          {rows.length > 0 && visible.length === 0 && <V3Note>{emptyCopy[filter]}</V3Note>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map(({ topic, set, info }) => (
              <SetRow key={set.id} topic={topic} set={set} status={statusFor(set.id)} info={info} onToggle={onToggle} onFilmed={onFilmed} onSaveUrl={onSaveUrl} />
            ))}
          </div>
        </>
      )}
    </V3Shell>
  );
}

function SetRow({ topic, set, status, info, onToggle, onFilmed, onSaveUrl }: {
  topic: BoothTopic; set: BoothSetInfo; status: SetPublishStatus; info: StageInfo;
  onToggle: (setId: string, d: PublishDestination, posted: boolean) => void;
  onFilmed: (setId: string, filmed: boolean) => void;
  onSaveUrl: (setId: string, d: PublishDestination, url: string) => void;
}) {
  const [editing, setEditing] = useState<PublishDestination | null>(null);
  const [draft, setDraft] = useState("");

  const commit = () => {
    if (editing) onSaveUrl(set.id, editing, draft.trim());
    setEditing(null);
  };

  const filmed = !!status.filmedAt;
  const unconfirmed = isFilmedUnconfirmed(info);

  return (
    <div style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
      <div style={{ minWidth: 170 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{set.name}</div>
        <div style={{ fontSize: 11.5, color: V3_MUTED }}>{topic.name} · {set.liveCount} question{set.liveCount === 1 ? "" : "s"}</div>
      </div>

      <StageChip info={info} align="left" minWidth={104} />

      {/* THE FILMED FLAG — manual, wins over the timer. When only the timer says so, the button
          asks for the confirmation instead of pretending it already has it. */}
      <button
        type="button"
        onClick={() => onFilmed(set.id, !filmed)}
        title={filmed ? `Filmed ${new Date(status.filmedAt!).toLocaleDateString()} — click to unmark` : unconfirmed ? "The Film timer ran on this set — confirm it's shot" : "Mark this set filmed"}
        style={{
          border: `1px solid ${filmed ? `${STAGE_SKY}88` : unconfirmed ? `${STAGE_SKY}55` : V3_EDGE}`,
          background: filmed ? "rgba(125,211,252,0.12)" : "transparent",
          color: filmed || unconfirmed ? STAGE_SKY : V3_MUTED,
          borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        🎬 {filmed ? "filmed" : unconfirmed ? "filmed? confirm" : "filmed"}
      </button>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PUBLISH_DESTINATIONS.map((d) => {
          const s = status[d];
          const posted = !!s.postedAt;
          return (
            <div key={d} style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
              <button
                type="button"
                onClick={() => onToggle(set.id, d, !posted)}
                title={posted ? `Posted ${new Date(s.postedAt!).toLocaleDateString()} — click to unmark` : `Mark posted to ${DEST_LABEL[d]}`}
                style={{
                  border: `1px solid ${posted ? `${MINT}88` : V3_EDGE}`,
                  background: posted ? "rgba(59,245,160,0.12)" : "transparent",
                  color: posted ? MINT : V3_MUTED,
                  borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {posted ? "✓" : "○"} {DEST_LABEL[d]}
              </button>
              {posted && editing !== d && (
                <div style={{ display: "flex", gap: 8 }}>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: V3_GOLD, textDecoration: "none" }}>
                      open ↗
                    </a>
                  )}
                  <button type="button" onClick={() => { setEditing(d); setDraft(s.url ?? ""); }}
                    style={{ background: "none", border: "none", color: V3_MUTED, fontSize: 10.5, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                    {s.url ? "edit link" : "+ link"}
                  </button>
                </div>
              )}
              {posted && editing === d && (
                <input
                  autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }}
                  placeholder="paste the URL"
                  style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, width: 160 }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* "→ Film", "→ Review", … — the row resumes the set where it stands. A set already on
          Post has nowhere further to go, so the link points at its front door instead. */}
      <Link
        to={info.next === "post" ? blastOffPath(topic, set) : blastOffPath(topic, set, info.next)}
        title={info.next === "post" ? "Open the set" : `Resume at step ${stepLabel(info.next)}`}
        style={{ marginLeft: "auto", fontSize: 12, color: V3_GOLD, textDecoration: "underline", textUnderlineOffset: 3, whiteSpace: "nowrap" }}
      >
        → {info.next === "post" ? "Open set" : stepLabel(info.next)}
      </Link>
    </div>
  );
}
