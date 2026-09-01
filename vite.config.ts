// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import { siteQaVersions } from "./scripts/vite-site-qa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server", preset: "vercel" },
  },
  nitro: { preset: "vercel" },
  // Extra plugins layered on top of the lovable preset. siteQaVersions bakes the
  // /admin/site-qa change-detection hashes into `virtual:site-qa-versions`.
  vite: {
    plugins: [siteQaVersions()],
    build: {
      // SOURCEMAPS ON PREVIEWS ONLY (2026-09-01).
      //
      // Two production crashes this week arrived as "Cannot access 'wl' before
      // initialization" and "…'yl'…". Minified names cost a full round trip
      // each: the first one I matched to the wrong module and shipped a fix
      // that wasn't the bug. With a map, those read 'orientation' and 'liveIds'
      // and the fix is obvious from the stack alone.
      //
      // NOT in production: the maps are served at predictable URLs, and this is
      // a public site — shipping them would publish the whole source. Preview
      // deploys are the ones behind Vercel SSO and the ones we debug against,
      // so that is where they belong.
      sourcemap: process.env.VERCEL_ENV !== "production",
    },
  },
});
