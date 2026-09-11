// POST-PRODUCTION — everything between "the take is finished" and "it's posted", in order.
//
// Lee, 2026-09-09: "Where do I upload the video file? Where can I add captions? I want to do this
// from the post point. It's post-filming / post production to me. So somewhere in /post. Explain
// how this process can work and in the most streamlined way. I'm a bit confused the order of
// operations once I have a finished video file."
//
// He was right to be confused: the caption copy lived on the row, the cover lived in another
// sheet, and the subtitles lived in a command line on a machine he doesn't post from. Three
// tools, no line. This is the line.
//
// THE TAKE IS PICKED ONCE, AT THE TOP. Every step reads that same File — the transcript strips
// ~2MB of audio out of it locally, the cover grabs a frame out of it locally — and, since he
// asked ("I actually don't have the video file on this computer… Can we add a way for me to
// upload the file in the web app?"), the bytes also go up to canvas-media in the background so
// the renderer can reach them. Direct to storage with a signed upload: a 400MB file never
// passes through Vercel.
//
// NO BURN STEP SINCE 2026-09-12. There used to be one between the transcript and the copy: the
// .ass went up beside the take and the Fly worker burned it in. Lee, asked whether captions were
// worth the eighth of the frame they took: "I think if we remove captions, it creates more space
// in the frame for us to teach from. Probably worth more than captions… Yes remove." So the
// slides took that space back (blastoff/layout.ts) and this panel offers the .srt under the
// transcript instead — the platforms read it as a caption track, and it costs no frame space.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ThumbnailStudio } from "@/components/brand-kit/ThumbnailStudio";
import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { downloadText, mediaDurationS, storedTranscript, transcribeTakeFile } from "@/components/v3/take-transcript";
import { clock, transcriptFitsFile } from "@/lib/take-match";
import { shortCaptionFiles, srtName, transcriptFromWords, whisperCostUsd, type Word } from "@/lib/short-captions";
// Imported up front (2026-09-11), not on demand: a deploy mid-session 404'd the lazy chunk.
import { uploadCover, uploadTake } from "@/components/v3/take-burn";
import { setPublishCover, type SetPublishStatus } from "@/lib/publish-queue.functions";
import { resolveSitePost, startSitePost } from "@/lib/site-publish.functions";
import { splitOfPubKey } from "@/lib/short-publication";
import type { PublishCover } from "@/lib/publish-cover";
import { takeFileProblem } from "@/lib/take-frame";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const MINT = "#3BF5A0";

const small: React.CSSProperties = { font: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "transparent", color: V3_CREAM, cursor: "pointer", whiteSpace: "nowrap" };
const primary: React.CSSProperties = { ...small, fontSize: 12.5, padding: "7px 14px", border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)" };

/** One numbered step. Open by default until it's done, then it folds itself away — the panel
 *  should read as a checklist that shortens, not a wall. */
function Step({ n, title, hint, done, children }: {
  n: number; title: string; hint?: string; done?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (done) setOpen(false); }, [done]);
  return (
    <section style={{ border: `1px solid ${done ? `${MINT}44` : V3_EDGE}`, borderRadius: 12, padding: "11px 14px", marginTop: 10 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "baseline", gap: 9, width: "100%" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: done ? MINT : V3_GOLD, fontVariantNumeric: "tabular-nums" }}>{done ? "✓" : n}</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: V3_CREAM }}>{title}</span>
        {hint && <span style={{ fontSize: 11.5, color: V3_MUTED }}>{hint}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: V3_MUTED }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </section>
  );
}

export function PostProduction({ pubKey, title, topicName, coverSeed, onTranscript, onOpenCopy, onClose, hidden = false, copyDone = false, cover = null, onCoverSaved, setId: setIdProp, takeIndex: takeIndexProp, takeName = "", sitePosted = null, onSitePosted }: {
  /** The publish key for THIS video — the set's id, or "<setId>#N" for a split. */
  pubKey: string;
  /** What this video is called: the set's name, or the split's. */
  title: string;
  topicName: string;
  /** Step 5's studio seed: the set (for its illustrations) and the video's place on the cram path
   *  ("3") or a name for the series label. */
  coverSeed?: { setId: string; part?: string };
  /** Handed up so the caption sheet writes from what he actually said on camera. */
  onTranscript: (text: string) => void;
  /** Opens step 4 — the caption sheet, seeded with the transcript. */
  onOpenCopy: () => void;
  onClose: () => void;
  /** ONE MODAL AT A TIME (2026-09-09). While the caption sheet is up, the panel steps aside —
   *  but stays mounted, because the picked take, its upload and the burned file are all state
   *  in here, and unmounting to make room for the sheet would throw a 300MB upload away. The
   *  route flips this back off when the sheet closes and the panel is where he left it. */
  hidden?: boolean;
  /** Step 4 is done when the captions are saved on the row — the route knows, this doesn't. */
  copyDone?: boolean;
  /** YOUR OWN THUMBNAIL (2026-09-11): the image saved on this video's row, and the row after a save. */
  cover?: PublishCover | null;
  onCoverSaved?: (s: SetPublishStatus) => void;
  /** POST TO THE SITE (2026-09-11): which set this video belongs to, which part it is (0-based),
   *  the part's name, the row's site tick, and the row after a post. */
  /** Absent (the /v3 map opens this panel with the key only) = read from the publish key. */
  setId?: string;
  takeIndex?: number;
  takeName?: string;
  sitePosted?: { postedAt: string | null; url: string | null } | null;
  onSitePosted?: (s: SetPublishStatus) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [words, setWords] = useState<Word[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // THE STORED TRANSCRIPT MUST FIT THE FILE (2026-09-11, lib/take-match.ts): the row's length and
  // the picked take's own length, read from its metadata.
  const [storedS, setStoredS] = useState<number | null>(null);
  const [fileS, setFileS] = useState<number | null>(null);
  // TRANSCRIBE BY DEFAULT (2026-09-11): the take's length has been read (or couldn't be), so step 2
  // may run; and the transcript's own copy button.
  const [fileChecked, setFileChecked] = useState(false);
  const [txCopied, setTxCopied] = useState(false);
  // YOUR OWN THUMBNAIL (2026-09-11, lib/publish-cover.ts): uploaded, kept on this video's row.
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverErr, setCoverErr] = useState<string | null>(null);
  // POST TO THE SITE (2026-09-11, site-publish.functions.ts): the take step 1 uploaded goes to the
  // video host as a public video, then onto the set for students.
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteNote, setSiteNote] = useState<string | null>(null);
  const [siteErr, setSiteErr] = useState<string | null>(null);
  const [siteLink, setSiteLink] = useState<string | null>(null);
  // The set and the part: the route's, else what the publish key names ("<setId>" is part 1,
  // "<setId>#N" is part N).
  const keyed = splitOfPubKey(pubKey);
  const setId = setIdProp ?? keyed.setId;
  const takeIndex = takeIndexProp ?? keyed.takeIndex;
  const saveCover = async (img: File | null) => {
    setCoverBusy(true); setCoverErr(null);
    try {
      const next = img ? { url: await uploadCover(img), name: img.name } : null;
      const r = await setPublishCover({ data: { setId: pubKey, cover: next } });
      if (!r.ok || !r.status) throw new Error(r.error || "The thumbnail didn't save on the row.");
      onCoverSaved?.(r.status);
    } catch (e) { setCoverErr(e instanceof Error ? e.message : String(e)); }
    finally { setCoverBusy(false); }
  };
  const pickCover = (img: File | null) => {
    if (!img) return;
    if (!/^image\//.test(img.type)) { setCoverErr("That isn't an image. Pick a PNG or a JPG."); return; }
    if (img.size > 10 * 1048576) { setCoverErr("That image is over 10MB. Export a smaller one."); return; }
    void saveCover(img);
  };

  // A transcript already run for this video comes straight back — it is stored by publish key,
  // so re-opening the panel is free and never re-bills.
  useEffect(() => {
    let alive = true;
    storedTranscript(pubKey)
      .then((row) => { if (alive && row?.words?.length) { setWords(row.words); setStoredS(row.duration_s ?? null); setNote(`Transcribed earlier${row.duration_s ? ` (${clock(row.duration_s)})` : ""} — reusing it.`); } })
      .catch(() => { /* no row, or the table isn't there — step 2 will say so when he asks */ });
    return () => { alive = false; };
  }, [pubKey]);

  // A take that doesn't fit the stored words is a different take: drop them, and step 2 transcribes
  // this one (transcribeTakeFile overwrites the row).
  useEffect(() => {
    if (fileS == null || storedS == null || transcriptFitsFile(storedS, fileS)) return;
    setWords(null);
    setStoredS(null);
    setNote(`The stored transcript is ${clock(storedS)} but this take is ${clock(fileS)} — get the transcript for this one.`);
  }, [fileS, storedS]);

  const text = useMemo(() => (words ? transcriptFromWords(words) : ""), [words]);
  useEffect(() => { if (text) onTranscript(text); }, [text, onTranscript]);
  const files = useMemo(() => (words ? shortCaptionFiles(words) : null), [words]);

  const run = useCallback(async (force: boolean) => {
    if (!file) { setErr("Pick the take first."); return; }
    setBusy(true); setErr(null);
    try {
      const row = await transcribeTakeFile(pubKey, file, setNote, force, fileS);
      setWords(row.words ?? []);
      setStoredS(row.duration_s ?? null);
      setNote(`${(row.words ?? []).length} words${row.duration_s ? ` from ${Math.round(row.duration_s)}s` : ""}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setNote(null);
    } finally { setBusy(false); }
  }, [file, pubKey, fileS]);

  // TRANSCRIBE BY DEFAULT (2026-09-11). Lee: "It's cheap enough that by default, if I upload a
  // mp4, let's transcribe it and let me download it easily." Once per picked take, as soon as its
  // length has been read, so a stored transcript for a different take is never reused: step 2
  // runs on its own. A stored transcript that fits comes straight back and bills nothing.
  const autoFor = useRef<File | null>(null);
  useEffect(() => {
    if (!file || !fileChecked || busy || autoFor.current === file) return;
    autoFor.current = file;
    void run(false);
  }, [file, fileChecked, busy, run]);

  // THE TRANSCRIPT, one click to copy (2026-09-11).
  const copyTranscript = async () => { setTxCopied(await copyToClipboard(text)); window.setTimeout(() => setTxCopied(false), 1800); };

  // THE UPLOAD. Starts the moment he picks the take and runs in the background while he does
  // step 2 — by the time the transcript is back the bytes are usually already there. Direct to
  // storage, so a 400MB file is not a body-limit problem.
  const [upFrac, setUpFrac] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);

  const pick = (picked: File | null) => {
    const problem = takeFileProblem(picked);
    if (problem || !picked) { setErr(problem); return; }
    setErr(null); setFile(picked);
    setFileS(null); setFileChecked(false);
    void mediaDurationS(picked).then((s) => { setFileS(s); setFileChecked(true); });
    setVideoUrl(null); setUpErr(null); setUpFrac(0);
    void (async () => {
      try {
        setVideoUrl(await uploadTake(picked, setUpFrac));
        setUpFrac(1);
      } catch (e) {
        setUpErr(e instanceof Error ? e.message : String(e));
        setUpFrac(null);
      }
    })();
  };

  const postToSite = async () => {
    const source = videoUrl;
    if (!source) return;
    setSiteBusy(true); setSiteErr(null); setSiteLink(null);
    try {
      setSiteNote("Sending it to the video host…");
      const { assetId } = await startSitePost({ data: { videoUrl: source, pubKey } });
      const deadline = Date.now() + 15 * 60 * 1000;
      let misses = 0;
      for (;;) {
        await new Promise((r) => window.setTimeout(r, 4000));
        if (Date.now() > deadline) throw new Error("The video host is taking longer than fifteen minutes. Press Post again later.");
        let r;
        try { r = await resolveSitePost({ data: { assetId, setId, pubKey, takeIndex, takeName, title, videoUrl: source } }); misses = 0; }
        catch (e) {
          misses += 1;
          if (misses >= 4) throw e;
          setSiteNote("The site is slow to answer. Checking again…");
          continue;
        }
        if (r.state === "error") throw new Error(r.error);
        if (r.state === "posted") {
          setSiteLink(r.link);
          setSiteNote(r.statusError ? `On the site. The row's tick didn't save: ${r.statusError}` : "On the site.");
          if (r.status) onSitePosted?.(r.status);
          return;
        }
        setSiteNote("The video host is processing it…");
      }
    } catch (e) { setSiteErr(e instanceof Error ? e.message : String(e)); setSiteNote(null); }
    finally { setSiteBusy(false); }
  };

  // ESCAPE CLOSES — the same capture-phase handler the caption sheet has (routes/v3.post.tsx),
  // and off while the sheet is up so one Escape closes one modal, not both.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (hidden) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [hidden]);

  if (hidden) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Post-production — ${title}`} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2147482800, background: "rgba(5,8,16,0.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflowY: "auto", background: "#0B0F1E", color: V3_CREAM, border: `1px solid ${V3_GOLD}66`, borderRadius: 16, padding: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: V3_DISPLAY, fontSize: 20, fontWeight: 900, letterSpacing: "-0.01em" }}>Post-production</div>
          <div style={{ fontSize: 12.5, color: V3_MUTED }}>{title} · {topicName}</div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ ...small, color: V3_MUTED }}>close</button>
        </div>
        {/* HONEST about where the bytes go (2026-09-09): the take DOES upload now — that is
            what lets the worker burn it — so the old "never uploads" line was a lie the moment
            the upload shipped. Three clauses, one per thing that moves. */}
        <div style={{ marginTop: 8, fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
          The take goes to our storage so the renderer can reach it; the transcript sends about 2 MB of audio; the cover is read on this machine.
        </div>

        {err && <div style={{ marginTop: 10, fontSize: 12.5, color: "#FF8B7E" }}>{err}</div>}

        {/* ── 1 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={1} title="The take" hint={file ? file.name : "the finished .mp4 from OBS"} done={!!videoUrl}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            Pick it from whichever machine you're on — the name doesn't matter, it reads whatever
            OBS wrote. It uploads in the background while you do step 2.
          </div>
          <label style={{ ...primary, display: "inline-block", marginTop: 8, color: V3_GOLD }}>
            {file ? "Pick a different take" : "Pick the take file"}
            <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
          </label>
          {file && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: V3_MUTED }}>
              {file.size < 1048576 ? "<1MB" : `${(file.size / 1048576).toFixed(0)}MB`} ·{" "}
              {upErr ? <span style={{ color: "#FF8B7E" }}>upload failed — {upErr}</span>
                : videoUrl ? <span style={{ color: MINT }}>uploaded</span>
                : <span style={{ color: V3_GOLD }}>uploading… {upFrac != null ? `${Math.round(upFrac * 100)}%` : ""}</span>}
            </div>
          )}
          {file && !videoUrl && !upErr && (
            <div style={{ marginTop: 6, height: 4, borderRadius: 3, background: "rgba(244,239,230,0.10)", overflow: "hidden" }}>
              <div style={{ width: `${Math.round((upFrac ?? 0) * 100)}%`, height: "100%", background: V3_GOLD, transition: "width 200ms linear" }} />
            </div>
          )}
        </Step>

        {/* ── 2 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={2} title="The transcript" hint={words ? `${words.length} words` : "what you actually said"} done={!!words?.length}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            It starts on its own when you pick the take. The audio alone goes out — about 2MB a minute, well under Whisper's cap — and the words
            come back timed. Everything below is written from them.
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" disabled={!file || busy} onClick={() => void run(false)} style={{ ...primary, opacity: !file || busy ? 0.5 : 1 }}>
              {busy ? "Working…" : words ? "Transcribed" : "Get the transcript"}
            </button>
            {words && !busy && <button type="button" onClick={() => void run(true)} style={small} title="Run Whisper again and overwrite the stored words">re-run</button>}
            <span style={{ fontSize: 11.5, color: V3_MUTED }}>~${whisperCostUsd(files?.seconds || 180).toFixed(3)}</span>
            {note && <span style={{ fontSize: 11.5, color: busy ? V3_GOLD : MINT }}>{note}</span>}
          </div>
          {text && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => void copyTranscript()} style={{ ...primary, color: txCopied ? MINT : V3_CREAM }}>{txCopied ? "copied" : "Copy the transcript"}</button>
              <button type="button" onClick={() => downloadText(`${(file?.name ?? title).replace(/.w+$/, "")}.transcript.txt`, text)} style={small}>Download it (.txt)</button>
              {/* THE CAPTION TRACK (2026-09-12): nothing is burned into the picture any more, but
                  YouTube and the rest read this file and lay their own captions over the video —
                  the viewer turns them on, and they cost the slide no room. */}
              {files && file && <button type="button" onClick={() => downloadText(srtName(file.name), files.srt, "application/x-subrip")} style={small}
                title="A caption track to upload beside the video — YouTube reads it natively. Nothing is burned into the picture.">Save the captions (.srt)</button>}
            </div>
          )}
          {text && (
            <textarea readOnly value={text} rows={4}
              style={{ width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12, lineHeight: 1.5, marginTop: 8, padding: "7px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none", resize: "vertical" }} />
          )}
        </Step>

        {/* ── 3 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={3} title="The copy" hint={copyDone ? "saved on the row" : "title, description, hashtags"} done={copyDone}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            {text
              ? "Written from the transcript — what you said on camera outranks everything else. Talk over it if you want to steer the angle."
              : "Get the transcript first and this writes itself from it; without one it falls back to your kept prompter lines."}
          </div>
          <button type="button" onClick={onOpenCopy} style={{ ...primary, marginTop: 8 }}>Write the copy</button>
        </Step>

        {/* ── 4 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={4} title="The cover" hint={cover ? "your own thumbnail is saved" : "your own image, or make one: the social cover and the site thumbnail"} done={!!cover}>
          {/* YOUR OWN THUMBNAIL (2026-09-11): an image he made himself, kept on this video's row. */}
          <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${V3_EDGE}` }}>
            <div style={{ fontSize: 12.5, color: V3_CREAM, fontWeight: 700 }}>Your own thumbnail</div>
            <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {cover && (
                <a href={cover.url} target="_blank" rel="noreferrer" title="Open it full size">
                  <img src={cover.url} alt={`Thumbnail: ${cover.name}`} style={{ width: 54, height: 96, objectFit: "cover", borderRadius: 6, border: `1px solid ${V3_EDGE}`, display: "block" }} />
                </a>
              )}
              <label style={{ ...small, display: "inline-block", color: V3_GOLD, opacity: coverBusy ? 0.5 : 1 }}>
                {coverBusy ? "Saving…" : cover ? "Replace it" : "Upload an image"}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={coverBusy} onChange={(e) => { pickCover(e.target.files?.[0] ?? null); e.target.value = ""; }} style={{ display: "none" }} />
              </label>
              {cover && !coverBusy && <button type="button" onClick={() => void saveCover(null)} style={small}>Remove</button>}
              {cover && <span style={{ fontSize: 11.5, color: MINT }}>saved with this video · {cover.name}</span>}
              {coverErr && <span style={{ fontSize: 11.5, color: "#FF8B7E" }}>{coverErr}</span>}
            </div>
          </div>
          {/* THE THUMBNAIL SYSTEM (2026-09-11) — the same studio as /branding/thumbnails, handed
              this take: its frame picker is the SAME door as step 1's (a take chosen here starts
              the upload too), and "Use on the cover" drops the still straight into the art. */}
          <ThumbnailStudio compact context={{ title, topicName, setId: coverSeed?.setId, part: coverSeed?.part, exam: 1 }} takeFile={file} onTakeFile={pick} />
        </Step>

        {/* ── 5 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={5} title="Post it" hint="by hand, then tick it off">
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.6 }}>
            Upload <b style={{ color: V3_CREAM }}>{file ? file.name : "the take"}</b> — your take as it came out of OBS — to YouTube, Instagram and
            TikTok yourself, pasting the copy from step 3 and the cover from step 4. Add the .srt
            from step 2 wherever a caption track is offered. Then close this and tick each
            destination on the row — that's what the queue counts.
          </div>
        </Step>

        {/* ── 6 ── POST TO THE SITE (2026-09-11). Lee: "I don't see anywhere where I could just
            upload a file and have it post." One press: the video host, then the set, then the row. */}
        <Step n={6} title="Post it to the site" hint={siteLink || sitePosted?.postedAt ? "on the site" : "students see it on /learn"} done={!!siteLink || !!sitePosted?.postedAt}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.6 }}>
            One click: your video goes to our video host and becomes this set's video on the site{takeIndex > 0 ? ` (part ${takeIndex + 1})` : ""}. Pressing again replaces it.
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" disabled={!videoUrl || siteBusy} onClick={() => void postToSite()} style={{ ...primary, opacity: !videoUrl || siteBusy ? 0.5 : 1 }}>
              {siteBusy ? "Posting…" : siteLink || sitePosted?.postedAt ? "Post it again (replaces it)" : "Post to the site"}
            </button>
            {!videoUrl && <span style={{ fontSize: 11.5, color: V3_MUTED }}>waiting for step 1's upload…</span>}
            {siteNote && <span style={{ fontSize: 11.5, color: siteBusy ? V3_GOLD : MINT }}>{siteNote}</span>}
            {(siteLink ?? sitePosted?.url) && <a href={(siteLink ?? sitePosted?.url) as string} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: V3_GOLD }}>open it ↗</a>}
            {siteErr && <span style={{ fontSize: 12, color: "#FF8B7E" }}>{siteErr}</span>}
          </div>
          {takeIndex > 0 && <div style={{ marginTop: 6, fontSize: 11, color: V3_MUTED }}>Students see part 1 of a set today. The other parts play once the student player learns to play parts in order.</div>}
        </Step>
      </div>
    </div>
  );
}
