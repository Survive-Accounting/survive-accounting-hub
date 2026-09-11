// RETARGETING — the pure half: which tags, which events, and when NOT to fire anything.
//
// Lee, 2026-09-11: "Set up all retargeting tokens for the site before we launch." Audiences only
// accumulate from the day a tag goes live, so the tags ship now — each one dormant until its ID is
// set in the environment — and the ads come later. The parked spec (2026-09-01) set the rules:
//   · one helper, no Tag Manager. Google's tag first (YouTube retargeting), Meta second
//     (Instagram) — and TikTok third, because Lee posts there too
//   · ZERO PII: no name, email or phone, hashed or not, in any parameter — and no page whose URL
//     carries one is ever reported
//   · never fire on an internal page, on an admin device, or in a test session; honour Global
//     Privacy Control and the device opt-out on /privacy
//   · eleven funnel events, each carrying campus / chapter where it exists
// The browser half (script injection, the platform queues) is lib/retargeting.ts.

export const AD_EVENTS = [
  "chapter_page_view",
  "gate_view",
  "gate_submit",
  "sponsorship_interest",
  "share_view",
  "share_copied",
  "claim_start",
  "claim_complete",
  "video_start",
  "path_complete",
  "exam2_lock",
] as const;
export type AdEvent = (typeof AD_EVENTS)[number];

/** How each event is named on each platform. Google takes our own names (they are what the
 *  audience builder shows). Meta and TikTok get their STANDARD event where one fits — their ad
 *  optimisers only understand those — and a custom event under our name otherwise. */
export const PLATFORM_EVENT: Record<AdEvent, { google: string; meta: { standard: string } | { custom: string }; tiktok: string }> = {
  chapter_page_view: { google: "chapter_page_view", meta: { standard: "ViewContent" }, tiktok: "ViewContent" },
  gate_view: { google: "gate_view", meta: { custom: "GateView" }, tiktok: "GateView" },
  gate_submit: { google: "gate_submit", meta: { standard: "Lead" }, tiktok: "SubmitForm" },
  sponsorship_interest: { google: "sponsorship_interest", meta: { standard: "Contact" }, tiktok: "Contact" },
  share_view: { google: "share_view", meta: { custom: "ShareView" }, tiktok: "ShareView" },
  share_copied: { google: "share_copied", meta: { custom: "ShareCopied" }, tiktok: "ShareCopied" },
  claim_start: { google: "claim_start", meta: { custom: "ClaimStart" }, tiktok: "ClaimStart" },
  claim_complete: { google: "claim_complete", meta: { standard: "CompleteRegistration" }, tiktok: "CompleteRegistration" },
  video_start: { google: "video_start", meta: { custom: "VideoStart" }, tiktok: "VideoStart" },
  path_complete: { google: "path_complete", meta: { custom: "PathComplete" }, tiktok: "PathComplete" },
  exam2_lock: { google: "exam2_lock", meta: { custom: "Exam2Lock" }, tiktok: "Exam2Lock" },
};

// ── the tags ─────────────────────────────────────────────────────────────────────────────────

/** Browser-safe IDs (they ship in the page by design), VITE_PUBLIC_-prefixed like PostHog's and
 *  Sentry's. Set in Vercel → Settings → Environment Variables, then redeploy. */
export const TAG_ENV = {
  googleAds: "VITE_PUBLIC_GOOGLE_ADS_ID",
  ga4: "VITE_PUBLIC_GA4_ID",
  meta: "VITE_PUBLIC_META_PIXEL_ID",
  tiktok: "VITE_PUBLIC_TIKTOK_PIXEL_ID",
} as const;
export type TagKey = keyof typeof TAG_ENV;

const TAG_FORMAT: Record<TagKey, { re: RegExp; example: string }> = {
  googleAds: { re: /^AW-\d{6,14}$/, example: "AW-123456789" },
  ga4: { re: /^G-[A-Z0-9]{6,14}$/, example: "G-ABC123XYZ9" },
  meta: { re: /^\d{10,20}$/, example: "1234567890123456" },
  tiktok: { re: /^[A-Z0-9]{16,24}$/, example: "CXXXXXXXXXXXXXXXXXXX" },
};

export type TagConfig = Record<TagKey, string | null>;

/** Read the four IDs. A value in the wrong shape is refused with a reason — loud, never loaded:
 *  a pasted-wrong ID must not silently send nowhere, and an unvalidated string is never put into
 *  a script. */
export function parseTagConfig(env: Record<string, unknown>): { config: TagConfig; problems: string[] } {
  const config = { googleAds: null, ga4: null, meta: null, tiktok: null } as TagConfig;
  const problems: string[] = [];
  for (const key of Object.keys(TAG_ENV) as TagKey[]) {
    const raw = env[TAG_ENV[key]];
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) continue;
    if (TAG_FORMAT[key].re.test(v)) config[key] = v;
    else problems.push(`${TAG_ENV[key]}="${v.slice(0, 40)}" doesn't look like ${TAG_FORMAT[key].example}`);
  }
  return { config, problems };
}

export function anyTag(config: TagConfig): boolean {
  return Object.values(config).some(Boolean);
}

// ── when nothing fires ───────────────────────────────────────────────────────────────────────

/** Every internal surface. A route file behind AdminGate must sit under one of these —
 *  retargeting.test.ts reads src/routes and fails if a new admin page doesn't. */
export const INTERNAL_PREFIXES = [
  "/admin", "/v3", "/outreach", "/branding", "/study", "/talkthrough", "/leeportal", "/ceq",
  "/buildqueue", "/blast-off", "/blastoff-demo", "/survive-bolt", "/shipped", "/exhibit-lab",
  "/exhibit-demo", "/callout-demo", "/logo-lab", "/intro-outro", "/practice-demo", "/lab",
  "/preview", "/api",
] as const;

export function isInternalPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return INTERNAL_PREFIXES.some((r) => p === r || p.startsWith(`${r}/`) || p.startsWith(`${r}_`));
}

/** AdminGate.tsx's own storage key (its constant is private; a ratchet holds the two together). */
export const ADMIN_UNLOCK_STORAGE_KEY = "sa-admin-unlocked";
/** The /privacy "turn off advertising cookies on this device" switch. */
export const ADS_OPT_OUT_KEY = "sa-ads-optout";
/** lib/test-mode.ts's session key, read directly: importing test-mode would pull that module onto
 *  the canvas render path (lib/analytics → lib/retargeting), which the TDZ ratchet forbids. A ratchet
 *  in retargeting.test.ts holds the two strings together. */
export const TEST_SESSION_STORAGE_KEY = "sa-test-session";

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
function looksLikePhone(v: string): boolean {
  return /^\+?\d{7,15}$/.test(v.replace(/[\s().-]/g, ""));
}
function looksPersonal(v: string): boolean {
  return EMAIL.test(v) || looksLikePhone(v);
}

/** A query string that carries anything personal — the tester URL's ?email=, an unsubscribe link.
 *  Meta and TikTok read the whole address themselves, so a page like that is never reported at all. */
export function urlHasPii(search: string): boolean {
  try {
    const q = new URLSearchParams(search);
    for (const [k, v] of q) {
      if (/^(email|e|phone|tel|name|first_?name|last_?name)$/i.test(k)) return true;
      if (looksPersonal(decodeURIComponent(v))) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export type Suppression = "admin-device" | "test-session" | "global-privacy-control" | "opted-out" | "internal-page" | "personal-data-in-url";

/** Why this device must never load a tag at all — or null. Checked before anything is injected. */
export function deviceSuppression(d: { adminUnlocked: boolean; testSession: boolean; gpc: boolean; optedOut: boolean; search: string }): Suppression | null {
  if (d.adminUnlocked) return "admin-device";
  if (d.testSession || /(?:^|[?&])(testmode|test)=/.test(d.search)) return "test-session";
  if (d.gpc) return "global-privacy-control";
  if (d.optedOut) return "opted-out";
  return null;
}

/** Why THIS page must not be reported — or null. */
export function pageSuppression(pathname: string, search: string): Suppression | null {
  if (isInternalPath(pathname)) return "internal-page";
  if (urlHasPii(search)) return "personal-data-in-url";
  return null;
}

// ── what an event may carry ──────────────────────────────────────────────────────────────────

/** The whole vocabulary an event may carry: where the student is, never who. */
export const AD_PARAM_KEYS = ["campus", "chapter", "course", "exam", "mode", "topic", "video", "source"] as const;
export type AdParams = Partial<Record<(typeof AD_PARAM_KEYS)[number], string | number | null | undefined>>;

/** Keep only the allowed keys; drop empties, anything email- or phone-shaped, and over-long text. */
export function cleanParams(p: Record<string, unknown> | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!p) return out;
  for (const key of AD_PARAM_KEYS) {
    const v = p[key];
    if (typeof v === "number" && Number.isFinite(v)) { out[key] = v; continue; }
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || s.length > 80 || looksPersonal(s)) continue;
    out[key] = s;
  }
  return out;
}

/** Existing product events (lib/analytics.ts) that ARE funnel moments — forwarded, so their call
 *  sites don't change. */
export const FROM_PRODUCT_EVENT: Record<string, AdEvent> = {
  chapter_claim_started: "claim_start",
  chapter_claimed: "claim_complete",
  share_link_copied: "share_copied",
  exam_completed: "path_complete",
};

/** A product event's properties in the ad vocabulary. */
export function productParams(props: Record<string, unknown> | undefined): AdParams {
  if (!props) return {};
  const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? v : undefined);
  return {
    campus: s(props.campus_slug) ?? s(props.campus_id),
    chapter: s(props.chapter_slug) ?? s(props.chapter_id),
    course: s(props.course_code) ?? s(props.course_id),
    exam: s(props.exam),
    mode: s(props.mode),
    source: s(props.source),
  };
}
