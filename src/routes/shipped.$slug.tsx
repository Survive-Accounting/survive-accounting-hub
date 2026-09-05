// /shipped/[slug] — one entry. Video, what I was building, notes (if public), a collapsible
// transcript, then the two CTAs: what to build next, and how to get involved.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_FONT, DISPLAY_FONT } from "@/components/blastoff/stage";
import { getShippedBySlug, listShippedTopicVotes, voteShippedTopic } from "@/lib/shipped.functions";
import { bestTranscript, formatRecordDate, SHIPPED_INVOLVEMENT_URL, SHIPPED_TOPICS, SHIPPED_URL } from "@/components/shipped/model";
import { MuxVideo } from "@/components/shipped/MuxVideo";

export const Route = createFileRoute("/shipped/$slug")({
  loader: async ({ params }) => {
    const r = await getShippedBySlug({ data: { slug: params.slug } });
    if (!r.entry) throw notFound();
    return r.entry;
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [
    { title: `${loaderData.title} — SHIPPED — Survive` },
    { name: "description", content: "Building Survive Accounting in public." },
  ] : [] }),
  component: ShippedEntryPage,
  notFoundComponent: () => (
    <div style={{ minHeight: "100vh", background: "#05070D", color: "#F4EFE6", display: "grid", placeItems: "center", fontFamily: "'Rubik', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>That one isn't here.</div>
        <a href="/shipped" style={{ color: "#FCA311", fontSize: 13 }}>← back to SHIPPED</a>
      </div>
    </div>
  ),
});

const GOLD = "#FCA311", CREAM = "#F4EFE6", MUTED = "#9AA3B8", EDGE = "rgba(244,239,230,0.14)", INK = "#05070D", MINT = "#3BF5A0";
const VOTED_KEY = "sa-shipped-voted-topics";

function readVoted(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(VOTED_KEY) ?? "[]")); } catch { return new Set(); } }
function rememberVoted(s: Set<string>) { try { localStorage.setItem(VOTED_KEY, JSON.stringify([...s])); } catch { /* the click still counted server-side */ } }

function ShippedEntryPage() {
  const entry = Route.useLoaderData();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [shared, setShared] = useState(false);

  useEffect(() => { setVoted(readVoted()); listShippedTopicVotes().then((r) => setVotes(r.votes)).catch(() => {}); }, []);

  const vote = (topic: string) => {
    if (voted.has(topic)) return;
    const next = new Set(voted); next.add(topic); setVoted(next); rememberVoted(next);
    setVotes((v) => ({ ...v, [topic]: (v[topic] ?? 0) + 1 }));
    voteShippedTopic({ data: { topic } }).catch(() => {}); // the local tick already gave the feedback that matters
  };

  const share = () => {
    const url = `${SHIPPED_URL}/${entry.slug}`;
    if (navigator.share) { navigator.share({ title: entry.title, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).then(() => { setShared(true); setTimeout(() => setShared(false), 2500); }).catch(() => {});
  };

  const transcript = bestTranscript(entry);

  return (
    <div style={{ minHeight: "100vh", background: INK, color: CREAM, fontFamily: BRAND_FONT, padding: "34px 20px 90px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <a href="/shipped" style={{ fontSize: 12, color: MUTED, textDecoration: "none" }}>← SHIPPED</a>
        <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>{formatRecordDate(new Date(entry.recordedAt))} · {entry.semester}</div>
        <h1 style={{ marginTop: 4, fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 24, lineHeight: 1.2 }}>{entry.title}</h1>

        <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", background: "#000" }}>
          {entry.muxPlaybackId && entry.videoStatus === "ready" ? (
            <MuxVideo playbackId={entry.muxPlaybackId} style={{ width: "100%", aspectRatio: "9 / 16", maxHeight: "80vh", display: "block" }} />
          ) : (
            <div style={{ aspectRatio: "9 / 16", maxHeight: "80vh", display: "grid", placeItems: "center", color: MUTED, fontSize: 13, padding: 20, textAlign: "center" }}>
              Still processing — check back in a few minutes.
            </div>
          )}
        </div>

        {entry.topic && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD }}>What I was building</div>
            <div style={{ marginTop: 4, fontSize: 14, color: CREAM, opacity: 0.9 }}>{entry.topic}</div>
          </div>
        )}

        {entry.notesHtml && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD }}>Notes</div>
            <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: entry.notesHtml }} />
          </div>
        )}

        {transcript && (
          <div style={{ marginTop: 18 }}>
            <button type="button" onClick={() => setTranscriptOpen((v) => !v)}
              style={{ font: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {transcriptOpen ? "▾" : "▸"} Transcript
            </button>
            {transcriptOpen && <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6, color: CREAM, opacity: 0.88, whiteSpace: "pre-wrap" }}>{transcript}</div>}
          </div>
        )}

        <div style={{ marginTop: 30, borderTop: `1px solid ${EDGE}`, paddingTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>What should I build next?</div>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SHIPPED_TOPICS.map((t) => (
              <button key={t} type="button" onClick={() => vote(t)} disabled={voted.has(t)}
                style={{ font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 999, border: `1px solid ${voted.has(t) ? MINT : EDGE}`, background: voted.has(t) ? "rgba(59,245,160,0.12)" : "transparent", color: voted.has(t) ? MINT : CREAM, cursor: voted.has(t) ? "default" : "pointer" }}>
                {t}{voted.has(t) ? " ✓" : ""}{votes[t] ? ` · ${votes[t]}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="mailto:lee@surviveaccounting.com?subject=SHIPPED" style={ctaBtn}>Leave me a message</a>
          <button type="button" onClick={share} style={{ ...ctaBtn, border: `1px solid ${EDGE}`, background: "transparent", color: CREAM, cursor: "pointer" }}>{shared ? "Link copied ✓" : "Share with a friend"}</button>
        </div>

        <div style={{ marginTop: 26, borderTop: `1px solid ${EDGE}`, paddingTop: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Want to help build or promote Survive?</div>
          <a href={SHIPPED_INVOLVEMENT_URL} style={{ ...ctaBtn, marginTop: 10, display: "inline-block" }}>Get involved</a>
        </div>

        <SurviveWordmark size={16} style={{ marginTop: 40, opacity: 0.5 }} />
      </div>
    </div>
  );
}

const ctaBtn: React.CSSProperties = { font: "inherit", fontSize: 13, fontWeight: 800, padding: "9px 16px", borderRadius: 10, border: "none", background: "#FCA311", color: "#05070D", textDecoration: "none" };
