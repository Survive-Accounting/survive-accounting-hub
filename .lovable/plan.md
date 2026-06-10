## Goal

Replace the current placeholder homepage at `/` with a faithful visual rebuild of the old project's primary landing page (`StagingLandingPage`). Match layout, palette, type, photo placement, and CTA structure. No new design ideas, no feature work — visual parity only.

## What the old homepage actually is

Top-to-bottom sections in the old `StagingLandingPage`:

1. **Navbar** — fixed, transparent over hero, fades to navy on scroll. White wordmark logo (hosted on `lwfiles.mycourse.app` CDN), quiet "Log in" link.
2. **Hero** — deep navy `#0A2A57` background with animated Stripe-style red/blue blurred ribbons. Centered column:
   - 112px circular Lee headshot, white border, soft float animation
   - "Meet Lee Ingram" eyebrow (Inter, uppercase, tracked)
   - Headline "Let's Make Accounting Simple" in DM Serif Display, white, ~64px desktop
   - Subhead about virtual tutoring + exam confidence
   - Two CTAs side-by-side: red gradient **Book Tutoring** (`#CE1126 → #A8101F`) + glass ghost **Read Reviews**
   - Soft white-to-transparent fade at the bottom of the hero
3. **Reviews** — white section, DM Serif Display heading "From students who studied with Lee", testimonial.to iframe embed
4. **Contact form** — navy gradient `#14213D → #0B1426` with faint grid drift, name/email/message form, Lee headshot
5. **Footer** — near-black `#0f172a`, wordmark left, link row (Book Tutoring / Read Reviews / About Lee / Contact), copyright + Privacy/Terms

## Migration plan

### 1. Brand tokens (`src/styles.css`)
Override the current forest/parchment palette with the old app's exact values, kept as semantic tokens so components stay token-driven:
- `--background` → white `oklch(1 0 0)`
- `--foreground` → navy `#14213D`
- `--primary` → navy `#14213D`
- `--accent` / brand-red token → `#CE1126`
- Add `--hero-bg: #0A2A57`, `--footer-bg: #0f172a`
- Wire `--font-display` to **DM Serif Display** (Google Fonts) and body to **Inter**, replacing the current Instrument Serif setup. Load both via `__root.tsx` `<link>` tags.
- The admin shell (sidebar, outreach, CEQ pages) stays usable on the new palette — sidebar uses navy already, so contrast remains good. I'll spot-check the existing admin pages and adjust the sidebar tokens if anything reads wrong.

### 2. Assets
- Copy `src/assets/lee-headshot-original.png` from the old project into the new one.
- Use the existing wordmark logo via its public CDN URL (no copy needed).

### 3. Components (new, in `src/components/landing/`)
Self-contained, no external dependencies beyond what's already installed:
- `SiteNavbar.tsx` — transparent-on-top navbar with scroll-to-solid transition, wordmark + Log in placeholder button.
- `Hero.tsx` — full visual port: ribbons, headshot, headline, subhead, two CTAs. Headshot click is a placeholder (no AboutLeeModal). **Book Tutoring** opens an `<a>` to a placeholder href (or a `mailto:`) — the old Square booking widget is not migrated. **Read Reviews** smooth-scrolls to the reviews section.
- `Reviews.tsx` — same testimonial.to iframe embed + resizer script as the old `ReviewsSliderSection` (no backend, fully static).
- `ContactForm.tsx` — visual port of the navy contact section with the grid drift, headshot, name/email/message inputs and submit button. Submission is a no-op stub (toasts "Thanks, we'll be in touch") — no Supabase wiring.
- `SiteFooter.tsx` — wordmark + link row + copyright, links scroll to the matching sections.

### 4. Route rewrite
- Replace the current `src/routes/index.tsx` body (the V0 marketing page I built last turn) with a new composition:
  ```
  <SiteNavbar />
  <Hero />
  <Reviews />
  <ContactForm />
  <SiteFooter />
  ```
- Update the route's `head()` meta to the old positioning: title "Survive Accounting — Let's Make Accounting Simple" and matching description.

### 5. What I'm intentionally NOT bringing over
- `react-router-dom`, `useAuth`, `useEventTracking`, Supabase calls, `EmailGateContext`, the Square booking widget, MagicLinkModal, AboutLeeModal, campus-resolution flow, and analytics tracking. Visual parity, not functional parity — this matches the V3 context doc rule of preserving useful parts only.
- The hidden/commented-out sections in the old file (SocialProofStrip with a zero-width-space, AskAnythingSection, LandingStudyPreviewerSection) stay out.
- Existing admin shell, `/outreach`, `/ceq/*` routes from last turn are untouched.

### 6. Verification
After the build, screenshot the homepage and compare hero, reviews, contact, and footer against the old visual structure. Check mobile width too. Confirm the admin sidebar still reads correctly on the new tokens.

## Files touched

- `src/styles.css` — palette + fonts
- `src/routes/__root.tsx` — Google Fonts links (DM Serif Display + Inter)
- `src/routes/index.tsx` — full rewrite
- `src/components/landing/SiteNavbar.tsx` (new)
- `src/components/landing/Hero.tsx` (new)
- `src/components/landing/Reviews.tsx` (new)
- `src/components/landing/ContactForm.tsx` (new)
- `src/components/landing/SiteFooter.tsx` (new)
- `src/assets/lee-headshot-original.png` (copied from old project)

## One open question

The old **Book Tutoring** CTA opens a Square scheduling widget inline. Want me to:
- (a) Wire it to your real Square widget URL (paste it and I'll embed it), or
- (b) Leave it as a button that links to a placeholder/`mailto:lee@…` for now?

I'll default to (b) unless you say otherwise.
