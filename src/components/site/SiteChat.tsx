// THE CHAT, ON EVERY PAGE (Lee, 2026-09-14: "chat messenger should be on every page"). One mount in
// __root.tsx instead of one per page. It stays off where it would be in the way or on camera:
// internal tools (the same list the ad tags use, plus the studio/film tools), the film pop-out
// OBS records, print and redirect routes, anything inside an iframe, and any screen that asks it
// to hide — the /learn player does, through hideSiteChat().
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";

import { LearnTextLee } from "@/components/learn/LearnTextLee";
import { isInternalPath } from "@/lib/retargeting-core";

const NEVER = [
  "/studio", "/ceq", "/talkthrough", "/leeportal", "/branding", "/canvas", "/film", "/blast-off", "/blastoff-demo",
  "/exhibit", "/callout-demo", "/logo-lab", "/intro-outro", "/practice-demo", "/lab", "/buildqueue", "/survive-bolt",
  "/shipped", "/va", "/api", "/chapters/kit", "/preview/exam1", "/l/", "/r/", "/c/", "/embed",
];

export function siteChatAllowed(pathname: string, search: string): boolean {
  if (isInternalPath(pathname)) return false;
  if (NEVER.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || pathname.startsWith(p))) return false;
  if (/[?&]popout=/.test(search)) return false;
  return true;
}

// A screen that covers the page (a player) hides the bubble while it is up.
let hiders = 0;
const listeners = new Set<() => void>();
export function hideSiteChat(): () => void {
  hiders++; listeners.forEach((l) => l());
  return () => { hiders = Math.max(0, hiders - 1); listeners.forEach((l) => l()); };
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function SiteChat() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr ?? "" });
  const hidden = useSyncExternalStore(subscribe, () => hiders > 0, () => false);
  // Client only: the bubble reads cookies and storage, and an iframe check needs a window.
  const [ready, setReady] = useState(false);
  const [framed, setFramed] = useState(false);
  useEffect(() => { setReady(true); try { setFramed(window.self !== window.top); } catch { setFramed(true); } }, []);
  if (!ready || framed || hidden || !siteChatAllowed(pathname, searchStr)) return null;
  return <LearnTextLee />;
}

/** Hide the site chat while `on` (the /learn player). */
export function HideChatWhile({ on }: { on: boolean }) {
  useEffect(() => (on ? hideSiteChat() : undefined), [on]);
  return null;
}
