// ADD TO HOME SCREEN — the only way /learn ever loses the address bar.
//
// ── THE HONEST VERSION OF THE URL-BAR QUESTION ────────────────────────────────────────────────
// Safari will not let a website hide its own address bar, and no amount of CSS changes that. The
// bar goes away in exactly one situation: the student installs the site to their home screen and
// opens it from there, which runs it in standalone display mode with no browser chrome at all.
// The manifest is what makes that possible; this component is what makes it happen.
//
// ── WHY IT WAITS FOR A SECOND VISIT ───────────────────────────────────────────────────────────
// Asking someone to install an app they have used for four seconds is asking them to say no. The
// prompt therefore counts visits and appears from the SECOND one — by then a student has watched
// something, and "keep this on your phone" is a reasonable thing to say to a person who came back.
//
// ── TWO PLATFORMS, TWO MECHANISMS ─────────────────────────────────────────────────────────────
// Android/Chrome fires `beforeinstallprompt`, which can be saved and replayed on a tap: a real,
// native install dialog. iOS Safari fires nothing and has no API at all — the only route is Share
// → Add to Home Screen, done by hand. So on iOS this shows the instruction rather than a button
// that cannot work. Anything else would be a button that does nothing on half of the phones this
// product runs on.
import { useEffect, useState } from "react";

import { Share, X } from "lucide-react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import { isDismissed, setDismissed } from "@/lib/device-prefs";

const VISITS_KEY = "sa-learn-visits";
const DISMISS_KEY = "learn-install-prompt";

/** Chrome's saved event. Not in lib.dom yet. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function bumpVisits(): number {
  try {
    const n = Number(window.localStorage.getItem(VISITS_KEY) ?? "0") + 1;
    window.localStorage.setItem(VISITS_KEY, String(n));
    return n;
  } catch { return 1; }
}

/** Already running from the home screen? Then there is nothing to offer. */
function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches
      // iOS reports it here instead, and only here.
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac; the touch-point count is what separates it from a desktop.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed(DISMISS_KEY)) return;
    const visits = bumpVisits();
    setIos(isIOS());

    const onBeforeInstall = (e: Event) => {
      // Suppressing the browser's own mini-infobar so ours is the only ask — two prompts for one
      // action reads as a site nagging you.
      e.preventDefault();
      setDeferred(e as InstallEvent);
      if (visits >= 2) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires that event, so the instruction path is time-based only.
    if (visits >= 2 && isIOS()) setShow(true);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!show) return null;

  const close = (remember: boolean) => {
    setShow(false);
    if (remember) setDismissed(DISMISS_KEY, true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Whatever they chose, do not ask again — a second ask after a decline is the behaviour
    // that gets a site muted.
    close(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Add Survive to your home screen"
      className="fixed inset-x-0 z-[130] mx-auto max-w-[420px] px-3"
      // Sits ABOVE the tab bar, not over it — covering the navigation to advertise an install is
      // the ad-behaviour version of this pattern.
      style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))", fontFamily: BRAND_SANS }}
    >
      <div
        className="flex items-start gap-3 rounded-2xl px-4 py-3"
        style={{
          background: "var(--lm-surface, #101728)",
          border: "1px solid color-mix(in srgb, var(--lm-accent) 40%, transparent)",
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.9)",
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-black" style={{ fontFamily: BRAND_DISPLAY, color: "var(--lm-text)" }}>
            Keep Survive on your phone
          </p>
          {ios ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[12.5px] leading-snug" style={{ color: "var(--lm-muted)" }}>
              Tap <Share className="inline h-3.5 w-3.5" aria-label="Share" /> then
              <span className="font-bold" style={{ color: "var(--lm-text)" }}>Add to Home Screen</span>
              — it opens full screen, no address bar.
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--lm-muted)" }}>
                Opens full screen, no address bar.
              </p>
              <button
                type="button"
                onClick={() => void install()}
                className="mt-2 rounded-lg px-3.5 text-[13px] font-black"
                style={{ minHeight: 40, background: "var(--lm-accent)", color: "var(--lm-accent-ink)", border: 0, cursor: "pointer" }}
              >
                Add to home screen
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => close(true)}
          aria-label="Not now"
          className="-mr-1 -mt-1 grid shrink-0 place-items-center rounded-full hover:bg-white/10"
          style={{ height: 36, width: 36, color: "var(--lm-muted)", background: "none", border: 0, cursor: "pointer" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
