// /branding/thumbnails — the thumbnail system on its own page (Lee, 2026-09-11): one visual system
// for the SITE thumbnail (the poster in /learn's 9:16 card) and the SOCIAL cover (Reels, TikTok,
// Shorts), four content variants, any campus. Pick a video from the bank to seed the title, the
// series number and the set's illustrations — or pick none and make one by hand.
//
// The same editor is the 🖼 cover sheet on /v3/post and step 5 of post-production. Private =
// AdminGate + noindex. Nothing here writes anything; exports are downloads.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { BrandingNav } from "@/components/brand-kit/BrandingNav";
import { Field, input } from "@/components/brand-kit/kit-ui";
import { SeriesBatch } from "@/components/brand-kit/SeriesBatch";
import { ThumbnailStudio, type CoverContext } from "@/components/brand-kit/ThumbnailStudio";
import { useBank } from "@/components/v3/use-bank";
import { listBlastPlanSetIds, type PlanTakeRow } from "@/lib/blastoff.functions";
import { videoRows, type VideoRow } from "@/lib/brand-kit/thumbnail";

export const Route = createFileRoute("/branding_/thumbnails")({
  component: () => <AdminGate><Thumbnails /></AdminGate>,
  head: () => ({ meta: [{ title: "Thumbnails — Survive" }, { name: "robots", content: "noindex" }] }),
});

const MUTED = "#9AA3B8";

function SectionHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div style={{ margin: "26px 0 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#FCA311" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{blurb}</div>
    </div>
  );
}

function contextFor(r: VideoRow | null): CoverContext | undefined {
  if (!r) return undefined;
  return { title: r.title, topicName: r.topicName, setId: r.setId, part: r.cram ? String(r.cram) : r.topicName, exam: 1 };
}

function Thumbnails() {
  const { topics, error } = useBank();
  const [takes, setTakes] = useState<Map<string, PlanTakeRow[]>>(() => new Map());
  const [takesErr, setTakesErr] = useState<string | null>(null);
  useEffect(() => {
    listBlastPlanSetIds()
      .then((rows) => setTakes(new Map(rows.map((r) => [r.setId, r.takes]))))
      .catch((e) => setTakesErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const rows = useMemo(() => (topics ? videoRows(topics, takes) : []), [topics, takes]);
  const [key, setKey] = useState("");
  const row = rows.find((r) => r.key === key) ?? null;
  const byTopic = useMemo(() => {
    const m = new Map<string, VideoRow[]>();
    for (const r of rows) m.set(r.topicName, [...(m.get(r.topicName) ?? []), r]);
    return [...m.entries()];
  }, [rows]);

  const picker = (
    <Field label="Video" hint={error ? `Couldn't load the bank: ${error}` : takesErr ? `Splits unavailable (${takesErr}) — every set reads as one video.` : topics ? "Seeds the title, the number on the cram path and the set's illustrations." : "Loading the bank…"}>
      <select value={key} onChange={(e) => setKey(e.target.value)} style={{ ...input, colorScheme: "dark" }}>
        <option value="">None — make one by hand</option>
        {byTopic.map(([topic, list]) => (
          <optgroup key={topic} label={topic}>
            {list.map((r) => <option key={r.key} value={r.key}>{r.cram ? String(r.cram).padStart(2, "0") : "—"} · {r.title}</option>)}
          </optgroup>
        ))}
      </select>
    </Field>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#070B14", color: "#F4EFE6", fontFamily: "'Inter', system-ui, sans-serif", padding: "28px 32px 80px" }}>
      <BrandingNav current="/branding/thumbnails" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 22, fontWeight: 900, margin: 0 }}>Thumbnails</h1>
        <span style={{ fontSize: 12.5, color: MUTED }}>one system: the site thumbnail (no title — /learn prints it) and the social cover (the title in the lower third)</span>
      </div>
      <SectionHead title="Series" blurb="A whole set at once — one kicker, one title per video, one title size across the set, any campuses." />
      <SeriesBatch />
      <SectionHead title="One video" blurb="Any video in the bank: a frame of the take, an illustration or a concept, the four variants, the site thumbnail too." />
      <ThumbnailStudio context={contextFor(row)} picker={picker} />
    </div>
  );
}
