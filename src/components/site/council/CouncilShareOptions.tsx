// THE FOUR WAYS A COUNCIL EXEC CAN SHARE, IN THE ORDER SHE SHOULD MEET THEM.
//
// ── WHY THE PORTAL LINK IS FIRST ──────────────────────────────────────────────────────────────
// The bulk post asks a chapter president to find her own row in eighteen near-identical lines,
// in a group chat, on a phone. The failure that invites is not "she gives up" — it is worse:
// she taps the wrong chapter's link, lands on somebody else's page, and every member she then
// forwards it to is counted against the wrong house. Attribution that is confidently wrong is
// harder to recover from than attribution that is missing.
//
// One portal link cannot be mis-tapped. The picker on /s/<campus> is the only thing that decides
// which chapter page anyone lands on, and it is driven by the roster rather than by a thumb.
//
// The bulk post stays — some councils genuinely prefer it, and telling them they cannot have it
// would cost more than the risk — but it is second, and it is labelled as the alternative.
//
// ── THE SHAPE ─────────────────────────────────────────────────────────────────────────────────
// Four rows, one primary. Each row says what it IS and what it costs to use, because an exec
// choosing between them is deciding how much work she is about to do, not which button is
// prettiest.
import { useState } from "react";

import { Check, ChevronRight, Copy, FileText, Link2, Users } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type Tone = "primary" | "quiet";

export function ShareOption({ tone = "quiet", icon, title, sub, badge, onClick, href, confirmed, disabled }: {
  tone?: Tone;
  icon: React.ReactNode;
  title: string;
  sub: string;
  /** "Default" on the primary row — says which one to pick without hiding the others. */
  badge?: string;
  onClick?: () => void;
  href?: string;
  confirmed?: boolean;
  disabled?: boolean;
}) {
  const primary = tone === "primary";
  const style: React.CSSProperties = {
    minHeight: 72,
    borderRadius: 14,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    textAlign: "left",
    width: "100%",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontFamily: BRAND_SANS,
    background: confirmed
      ? "rgba(252,163,17,0.14)"
      : primary ? "var(--cta-solo-bg, var(--accent))" : "rgba(0,0,0,0.24)",
    color: confirmed
      ? "var(--accent)"
      : primary ? "var(--cta-solo-fg, #0B1220)" : "var(--brand-cream)",
    border: confirmed
      ? "1px solid var(--accent)"
      : primary ? "0" : "1px solid var(--border-default)",
  };

  const inner = (
    <>
      <span className="grid shrink-0 place-items-center" style={{ width: 26 }} aria-hidden>
        {confirmed ? <Check className="h-5 w-5" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-black leading-tight" style={{ fontFamily: BRAND_DISPLAY }}>{title}</span>
          {badge && (
            <span
              className="shrink-0 rounded-full px-1.5 text-[9px] font-black uppercase tracking-wider"
              style={{
                background: primary ? "rgba(0,0,0,0.16)" : "var(--accent)",
                color: primary ? "inherit" : "#0B1220",
                paddingTop: 2, paddingBottom: 2,
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ opacity: primary ? 0.82 : 1, color: primary ? "inherit" : "var(--text-muted)" }}>
          {sub}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden style={{ opacity: 0.5 }} />
    </>
  );

  return href
    ? <a href={href} style={style} className="transition-transform hover:scale-[1.01]">{inner}</a>
    : <button type="button" onClick={onClick} disabled={disabled} style={style} className="transition-transform hover:scale-[1.01]">{inner}</button>;
}

/** A copy row that tells the truth about whether the copy happened.
 *
 *  copyToClipboard already refuses to claim a success it did not have — both its paths fail in
 *  the in-app browsers a GroupMe or Instagram DM opens links in, which is exactly where these
 *  links get opened. What was missing was the caller HONOURING that "no": a failed copy used to
 *  change nothing on screen, so the exec tapped, saw nothing, and either tapped again or walked
 *  away believing she had the message. On failure this reveals the text instead, selectable, and
 *  says why. */
export function useCopyRow(text: string): {
  copied: boolean;
  failed: boolean;
  copy: () => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok) { setFailed(true); setCopied(false); return; }
    setFailed(false);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2600);
  };

  return { copied, failed, copy };
}

export const SHARE_ICONS = {
  portal: <Link2 className="h-5 w-5" />,
  bulk: <Copy className="h-5 w-5" />,
  chapter: <Users className="h-5 w-5" />,
  materials: <FileText className="h-5 w-5" />,
};
