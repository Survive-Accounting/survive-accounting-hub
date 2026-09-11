// THE SOCIAL KIT — /branding/social. Lee, 2026-09-11: one reusable branded system for setting up
// Instagram, TikTok and YouTube. In priority order: the master avatar (one image for all three),
// the YouTube banner (the only platform-specific asset, because YouTube requires one), and a
// reusable 1080×1920 cover template — plus the campus bolts, for design review.
//
// Every mark is the real one (brand.tsx's <Bolt>, the SurviveWordmark lockup), every colour and
// face is the app's (lib/brand-kit/tokens.ts), and every export is the preview itself, painted at
// its exact size with the guides left behind (lib/brand-kit/export-png.ts).
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import { BAD, CampusSelect, Chip, ExportButton, Field, input, MINT } from "@/components/brand-kit/kit-ui";
import { KitBoltCentered } from "@/components/brand-kit/KitMarks";
import { AvatarArt, BannerArt } from "@/components/brand-kit/SocialArt";
import { ThumbnailArt } from "@/components/brand-kit/ThumbnailArt";
import { useKitFontsReady } from "@/components/brand-kit/use-kit-fonts";
import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { exportSvg } from "@/lib/brand-kit/export-png";
import {
  AVATAR, AVATAR_FILL, AVATAR_MIN_CLEARANCE, avatarClearance, BANNER, BANNER_VIEWS, CAMPUS_CHECK_IDS, PLATFORMS, SOCIAL_COVER_FILENAME,
} from "@/lib/brand-kit/social";
import { defaultThumbSpec, exportProblem, SOCIAL_EXPORT, type ThumbSpec } from "@/lib/brand-kit/thumbnail";
import { colorwayFor, KIT, NEUTRAL_COLORWAY_ID } from "@/lib/brand-kit/tokens";

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: V3_GOLD }}>{title}</div>
      <div style={{ fontSize: 12.5, color: V3_MUTED, margin: "4px 0 14px", maxWidth: 760, lineHeight: 1.5 }}>{blurb}</div>
      {children}
    </section>
  );
}

function Circle({ size, fill }: { size: number; fill: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
      <AvatarArt fill={fill} width={size} />
    </div>
  );
}

const caption: React.CSSProperties = { marginTop: 6, fontSize: 11, color: V3_MUTED, textAlign: "center" };

export function SocialAssets() {
  useKitFontsReady();
  const [fill, setFill] = useState<number>(AVATAR_FILL.default);
  const [avatarGuides, setAvatarGuides] = useState(false);
  const [bannerGuides, setBannerGuides] = useState(true);
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name])));
  const [cover, setCover] = useState<ThumbSpec>(() => defaultThumbSpec({ part: "1", title: "5 TYPES OF\nACCOUNTS", concept: { kind: "bolt", text: "" } }));
  const [coverCampus, setCoverCampus] = useState<string>(NEUTRAL_COLORWAY_ID);
  const avatarRef = useRef<SVGSVGElement>(null);
  const bannerRef = useRef<SVGSVGElement>(null);
  const coverRef = useRef<SVGSVGElement>(null);
  const clear = avatarClearance(fill);
  const clearOk = clear.share >= AVATAR_MIN_CLEARANCE;
  const patchCover = (p: Partial<ThumbSpec>) => setCover((s) => ({ ...s, ...p }));

  return (
    <div style={{ color: V3_CREAM }}>
      {/* ── 1 · the avatar ─────────────────────────────────────────────────────────────────── */}
      <Section title="1 · Master avatar" blurb="One image for Instagram, TikTok and YouTube: navy, the real house bolt centred on its own ink, nothing else. The small circles are the sizes the apps actually draw it — the bolt has to read there.">
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${V3_EDGE}` }}><AvatarArt ref={avatarRef} fill={fill} width={300} guides={avatarGuides} /></div>
            <div style={caption}>square · {AVATAR.size}×{AVATAR.size}</div>
          </div>
          <div>
            <Circle size={300} fill={fill} />
            <div style={caption}>the circular crop</div>
          </div>
          <div style={{ display: "flex", gap: 22, alignItems: "flex-end", paddingTop: 20 }}>
            <div><Circle size={48} fill={fill} /><div style={caption}>48 px</div></div>
            <div><Circle size={32} fill={fill} /><div style={caption}>32 px</div></div>
          </div>
          <div style={{ minWidth: 250, flex: "1 1 250px" }}>
            <Field label="Bolt size" hint="The bolt's height as a share of the square.">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="range" min={AVATAR_FILL.min} max={AVATAR_FILL.max} step={AVATAR_FILL.step} value={fill} onChange={(e) => setFill(Number(e.target.value))} style={{ flex: 1, accentColor: V3_GOLD }} />
                <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{Math.round(fill * 100)}%</span>
              </div>
            </Field>
            <div style={{ marginTop: 10, fontSize: 12.5, color: clearOk ? MINT : BAD, lineHeight: 1.5 }}>
              {clear.clearance > 0
                ? `The bolt's farthest point, keyline included, stays ${Math.round(clear.clearance)} px inside the circle (${Math.round(clear.share * 100)}% of the radius).`
                : `The bolt runs ${Math.round(-clear.clearance)} px past the circle — the crop would cut it.`}
              {clear.clearance > 0 && !clearOk && " That's too tight — bring it down."}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <Chip on={avatarGuides} onClick={() => setAvatarGuides((g) => !g)} title="The crop circle and the bolt's reach — never exported">guides</Chip>
              <ExportButton strong label="Download Avatar PNG" blocked={clearOk ? null : "The bolt is too close to the circle."}
                run={() => exportSvg(avatarRef.current, { width: AVATAR.size, height: AVATAR.size, filename: AVATAR.filename })} />
            </div>
          </div>
        </div>
      </Section>

      {/* ── the three profiles ─────────────────────────────────────────────────────────────── */}
      <Section title="Profiles" blurb="The same avatar on all three. Display names are reference text for when you fill the profile in — they are never baked into the image.">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {PLATFORMS.map((p) => (
            <div key={p.id} style={{ width: 270, border: `1px solid ${V3_EDGE}`, borderRadius: 14, padding: 14, background: "rgba(244,239,230,0.03)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_MUTED }}>{p.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", marginTop: 12 }}>
                <Circle size={84} fill={fill} />
                <input value={names[p.id] ?? ""} onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value }))} aria-label={`${p.label} display name`}
                  style={{ ...input, fontWeight: 800, fontSize: 13.5, textAlign: "center" }} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 2 · the banner ─────────────────────────────────────────────────────────────────── */}
      <Section title="2 · YouTube banner" blurb={`${BANNER.w}×${BANNER.h}. Everything that matters sits inside YouTube's 1235×338 safe area; the faint campus trail lives outside it and may be cut. Guides show in the editor only.`}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 10 }}>
          <Chip on={bannerGuides} onClick={() => setBannerGuides((g) => !g)} title="Safe area + device bands — never exported">guides</Chip>
          <ExportButton strong label="Download YouTube Banner PNG" run={() => exportSvg(bannerRef.current, { width: BANNER.w, height: BANNER.h, filename: BANNER.filename })} />
        </div>
        <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${V3_EDGE}`, maxWidth: 1100 }}>
          <BannerArt ref={bannerRef} guides={bannerGuides} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 14, marginTop: 14, maxWidth: 1100 }}>
          {BANNER_VIEWS.map((v) => (
            <div key={v.id}>
              <div style={{ fontSize: 11.5, fontWeight: 800 }}>{v.label} <span style={{ color: V3_MUTED, fontWeight: 600 }}>· shows {v.rect.w}×{v.rect.h}</span></div>
              <div style={{ marginTop: 6, borderRadius: 8, overflow: "hidden", border: `1px solid ${V3_EDGE}` }}><BannerArt crop={v.rect} /></div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 3 · the cover template ─────────────────────────────────────────────────────────── */}
      <Section title="3 · Social cover template" blurb="The thumbnail system's social cover with free fields — for Reel, TikTok and Shorts covers and Story launch slides. Per-video covers (frames, illustrations, the four variants) are on Thumbnails.">
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "0 0 320px" }}>
            <Field label="Eyebrow" hint={<>Blank = the series label from the exam number (EXAM {cover.exam} · {cover.part.trim() ? cover.part.padStart(2, "0") : "…"}).</>}>
              <input value={cover.eyebrow} onChange={(e) => patchCover({ eyebrow: e.target.value })} placeholder="EXAM 1 · EASY POINTS" style={input} />
            </Field>
            <Field label="Exam number">
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min={1} max={9} value={cover.exam} onChange={(e) => patchCover({ exam: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} style={{ ...input, width: 64 }} />
                <input value={cover.part} onChange={(e) => patchCover({ part: e.target.value })} placeholder="01" style={input} aria-label="Video number or name" />
              </div>
            </Field>
            <Field label="Main title" hint="Enter forces a line break.">
              <textarea value={cover.title} onChange={(e) => patchCover({ title: e.target.value })} rows={2} style={{ ...input, resize: "vertical" }} />
            </Field>
            <Field label="Subtitle · optional">
              <input value={cover.subtitle} onChange={(e) => patchCover({ subtitle: e.target.value })} placeholder="Free for every campus" style={input} />
            </Field>
            <Field label="Campus accent">
              <CampusSelect value={coverCampus} onChange={setCoverCampus} />
            </Field>
            <div style={{ marginTop: 14 }}>
              <ExportButton strong label="Download Social Cover PNG" blocked={exportProblem(cover, "social")}
                run={() => exportSvg(coverRef.current, { width: SOCIAL_EXPORT.w, height: SOCIAL_EXPORT.h, filename: SOCIAL_COVER_FILENAME })} />
            </div>
            <div style={{ marginTop: 12, fontSize: 12 }}>
              <Link to="/branding/thumbnails" style={{ color: V3_GOLD }}>Per-video covers →</Link>
            </div>
          </div>
          <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${V3_EDGE}` }}>
            <ThumbnailArt ref={coverRef} spec={cover} colorway={colorwayFor(coverCampus)} mode="social" guides width={300} />
          </div>
        </div>
      </Section>

      {/* ── the campus bolts ───────────────────────────────────────────────────────────────── */}
      <Section title="Campus bolts" blurb="Design review only: the same bolt in six school colourways from the school table, on the navy and at avatar size. Campuses keep both school colours.">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {CAMPUS_CHECK_IDS.map((id) => {
            const cw = colorwayFor(id);
            return (
              <div key={id} style={{ width: 150, textAlign: "center" }}>
                <svg viewBox="0 0 200 200" width={150} height={150} style={{ display: "block", borderRadius: 14 }}>
                  <rect x={0} y={0} width={200} height={200} fill={KIT.navy} />
                  <KitBoltCentered cx={100} cy={100} inkH={136} c1={cw.c1} c2={cw.c2} />
                </svg>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginTop: 8 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden" }}>
                    <svg viewBox="0 0 200 200" width={48} height={48} style={{ display: "block" }}>
                      <rect x={0} y={0} width={200} height={200} fill={KIT.navy} />
                      <KitBoltCentered cx={100} cy={100} inkH={200 * AVATAR_FILL.default} c1={cw.c1} c2={cw.c2} />
                    </svg>
                  </div>
                  <div style={{ fontSize: 10, color: V3_MUTED, lineHeight: 1.5, textAlign: "left" }}>{cw.c1}<br />{cw.c2}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800 }}>{cw.name}</div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
