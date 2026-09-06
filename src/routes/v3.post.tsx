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
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { blastOffPath, useBank } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_MUTED, V3_GOLD, V3_EDGE, V3_DISPLAY } from "@/components/v3/Shell";
import {
  listPublishStatuses, togglePublishDestination, setPublishUrl,
  PUBLISH_DESTINATIONS, type PublishDestination, type SetPublishStatus,
} from "@/lib/publish-queue.functions";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/post")({
  component: () => <AdminGate><PostQueue /></AdminGate>,
  head: () => ({ meta: [{ title: "📮 Post — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

const DEST_LABEL: Record<PublishDestination, string> = {
  site: "SurviveAccounting.com", youtube: "YouTube Shorts", instagram: "Instagram Reels", tiktok: "TikTok",
};
const MINT = "#3BF5A0";

const EMPTY: SetPublishStatus = {
  site: { postedAt: null, url: null }, youtube: { postedAt: null, url: null },
  instagram: { postedAt: null, url: null }, tiktok: { postedAt: null, url: null },
};

function PostQueue() {
  const { topics, error } = useBank();
  const [status, setStatus] = useState<Record<string, SetPublishStatus> | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hidePosted, setHidePosted] = useState(false);

  useEffect(() => {
    listPublishStatuses()
      .then(setStatus)
      .catch((e) => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const flat = useMemo(() => topics?.flatMap((t) => t.sets.map((s) => ({ topic: t, set: s }))) ?? [], [topics]);
  const statusFor = (setId: string): SetPublishStatus => status?.[setId] ?? EMPTY;
  const fullyPosted = (s: SetPublishStatus) => PUBLISH_DESTINATIONS.every((d) => s[d].postedAt);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return flat.filter(({ topic, set }) => !needle || set.name.toLowerCase().includes(needle) || topic.name.toLowerCase().includes(needle));
  }, [flat, q]);
  const visible = status ? (hidePosted ? rows.filter(({ set }) => !fullyPosted(statusFor(set.id))) : rows) : [];

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

  return (
    <V3Shell crumbs={[{ label: "V3", to: "/v3" }, { label: "Post" }]} wide>
      <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 30, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px" }}>📮 Post</h1>
      <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 20, maxWidth: 640, lineHeight: 1.5 }}>
        Every set, one queue. Click a destination once it's actually posted — nothing here uploads for you, YouTube, Instagram and TikTok all stay a human act for now — this just tracks what's left.
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
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: V3_MUTED, cursor: "pointer" }}>
              <input type="checkbox" checked={hidePosted} onChange={(e) => setHidePosted(e.target.checked)} />
              Hide fully posted
            </label>
            <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
              {PUBLISH_DESTINATIONS.map((d) => (
                <span key={d} style={{ color: V3_MUTED }}>
                  <b style={{ color: V3_CREAM, fontVariantNumeric: "tabular-nums" }}>{counts[d]}</b>/{rows.length} {DEST_LABEL[d]}
                </span>
              ))}
            </div>
          </div>

          {rows.length === 0 && <V3Note>Nothing in the bank yet.</V3Note>}
          {rows.length > 0 && visible.length === 0 && <V3Note>{hidePosted ? "Everything here is fully posted." : "Nothing matches."}</V3Note>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map(({ topic, set }) => (
              <SetRow key={set.id} topic={topic} set={set} status={statusFor(set.id)} onToggle={onToggle} onSaveUrl={onSaveUrl} />
            ))}
          </div>
        </>
      )}
    </V3Shell>
  );
}

function SetRow({ topic, set, status, onToggle, onSaveUrl }: {
  topic: BoothTopic; set: BoothSetInfo; status: SetPublishStatus;
  onToggle: (setId: string, d: PublishDestination, posted: boolean) => void;
  onSaveUrl: (setId: string, d: PublishDestination, url: string) => void;
}) {
  const [editing, setEditing] = useState<PublishDestination | null>(null);
  const [draft, setDraft] = useState("");

  const commit = () => {
    if (editing) onSaveUrl(set.id, editing, draft.trim());
    setEditing(null);
  };

  return (
    <div style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
      <div style={{ minWidth: 170 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{set.name}</div>
        <div style={{ fontSize: 11.5, color: V3_MUTED }}>{topic.name} · {set.liveCount} question{set.liveCount === 1 ? "" : "s"}</div>
      </div>

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

      <Link to={blastOffPath(topic, set)} style={{ marginLeft: "auto", fontSize: 12, color: V3_GOLD, textDecoration: "underline", textUnderlineOffset: 3, whiteSpace: "nowrap" }}>
        Open set →
      </Link>
    </div>
  );
}
