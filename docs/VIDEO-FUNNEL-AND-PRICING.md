# Video Hosting, Free Funnel & The Completion Moment

Status: **roadmap / not built.** Decisions and open questions captured while
authoring Start Here. Nothing here blocks filming.

---

## 1. Video hosting: YouTube AND Mux — never YouTube embedded in-platform

**Decision:** free lessons get posted to YouTube *as marketing*, and hosted on
Mux *inside the platform*. Same file, two destinations. Paid lessons are Mux
only (unlisted YouTube is not a security model).

**Why not embed YouTube in the platform:**
- **Escape hatch.** An embed gives students one click into YouTube's
  recommendation feed at the exact moment we want them converting.
- **View count is an anti-signal early.** "12 views" next to a lesson is worse
  than no number at all. Mux shows nothing.
- **Kills the player roadmap.** Copy-share-link, branded screenshot, "Ask Lee
  about this moment" (timestamped → reactive-video queue) all require our own
  player chrome.
- **No dating.** See §4.

**Why still post to YouTube:**
- #2 search engine. Students search "adjusting entries explained."
- Free discovery + SEO + social proof at scale.
- It's already the shorts distribution target.
- Zero marginal cost — the file exists.

**Cost check:** Mux delivery ≈ pennies per hour streamed. A few hundred students
watching all free chapters is a rounding error. Not a constraint at this scale.

**Open:** does the YouTube version end with a CTA card driving to the platform?
(Probably yes — same outro discipline as shorts: "Start free at
surviveaccounting.com.")

---

## 2. Free video funnel

Free lessons (Ch 1–8, through Trial Balance) are the funnel. The gate is at
adjusting entries.

**Email capture:** "Add your email to get the free videos." Low friction, gets
them into the list before they hit the gate.

**SMS + syllabus (pipeline already built — Twilio MMS webhook, HEIC→JPEG,
order_media):** "Upload your syllabus, get notifications timed to your tests."
This is the highest-value onboarding ask we have — it gives us exam dates,
course code, professor, and campus in one photo. Wire the existing pipeline into
onboarding rather than rebuilding.

**Why the syllabus matters beyond notifications:** it's the academic-calendar
data that powers timed shorts posting (adjusting entries land ~week 6 nearly
everywhere) and eventually the learning-data layer.

---

## 3. Pricing presentation: founding rate, not a standing discount

**Rejected:** permanent 20% off shown on every dashboard load. A discount
everyone always gets is just the price with extra steps; a $150 considered
purchase doesn't behave like an impulse buy; a recurring popup trains reflex
dismissal.

**Adopted instead:** **Founding student — $120 through Fall 2026** (then $150).
- Honest and time-boxed → real urgency instead of manufactured urgency.
- Rewards early adopters who are betting on an unproven platform.
- Gives a legitimate reason to raise to full price later ("founding rate ends").
- Assuages "new platform vibes" by *naming* the newness instead of hiding it.

**Presentation rules:** show it once, dismissible; may return after N days;
never on every load. Greek chapter pricing ($100/member, 15-seat min, +10
blocks, seats roll to next semester) is unaffected.

---

## 4. Do not date videos in-platform

Contradicts the standing content rule: **nothing dated.** A lesson filmed in
2026 should still be perfect in 2029; a visible date makes it *look* stale
regardless. YouTube stamps upload dates automatically and that's unavoidable —
in-platform, no dates. (One more reason the platform player is Mux, not an
embed.)

---

## 5. The completion moment (course wrap-up → promo)

Follows the existing Bridge card rule: **Share/Invite appears on success, not
struggle.** Course completion is the largest success moment in the product — a
student who just ran the full cycle and finally gets it.

Optional promo section at the end of a course:
- **Share with friends** — the branded-screenshot / share-link mechanics; every
  share is an ad with Lee's face on it.
- **Onboard your Greek org** — "Get this for your whole chapter." Pre-drafted
  message the student can forward to their exec, plus a link that tags the
  chapter. A student who just finished is the best possible person to pitch
  their chapter — far better than a cold email from Lee.
- **Ask Lee** — the tutoring funnel, at peak goodwill.

This is where the Greek waitlist tally grows fastest: every finisher is a
potential chapter champion.

---

## Open questions

- YouTube CTA end-card: how hard to push the platform without cheapening the
  free lesson?
- Does the free tier require email before *any* video, or after Ch 1? (Friction
  vs. list size.)
- Founding rate: hard cutoff date, or first N students? (Date is simpler and
  more honest.)
- Completion promo: gate it behind actually finishing, or offer at any point
  after the wrap-up? (Finishing is the honest trigger.)
