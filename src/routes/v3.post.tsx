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
//
// TALK THE CAPTION (2026-09-07, docs/USE-YOUR-WORDS-AUDIT.md §3). The audit's finding: "Cross-post
// has no caption, title, description or hashtag field at all." Lee: "'Use your words' is the
// fundamental value… Wherever we can click, talk, get suggestions." And on this moment: "now we're
// at the final editing point. Maybe one last thing comes around to enhance our video… Every second
// matters." Every row has "🎙 Talk the caption": a sheet with a mic, twenty seconds of him on the
// set (typing allowed), the model following along on the rehearsal review's throttle, one card per
// destination with copy + edit in place, Save → set_publish_status.captions. It reads from what
// already exists — the prompter lines he KEPT in rehearsal, the set's cards, the talkthrough
// notes — and the sheet shows the kept lines so he can see what it read. Nothing here posts.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminGate, getAdminWho } from "@/components/AdminGate";
import { rehearsalContextFor } from "@/components/blastoff/rehearsal-context";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { blastOffPath, useBank } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_MUTED, V3_GOLD, V3_EDGE, V3_DISPLAY } from "@/components/v3/Shell";
import { StageChip, stepLabel } from "@/components/v3/StageChip";
import { ThumbSheet } from "@/components/v3/ThumbSheet";
import { PostProduction } from "@/components/v3/PostProduction";
import { DEST_UPLOAD_URL, looksLikeUrl, shouldAutoTick } from "@/components/v3/post-links";
import { isFilmedUnconfirmed, matchesFilter, stageOf, stageRank, talkStageOf, STAGE_SKY, type StageFilter, type StageInfo } from "@/components/v3/set-stage";
import { listBlastPlanSetIds, loadBlastPlan, type PlanTakeRow } from "@/lib/blastoff.functions";
import { runFor } from "@/components/blastoff/plan";
import {
  buildCaptionMessages, CAPTION_DEST_LABEL, CAPTION_DESTINATIONS, CAPTION_LIMITS, captionClipboardText, hasCaptions, normalizeHashtags, parseCaptions, transcriptText,
  type CaptionDestination, type DestinationCaption, type PublishCaptions,
} from "@/lib/caption-brief";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { logCostEvent } from "@/lib/cost-ledger.functions";
import { productionBottleneckReport } from "@/lib/production-time.functions";
import {
  listPublishStatuses, togglePublishDestination, setPublishUrl, setFilmed, setPublishCaptions,
  PUBLISH_DESTINATIONS, type PublishDestination, type SetPublishStatus,
} from "@/lib/publish-queue.functions";
import { runMicro, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import { useDictation } from "@/lib/use-dictation";

/** The rehearsal review's live-brief cadence (RehearsalReview.tsx LIVE_BRIEF_EVERY_MS). */
const LIVE_BRIEF_EVERY_MS = 2500;

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
  filmedAt: null, captions: null,
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
  /** THE SPLITS, per set (2026-09-09). Lee: "we need post to be ready for splits… I only did
   *  account classification > assets. Not the full thing." A set whose running order carries cuts
   *  is several videos, and each one is posted, captioned and covered on its own. */
  const [takesBySet, setTakesBySet] = useState<Map<string, PlanTakeRow[]>>(() => new Map());
  const [filmSeconds, setFilmSeconds] = useState<Map<string, number>>(() => new Map());
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, forceReview] = useState(0);
  useEffect(() => {
    listPublishStatuses()
      .then(setStatus)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
    listBlastPlanSetIds().then((rows) => {
      setPlans(new Set(rows.map((r) => r.setId)));
      setTakesBySet(new Map(rows.map((r) => [r.setId, r.takes])));
    }).catch(() => { /* no plan signal — chip falls back, and every set reads as one video */ });
    productionBottleneckReport()
      .then((r) => setFilmSeconds(new Map(r.sets.map((s) => [s.setId, s.bySteps.film ?? 0]))))
      .catch(() => { /* no timer signal — chip falls back */ });
    startTT();
    sweepStrandedReviews();
    const unReview = subscribeReview(() => forceReview((n) => n + 1));
    const unTT = subscribeTT(setTT);
    return () => { unReview(); unTT(); };
  }, []);

  // ONE ROW PER VIDEO. A set with no cuts is one take and keys on its own id, exactly as before
  // — so every row already posted keeps its state. The second split onward keys on "<setId>#N",
  // which set_publish_status accepts unchanged (its primary key is free text).
  const flat = useMemo(() => topics?.flatMap((t) => t.sets.flatMap((s) => {
    const takes = takesBySet.get(s.id) ?? [];
    const list: PlanTakeRow[] = takes.length ? takes : [{ name: "", headId: "", frames: 0, ceqIds: [] }];
    return list.map((tk, i) => ({
      topic: t, set: s, take: tk, takeIndex: i, takeCount: list.length,
      key: i === 0 ? s.id : `${s.id}#${i + 1}`,
    }));
  })) ?? [], [topics, takesBySet]);
  const statusFor = (setId: string): SetPublishStatus => status?.[setId] ?? EMPTY;
  // A PLAN AND A FILM TIMER BELONG TO THE SET; publish state belongs to the video. So the stage
  // reads the set for the first two and the row's own key for the third — with one exception:
  // the timer only vouches for split #1. It ran on the SET, and one filmed split lit every
  // sibling "filmed?" as if the whole set were shot; from #2 on, only the row's own filmed flag
  // counts. (A per-split film log is a later package; until then the timer is set-wide evidence
  // and the first split is the honest place to credit it.)
  const stageFor = (set: BoothSetInfo, key: string, takeIndex: number): StageInfo => {
    const publish = status?.[key] ?? null;
    const timerSeconds = takeIndex > 0 ? 0 : filmSeconds.get(set.id) ?? 0;
    return stageOf({ talk: talkStageOf(tt, set), hasPlan: plans.has(set.id), filmSeconds: timerSeconds, filmedAt: publish?.filmedAt ?? null, publish });
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return flat.filter(({ topic, set, take }) => !needle || set.name.toLowerCase().includes(needle) || topic.name.toLowerCase().includes(needle) || take.name.toLowerCase().includes(needle));
  }, [flat, q]);

  // Stage once per row per render — the three lookups are cheap, the sort below reads it twice.
  const staged = status ? rows.map((r) => ({ ...r, info: stageFor(r.set, r.key, r.takeIndex) })) : [];
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
      if (rank !== 0) return rank;
      const byName = a.set.name.localeCompare(b.set.name);
      return byName !== 0 ? byName : a.takeIndex - b.takeIndex;
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

  // Resolves to whether the link landed, so a pasted link can tick the destination AFTER the
  // URL is saved rather than alongside it — two upserts on one row, in flight at once, each
  // answering with "the row as I saw it", would let the slower answer erase the faster one.
  const onSaveUrl = (setId: string, destination: PublishDestination, url: string): Promise<boolean> => {
    setSaveErr(null);
    return setPublishUrl({ data: { setId, destination, url } }).then((r) => {
      if (r.ok && r.status) { setStatus((prev) => ({ ...(prev ?? {}), [setId]: r.status! })); return true; }
      setSaveErr(r.error ?? "Could not save the link — try again.");
      return false;
    }).catch((e) => { setSaveErr(e instanceof Error ? e.message : String(e)); return false; });
  };

  // THE CAPTION SHEET — one open at a time, keyed by set id.
  const [captioning, setCaptioning] = useState<string | null>(null);
  const captioningRow = captioning ? flat.find((r) => r.key === captioning) ?? null : null;
  /** POST-PRODUCTION (2026-09-09). Lee: "I'm a bit confused the order of operations once I have
   *  a finished video file." One door, six numbered steps, keyed by video. */
  const [producing, setProducing] = useState<string | null>(null);
  const producingRow = producing ? flat.find((r) => r.key === producing) ?? null : null;
  /** The take's own words, per video — held for this visit so the caption sheet can write from
   *  them. The durable copy is the take_transcripts row; this is just what's in hand. */
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [thumbing, setThumbing] = useState<string | null>(null);
  const thumbRow = thumbing ? flat.find((r) => r.key === thumbing) ?? null : null;

  const counts = PUBLISH_DESTINATIONS.reduce((acc, d) => {
    acc[d] = rows.filter((r) => statusFor(r.key)[d].postedAt).length;
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
            {visible.map((r) => (
              <SetRow
                key={r.key} topic={r.topic} set={r.set} pubKey={r.key} takeName={r.take.name}
                takeIndex={r.takeIndex} takeCount={r.takeCount} takeCards={r.take.ceqIds.length}
                status={statusFor(r.key)} info={r.info}
                onToggle={onToggle} onFilmed={onFilmed} onSaveUrl={onSaveUrl}
                onCaption={() => setCaptioning(r.key)} onThumb={() => setThumbing(r.key)} onProduce={() => setProducing(r.key)}
              />
            ))}
          </div>
        </>
      )}

      {captioningRow && (
        <CaptionSheet
          topic={captioningRow.topic} set={captioningRow.set} pubKey={captioningRow.key}
          takeLabel={takeTitle(captioningRow.take.name, captioningRow.takeIndex, captioningRow.takeCount)}
          takeCeqIds={captioningRow.take.ceqIds}
          takeTranscript={transcripts[captioningRow.key] ?? ""}
          status={statusFor(captioningRow.key)} tt={tt}
          onSaved={(s) => setStatus((prev) => ({ ...(prev ?? {}), [captioningRow.key]: s }))}
          onClose={() => setCaptioning(null)}
        />
      )}

      {/* ONE MODAL AT A TIME. Step 4 opens the caption sheet; the panel steps aside (hidden, not
          unmounted — the picked take and its upload live in there) and comes back the moment the
          sheet closes, with step 4 ticked if the captions were saved. */}
      {producingRow && (
        <PostProduction
          pubKey={producingRow.key}
          title={takeTitle(producingRow.take.name, producingRow.takeIndex, producingRow.takeCount) || producingRow.set.name}
          topicName={producingRow.topic.name}
          defaultHookLine={firstStemOf(producingRow.set, producingRow.take.ceqIds)}
          onTranscript={(t) => setTranscripts((prev) => (prev[producingRow.key] === t ? prev : { ...prev, [producingRow.key]: t }))}
          onOpenCopy={() => setCaptioning(producingRow.key)}
          onClose={() => setProducing(null)}
          hidden={!!captioningRow}
          copyDone={hasCaptions(statusFor(producingRow.key).captions)}
        />
      )}

      {thumbRow && (
        <ThumbSheet
          setId={thumbRow.set.id}
          setName={takeTitle(thumbRow.take.name, thumbRow.takeIndex, thumbRow.takeCount) || thumbRow.set.name}
          topicName={thumbRow.topic.name}
          defaultLine={firstStemOf(thumbRow.set, thumbRow.take.ceqIds)}
          onClose={() => setThumbing(null)}
        />
      )}
    </V3Shell>
  );
}

/** What a video is called on this page: Lee's name for the split, else "Split N", else nothing
 *  at all when the set is a single video (then the set's own name is the title). */
function takeTitle(name: string, index: number, count: number): string {
  if (count <= 1) return name.trim();
  return name.trim() || `Split ${index + 1}`;
}

/** The four link fields, read off the row — what the inputs show when nobody is typing. */
function urlsOf(status: SetPublishStatus): Record<PublishDestination, string> {
  return { site: status.site.url ?? "", youtube: status.youtube.url ?? "", instagram: status.instagram.url ?? "", tiktok: status.tiktok.url ?? "" };
}

/** The first question this video covers — the thumbnail's default hook. Falls back to the set's
 *  first card when a split carries no cards of its own (a pure brand run). */
function firstStemOf(set: BoothSetInfo, ceqIds: readonly string[]): string {
  const live = set.ceqs.filter((c) => !c.draft && !c.noteOnly);
  const mine = ceqIds.length ? live.filter((c) => ceqIds.includes(c.id)) : live;
  return (mine[0] ?? live[0])?.stem ?? "";
}

function SetRow({ topic, set, pubKey, takeName, takeIndex, takeCount, takeCards, status, info, onToggle, onFilmed, onSaveUrl, onCaption, onThumb, onProduce }: {
  topic: BoothTopic; set: BoothSetInfo; status: SetPublishStatus; info: StageInfo;
  /** The publish key for THIS video: the set's id for the first, "<setId>#N" after that. */
  pubKey: string;
  takeName: string; takeIndex: number; takeCount: number; takeCards: number;
  onToggle: (setId: string, d: PublishDestination, posted: boolean) => void;
  onFilmed: (setId: string, filmed: boolean) => void;
  /** Resolves true when the link is saved — the paste-back waits on it before ticking. */
  onSaveUrl: (setId: string, d: PublishDestination, url: string) => Promise<boolean>;
  onCaption: () => void;
  onThumb: () => void;
  onProduce: () => void;
}) {
  // THE LINK FIELDS — always on screen, one per destination (2026-09-09). Lee: "an icon per
  // platform that takes me to its upload page, then paste the URL back." Before this the field
  // only appeared AFTER ticking posted, which put the paste behind the very click it should
  // replace. Now the paste IS the tick: a real link into an unposted destination marks it posted
  // (post-links.ts decides), the ✓/○ button stays for a post with no link to show for it.
  const [drafts, setDrafts] = useState<Record<PublishDestination, string>>(() => urlsOf(status));
  const [editing, setEditing] = useState<PublishDestination | null>(null);
  // A row back from the server (a tick, a save, another field's paste) refreshes every field he
  // isn't typing in — never the one under his cursor.
  useEffect(() => {
    setDrafts((prev) => {
      const fresh = urlsOf(status);
      const next = { ...prev };
      for (const d of PUBLISH_DESTINATIONS) if (d !== editing) next[d] = fresh[d];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the four urls, not the row object
  }, [status.site.url, status.youtube.url, status.instagram.url, status.tiktok.url]);

  // A WORD BACK, for a moment — "caption copied — paste it in", "marked posted to TikTok". The
  // row is the only surface; a global toast would be a new idiom for four strings.
  const [flash, setFlash] = useState<{ text: string; tone: "good" | "warn" } | null>(null);
  const flashTimer = useRef<number | null>(null);
  const say = (text: string, tone: "good" | "warn" = "good") => {
    setFlash({ text, tone });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2600);
  };
  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  // Paste fires a commit and blur fires another a beat later; the second is the same string and
  // must not be a second save (or a second tick). Cleared on failure so a retry is allowed.
  const lastSaved = useRef<Partial<Record<PublishDestination, string>>>({});
  const commitUrl = (d: PublishDestination, raw: string) => {
    const next = raw.trim();
    const current = (status[d].url ?? "").trim();
    if (next === current || next === lastSaved.current[d]) return;
    lastSaved.current[d] = next;
    // Decided BEFORE the save lands, off the row as it was — the answer to "was this new?".
    const tick = shouldAutoTick(status[d].url, next, !!status[d].postedAt);
    void onSaveUrl(pubKey, d, next).then((ok) => {
      if (!ok) { delete lastSaved.current[d]; return; }
      if (!tick) return;
      onToggle(pubKey, d, true);
      say(`marked posted to ${DEST_LABEL[d]}`);
    });
  };

  // THE DOOR. Copy this destination's caption, open its upload page, say which happened. The
  // clipboard write is STARTED before the tab opens: the new tab takes focus, and a write asked
  // for on an unfocused document rejects. A failed copy still gets the tab — the caption is one
  // 🎙 click away — and says so instead of pretending.
  const openUpload = (d: PublishDestination) => {
    const url = DEST_UPLOAD_URL[d];
    if (!url) return;
    const c = status.captions?.[d];
    const copying = c && (c.title || c.caption) ? copyToClipboard(captionClipboardText(c)) : null;
    window.open(url, "_blank", "noopener");
    if (!copying) { say("no caption yet", "warn"); return; }
    void copying.then((ok) => say(ok ? "caption copied — paste it in" : "couldn't copy — open the caption sheet", ok ? "good" : "warn"));
  };

  const filmed = !!status.filmedAt;
  const unconfirmed = isFilmedUnconfirmed(info);

  return (
    <div style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
      <div style={{ minWidth: 170 }}>
        <div style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
          {set.name}
          {/* A SPLIT SET reads as its own video here, named on the edit side. Without a name it is
              "Split N" — enough to tell them apart while the names are still being written. */}
          {takeCount > 1 && (
            <span title={`Video ${takeIndex + 1} of ${takeCount} in this set — rename it in Review`}
              style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", color: V3_GOLD, border: `1px solid ${V3_GOLD}66`, background: "rgba(252,163,17,0.10)", borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>
              {takeTitle(takeName, takeIndex, takeCount)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: V3_MUTED }}>
          {topic.name} · {takeCount > 1 ? `${takeCards} question${takeCards === 1 ? "" : "s"} of ${set.liveCount}` : `${set.liveCount} question${set.liveCount === 1 ? "" : "s"}`}
        </div>
      </div>

      <StageChip info={info} align="left" minWidth={104} />

      {/* THE FILMED FLAG — manual, wins over the timer. When only the timer says so, the button
          asks for the confirmation instead of pretending it already has it. */}
      <button
        type="button"
        onClick={() => onFilmed(pubKey, !filmed)}
        title={filmed ? `Filmed ${new Date(status.filmedAt!).toLocaleDateString()} — click to unmark` : unconfirmed ? "The Film timer ran on this set — confirm it's shot" : "Mark this set filmed"}
        style={{
          border: `1px solid ${filmed ? `${STAGE_SKY}88` : unconfirmed ? `${STAGE_SKY}55` : V3_EDGE}`,
          background: filmed ? "rgba(125,211,252,0.12)" : "transparent",
          color: filmed || unconfirmed ? STAGE_SKY : V3_MUTED,
          borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {filmed ? "✔ filmed" : unconfirmed ? "filmed? confirm" : "mark filmed"}
      </button>

      {/* POST-PRODUCTION — the whole line from a finished take to a posted video, in order. This
          is the door; the caption and cover sheets are steps inside it (and still have their own
          buttons, for going straight back to one). */}
      <button
        type="button" onClick={onProduce}
        title="The finished take: transcript, burned captions, the copy, the cover — in order"
        style={{
          border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.14)", color: V3_GOLD,
          borderRadius: 8, padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        🎬 Post-production
      </button>

      {/* TALK THE CAPTION — the copy for every destination, talked, then copied where his hands are. */}
      <button
        type="button" onClick={onCaption}
        title={hasCaptions(status.captions) ? "Captions saved — open to copy or redo them" : "Talk twenty seconds about this set; the copy for every destination is written from that and the lines you kept"}
        style={{
          border: `1px solid ${hasCaptions(status.captions) ? `${V3_GOLD}88` : V3_EDGE}`, background: hasCaptions(status.captions) ? "rgba(252,163,17,0.10)" : "transparent",
          color: hasCaptions(status.captions) ? V3_GOLD : V3_MUTED, borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        🎙 {hasCaptions(status.captions) ? "captions ✓" : "Talk the caption"}
      </button>

      {/* THE COVER — the first thing anyone sees of the short, rendered from the set's own question. */}
      <button
        type="button" onClick={onThumb}
        title="Make the cover image: the hook, the topic and the bolt, as a PNG to save"
        style={{
          border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_MUTED,
          borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        🖼 Thumbnail
      </button>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PUBLISH_DESTINATIONS.map((d) => {
          const s = status[d];
          const posted = !!s.postedAt;
          const door = DEST_UPLOAD_URL[d];
          return (
            <div key={d} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {/* ↗ — the site has no upload page (it IS this app), so it gets no door. */}
                {door && (
                  <button
                    type="button"
                    onClick={() => openUpload(d)}
                    title={`Open ${DEST_LABEL[d]} upload · copies this caption`}
                    style={{
                      border: `1px solid ${V3_GOLD}66`, background: "rgba(252,163,17,0.08)", color: V3_GOLD,
                      borderRadius: 8, padding: "5px 8px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    ↗
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onToggle(pubKey, d, !posted)}
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
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={drafts[d]}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [d]: e.target.value }))}
                  onFocus={() => setEditing(d)}
                  onBlur={(e) => { setEditing(null); commitUrl(d, e.currentTarget.value); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { commitUrl(d, e.currentTarget.value); e.currentTarget.blur(); }
                    // Escape puts the saved link back (no blur — the blur would commit the DOM's
                    // value, which is still the typed one until React repaints).
                    if (e.key === "Escape") setDrafts((prev) => ({ ...prev, [d]: s.url ?? "" }));
                  }}
                  // A pasted link commits on the spot — no Enter, no click-away — so the ○
                  // becomes ✓ the moment the URL is in. Anything else pasted just types.
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text").trim();
                    if (!looksLikeUrl(pasted)) return;
                    e.preventDefault();
                    setDrafts((prev) => ({ ...prev, [d]: pasted }));
                    commitUrl(d, pasted);
                  }}
                  placeholder="paste the link"
                  title={posted ? `The posted ${DEST_LABEL[d]} link` : `Paste the ${DEST_LABEL[d]} link — that marks it posted`}
                  style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: `1px solid ${s.url ? `${V3_GOLD}55` : V3_EDGE}`, background: "transparent", color: V3_CREAM, width: 180, boxSizing: "border-box" }}
                />
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" title="Open the posted video" style={{ fontSize: 10.5, color: V3_GOLD, textDecoration: "none", whiteSpace: "nowrap" }}>
                    view
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {flash && (
        <span role="status" style={{ fontSize: 11.5, fontWeight: 700, color: flash.tone === "good" ? MINT : "#FF9F43", whiteSpace: "nowrap" }}>
          {flash.text}
        </span>
      )}

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

// ------------------------------------------------------------------ talk the caption

const EMPTY_CAPTION: DestinationCaption = { title: "", caption: "", hashtags: [] };
const emptyCaptions = (): PublishCaptions => ({ youtube: { ...EMPTY_CAPTION }, instagram: { ...EMPTY_CAPTION }, tiktok: { ...EMPTY_CAPTION }, site: { ...EMPTY_CAPTION } });

/** THE SHEET. Talk (or type) about the set; the brief runs on the throttle while he talks and
 *  every card updates; edit any field in place; copy a destination; Save. What it read from —
 *  the kept prompter lines, the cards, whether talkthrough notes exist — is shown, so a bad
 *  caption has a visible cause. */
function CaptionSheet({ topic, set, pubKey, takeLabel, takeCeqIds, takeTranscript, status, tt, onSaved, onClose }: {
  topic: BoothTopic; set: BoothSetInfo; status: SetPublishStatus; tt: TTState;
  /** The publish key for THIS video — the set's id, or "<setId>#N" for a split. */
  pubKey: string;
  /** "Split 2", or Lee's own name for it. "" when the set is one video. */
  takeLabel: string;
  /** The cards THIS video covers. Empty = the whole set (no cuts, or a run with no cards). */
  takeCeqIds: readonly string[];
  /** THE TAKE'S OWN WORDS, when post-production has transcribed it. Seeds the box below, so the
   *  copy is written from what he said on camera without him pasting anything. */
  takeTranscript?: string;
  onSaved: (s: SetPublishStatus) => void; onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  /** THE TAKE. Pasted SRT/VTT/plain text from `bun run captions <take.mp4>` — the filmed
   *  video's own words. Not stored: it belongs to the file, and re-pasting is one keystroke. */
  const [take0, setTake0] = useState(takeTranscript ?? "");
  // A transcript arriving after the sheet opened (post-production finishing while it is up) fills
  // the box, but never overwrites something already typed there.
  useEffect(() => { if (takeTranscript) setTake0((t) => t || takeTranscript); }, [takeTranscript]);
  const transcript = useMemo(() => transcriptText(take0), [take0]);
  const transcriptRef = useRef(transcript); transcriptRef.current = transcript;
  /** Speech only — what the throttle keys on, so a keystroke never costs a call. */
  const [take, setTake] = useState("");
  const [captions, setCaptions] = useState<PublishCaptions>(() => status.captions ?? emptyCaptions());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<CaptionDestination | "none" | null>(null);
  const [cost, setCost] = useState(0);
  const mic = useDictation((final, live) => {
    setInterim(live);
    if (final.trim()) { setText((t) => `${t} ${final}`.trim()); setTake((t) => `${t} ${final}`.trim()); }
  });

  // WHAT IT READS FROM. The kept lines come from the saved plan (one round trip); the cards
  // from the bank row already in hand; the talkthrough notes from the store, per card.
  const [keptLines, setKeptLines] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadBlastPlan({ data: { setId: set.id } })
      .then((p) => {
        if (!alive) return;
        // A SPLIT SET's captions come from ITS OWN slides. The plan is the whole set, so the run
        // this video covers is cut out of it: the frames between the two cuts that bracket this
        // video's cards.
        const frames = p ? p.frames.filter((f) => !f.skipped) : [];
        const mine = takeCeqIds.length ? runFor(frames, takeCeqIds) : frames;
        setKeptLines(mine.filter((f) => f.prompter?.length).flatMap((f) => f.prompter ?? []));
      })
      .catch(() => { if (alive) setKeptLines([]); });
    return () => { alive = false; };
  }, [set.id, takeCeqIds]);
  /** The set's cards this video covers — all of them when the set is a single video. */
  const mineOnly = useMemo(() => set.ceqs.filter((c) => !takeCeqIds.length || takeCeqIds.includes(c.id)), [set, takeCeqIds]);
  const stems = useMemo(() => mineOnly.filter((c) => !c.draft && !c.noteOnly).map((c) => c.stem), [mineOnly]);
  const talkthrough = useMemo(() => mineOnly.map((c) => rehearsalContextFor(tt.doc, set.id, c.id)).filter(Boolean).join("\n").slice(0, 1800), [tt, set.id, mineOnly]);

  const captionsRef = useRef(captions); captionsRef.current = captions;
  const brief = useCallback(async (spoken: string) => {
    setBusy(true); setErr(null);
    try {
      const m = buildCaptionMessages({
        setName: takeLabel ? `${set.name} — ${takeLabel}` : set.name, topicName: topic.name, stems, keptLines: keptLines ?? [], talkthrough, spoken,
        transcript: transcriptRef.current,
        previous: hasCaptions(captionsRef.current) ? captionsRef.current : null,
      });
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 900 } });
      void logCostEvent({ data: { setId: set.id, kind: "ai", usd: r.usage.costUsd, model: r.model, label: "captions", who: getAdminWho() } });
      setCost((c) => c + r.usage.costUsd);
      const parsed = parseCaptions(r.text);
      if (!parsed) throw new Error("The captions didn't come back clean — say it once more.");
      setCaptions(parsed); setDirty(true);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [set, topic.name, stems, keptLines, talkthrough]);

  // The rehearsal review's throttle: first new speech briefs at once, then at most once per
  // LIVE_BRIEF_EVERY_MS, and the tail always lands.
  const lastAt = useRef(0);
  const briefed = useRef("");
  useEffect(() => {
    if (!take || take === briefed.current) return;
    const wait = Math.max(0, lastAt.current + LIVE_BRIEF_EVERY_MS - Date.now());
    const id = window.setTimeout(() => { lastAt.current = Date.now(); briefed.current = take; void brief(take); }, wait);
    return () => window.clearTimeout(id);
  }, [take, brief]);

  const close = () => { if (mic.on) mic.stop(); onClose(); };
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, []);

  const toggleMic = () => {
    if (mic.on) { mic.stop(); setInterim(""); return; }
    setTake(""); setInterim(""); briefed.current = "";
    mic.start();
  };
  const patch = (d: CaptionDestination, p: Partial<DestinationCaption>) => { setCaptions((c) => ({ ...c, [d]: { ...c[d], ...p } })); setDirty(true); };
  const copy = async (d: CaptionDestination) => {
    const ok = await copyToClipboard(captionClipboardText(captions[d]));
    setCopied(ok ? d : "none");
    window.setTimeout(() => setCopied(null), 1800);
  };
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await setPublishCaptions({ data: { setId: pubKey, captions: hasCaptions(captions) ? captions : null } });
      if (!r.ok || !r.status) { setErr(r.error ?? "Could not save the captions."); return; }
      onSaved(r.status); setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const shown = text + (interim ? (text ? " " : "") + interim : "");
  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12.5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none" };
  const small: React.CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Talk the caption — ${set.name}`} onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 2147482800, background: "rgba(5,8,16,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 760, maxHeight: "92vh", overflowY: "auto", background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_GOLD}66`, borderRadius: 16, padding: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: V3_DISPLAY, fontSize: 20, fontWeight: 900, letterSpacing: "-0.01em" }}>Talk the caption</div>
          <div style={{ fontSize: 12.5, color: V3_MUTED }}>{set.name}{takeLabel ? ` · ${takeLabel}` : ""} · {topic.name}</div>
          <span style={{ flex: 1 }} />
          {cost > 0 && <span style={{ fontSize: 11, color: V3_MUTED }} title="This sheet's model calls, priced into the ledger">~${cost.toFixed(3)}</span>}
          <button type="button" onClick={close} style={{ ...small, color: V3_MUTED }}>close</button>
        </div>

        {/* THE TAKE — twenty seconds on the set. */}
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: V3_MUTED, flex: 1 }}>Twenty seconds on this set — what it teaches, who it's for, the angle. The cards update while you talk.</span>
          {mic.supported && (
            <button type="button" onClick={toggleMic} title={mic.on ? "Stop listening" : "Talk (Chrome)"}
              style={{ ...small, color: mic.on ? "#FF9F43" : V3_CREAM, borderColor: mic.on ? "#FF9F43aa" : V3_EDGE, background: mic.on ? "rgba(255,159,67,0.12)" : "transparent" }}>
              {mic.on ? "■ listening…" : "🎙 Talk"}
            </button>
          )}
        </div>
        <textarea autoFocus value={shown} onChange={(e) => { setInterim(""); setText(e.target.value); }} rows={3} placeholder="talk, or type"
          style={{ ...field, marginTop: 6, resize: "vertical", fontSize: 13.5, lineHeight: 1.45 }} />
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!mic.on && (
            <button type="button" disabled={busy} onClick={() => { briefed.current = text; void brief(text); }} style={{ ...small, borderColor: `${V3_GOLD}88`, color: V3_GOLD, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Writing…" : hasCaptions(captions) ? (text.trim() ? "Rewrite from that" : "Write it again") : text.trim() ? "Write the captions" : transcript ? "Write from the take" : "Write from the lines alone"}
            </button>
          )}
          {busy && mic.on && <span style={{ fontSize: 11.5, color: V3_GOLD }}>writing…</span>}
          {err && <span style={{ fontSize: 12, color: "#FF8B7E" }}>{err}</span>}
        </div>

        {/* THE TAKE — the filmed video's own words, once he has run the transcript. */}
        <details style={{ marginTop: 10 }} open={!!take0}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: transcript ? MINT : V3_MUTED }}>
            {transcript ? `The take's transcript — ${transcript.split(/\s+/).length} words, reading from it` : "Paste the take's transcript (optional)"}
          </summary>
          <div style={{ marginTop: 6, fontSize: 11.5, color: V3_MUTED, lineHeight: 1.5 }}>
            Run <code style={{ color: V3_CREAM }}>bun run captions "take.mp4"</code> and paste the .srt it writes beside the file.
            Timecodes are stripped. The copy below then comes from what you actually said on camera.
          </div>
          <textarea value={take0} onChange={(e) => setTake0(e.target.value)} rows={4} placeholder="paste the .srt, the .vtt, or the plain transcript"
            style={{ ...field, marginTop: 6, resize: "vertical", fontSize: 12, lineHeight: 1.45 }} />
        </details>

        {/* WHAT IT READ FROM. */}
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: V3_MUTED }}>
            What it reads from: {keptLines === null ? "loading the kept lines…" : `${keptLines.length} kept line${keptLines.length === 1 ? "" : "s"}`} · {stems.length} card{stems.length === 1 ? "" : "s"} · {talkthrough ? "talkthrough notes" : "no talkthrough notes"}{transcript ? " · the take's transcript" : ""}
          </summary>
          <div style={{ marginTop: 6, fontSize: 12, color: V3_CREAM, opacity: 0.85, lineHeight: 1.5 }}>
            {keptLines && keptLines.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>{keptLines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            ) : keptLines ? <div style={{ color: V3_MUTED }}>No prompter lines kept for this set yet — the review after a rehearsal round writes them.</div> : null}
            {stems.length > 0 && <div style={{ marginTop: 6, color: V3_MUTED }}>Cards: {stems.map((s) => s.slice(0, 80)).join(" · ")}</div>}
          </div>
        </details>

        {/* ONE CARD PER DESTINATION — edit in place, copy. */}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
          {CAPTION_DESTINATIONS.map((d) => {
            const c = captions[d];
            const lim = CAPTION_LIMITS[d];
            const over = c.title.length > lim.title;
            return (
              <div key={d} style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: V3_GOLD }}>{CAPTION_DEST_LABEL[d]}</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={() => void copy(d)} disabled={!c.title && !c.caption} style={{ ...small, opacity: !c.title && !c.caption ? 0.5 : 1, color: copied === d ? MINT : V3_CREAM }}>
                    {copied === d ? "copied" : copied === "none" ? "copy failed" : "copy"}
                  </button>
                </div>
                <input value={c.title} onChange={(e) => patch(d, { title: e.target.value })} placeholder={d === "tiktok" ? "the hook line" : d === "instagram" ? "first line (optional)" : "title"}
                  style={{ ...field, borderColor: over ? "#FF9F43aa" : V3_EDGE }} />
                <div style={{ fontSize: 10.5, color: over ? "#FF9F43" : V3_MUTED, textAlign: "right", marginTop: 2 }}>{c.title.length}/{lim.title}</div>
                <textarea value={c.caption} onChange={(e) => patch(d, { caption: e.target.value })} rows={d === "instagram" ? 4 : d === "site" ? 2 : 3} placeholder={d === "site" ? "one line for the site's listing" : "the caption"}
                  style={{ ...field, marginTop: 4, resize: "vertical", lineHeight: 1.45 }} />
                {lim.hashtags[1] > 0 && (
                  <input value={c.hashtags.map((h) => `#${h}`).join(" ")} placeholder={`${lim.hashtags[0]}–${lim.hashtags[1]} hashtags`}
                    onChange={(e) => patch(d, { hashtags: normalizeHashtags(e.target.value.split(/\s+/), lim.hashtags[1]) })}
                    style={{ ...field, marginTop: 6, fontSize: 11.5, color: V3_MUTED }} />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" disabled={saving || !dirty} onClick={() => void save()}
            style={{ ...small, fontSize: 12.5, padding: "7px 14px", border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", opacity: saving || !dirty ? 0.5 : 1 }}>
            {saving ? "Saving…" : dirty ? "Save the captions" : hasCaptions(status.captions) ? "Saved" : "Nothing to save yet"}
          </button>
          <button type="button" onClick={close} style={small}>{dirty ? "Close without saving" : "Close"}</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: V3_MUTED }}>Nothing posts from here — copy, then paste where you post.</span>
        </div>
      </div>
    </div>
  );
}
