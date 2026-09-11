// RETARGETING — the browser half. Loads the Google tag, the Meta pixel and the TikTok pixel ONLY
// when their IDs are set (lib/retargeting-core.ts TAG_ENV), ONLY on a public page, and ONLY on a
// device that isn't an admin's, a tester's, or one that has opted out / sends Global Privacy
// Control. Each platform's official base snippet is used as-is, with an ID that has already
// passed its format check, so nothing unvalidated is ever put into a script.
//
// Two calls, both no-ops when nothing is configured:
//   adPageview(pathname)  — from the root route on every navigation (automatic PageView per tag)
//   adEvent(name, params) — the eleven funnel moments; params are cleaned to campus/chapter/…
// No import of lib/test-mode: lib/analytics imports this module and sits on the canvas render
// path, so the test session is read straight from storage (TEST_SESSION_STORAGE_KEY).
import {
  ADMIN_UNLOCK_STORAGE_KEY, ADS_OPT_OUT_KEY, anyTag, cleanParams, deviceSuppression, FROM_PRODUCT_EVENT, pageSuppression,
  parseTagConfig, PLATFORM_EVENT, productParams, TEST_SESSION_STORAGE_KEY, type AdEvent, type AdParams,
} from "./retargeting-core";

type Queue = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Queue;
    fbq?: Queue;
    ttq?: { page: () => void; track: (event: string, params?: Record<string, unknown>) => void };
    globalPrivacyControl?: boolean;
  }
  interface Navigator { globalPrivacyControl?: boolean }
}

// Read statically — Vite only inlines import.meta.env.X it can see.
const { config, problems } = parseTagConfig({
  VITE_PUBLIC_GOOGLE_ADS_ID: import.meta.env.VITE_PUBLIC_GOOGLE_ADS_ID,
  VITE_PUBLIC_GA4_ID: import.meta.env.VITE_PUBLIC_GA4_ID,
  VITE_PUBLIC_META_PIXEL_ID: import.meta.env.VITE_PUBLIC_META_PIXEL_ID,
  VITE_PUBLIC_TIKTOK_PIXEL_ID: import.meta.env.VITE_PUBLIC_TIKTOK_PIXEL_ID,
});
const googleIds = [config.googleAds, config.ga4].filter((v): v is string => !!v);
const enabled = anyTag(config);

let warned = false;
let loaded = false;

/** Which tags this build carries (the IDs are public by design). */
export function retargetingConfig() {
  return { ...config, problems };
}

function store(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function sessionStore(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function deviceBlocked(): string | null {
  return deviceSuppression({
    adminUnlocked: store(ADMIN_UNLOCK_STORAGE_KEY) === "yes",
    testSession: !!sessionStore(TEST_SESSION_STORAGE_KEY),
    gpc: navigator.globalPrivacyControl === true || window.globalPrivacyControl === true,
    optedOut: store(ADS_OPT_OUT_KEY) === "1",
    search: window.location.search,
  });
}

/** Nothing on the server, nothing unconfigured, nothing blocked — else true, with the tags loaded. */
function ready(): boolean {
  if (typeof window === "undefined" || !enabled) return false;
  if (problems.length && !warned) {
    warned = true;
    console.warn(`[retargeting] ignored: ${problems.join("; ")}`);
  }
  if (deviceBlocked()) return false;
  if (pageSuppression(window.location.pathname, window.location.search)) return false;
  load();
  return true;
}

function inline(code: string): void {
  const s = document.createElement("script");
  s.text = code;
  document.head.appendChild(s);
}

const META_BASE = "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');";

function tiktokBase(id: string): string {
  return "!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=[\"page\",\"track\",\"identify\",\"instances\",\"debug\",\"on\",\"off\",\"once\",\"ready\",\"alias\",\"group\",\"enableCookie\",\"disableCookie\",\"holdConsent\",\"revokeConsent\",\"grantConsent\"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r=\"https://analytics.tiktok.com/i18n/pixel/events.js\",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement(\"script\");n.type=\"text/javascript\",n.async=!0,n.src=r+\"?sdkid=\"+e+\"&lib=\"+t;e=document.getElementsByTagName(\"script\")[0];e.parentNode.insertBefore(n,e)};"
    + `ttq.load('${id}');}(window,document,'ttq');`;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (googleIds.length) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleIds[0])}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    // gtag.js reads `arguments` objects off the dataLayer, exactly as its own snippet pushes them.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    // Page views are sent per route by adPageview, never by config (an SPA would double count).
    for (const id of googleIds) window.gtag("config", id, { send_page_view: false });
  }
  if (config.meta) {
    inline(META_BASE);
    // autoConfig off: the pixel may not scrape buttons and page metadata on its own.
    window.fbq?.("set", "autoConfig", false, config.meta);
    window.fbq?.("init", config.meta);
  }
  if (config.tiktok) inline(tiktokBase(config.tiktok));
}

let lastPath: string | null = null;

/** One PageView per navigation, per tag. Consecutive identical paths are de-duplicated. */
export function adPageview(pathname: string): void {
  if (pathname === lastPath) return;
  lastPath = pathname;
  if (!ready()) return;
  if (googleIds.length) {
    window.gtag?.("event", "page_view", { page_path: pathname, page_location: window.location.href, page_title: document.title, send_to: googleIds });
  }
  window.fbq?.("track", "PageView");
  window.ttq?.page();
}

/** One of the eleven funnel moments, to every configured tag. */
export function adEvent(name: AdEvent, params?: AdParams): void {
  if (!ready()) return;
  const p = cleanParams(params);
  const m = PLATFORM_EVENT[name];
  if (googleIds.length) window.gtag?.("event", m.google, { ...p, send_to: googleIds });
  if ("standard" in m.meta) window.fbq?.("track", m.meta.standard, p);
  else window.fbq?.("trackCustom", m.meta.custom, p);
  window.ttq?.track(m.tiktok, p);
}

/** Called by lib/analytics.ts track(): an existing product event that is a funnel moment. */
export function forwardProductEvent(event: string, props?: Record<string, unknown>): void {
  const ad = FROM_PRODUCT_EVENT[event];
  if (ad) adEvent(ad, productParams(props));
}

export function adsOptedOut(): boolean {
  return store(ADS_OPT_OUT_KEY) === "1";
}

/** The /privacy switch. Turning off stops anything further on this page and every later visit. */
export function setAdsOptOut(off: boolean): void {
  try {
    if (off) localStorage.setItem(ADS_OPT_OUT_KEY, "1");
    else localStorage.removeItem(ADS_OPT_OUT_KEY);
  } catch { /* private mode: nothing to remember */ }
}
