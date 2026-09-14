// QUICK POST · THE SOCIALS — per video: is it worth posting, one button per platform, and a skip.
//
// Lee, 2026-09-14: "For any of the videos in any series, I want to know which ones are worthy of posting
// to Reels, TikTok, and YT shorts… an icon for each, and if I click an icon, we can generate the
// title/description and thumbnail right away right there. We can have a link to open channel page to
// upload… a skip icon that strikes through all the social icons." And: "Move to quick post."
//
// Click a platform: the copy for all three platforms is written (once) from the title and the set's
// questions, saved on the video's publish row, and shown for that platform with Copy, the cover as a
// 1080×1920 PNG, and the upload page (which copies the caption first). A pasted link marks it posted.
import { useState } from "react";

import { V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { buildCaptionMessages, captionClipboardText, hasCaptions, parseCaptions, type CaptionDestination, type DestinationCaption, type PublishCaptions } from "@/lib/caption-brief";
import { renderSvgToBlob } from "@/lib/brand-kit/export-png";
import { SOCIAL_EXPORT } from "@/lib/brand-kit/thumbnail";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { setPublishCaptions, setPublishSocialSkip, setPublishUrl, togglePublishDestination, type SetPublishStatus } from "@/lib/publish-queue.functions";
import { runMicro } from "@/lib/talkthrough.functions";

import { DEST_UPLOAD_URL, looksLikeUrl, socialPickForTitle } from "./post-links";

const MINT = "#7BD3A8";
const RED = "#FF8A7A";
type Social = "youtube" | "instagram" | "tiktok";
const PLATFORMS: { d: Social; short: string; label: string }[] = [
  { d: "instagram", short: "IG", label: "Instagram Reels" },
  { d: "tiktok", short: "TT", label: "TikTok" },
  { d: "youtube", short: "YT", label: "YouTube Shorts" },
];

export const EMPTY_STATUS: SetPublishStatus = {
  site: { postedAt: null, url: null }, youtube: { postedAt: null, url: null }, instagram: { postedAt: null, url: null }, tiktok: { postedAt: null, url: null },
  filmedAt: null, captions: null, cover: null, socialSkip: false,
};

const chip = (on: boolean, tone: string): React.CSSProperties => ({
  font: "inherit", fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap",
  border: `1px solid ${on ? tone : V3_EDGE}`, background: on ? `${tone}22` : "transparent", color: on ? tone : V3_CREAM,
});
const field: React.CSSProperties = { background: "rgba(0,0,0,0.25)", color: V3_CREAM, border: `1px solid ${V3_EDGE}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

export function QuickPostSocial({ pubKey, title, setName, topicName, stems, status, onStatus, coverSvg }: {
  pubKey: string; title: string; setName: string; topicName: string;
  /** The set's questions this video likely covers — what the copy is written from beside the title. */
  stems: readonly string[];
  status: SetPublishStatus; onStatus: (s: SetPublishStatus) => void;
  /** The row's cover art, drawn on the page — exported as the social PNG. */
  coverSvg: () => SVGSVGElement | null;
}) {
  const [open, setOpen] = useState<Social | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [draft, setDraft] = useState<PublishCaptions | null>(null);
  const pick = socialPickForTitle(title);
  const skip = status.socialSkip;
  const say = (text: string, bad = false) => setNote({ text, bad });

  const save = async (fn: () => Promise<{ ok: boolean; error?: string; status?: SetPublishStatus }>) => {
    const r = await fn();
    if (r.ok && r.status) { onStatus(r.status); return true; }
    say(r.error ?? "Not saved — try again.", true); return false;
  };

  const generate = async () => {
    setBusy(true); setNote(null);
    try {
      const m = buildCaptionMessages({ setName: `${setName} — ${title}`, topicName, stems, keptLines: [], talkthrough: "", spoken: `The video is "${title}". Short, punchy, for accounting students cramming for an exam.`, previous: null });
      const r = await runMicro({ data: { system: m.system, user: m.user, maxOutput: 900 } });
      const parsed = parseCaptions(r.text);
      if (!parsed) throw new Error("The copy didn't come back clean — press Write again.");
      setDraft(parsed);
      await save(() => setPublishCaptions({ data: { setId: pubKey, captions: parsed } }));
    } catch (e) { say(e instanceof Error ? e.message : String(e), true); }
    finally { setBusy(false); }
  };

  const openPlatform = (d: Social) => {
    if (open === d) { setOpen(null); return; }
    setOpen(d); setNote(null); setDraft(status.captions);
    if (!hasCaptions(status.captions)) void generate();
  };

  const caps = draft ?? status.captions;
  const c: DestinationCaption | null = open && caps ? caps[open as CaptionDestination] : null;
  const edit = (patch: Partial<DestinationCaption>) => { if (!open || !caps) return; setDraft({ ...caps, [open]: { ...caps[open], ...patch } }); };
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(status.captions);

  const downloadCover = async () => {
    const svg = coverSvg();
    if (!svg) { say("The cover isn't on the page yet.", true); return; }
    const blob = await renderSvgToBlob(svg, { width: SOCIAL_EXPORT.w, height: SOCIAL_EXPORT.h, type: SOCIAL_EXPORT.type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "cover"}-1080x1920.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say("Cover saved — 1080×1920 PNG");
  };

  const upload = async (d: Social) => {
    const url = DEST_UPLOAD_URL[d];
    if (!url || !c) return;
    const copying = copyToClipboard(captionClipboardText(c));
    window.open(url, "_blank", "noopener");
    say((await copying) ? "Caption copied — paste it in" : "Couldn't copy — use Copy", !(await copying));
  };

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span title={pick.why} style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", borderRadius: 999, padding: "2px 8px", border: `1px solid currentColor`, color: pick.pick === "post" ? MINT : pick.pick === "maybe" ? V3_GOLD : V3_MUTED }}>
          {pick.pick === "post" ? "Suggest: post" : pick.pick === "maybe" ? "Suggest: maybe" : "Suggest: site only"}
        </span>
        {PLATFORMS.map((p) => {
          const posted = !!status[p.d].postedAt;
          return (
            <button key={p.d} type="button" disabled={skip} onClick={() => openPlatform(p.d)} aria-pressed={open === p.d}
              title={skip ? `Skipped for ${p.label}` : posted ? `Posted to ${p.label}` : `${p.label}: write the copy, get the cover, open the upload page`}
              style={{ ...chip(open === p.d || posted, posted ? MINT : V3_GOLD), textDecoration: skip ? "line-through" : "none", opacity: skip ? 0.45 : 1, cursor: skip ? "default" : "pointer" }}>
              {posted ? "✓ " : ""}{p.short}
            </button>
          );
        })}
        <button type="button" onClick={() => void save(() => setPublishSocialSkip({ data: { setId: pubKey, skip: !skip } })).then((ok) => { if (ok && !skip) setOpen(null); })}
          aria-pressed={skip} title={skip ? "Skipped on the socials — click to un-skip" : "Skip this one on Instagram, TikTok and YouTube"} style={chip(skip, RED)}>
          ⊘ {skip ? "skipped" : "skip"}
        </button>
        {note && <span role="status" style={{ fontSize: 11.5, fontWeight: 700, color: note.bad ? RED : MINT }}>{note.text}</span>}
      </div>

      {open && !skip && (
        <div style={{ border: `1px solid ${V3_EDGE}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 800 }}>
            {PLATFORMS.find((p) => p.d === open)!.label}
            <span style={{ flex: 1 }} />
            <button type="button" style={chip(false, V3_GOLD)} disabled={busy} onClick={() => void generate()}>{busy ? "Writing…" : hasCaptions(caps) ? "Write again" : "Write"}</button>
          </div>
          {busy && !c?.title && <div style={{ fontSize: 12, color: V3_MUTED }}>Writing the title and description…</div>}
          {c && (<>
            <input value={c.title} onChange={(e) => edit({ title: e.target.value })} placeholder="Title" aria-label="Title" style={{ ...field, fontWeight: 700 }} />
            <textarea value={c.caption} onChange={(e) => edit({ caption: e.target.value })} placeholder="Description" aria-label="Description" rows={3} style={{ ...field, resize: "vertical" }} />
            <input value={c.hashtags.map((h) => `#${h}`).join(" ")} onChange={(e) => edit({ hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean) })} placeholder="#hashtags" aria-label="Hashtags" style={field} />
          </>)}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {dirty && <button type="button" style={chip(true, V3_GOLD)} onClick={() => void save(() => setPublishCaptions({ data: { setId: pubKey, captions: draft } })).then((ok) => ok && say("Saved"))}>Save edits</button>}
            <button type="button" style={chip(false, V3_GOLD)} disabled={!c} onClick={() => c && void copyToClipboard(captionClipboardText(c)).then((ok) => say(ok ? "Copied" : "Couldn't copy", !ok))}>Copy</button>
            <button type="button" style={chip(false, V3_GOLD)} onClick={() => void downloadCover()}>Cover PNG</button>
            <button type="button" style={chip(true, V3_GOLD)} disabled={!c} onClick={() => void upload(open)}>Open upload page ↗</button>
          </div>
          <input defaultValue={status[open].url ?? ""} key={`${open}-${status[open].url ?? ""}`} placeholder={`Paste the ${PLATFORMS.find((p) => p.d === open)!.label} link — marks it posted`} aria-label="Posted link" style={field}
            onPaste={(e) => {
              const url = e.clipboardData.getData("text").trim();
              if (!looksLikeUrl(url)) return;
              e.preventDefault();
              const d = open;
              void save(() => setPublishUrl({ data: { setId: pubKey, destination: d, url } })).then(async (ok) => {
                if (ok && !status[d].postedAt && (await save(() => togglePublishDestination({ data: { setId: pubKey, destination: d, posted: true } })))) say("Marked posted");
              });
            }} />
        </div>
      )}
    </div>
  );
}
