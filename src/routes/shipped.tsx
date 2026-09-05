// /shipped — Lee's build-in-public log. A feed, newest first: a video, a date, a semester, a
// short excerpt, "Watch →". Lee, 2026-09-05: "This should feel like a BUILD LOG, not a polished
// corporate blog." Admins (device already unlocked) also see their own drafts at the top, with
// a one-click Publish, so "Save Draft" is never a dead end.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { isAdminUnlocked } from "@/components/AdminGate";
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_FONT, DISPLAY_FONT } from "@/components/blastoff/stage";
import { listShippedDrafts, listShippedPublic, saveShippedEntry } from "@/lib/shipped.functions";
import { formatDuration, formatRecordDate, muxThumbnailUrl, transcriptExcerpt, bestTranscript, type ShippedEntry } from "@/components/shipped/model";

export const Route = createFileRoute("/shipped")({
  component: ShippedFeed,
  head: () => ({ meta: [
    { title: "SHIPPED — Survive" },
    { name: "description", content: "Building Survive Accounting in public." },
  ] }),
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.14)", INK = "#05070D", ORANGE = "#FF9F43";

function ShippedFeed() {
  const [entries, setEntries] = useState<ShippedEntry[] | null>(null);
  const [drafts, setDrafts] = useState<ShippedEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setUnlocked(isAdminUnlocked());
    listShippedPublic().then((r) => setEntries(r.entries)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    listShippedDrafts().then((r) => setDrafts(r.entries)).catch(() => setDrafts([])); // a passcode rotation just hides the strip
  }, [unlocked]);

  const quickPublish = async (d: ShippedEntry) => {
    if (!d.title.trim()) { window.location.assign("#draft-" + d.id); return; } // needs a title first — nothing to publish yet
    setBusyId(d.id);
    try {
      await saveShippedEntry({ data: { id: d.id, title: d.title, topic: d.topic, semester: d.semester, publish: true } });
      setDrafts((v) => (v ?? []).filter((x) => x.id !== d.id));
      listShippedPublic().then((r) => setEntries(r.entries));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusyId(null); }
  };

  return (
    <div style={{ minHeight: "100vh", background: INK, color: CREAM, fontFamily: BRAND_FONT, padding: "40px 20px 90px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 34 }}>
          <SurviveWordmark size={26} />
          <div style={{ marginTop: 10, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 30, letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD }}>SHIPPED</div>
          <div style={{ marginTop: 6, fontSize: 13.5, color: MUTED }}>Building Survive Accounting in public.</div>
        </div>

        {unlocked && drafts && drafts.length > 0 && (
          <div style={{ marginBottom: 30, border: `1px dashed ${GOLD}55`, borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>Your drafts</div>
            {drafts.map((d) => (
              <div key={d.id} id={`draft-${d.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${EDGE}` }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || "(untitled — press R to add one)"}</span>
                <span style={{ fontSize: 11, color: MUTED }}>{d.videoStatus}</span>
                <button type="button" disabled={busyId === d.id || !d.title.trim()} onClick={() => quickPublish(d)}
                  style={{ font: "inherit", fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 999, border: "none", background: GOLD, color: INK, cursor: "pointer", opacity: busyId === d.id || !d.title.trim() ? 0.5 : 1 }}>
                  {busyId === d.id ? "Publishing…" : "Publish"}
                </button>
              </div>
            ))}
          </div>
        )}

        {err && <div style={{ color: ORANGE, fontSize: 13, marginBottom: 16 }}>{err}</div>}
        {entries === null && !err && <div style={{ color: MUTED, fontSize: 13, textAlign: "center" }}>Loading…</div>}
        {entries?.length === 0 && <div style={{ color: MUTED, fontSize: 13, textAlign: "center" }}>Nothing published yet — the first one's coming.</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {entries?.filter((e): e is ShippedEntry & { slug: string } => !!e.slug).map((e) => {
            const excerpt = transcriptExcerpt(bestTranscript(e));
            return (
              <Link key={e.id} to="/shipped/$slug" params={{ slug: e.slug }}
                style={{ display: "flex", gap: 14, textDecoration: "none", color: "inherit", border: `1px solid ${EDGE}`, borderRadius: 14, padding: 12, alignItems: "flex-start" }}>
                <div style={{ width: 120, aspectRatio: "9 / 16", flexShrink: 0, borderRadius: 10, overflow: "hidden", background: "#000", position: "relative" }}>
                  {e.muxPlaybackId && <img src={muxThumbnailUrl(e.muxPlaybackId)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />}
                  {e.durationSeconds !== null && (
                    <span style={{ position: "absolute", right: 5, bottom: 5, background: "rgba(0,0,0,0.7)", color: CREAM, fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "1px 5px" }}>{formatDuration(e.durationSeconds)}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: MUTED }}>{formatRecordDate(new Date(e.recordedAt))} · {e.semester}</div>
                  <div style={{ marginTop: 3, fontSize: 16, fontWeight: 700 }}>{e.title}</div>
                  {excerpt && <div style={{ marginTop: 4, fontSize: 13, color: MUTED, lineHeight: 1.4 }}>{excerpt}</div>}
                  <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 800, color: GOLD }}>Watch →</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
