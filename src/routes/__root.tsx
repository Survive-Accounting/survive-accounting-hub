import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { initAnalytics, capturePageview } from "@/lib/analytics";
import { initSentry, setSentryRoute, captureError } from "@/lib/sentry";
// NOTE: this is a TanStack Start (React) app, NOT Next.js — use the "/react"
// entrypoints, not "@vercel/analytics/next".
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import appCss from "../styles.css?url";
import { HOME_OG, ogMeta } from "../lib/og";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { TestModeBar } from "@/components/site/TestModeBar";
import { IdeasDock } from "@/components/ideas/IdeasDock";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    captureError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // MOBILE CHROME (M1.4). viewport-fit=cover lets the page paint under the notch and the
      // home indicator — env(safe-area-inset-*) reports 0 until this is set.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      // theme-color is what iOS Safari samples for its toolbar. Without it the bar renders
      // white against our navy page and reads as a broken render. Matches SITE_NAVY.
      { name: "theme-color", content: "#0D1730" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "author", content: "Survive Accounting" },
      // SITE-WIDE DEFAULT CARD — the HOME copy + the generated og-card.png (scripts/og-cards.mjs
      // draws it from the SAME bolt geometry and lockup maths the site renders, so the share
      // preview cannot drift from the logo). Routes with their own identity override this whole
      // set via ogMeta(); TanStack dedupes by name/property with the deepest route winning, so a
      // page always ships exactly one coherent card — never a root/leaf hybrid.
      ...ogMeta({ ...HOME_OG, path: "/" }),
    ],
    links: [
      // Favicon — Lee's FINAL bolt (the canonical brand bolt, baked in brand.tsx).
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Fraunces:opsz,wght,SOFT@9..144,300..900,0..100&family=Inter:wght@400;500;600;700;800&family=League+Spartan:wght@600;700;800;900&family=Poppins:wght@500;600;700&family=Rubik:wght@500;600;700;800;900&family=Sora:wght@500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
                {children}
        {/* Vercel Web Analytics (page views/visitors) + Speed Insights (real-user
            performance). Client-only: no-op in dev, active on the Vercel deploy. */}
        <Analytics />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // PostHog (product analytics). No-op unless VITE_PUBLIC_POSTHOG_KEY is set;
  // init resolves then captures the first pageview, and each route change after.
  useEffect(() => { void initAnalytics().then(() => capturePageview(window.location.pathname)); }, []);
  useEffect(() => { capturePageview(pathname); }, [pathname]);
  // Sentry (error monitoring). No-op unless VITE_PUBLIC_SENTRY_DSN is set. Tag
  // the route so errors group per page (feeds /admin/site-qa error attribution).
  useEffect(() => { void initSentry().then(() => setSentryRoute(window.location.pathname)); }, []);
  useEffect(() => { setSentryRoute(pathname); }, [pathname]);
  return (
    <QueryClientProvider client={queryClient}>
      <TestModeBar />
      {/* IDEAS TO SAVE — the pill + drawer. Renders itself only on internal
          surfaces (it checks the path); null everywhere a student can reach. */}
      <IdeasDock />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
