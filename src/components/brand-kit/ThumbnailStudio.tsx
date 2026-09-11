// THE THUMBNAIL STUDIO — the one editor for the thumbnail system. It lives in three places and is
// the same component in each: /branding/thumbnails (any video in the bank), the 🖼 cover sheet on
// a /v3/post row, and step 5 of post-production (where the take is already loaded, so a frame of
// it is one click away).
//
// Lee, 2026-09-11: "A student should understand the video topic in under one second. Prefer one
// strong visual + one short title." So the controls are few — what the video is, which variant,
// which visual, the look — and the previews are the artwork itself (ThumbnailArt), shown for the
// neutral mark and three campuses side by side, so a recolour is checked before anything is saved.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { BAD, CampusSelect, Chip, ExportButton, Field, fileToKitImage, imageSize, input, small } from "@/components/brand-kit/kit-ui";
import { ThumbnailArt } from "@/components/brand-kit/ThumbnailArt";
import { useKitFontsReady } from "@/components/brand-kit/use-kit-fonts";
import { VARIANT_NAME } from "@/components/brand-kit/variant";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { TakeFrame } from "@/components/v3/TakeFrame";
import { loadBlastPlan } from "@/lib/blastoff.functions";
import { exportSvg } from "@/lib/brand-kit/export-png";
import { measureText } from "@/lib/brand-kit/measure";
import {
  CONCEPT_HINT, CONCEPT_KINDS, defaultThumbSpec, exportProblem, fitSocialTitle, SITE_EXPORT, SOCIAL_EXPORT,
  THUMB_VARIANTS, thumbFilename, TITLE_TRACKING, VISUAL_TYPES, type ThumbMode, type ThumbSpec, type VisualType,
} from "@/lib/brand-kit/thumbnail";
import { colorwayFor, KIT, NEUTRAL_COLORWAY_ID, type Colorway } from "@/lib/brand-kit/tokens";

/** The four the brief asked to see side by side: the neutral mark, then three campuses whose
 *  colours pull three different ways (crimson/white, orange/white, purple/gold). */
export const THUMB_CHECK_IDS = [NEUTRAL_COLORWAY_ID, "arkansas", "tennessee", "lsu"] as const;

const VISUAL_NAME: Record<VisualType, string> = { frame: "Frame of the take", illustration: "Illustration", concept: "Concept" };

export interface CoverContext {
  /** What the video is called — the social title's starting point. */
  title?: string;
  topicName?: string;
  /** Its place on the cram path ("3"), or a name ("Easy Points"). */
  part?: string;
  exam?: number;
  /** The set, so the illustrations already on its slides can be offered. */
  setId?: string;
}

export function ThumbnailStudio({ context, takeFile, onTakeFile, compact = false, picker }: {
  context?: CoverContext;
  /** Post-production's take, picked once at the top of that panel. Leave undefined and the studio
   *  keeps its own. */
  takeFile?: File | null;
  onTakeFile?: (f: File) => void;
  compact?: boolean;
  /** A slot above the controls — the /branding page's video picker. */
  picker?: ReactNode;
}) {
  useKitFontsReady();
  const [spec, setSpec] = useState<ThumbSpec>(() => defaultThumbSpec({
    title: context?.title ?? "", part: context?.part ?? "", exam: context?.exam ?? 1,
    // With the take already in hand the frame is the natural first visual; otherwise the campus
    // bolt, so a fresh studio opens on a cover that is already complete and exportable.
    visualType: takeFile !== undefined ? "frame" : "concept",
    concept: { kind: "bolt", text: "" },
  }));
  const patch = (p: Partial<ThumbSpec>) => setSpec((s) => ({ ...s, ...p }));

  // A different video (the /branding picker) re-seeds what belongs to the video and keeps the look.
  const ctxKey = `${context?.setId ?? ""}|${context?.title ?? ""}|${context?.part ?? ""}|${context?.exam ?? 1}`;
  const seeded = useRef(ctxKey);
  useEffect(() => {
    if (seeded.current === ctxKey) return;
    seeded.current = ctxKey;
    setSpec((s) => ({ ...s, title: context?.title ?? "", part: context?.part ?? "", exam: context?.exam ?? 1, frame: null, illustration: null }));
  }, [ctxKey, context?.title, context?.part, context?.exam]);

  const [focus, setFocus] = useState<string>(NEUTRAL_COLORWAY_ID);
  const cw = useMemo(() => colorwayFor(focus), [focus]);
  const [guides, setGuides] = useState(true);
  const [localTake, setLocalTake] = useState<File | null>(null);
  const take = takeFile !== undefined ? takeFile : localTake;
  const setTake = onTakeFile ?? setLocalTake;
  const [pictureErr, setPictureErr] = useState<string | null>(null);

  // THE SET'S OWN ILLUSTRATIONS — whatever the Illustrator already drew for its slides.
  const [illos, setIllos] = useState<string[] | null>(null);
  const [illosErr, setIllosErr] = useState<string | null>(null);
  useEffect(() => {
    const setId = context?.setId;
    setIllos(null); setIllosErr(null);
    if (!setId) return;
    let alive = true;
    loadBlastPlan({ data: { setId } })
      .then((plan) => {
        if (!alive) return;
        const seen = new Set<string>();
        for (const f of plan?.frames ?? []) {
          const url = f.illustration?.assetUrl;
          if (url) seen.add(url);
        }
        setIllos([...seen]);
      })
      .catch((e) => { if (alive) setIllosErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [context?.setId]);

  const pickIllustration = async (src: string) => {
    setPictureErr(null);
    try { patch({ illustration: { src, ...(await imageSize(src)) }, visualType: "illustration" }); }
    catch (e) { setPictureErr(e instanceof Error ? e.message : String(e)); }
  };
  const pickFile = async (f: File | undefined, into: "frame" | "illustration") => {
    if (!f) return;
    setPictureErr(null);
    try {
      const img = await fileToKitImage(f);
      patch(into === "frame" ? { frame: img, frameZoom: 1, frameY: 0 } : { illustration: img, illustrationZoom: 1 });
    } catch (e) { setPictureErr(e instanceof Error ? e.message : String(e)); }
  };

  const titleFit = fitSocialTitle(spec, (t, size) => measureText(t, size, 900, KIT.display, TITLE_TRACKING));

  const socialRef = useRef<SVGSVGElement>(null);
  const siteRef = useRef<SVGSVGElement>(null);
  const tiles = useRef<Record<string, SVGSVGElement | null>>({});

  const exportOne = (svg: SVGSVGElement | null, mode: ThumbMode, colorway: Colorway) => {
    const o = mode === "social" ? SOCIAL_EXPORT : SITE_EXPORT;
    return exportSvg(svg, { width: o.w, height: o.h, type: o.type, quality: mode === "site" ? SITE_EXPORT.quality : undefined, filename: thumbFilename(spec, colorway.id, mode) });
  };
  const exportFour = async () => {
    for (const id of THUMB_CHECK_IDS) {
      const c = colorwayFor(id);
      await exportOne(tiles.current[`social:${id}`] ?? null, "social", c);
      await exportOne(tiles.current[`site:${id}`] ?? null, "site", c);
    }
  };

  const bigW = compact ? 228 : 288;
  const tileW = compact ? 100 : 116;
  const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_GOLD };

  return (
    <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start", color: V3_CREAM }}>
      {/* ── the controls ─────────────────────────────────────────────────────────────────── */}
      <div style={{ flex: compact ? "1 1 280px" : "0 0 360px", minWidth: 270 }}>
        {picker}

        <Field label="Series" hint={<>A number reads <b style={{ color: V3_CREAM }}>EXAM {spec.exam} · 03</b>; a name reads <b style={{ color: V3_CREAM }}>EXAM {spec.exam} · EASY POINTS</b>.</>}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ fontSize: 11.5, color: V3_MUTED, display: "flex", alignItems: "center", gap: 6 }}>
              Exam <input type="number" min={1} max={9} value={spec.exam} onChange={(e) => patch({ exam: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} style={{ ...input, width: 56 }} />
            </label>
            <input value={spec.part} onChange={(e) => patch({ part: e.target.value })} placeholder="03 or Easy Points" style={input} />
          </div>
        </Field>

        <Field label="Kicker · social cover only" hint="Optional small line over the title — the series, e.g. TYPES OF ACCOUNTS.">
          <input value={spec.kicker} onChange={(e) => patch({ kicker: e.target.value })} placeholder="TYPES OF ACCOUNTS" style={input} />
        </Field>

        <Field label="Title · social cover only" hint={titleFit.fits ? "Enter forces a line break. The site thumbnail carries no title — /learn prints it under the card." : <span style={{ color: BAD }}>Too long to fit at any size — shorten it or break it with Enter.</span>}>
          <textarea value={spec.title} onChange={(e) => patch({ title: e.target.value })} rows={2} placeholder={"5 TYPES OF\nACCOUNTS"} style={{ ...input, resize: "vertical" }} />
        </Field>

        <Field label="Variant">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {THUMB_VARIANTS.map((v) => <Chip key={v} on={spec.variant === v} onClick={() => patch({ variant: v })}>{VARIANT_NAME[v]}</Chip>)}
          </div>
        </Field>

        <Field label="Visual">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VISUAL_TYPES.map((v) => <Chip key={v} on={spec.visualType === v} onClick={() => patch({ visualType: v })}>{VISUAL_NAME[v]}</Chip>)}
          </div>
        </Field>

        {spec.visualType === "frame" && (
          <div style={{ marginTop: 10 }}>
            <TakeFrame name={spec.title || "cover"} file={take} onFile={setTake} onUse={(still) => patch({ frame: { src: still.src, w: still.w, h: still.h }, frameZoom: 1, frameY: 0 })} />
            <label style={{ ...small, display: "inline-block", marginTop: 10, color: V3_MUTED }}>
              or use a still you already saved
              <input type="file" accept="image/*" onChange={(e) => void pickFile(e.target.files?.[0], "frame")} style={{ display: "none" }} />
            </label>
            {spec.frame && (
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", alignItems: "center", fontSize: 11.5, color: V3_MUTED }}>
                zoom <input type="range" min={1} max={2.2} step={0.01} value={spec.frameZoom} onChange={(e) => patch({ frameZoom: Number(e.target.value) })} style={{ accentColor: V3_GOLD }} />
                up / down <input type="range" min={-1} max={1} step={0.01} value={spec.frameY} onChange={(e) => patch({ frameY: Number(e.target.value) })} style={{ accentColor: V3_GOLD }} />
              </div>
            )}
          </div>
        )}

        {spec.visualType === "illustration" && (
          <div style={{ marginTop: 10 }}>
            {context?.setId && !illos && !illosErr && <div style={{ fontSize: 11.5, color: V3_MUTED }}>Loading this set's illustrations…</div>}
            {illosErr && <div style={{ fontSize: 11.5, color: BAD }}>Couldn't load this set's illustrations: {illosErr}</div>}
            {illos && illos.length === 0 && <div style={{ fontSize: 11.5, color: V3_MUTED }}>No slide in this set has an illustration yet.</div>}
            {illos && illos.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {illos.map((src) => (
                  <button key={src} type="button" onClick={() => void pickIllustration(src)} title="Use this illustration"
                    style={{ all: "unset", cursor: "pointer", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `2px solid ${spec.illustration?.src === src ? V3_GOLD : V3_EDGE}` }}>
                    <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            )}
            <label style={{ ...small, display: "inline-block", marginTop: 8, color: V3_MUTED }}>
              upload artwork
              <input type="file" accept="image/*" onChange={(e) => void pickFile(e.target.files?.[0], "illustration")} style={{ display: "none" }} />
            </label>
            {spec.illustration && (
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", fontSize: 11.5, color: V3_MUTED }}>
                zoom <input type="range" min={0.6} max={1.6} step={0.01} value={spec.illustrationZoom} onChange={(e) => patch({ illustrationZoom: Number(e.target.value) })} style={{ flex: 1, accentColor: V3_GOLD }} />
              </div>
            )}
          </div>
        )}

        {spec.visualType === "concept" && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CONCEPT_KINDS.map((k) => <Chip key={k} on={spec.concept.kind === k} onClick={() => patch({ concept: { ...spec.concept, kind: k } })}>{CONCEPT_HINT[k].label}</Chip>)}
            </div>
            {spec.concept.kind !== "bolt" && (
              <textarea value={spec.concept.text} onChange={(e) => patch({ concept: { ...spec.concept, text: e.target.value } })} rows={spec.concept.kind === "list" ? 4 : 2}
                placeholder={CONCEPT_HINT[spec.concept.kind].placeholder} style={{ ...input, marginTop: 8, resize: "vertical" }} />
            )}
            <div style={{ marginTop: 5, fontSize: 11, color: V3_MUTED }}>
              {spec.concept.kind === "stat" && "The number, a bar, the word under it."}
              {spec.concept.kind === "equation" && "Spaces or operators between the pieces."}
              {spec.concept.kind === "list" && "One per line — six at most."}
              {spec.concept.kind === "vs" && "Two words with a bar (or \"vs\") between them."}
              {spec.concept.kind === "bolt" && "The campus bolt, large — nothing to type."}
            </div>
          </div>
        )}
        {pictureErr && <div style={{ marginTop: 8, fontSize: 12, color: BAD }}>{pictureErr}</div>}

        <Field label="Look">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip on={spec.ground === "navy"} onClick={() => patch({ ground: "navy" })}>Navy</Chip>
            <Chip on={spec.ground === "black"} onClick={() => patch({ ground: "black" })}>Black</Chip>
            <Chip on={spec.glow} onClick={() => patch({ glow: !spec.glow })} title="A soft campus glow behind the visual and the site bolt">glow</Chip>
            <Chip on={spec.socialMark === "wordmark"} onClick={() => patch({ socialMark: "wordmark" })} title="The social cover signs off with…">wordmark</Chip>
            <Chip on={spec.socialMark === "bolt"} onClick={() => patch({ socialMark: "bolt" })} title="The social cover signs off with…">bolt</Chip>
          </div>
        </Field>
      </div>

      {/* ── the art ──────────────────────────────────────────────────────────────────────── */}
      <div style={{ flex: "1 1 480px", minWidth: 280 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={label}>Campus</span>
          <CampusSelect value={focus} onChange={setFocus} />
          <Chip on={guides} onClick={() => setGuides((g) => !g)} title="Crop guides — never exported">guides</Chip>
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
          <div>
            <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${V3_EDGE}`, width: bigW }}>
              <ThumbnailArt ref={socialRef} spec={spec} colorway={cw} mode="social" guides={guides} width={bigW} live />
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 800 }}>Social cover <span style={{ color: V3_MUTED, fontWeight: 600 }}>· 1080×1920 PNG</span></div>
            <div style={{ marginTop: 6 }}>
              <ExportButton strong label="Download the cover" blocked={exportProblem(spec, "social")} run={() => exportOne(socialRef.current, "social", cw)} />
            </div>
          </div>
          <div>
            <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${V3_EDGE}`, width: bigW }}>
              <ThumbnailArt ref={siteRef} spec={spec} colorway={cw} mode="site" guides={guides} width={bigW} live />
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 800 }}>Site thumbnail <span style={{ color: V3_MUTED, fontWeight: 600 }}>· 720×1280 WebP</span></div>
            <div style={{ marginTop: 6 }}>
              <ExportButton strong label="Download the thumbnail" blocked={exportProblem(spec, "site")} run={() => exportOne(siteRef.current, "site", cw)} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={label}>Campus check</span>
            <span style={{ fontSize: 11.5, color: V3_MUTED }}>The same art in four colourways — only the bolt, the dot, the hairline and the glow change. Click one to edit it above.</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
            {THUMB_CHECK_IDS.map((id) => {
              const c = colorwayFor(id);
              const on = focus === id;
              return (
                <button key={id} type="button" onClick={() => setFocus(id)} title={`Edit the ${c.name} version`}
                  style={{ all: "unset", cursor: "pointer", padding: 6, borderRadius: 12, border: `1.5px solid ${on ? V3_GOLD : "transparent"}` }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ borderRadius: 8, overflow: "hidden" }}><ThumbnailArt ref={(el) => { tiles.current[`social:${id}`] = el; }} spec={spec} colorway={c} mode="social" width={tileW} live /></div>
                    <div style={{ borderRadius: 8, overflow: "hidden" }}><ThumbnailArt ref={(el) => { tiles.current[`site:${id}`] = el; }} spec={spec} colorway={c} mode="site" width={tileW} live /></div>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11.5, fontWeight: 800, color: on ? V3_GOLD : V3_CREAM }}>{c.name}</div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 10 }}>
            <ExportButton label="Download all eight (4 campuses × cover + thumbnail)" blocked={exportProblem(spec, "social") ?? exportProblem(spec, "site")} run={exportFour} />
          </div>
        </div>
      </div>
    </div>
  );
}
