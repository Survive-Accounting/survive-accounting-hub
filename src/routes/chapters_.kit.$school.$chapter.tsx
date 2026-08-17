// /chapters/kit/<school>/<chapter> — the share kit: a printable flyer and a projector slide, both
// carrying the chapter's /go/ URL and a QR of it. Phase 2b.
//
// WHY A PAGE AND NOT A GENERATED FILE. The obvious reading of "flyer generation" is a server that
// renders a PDF. That would mean a PDF renderer, a font pipeline and a storage bucket, to produce
// something a browser already prints natively — and it would be one more thing that can be stale
// when the chapter's name or link changes. This page IS the artefact: Cmd/Ctrl-P gives a flyer,
// and the slide view is 16:9 for a laptop plugged into the chapter room's TV.
//
// noindex, and deliberately not linked from any student surface: it is an exec tool.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DEFAULT_FRAME_THEME, frameThemeVars } from "@/components/frames";
import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { getGoChapter, goPath } from "@/lib/greek-go.functions";

export const Route = createFileRoute("/chapters_/kit/$school/$chapter")({
  head: () => ({ meta: [{ title: "Chapter share kit — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: KitPage,
});

const ORIGIN = "surviveaccounting.com";

/** The QR. Uses the same public encoder the dashboard already uses rather than adding a QR library
 *  for one image — but the URL underneath it is built by goPath(), so the code and the printed link
 *  cannot disagree. LINK LAW applies to print too: a flyer with a /c/ URL on it would outlive the
 *  redirect that makes it work. */
function Qr({ url, size }: { url: string; size: number }) {
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(url)}`}
      alt={`QR code for ${url}`}
      width={size}
      height={size}
      style={{ background: "#fff", padding: Math.round(size * 0.045), borderRadius: 12 }}
    />
  );
}

function KitPage() {
  const { school, chapter } = Route.useParams();
  const [mode, setMode] = useState<"flyer" | "slide">("flyer");
  const q = useQuery({
    queryKey: ["go-chapter", school, chapter],
    queryFn: () => getGoChapter({ data: { schoolSlug: school, chapterSlug: chapter } }),
    networkMode: "always",
    staleTime: 300_000,
  });
  const ch = q.data ?? null;
  const url = `${ORIGIN}${goPath(school, chapter)}`;

  return (
    <div style={{ ...frameThemeVars(DEFAULT_FRAME_THEME), background: "var(--sa-surface-0, #0F1A2E)", minHeight: "100vh", fontFamily: BRAND_DISPLAY }}>
      <style>{`
        /* The controls are scaffolding — they must not print. The artefact fills the page and
           loses the dark chrome, because a navy full-bleed flyer costs a fortune in toner and
           reads worse on paper than it does on screen. */
        @media print {
          .kit-chrome { display: none !important; }
          .kit-art { box-shadow: none !important; margin: 0 !important; border: 0 !important; }
          @page { margin: 12mm; }
        }
      `}</style>

      <div className="kit-chrome mx-auto flex max-w-[900px] flex-wrap items-center gap-3 px-5 pt-6" style={{ fontFamily: BRAND_SANS }}>
        <span className="text-[13px] font-black" style={{ color: "var(--brand-cream)" }}>Share kit</span>
        {(["flyer", "slide"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold capitalize"
            style={{ background: mode === m ? "var(--accent)" : "rgba(245,239,230,0.06)", color: mode === m ? "#0B1220" : "var(--brand-cream)", border: "1px solid rgba(245,239,230,0.14)" }}>
            {m}
          </button>
        ))}
        <button onClick={() => window.print()} className="rounded-lg px-3 py-1.5 text-[12.5px] font-black" style={{ background: "var(--accent)", color: "#0B1220" }}>
          Print / Save PDF
        </button>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {q.isLoading ? "Loading…" : ch ? `${ch.chapterName} · ${ch.schoolName}` : "Chapter not found — check the link"}
        </span>
      </div>

      <div className="mx-auto max-w-[900px] px-5 py-6">
        {mode === "flyer"
          ? <Flyer name={ch?.chapterName ?? "Your chapter"} school={ch?.schoolName ?? ""} url={url} />
          : <Slide name={ch?.chapterName ?? "Your chapter"} school={ch?.schoolName ?? ""} url={url} />}
      </div>
    </div>
  );
}

/** THE FLYER — portrait, printed on white, pinned to a chapter-room corkboard. One instruction and
 *  one QR: a flyer that has to be read carefully has already failed. */
function Flyer({ name, school, url }: { name: string; school: string; url: string }) {
  return (
    <div className="kit-art mx-auto" style={{ width: "100%", maxWidth: 620, aspectRatio: "8.5 / 11", background: "#FFFFFF", color: "#0B1220", borderRadius: 14, padding: "7% 8%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", boxShadow: "0 24px 60px -24px rgba(0,0,0,0.6)" }}>
      <div style={{ width: 150 }}><SurviveWordmark size={40} /></div>

      <p style={{ marginTop: "6%", fontSize: "clamp(22px, 5.4cqw, 34px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.01em", fontFamily: BRAND_DISPLAY }}>
        Free Exam 1 cram videos
      </p>
      <p style={{ marginTop: 6, fontSize: "clamp(13px, 2.6cqw, 16px)", fontWeight: 800, color: "#CE1126", fontFamily: BRAND_SANS }}>
        courtesy of {name}
      </p>

      <div style={{ marginTop: "7%" }}><Qr url={`https://${url}`} size={260} /></div>

      {/* The typed URL matters as much as the QR: not everyone scans, and a phone camera that
          fails at a bad angle leaves a student with nothing unless the address is readable. */}
      <p style={{ marginTop: "5%", fontSize: "clamp(13px, 2.8cqw, 17px)", fontWeight: 900, fontFamily: BRAND_SANS, wordBreak: "break-all" }}>{url}</p>

      <p style={{ marginTop: "auto", fontSize: "clamp(11px, 2.1cqw, 13px)", lineHeight: 1.5, color: "#44506A", fontFamily: BRAND_SANS }}>
        Every Exam 1 topic, free — no card, no account.<br />
        {school ? `${school} · ` : ""}Taught by a tutor who&apos;s done this since 2015.
      </p>
    </div>
  );
}

/** THE SLIDE — 16:9 for the TV at chapter meeting. Read from the back row: the QR and the URL are
 *  the whole slide, because the person presenting it will say the rest out loud. */
function Slide({ name, school, url }: { name: string; school: string; url: string }) {
  return (
    <div className="kit-art mx-auto" style={{ width: "100%", aspectRatio: "16 / 9", background: "#0F1A2E", color: "var(--brand-cream)", borderRadius: 14, padding: "4% 5%", display: "flex", alignItems: "center", gap: "5%", boxShadow: "0 24px 60px -24px rgba(0,0,0,0.6)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ width: 130 }}><SurviveWordmark size={34} /></div>
        <p style={{ marginTop: "6%", fontSize: "clamp(20px, 3.6vw, 44px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
          Free Exam 1<br />cram videos
        </p>
        <p style={{ marginTop: "3%", fontSize: "clamp(12px, 1.5vw, 19px)", fontWeight: 800, color: "var(--accent)", fontFamily: BRAND_SANS }}>
          courtesy of {name}{school ? ` · ${school}` : ""}
        </p>
        <p style={{ marginTop: "5%", fontSize: "clamp(13px, 1.7vw, 22px)", fontWeight: 900, fontFamily: BRAND_SANS, wordBreak: "break-all" }}>{url}</p>
      </div>
      <div style={{ flexShrink: 0 }}><Qr url={`https://${url}`} size={300} /></div>
    </div>
  );
}
