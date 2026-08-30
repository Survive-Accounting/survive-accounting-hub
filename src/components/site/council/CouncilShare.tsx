// THE SHARE SECTION — the council page's whole reason to exist.
//
// ── WHAT THIS REPLACED, AND WHY ───────────────────────────────────────────────────────────────
// The only way to share used to be a table asking the officer to type an email address for every
// chapter — eighteen rows of addresses she does not know from memory and would have to go hunting
// for. That is twenty minutes of data entry standing between a cold email and a share, and it was
// the single biggest reason this page would fail. It is now the LAST of three tabs, for the rare
// officer who genuinely has the list.
//
// THE DEFAULT IS THE GROUP CHAT SHE ALREADY HAS. Every council has a chapter-presidents thread.
// One pre-written message with every chapter's link, one Copy button, paste, done. That is the
// whole first tab, and it is why the door beside it can honestly say thirty seconds.
//
// ── THE HARD RULE, UNCHANGED ──────────────────────────────────────────────────────────────────
// THIS PLATFORM NEVER SENDS EMAIL OR SMS TO AN ADDRESS A COUNCIL OFFICER TYPES IN. We assemble;
// she sends, from her own accounts. Two reasons, both non-negotiable:
//   1. CONSENT. A chapter president's address, typed in by a third party, is not a consented
//      contact. Messaging it because someone else pasted it is what gets a sender blocked.
//   2. IT WORKS BETTER. "Hey, it's your Panhellenic VP" opens doors "Survive Accounting" cannot.
// There is no server-side send anywhere in this file and there must never be one.
//
// MOBILE IS THE REAL SURFACE. She is reading this on a phone, in a cold email, between classes.
// Tabs 1 and 2 are built for that; tab 3's table is honestly labelled as a desktop job rather
// than crushed into a phone as three unreadable columns.
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { councilChapterLinksPost } from "@/lib/partners";
import type { PartnerChapterRow } from "@/lib/partners";

const ORIGIN = "https://surviveaccounting.com";

type TabKey = "post" | "individual" | "email";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "post", label: "Post it to your group chat" },
  { key: "individual", label: "Send individually" },
  { key: "email", label: "Email them" },
];

export function CouncilShare({ id, chapters, courseCode, emailTab }: {
  id: string;
  chapters: PartnerChapterRow[];
  courseCode: string | null;
  /** Tab 3's content — the existing table, passed in so this component owns the CHOICE between
   *  channels and not the mechanics of the slowest one. */
  emailTab: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("post");

  const withLinks = useMemo(
    () => chapters.map((c) => ({ ...c, url: `${ORIGIN}${c.goPath}` })),
    [chapters],
  );

  return (
    <section id={id} className="sa-anchor mt-16" style={{ fontFamily: BRAND_SANS }}>
      <h2 className="text-[22px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--brand-cream)" }}>
        Share it with your chapters
      </h2>
      <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Everything sends from your own inbox and phone, under your name. We never message your
        chapters ourselves.
      </p>

      {/* THE TABS. A real tablist, keyboard-operable, scrollable on a phone rather than wrapped
          into three stacked full-width bars that would out-shout the content under them. */}
      <div
        role="tablist"
        aria-label="Ways to share"
        className="sa-share-tabs mt-5 flex gap-1.5 overflow-x-auto pb-1"
      >
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              aria-controls={`sharepanel-${t.key}`}
              id={`sharetab-${t.key}`}
              type="button"
              onClick={() => setTab(t.key)}
              className="shrink-0 rounded-xl px-3.5 text-[13.5px] font-black focus-visible:ring-2"
              style={{
                minHeight: 46,
                background: on ? "var(--accent)" : "var(--bg-surface)",
                color: on ? "#0B1220" : "var(--brand-cream)",
                border: on ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`sharepanel-${tab}`}
        aria-labelledby={`sharetab-${tab}`}
        className="mt-4"
      >
        {tab === "post" && <PostTab chapters={withLinks} courseCode={courseCode} />}
        {tab === "individual" && <IndividualTab chapters={withLinks} />}
        {tab === "email" && emailTab}
      </div>
    </section>
  );
}

// ── TAB 1 — THE GROUP CHAT ────────────────────────────────────────────────────────────────────
/** One message, one button. Anything else added here is something between her and a done task. */
function PostTab({ chapters, courseCode }: {
  chapters: Array<PartnerChapterRow & { url: string }>;
  courseCode: string | null;
}) {
  const message = useMemo(
    () => councilChapterLinksPost({ courseCode, chapters }),
    [courseCode, chapters],
  );
  const { copied, copy } = useCopy();

  return (
    <div>
      <p className="mb-3 text-[14px] leading-snug" style={{ color: "var(--text-muted)" }}>
        Paste this into your chapter-presidents group chat. Every chapter&apos;s link is in it.
      </p>

      {/* The message shown in full, not behind a "preview" toggle: she is about to send this
          under her own name and has every right to read it first. */}
      <pre
        className="max-h-[42vh] overflow-auto rounded-2xl p-4 text-[13px] leading-relaxed"
        style={{
          background: "rgba(0,0,0,0.28)", border: "1px solid var(--border-default)",
          color: "var(--brand-cream)", fontFamily: BRAND_SANS, whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}
      >
        {message}
      </pre>

      <button
        type="button"
        onClick={() => void copy(message)}
        className="mt-3 w-full rounded-xl text-[15px] font-black transition-transform hover:scale-[1.01] focus-visible:ring-2 sm:w-auto sm:px-8"
        style={{
          minHeight: 52,
          background: copied ? "var(--bg-surface)" : "var(--accent)",
          border: copied ? "1px solid var(--accent)" : "1px solid var(--accent)",
          color: copied ? "var(--accent)" : "#0B1220",
          cursor: "pointer",
        }}
      >
        {copied ? "Copied — paste it in your group chat ✓" : "Copy message"}
      </button>
    </div>
  );
}

// ── TAB 2 — ONE AT A TIME ─────────────────────────────────────────────────────────────────────
/** The chapter list as COPY ROWS ONLY. No email field, no phone field, nothing to type. She
 *  copies a link and sends it however she already talks to that chapter. */
function IndividualTab({ chapters }: { chapters: Array<PartnerChapterRow & { url: string }> }) {
  const { copied, copy } = useCopy();
  const [copiedAll, setCopiedAll] = useState(false);

  const allLinks = useMemo(
    () => chapters.map((c) => `${c.name} — ${c.url}`).join("\n"),
    [chapters],
  );

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const ok = await writeClipboard(allLinks);
          if (ok) { setCopiedAll(true); window.setTimeout(() => setCopiedAll(false), 2200); }
        }}
        className="mb-3 w-full rounded-xl text-[14px] font-black focus-visible:ring-2 sm:w-auto sm:px-6"
        style={{
          minHeight: 46, background: "var(--bg-surface)",
          border: `1px solid ${copiedAll ? "var(--accent)" : "var(--border-default)"}`,
          color: copiedAll ? "var(--accent)" : "var(--brand-cream)", cursor: "pointer",
        }}
      >
        {copiedAll ? "All links copied ✓" : `Copy all ${chapters.length} links`}
      </button>

      <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--border-default)" }}>
        {chapters.map((c, i) => (
          <div
            key={c.slug}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            style={{ borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)" }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {c.letters && <span className="shrink-0 text-[13px] font-black" style={{ color: "var(--accent)" }}>{c.letters}</span>}
                <span className="min-w-0 truncate text-[14px] font-bold" style={{ color: "var(--brand-cream)" }}>{c.name}</span>
              </div>
              {/* The link is VISIBLE, not just copyable: clipboard access is blocked in several
                  in-app browsers, and a link nobody can read is a dead end. */}
              <a
                href={c.goPath}
                className="mt-0.5 block truncate text-[11.5px] underline underline-offset-2"
                style={{ color: "var(--text-muted)" }}
              >
                {c.url.replace("https://", "")}
              </a>
            </div>
            <button
              type="button"
              onClick={() => void copy(c.url, c.slug)}
              className="shrink-0 rounded-lg px-3 text-[12.5px] font-black focus-visible:ring-2"
              style={{
                minHeight: 44, background: "rgba(252,163,17,0.14)",
                color: "var(--accent)", border: 0, cursor: "pointer",
              }}
            >
              {copied === c.slug ? "Copied ✓" : "Copy link"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CLIPBOARD ─────────────────────────────────────────────────────────────────────────────────
/** navigator.clipboard needs a secure context AND document focus, and several in-app browsers
 *  (the ones a GroupMe link opens in) give neither. The textarea fallback is what makes Copy work
 *  where this page is actually opened. Returns whether it worked, so a success state is never
 *  shown for a copy that silently did nothing. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** `copied` holds the key of whatever was last copied ("__one" when the caller passes none). */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key = "__one") => {
    const ok = await writeClipboard(text);
    if (!ok) return;
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2200);
  };
  return { copied, copy };
}
