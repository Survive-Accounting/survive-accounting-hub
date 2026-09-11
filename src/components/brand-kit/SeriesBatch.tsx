// THE SERIES BATCH — a whole set of covers, every video in it, for any campuses, in one go.
//
// Lee, 2026-09-11: "Generate some downloadable thumbnails for first five types of accounts…
// TYPES OF ACCOUNTS / Assets / Liabilities etc. I'm about to get these posted and I'll upload all
// thumbnails manually." Same art as the studio (ThumbnailArt, social mode): one kicker, one title
// per video, and ONE title size across the set (seriesTitleCap), so the covers read as a set when
// they sit side by side on a profile grid. Previews boil on hover; the files are the still mark.
import { useRef, useState } from "react";

import { CampusSelect, Chip, ExportButton, Field, input, small } from "@/components/brand-kit/kit-ui";
import { ThumbnailArt } from "@/components/brand-kit/ThumbnailArt";
import { useKitFontsReady } from "@/components/brand-kit/use-kit-fonts";
import { VARIANT_NAME } from "@/components/brand-kit/variant";
import { V3_CREAM, V3_EDGE, V3_MUTED } from "@/components/v3/Shell";
import { exportSvg } from "@/lib/brand-kit/export-png";
import { measureText } from "@/lib/brand-kit/measure";
import { defaultThumbSpec, seriesTitleCap, SOCIAL_EXPORT, THUMB_VARIANTS, thumbFilename, TITLE_TRACKING, type ThumbVariant } from "@/lib/brand-kit/thumbnail";
import { colorwayFor, KIT, NEUTRAL_COLORWAY_ID } from "@/lib/brand-kit/tokens";

/** The first set Lee posts: the five splits of Account classification, on Easy Points. */
const START = { kicker: "TYPES OF ACCOUNTS", titles: "Assets\nLiabilities\nEquity\nRevenues\nExpenses", part: "Easy Points" };
const START_CAMPUSES = [NEUTRAL_COLORWAY_ID, "ole-miss", "lsu", "tennessee"];

export function SeriesBatch() {
  useKitFontsReady();
  const [kicker, setKicker] = useState(START.kicker);
  const [titles, setTitles] = useState(START.titles);
  const [exam, setExam] = useState(1);
  const [part, setPart] = useState(START.part);
  const [variant, setVariant] = useState<ThumbVariant>("STANDARD");
  const [campuses, setCampuses] = useState<string[]>(START_CAMPUSES);
  const [adding, setAdding] = useState<string>(NEUTRAL_COLORWAY_ID);
  const refs = useRef<Record<string, SVGSVGElement | null>>({});

  const list = titles.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 12);
  const base = defaultThumbSpec({ exam, part, kicker, variant, visualType: "concept", concept: { kind: "bolt", text: "" } });
  const measure = (t: string, s: number) => measureText(t, s, 900, KIT.display, TITLE_TRACKING);
  const cap = seriesTitleCap(list.map((title) => ({ ...base, title })), measure);
  const specs = list.map((title) => ({ ...base, title, titleCap: cap }));

  const download = async (ids: readonly string[]) => {
    for (const id of ids) {
      const cw = colorwayFor(id);
      for (let i = 0; i < specs.length; i++) {
        await exportSvg(refs.current[`${id}:${i}`] ?? null, { width: SOCIAL_EXPORT.w, height: SOCIAL_EXPORT.h, filename: thumbFilename(specs[i], cw.id, "social") });
      }
    }
  };
  const blocked = !specs.length ? "Type at least one title." : !campuses.length ? "Add a campus." : null;

  return (
    <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start", color: V3_CREAM }}>
      <div style={{ flex: "0 0 320px" }}>
        <Field label="Kicker" hint="The small line over every title in the set.">
          <input value={kicker} onChange={(e) => setKicker(e.target.value)} style={input} />
        </Field>
        <Field label="Titles · one video per line" hint={cap ? `Set at ${cap}px — the size the longest title fits — so the covers match.` : undefined}>
          <textarea value={titles} onChange={(e) => setTitles(e.target.value)} rows={5} style={{ ...input, resize: "vertical" }} />
        </Field>
        <Field label="Series" hint="EXAM 1 · EASY POINTS on every cover.">
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" min={1} max={9} value={exam} onChange={(e) => setExam(Math.max(1, Math.min(9, Number(e.target.value) || 1)))} style={{ ...input, width: 56 }} aria-label="Exam" />
            <input value={part} onChange={(e) => setPart(e.target.value)} style={input} aria-label="Topic or number" />
          </div>
        </Field>
        <Field label="Variant">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {THUMB_VARIANTS.map((v) => <Chip key={v} on={variant === v} onClick={() => setVariant(v)}>{VARIANT_NAME[v]}</Chip>)}
          </div>
        </Field>
        <Field label="Campuses" hint="Click a campus to drop it. Social posts carry one colourway each — pick the set you post.">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {campuses.map((id) => (
              <Chip key={id} on onClick={() => setCampuses((c) => c.filter((x) => x !== id))} title="Drop this campus">{colorwayFor(id).name} ×</Chip>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <CampusSelect value={adding} onChange={setAdding} />
            <button type="button" onClick={() => setCampuses((c) => (c.includes(adding) ? c : [...c, adding]))} style={small}>add</button>
          </div>
        </Field>
        <div style={{ marginTop: 14 }}>
          <ExportButton strong label={`Download all ${specs.length * campuses.length} covers`} blocked={blocked} run={() => download(campuses)} />
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: V3_MUTED, lineHeight: 1.5 }}>
          1080×1920 PNGs, named survive-exam-1-…-cover-&lt;campus&gt;.png. Site thumbnails carry no title, so a set's would all be
          alike — make those per video in the studio below.
        </div>
      </div>

      <div style={{ flex: "1 1 600px", minWidth: 320 }}>
        {campuses.map((id) => {
          const cw = colorwayFor(id);
          return (
            <div key={id} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{cw.name}</span>
                <ExportButton label={`Download these ${specs.length}`} blocked={blocked} run={() => download([id])} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {specs.map((s, i) => (
                  <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${V3_EDGE}` }}>
                    <ThumbnailArt ref={(el) => { refs.current[`${id}:${i}`] = el; }} spec={s} colorway={cw} mode="social" width={132} live />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
