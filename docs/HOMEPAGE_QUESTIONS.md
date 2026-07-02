# Homepage final-pass — calls & open questions

Branch: `orders-foundation` · 2026-07-02 · copy/UX pass. Each item = a place I had to make a call instead of guessing silently.

1. **Page `<title>` still says "Survive it. Or learn to love it."**
   `src/routes/index.tsx:31` — `{ title: "Survive Accounting — Survive it. Or learn to love it." }`.
   STEP 6 asked to remove the **footer body tagline** (done). This remaining hit is the browser-tab / SEO `<title>`. I **left it** rather than silently changing a branding/SEO string. Want the page title changed too (e.g. "Survive Accounting — Videos for accounting exam prep")?

2. **Three gated sections not named in STEP 2, not in the remove list — left in place, OFF by default.**
   `IntroVideoSection`, `FreeVideoCapture` (`s.freeExplainers`), `BeyondTeaser` (`s.beyondExam`). Site-settings defaults are `freeExplainers:false`, `beyondExam:false`, `introVideo.show:false` (empty url), so **none render by default** and the visible page matches your 6-section list. I did not remove their code (not in the remove list). Remove them entirely, or keep them flag-gated?

3. **"#1 thing I hear" reorder.** STEP 2's numbered order puts it at position 2 (before "How it works"); it was at position 3 (after "How it works"). The parenthetical said "don't move it if it already is [below the hero]." I read the numbered order as authoritative and moved "How it works" below it so the order reads Hero → #1-thing → How it works. Flag if you actually wanted How-it-works first.

4. **Naming mismatch: homepage now says "help video(s)"; `/order` says "Cram Video".**
   STEP 1/3 copy is verbatim ("Request Help Video", "a help video", "Get help videos…"). The order flow (`/order`, confirmation, track page, student emails) still says "Cram Video." The hero CTA points to `/order`, so a student clicks "Request Help Video" and lands on "Request a Cram Video." Intended, or should one name win everywhere?

5. **Press date format + sort.** Existing `PRESS` array is sorted **ascending by date (oldest first), undated last**. I inserted Hotty Toddy after Oxford Eagle (both Apr 2017; Oxford=Apr 14, Hotty Toddy=Apr 30) → position 2. I formatted its date as **"Apr 30, 2017"** (added the day) to match the short-date field style and disambiguate from Oxford Eagle's "Apr 2017." RateMyProfessors entry removed. (The array comment says "room to add recent pieces at the top" — but the actual order is oldest-first, so I matched the code, not the comment.)
