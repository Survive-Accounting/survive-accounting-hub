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
// THE TAKE IS PICKED ONCE, AT THE TOP, AND NEVER UPLOADED. Every step below reads that same
// File: the transcript strips ~2MB of audio out of it, the cover grabs a frame out of it, and
// the subtitles are written from its words. The video goes from his laptop to YouTube by hand,
// as it always has.
//
// THE ONE THING A BROWSER CANNOT DO is re-encode a 300MB video, so burning the captions in stays
// ffmpeg's job — but all the intelligence (cards, karaoke timings, rail geometry) happens here,
// and step 3 hands him a command with nothing left to think about.
import { useCallback, useEffect, useMemo, useState } from "react";

import { V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { TakeFrame } from "@/components/v3/TakeFrame";
import { downloadText, storedTranscript, transcribeTakeFile } from "@/components/v3/take-transcript";
import { assName, burnCommand, burnedName, shortCaptionFiles, srtName, transcriptFromWords, whisperCostUsd, type Word } from "@/lib/short-captions";
import { takeFileProblem } from "@/lib/take-frame";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const MINT = "#3BF5A0";

/** Where Rubik Black has to be for libass to find it. The CLI downloads its own copy; on a
 *  laptop with no repo, installing the font for the user is the one-time step. */
const FONT_URL = "https://github.com/googlefonts/rubik/raw/main/fonts/ttf/Rubik-Black.ttf";

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

export function PostProduction({ pubKey, title, topicName, defaultHookLine, onTranscript, onOpenCopy, onClose }: {
  /** The publish key for THIS video — the set's id, or "<setId>#N" for a split. */
  pubKey: string;
  /** What this video is called: the set's name, or the split's. */
  title: string;
  topicName: string;
  /** This video's first question — the cover's default hook. */
  defaultHookLine: string;
  /** Handed up so the caption sheet writes from what he actually said on camera. */
  onTranscript: (text: string) => void;
  /** Opens step 4 — the caption sheet, seeded with the transcript. */
  onOpenCopy: () => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [words, setWords] = useState<Word[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A transcript already run for this video comes straight back — it is stored by publish key,
  // so re-opening the panel is free and never re-bills.
  useEffect(() => {
    let alive = true;
    storedTranscript(pubKey)
      .then((row) => { if (alive && row?.words?.length) { setWords(row.words); setNote("Transcribed earlier — reusing it."); } })
      .catch(() => { /* no row, or the table isn't there — step 2 will say so when he asks */ });
    return () => { alive = false; };
  }, [pubKey]);

  const text = useMemo(() => (words ? transcriptFromWords(words) : ""), [words]);
  useEffect(() => { if (text) onTranscript(text); }, [text, onTranscript]);
  const files = useMemo(() => (words ? shortCaptionFiles(words) : null), [words]);

  const run = useCallback(async (force: boolean) => {
    if (!file) { setErr("Pick the take first."); return; }
    setBusy(true); setErr(null);
    try {
      const row = await transcribeTakeFile(pubKey, file, setNote, force);
      setWords(row.words ?? []);
      setNote(`${(row.words ?? []).length} words${row.duration_s ? ` from ${Math.round(row.duration_s)}s` : ""}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setNote(null);
    } finally { setBusy(false); }
  }, [file, pubKey]);

  const cmd = file ? burnCommand(file.name) : "";
  const copyCmd = async () => { setCopied(await copyToClipboard(cmd)); window.setTimeout(() => setCopied(false), 1800); };

  const pick = (picked: File | null) => {
    const problem = takeFileProblem(picked);
    if (problem || !picked) { setErr(problem); return; }
    setErr(null); setFile(picked);
  };

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
        <div style={{ marginTop: 8, fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
          Top to bottom, once per finished take. The video never uploads — everything below reads
          it off this machine, and the file you post is the one in your folder.
        </div>

        {err && <div style={{ marginTop: 10, fontSize: 12.5, color: "#FF8B7E" }}>{err}</div>}

        {/* ── 1 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={1} title="The take" hint={file ? file.name : "the finished .mp4 from OBS"} done={!!file}>
          <label style={{ ...primary, display: "inline-block", color: V3_GOLD }}>
            {file ? "Pick a different take" : "Pick the take file"}
            <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
          </label>
          {file && <span style={{ marginLeft: 10, fontSize: 11.5, color: V3_MUTED }}>{(file.size / 1048576).toFixed(0)}MB · stays on this machine</span>}
        </Step>

        {/* ── 2 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={2} title="The transcript" hint={words ? `${words.length} words` : "what you actually said"} done={!!words?.length}>
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            The audio alone goes out — about 2MB a minute, well under Whisper's cap — and the words
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
            <textarea readOnly value={text} rows={4}
              style={{ width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 12, lineHeight: 1.5, marginTop: 8, padding: "7px 10px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, outline: "none", resize: "vertical" }} />
          )}
        </Step>

        {/* ── 3 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={3} title="Burn the captions in" hint={files ? `${files.cards} cards` : "needs the transcript"}>
          {!files || !file ? (
            <div style={{ fontSize: 12.5, color: V3_MUTED }}>Do steps 1 and 2 first.</div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
                Save the subtitles beside the take, then run one command in that folder. Rubik Black,
                the spoken word in gold, sitting in the same rail Review reserves — the burn writes{" "}
                <b style={{ color: V3_CREAM }}>{burnedName(file.name)}</b> and leaves your original alone.
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => downloadText(assName(file.name), files.ass)} style={primary}>Save {assName(file.name)}</button>
                <button type="button" onClick={() => downloadText(srtName(file.name), files.srt, "application/x-subrip")} style={small} title="The plain sidecar — YouTube reads this on upload if you'd rather not burn">Save the .srt too</button>
              </div>
              <div style={{ marginTop: 10, fontSize: 11.5, color: V3_MUTED }}>Then, in that folder (right-click → Open in Terminal):</div>
              <pre style={{ margin: "6px 0 0", padding: "9px 11px", borderRadius: 8, border: `1px solid ${V3_EDGE}`, background: "rgba(244,239,230,0.05)", color: V3_CREAM, fontSize: 11, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{cmd}</pre>
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={() => void copyCmd()} style={{ ...small, color: copied ? MINT : V3_CREAM }}>{copied ? "copied" : "Copy the command"}</button>
                <span style={{ fontSize: 11, color: V3_MUTED }}>
                  One-time setup: <code style={{ color: V3_CREAM }}>winget install Gyan.FFmpeg</code>, then{" "}
                  <a href={FONT_URL} style={{ color: V3_GOLD }}>install Rubik Black</a> (double-click → Install).
                </span>
              </div>
            </>
          )}
        </Step>

        {/* ── 4 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={4} title="The copy" hint="title, description, hashtags">
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.5 }}>
            {text
              ? "Written from the transcript — what you said on camera outranks everything else. Talk over it if you want to steer the angle."
              : "Get the transcript first and this writes itself from it; without one it falls back to your kept prompter lines."}
          </div>
          <button type="button" onClick={onOpenCopy} style={{ ...primary, marginTop: 8 }}>Write the copy</button>
        </Step>

        {/* ── 5 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={5} title="The cover" hint="a frame of the take, or the card">
          <TakeFrame name={title} file={file} onFile={setFile} />
          <div style={{ marginTop: 10, fontSize: 11.5, color: V3_MUTED }}>
            Prefer the drawn card? Its hook is{" "}
            <b style={{ color: V3_CREAM }}>{defaultHookLine ? `"${defaultHookLine.slice(0, 60)}"` : "this video's first question"}</b> — the 🖼 button on the row.
          </div>
        </Step>

        {/* ── 6 ─────────────────────────────────────────────────────────────────────────────── */}
        <Step n={6} title="Post it" hint="by hand, then tick it off">
          <div style={{ fontSize: 12.5, color: V3_MUTED, lineHeight: 1.6 }}>
            Upload <b style={{ color: V3_CREAM }}>{file ? burnedName(file.name) : "the captioned file"}</b> to YouTube, Instagram and
            TikTok yourself, pasting the copy from step 4 and the cover from step 5. Then close this
            and tick each destination on the row — that's what the queue counts.
          </div>
        </Step>
      </div>
    </div>
  );
}
